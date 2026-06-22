export const SUPABASE_URL = 'https://hadpvqnosakaegvrbevv.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhhZHB2cW5vc2FrYWVndnJiZXZ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxNDc0OTEsImV4cCI6MjA5NzcyMzQ5MX0.npcgc7-5wEE8mcYUUnU_SXp8tWVPT9VUXqxf5oFY9cI' ;

// ============================================================
// SUPABASE CONFIGURATION
// Replace the two values below with your own from:
// Supabase Dashboard → Your Project → Settings → API
// ============================================================

// ============================================================
// DATABASE ADAPTER
// All database calls go through these functions.
// The rest of the app never touches Supabase directly.
// ============================================================

const headers = {
  'Content-Type': 'application/json',
  'apikey': SUPABASE_ANON_KEY,
  'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
  'Prefer': 'return=representation',
};

const api = async (method, table, body = null, query = '') => {
  const url = `${SUPABASE_URL}/rest/v1/${table}${query}`;
  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`DB error on ${table}: ${err}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : [];
};

// ─── REPS ────────────────────────────────────────────────────

export const repsDB = {
  getAll: async () => {
    const rows = await api('GET', 'reps', null, '?order=date_created.asc');
    return rows.map(camelRep);
  },

  getById: async (id) => {
    const rows = await api('GET', 'reps', null, `?id=eq.${id}`);
    return rows[0] ? camelRep(rows[0]) : null;
  },

  getByRepId: async (repId) => {
    const rows = await api('GET', 'reps', null, `?rep_id=eq.${repId}`);
    return rows[0] ? camelRep(rows[0]) : null;
  },

  create: async (data) => {
    const rows = await api('POST', 'reps', snakeRep(data));
    return rows[0] ? camelRep(rows[0]) : null;
  },

  update: async (id, data) => {
    const rows = await api('PATCH', 'reps', snakeRep(data), `?id=eq.${id}`);
    return rows[0] ? camelRep(rows[0]) : null;
  },

  delete: async (id) => {
    await api('DELETE', 'reps', null, `?id=eq.${id}`);
  },
};

// ─── PRODUCTS ────────────────────────────────────────────────

export const productsDB = {
  getAll: async () => {
    const rows = await api('GET', 'products', null, '?order=date_created.asc');
    return rows.map(camelProduct);
  },

  getById: async (id) => {
    const rows = await api('GET', 'products', null, `?id=eq.${id}`);
    return rows[0] ? camelProduct(rows[0]) : null;
  },

  getAvailable: async () => {
    const rows = await api('GET', 'products', null, '?inventory_quantity=gt.0&order=product_name.asc');
    return rows.map(camelProduct);
  },

  create: async (data) => {
    const payload = {
      ...snakeProduct(data),
      total_stock_added: data.inventoryQuantity,
      total_stock_sold: 0,
      inventory_status: data.inventoryQuantity > 0 ? 'Available' : 'Sold Out',
    };
    const rows = await api('POST', 'products', payload);
    return rows[0] ? camelProduct(rows[0]) : null;
  },

  update: async (id, data) => {
    const payload = snakeProduct(data);
    if (data.inventoryQuantity !== undefined) {
      payload.inventory_status = data.inventoryQuantity > 0 ? 'Available' : 'Sold Out';
    }
    const rows = await api('PATCH', 'products', payload, `?id=eq.${id}`);
    return rows[0] ? camelProduct(rows[0]) : null;
  },

  delete: async (id) => {
    await api('DELETE', 'products', null, `?id=eq.${id}`);
  },

  restock: async (id, quantity, adminName) => {
    // Get current product
    const product = await productsDB.getById(id);
    const newQty = product.inventoryQuantity + quantity;

    // Update product
    await api('PATCH', 'products', {
      inventory_quantity: newQty,
      total_stock_added: product.totalStockAdded + quantity,
      inventory_status: newQty > 0 ? 'Available' : 'Sold Out',
    }, `?id=eq.${id}`);

    // Log restock
    await api('POST', 'restocks', {
      product_id: id,
      product_name: product.productName,
      quantity_added: quantity,
      admin_name: adminName || 'Admin',
    });

    return productsDB.getById(id);
  },

  deductStock: async (id, quantity) => {
    const product = await productsDB.getById(id);
    const newQty = Math.max(0, product.inventoryQuantity - quantity);
    await api('PATCH', 'products', {
      inventory_quantity: newQty,
      total_stock_sold: product.totalStockSold + quantity,
      inventory_status: newQty > 0 ? 'Available' : 'Sold Out',
    }, `?id=eq.${id}`);
    return productsDB.getById(id);
  },
};

// ─── SALES ───────────────────────────────────────────────────

export const salesDB = {
  getAll: async () => {
    const rows = await api('GET', 'sales', null, '?order=date_sold.asc');
    return rows.map(camelSale);
  },

  getByRep: async (repId) => {
    const rows = await api('GET', 'sales', null, `?rep_id=eq.${repId}&order=date_sold.desc`);
    return rows.map(camelSale);
  },

  getByPeriod: async (startDate, endDate) => {
    const rows = await api('GET', 'sales', null,
      `?date_sold=gte.${startDate}T00:00:00Z&date_sold=lte.${endDate}T23:59:59Z&order=date_sold.asc`
    );
    return rows.map(camelSale);
  },

  create: async (data) => {
    const rows = await api('POST', 'sales', snakeSale(data));
    const sale = rows[0] ? camelSale(rows[0]) : null;
    // Deduct inventory
    await productsDB.deductStock(data.productId, data.quantitySold);
    return sale;
  },
};

// ─── RESTOCKS ────────────────────────────────────────────────

export const restocksDB = {
  getAll: async () => {
    const rows = await api('GET', 'restocks', null, '?order=date_added.desc');
    return rows.map(camelRestock);
  },
};

// ─── PERIODS ─────────────────────────────────────────────────

export const periodsDB = {
  getAll: async () => {
    const rows = await api('GET', 'payment_periods', null, '?order=start_date.desc');
    return rows.map(camelPeriod);
  },

  getOpen: async () => {
    const rows = await api('GET', 'payment_periods', null, '?status=eq.Open&limit=1');
    return rows[0] ? camelPeriod(rows[0]) : null;
  },

  create: async (data) => {
    const rows = await api('POST', 'payment_periods', snakePeriod(data));
    return rows[0] ? camelPeriod(rows[0]) : null;
  },

  update: async (id, data) => {
    const rows = await api('PATCH', 'payment_periods', snakePeriod(data), `?id=eq.${id}`);
    return rows[0] ? camelPeriod(rows[0]) : null;
  },

  delete: async (id) => {
    await api('DELETE', 'payment_periods', null, `?id=eq.${id}`);
  },
};

// ─── FIELD MAPPERS (snake_case ↔ camelCase) ──────────────────

const camelRep = r => ({
  id: r.id, repId: r.rep_id, name: r.name, phone: r.phone,
  email: r.email, password: r.password, status: r.status,
  dateCreated: r.date_created,
});
const snakeRep = r => ({
  ...(r.repId && { rep_id: r.repId }),
  ...(r.name && { name: r.name }),
  ...(r.phone !== undefined && { phone: r.phone }),
  ...(r.email && { email: r.email }),
  ...(r.password && { password: r.password }),
  ...(r.status && { status: r.status }),
});

const camelProduct = p => ({
  id: p.id, productName: p.product_name, sku: p.sku, category: p.category,
  sellingPrice: Number(p.selling_price), inventoryQuantity: p.inventory_quantity,
  totalStockAdded: p.total_stock_added, totalStockSold: p.total_stock_sold,
  inventoryStatus: p.inventory_status, dateCreated: p.date_created,
});
const snakeProduct = p => ({
  ...(p.productName && { product_name: p.productName }),
  ...(p.sku && { sku: p.sku }),
  ...(p.category && { category: p.category }),
  ...(p.sellingPrice !== undefined && { selling_price: p.sellingPrice }),
  ...(p.inventoryQuantity !== undefined && { inventory_quantity: p.inventoryQuantity }),
});

const camelSale = s => ({
  id: s.id, repId: s.rep_id, repName: s.rep_name, productId: s.product_id,
  productName: s.product_name, quantitySold: s.quantity_sold,
  unitPrice: Number(s.unit_price), totalSaleValue: Number(s.total_sale_value),
  paymentMethod: s.payment_method, customerName: s.customer_name,
  customerPhone: s.customer_phone, dateSold: s.date_sold,
});
const snakeSale = s => ({
  rep_id: s.repId, rep_name: s.repName, product_id: s.productId,
  product_name: s.productName, quantity_sold: s.quantitySold,
  unit_price: s.unitPrice, total_sale_value: s.totalSaleValue,
  payment_method: s.paymentMethod, customer_name: s.customerName || null,
  customer_phone: s.customerPhone || null,
});

const camelRestock = r => ({
  id: r.id, productId: r.product_id, productName: r.product_name,
  quantityAdded: r.quantity_added, dateAdded: r.date_added, adminName: r.admin_name,
});

const camelPeriod = p => ({
  id: p.id, periodName: p.period_name, startDate: p.start_date,
  endDate: p.end_date, status: p.status,
});
const snakePeriod = p => ({
  ...(p.periodName && { period_name: p.periodName }),
  ...(p.startDate && { start_date: p.startDate }),
  ...(p.endDate && { end_date: p.endDate }),
  ...(p.status && { status: p.status }),
});
