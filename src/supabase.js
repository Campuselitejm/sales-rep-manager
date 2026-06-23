export const SUPABASE_URL = 'https://hadpvqnosakaegvrbevv.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhhZHB2cW5vc2FrYWVndnJiZXZ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxNDc0OTEsImV4cCI6MjA5NzcyMzQ5MX0.npcgc7-5wEE8mcYUUnU_SXp8tWVPT9VUXqxf5oFY9cI';

const H = {
  'Content-Type': 'application/json',
  'apikey': SUPABASE_ANON_KEY,
  'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
  'Prefer': 'return=representation',
};

const api = async (method, table, body=null, query='') => {
  const url = `${SUPABASE_URL}/rest/v1/${table}${query}`;
  const res = await fetch(url, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) { const e = await res.text(); throw new Error(`${table}: ${e}`); }
  const t = await res.text(); return t ? JSON.parse(t) : [];
};

// ─── MAPPERS ─────────────────────────────────────────────────
const cRep = r => ({ id:r.id, repId:r.rep_id, name:r.name, phone:r.phone, email:r.email, password:r.password, status:r.status, mustChangePassword:r.must_change_password, dateCreated:r.date_created });
const sRep = r => ({ ...(r.repId&&{rep_id:r.repId}), ...(r.name&&{name:r.name}), ...(r.phone!==undefined&&{phone:r.phone}), ...(r.email&&{email:r.email}), ...(r.password&&{password:r.password}), ...(r.status&&{status:r.status}), ...(r.mustChangePassword!==undefined&&{must_change_password:r.mustChangePassword}) });
const cProd = p => ({ id:p.id, productName:p.product_name, sku:p.sku, category:p.category, sellingPrice:Number(p.selling_price), costPrice:Number(p.cost_price||0), inventoryQuantity:p.inventory_quantity, totalStockAdded:p.total_stock_added, totalStockSold:p.total_stock_sold, inventoryStatus:p.inventory_status, dateCreated:p.date_created });
const sProd = p => ({ ...(p.productName&&{product_name:p.productName}), ...(p.sku&&{sku:p.sku}), ...(p.category&&{category:p.category}), ...(p.sellingPrice!==undefined&&{selling_price:p.sellingPrice}), ...(p.costPrice!==undefined&&{cost_price:p.costPrice}), ...(p.inventoryQuantity!==undefined&&{inventory_quantity:p.inventoryQuantity}) });
const cSale = s => ({ id:s.id, repId:s.rep_id, repName:s.rep_name, productId:s.product_id, productName:s.product_name, quantitySold:s.quantity_sold, unitPrice:Number(s.unit_price), totalSaleValue:Number(s.total_sale_value), paymentMethod:s.payment_method, customerName:s.customer_name, customerPhone:s.customer_phone, dateSold:s.date_sold, restockPeriodId:s.restock_period_id, repInventoryId:s.rep_inventory_id });
const sSale = s => ({ rep_id:s.repId, rep_name:s.repName, product_id:s.productId, product_name:s.productName, quantity_sold:s.quantitySold, unit_price:s.unitPrice, total_sale_value:s.totalSaleValue, payment_method:s.paymentMethod, customer_name:s.customerName||null, customer_phone:s.customerPhone||null, restock_period_id:s.restockPeriodId||null, rep_inventory_id:s.repInventoryId||null });
const cRstock = r => ({ id:r.id, productId:r.product_id, productName:r.product_name, quantityAdded:r.quantity_added, dateAdded:r.date_added, adminName:r.admin_name });
const cPeriod = p => ({ id:p.id, periodName:p.period_name, startDate:p.start_date, endDate:p.end_date, status:p.status });
const sPeriod = p => ({ ...(p.periodName&&{period_name:p.periodName}), ...(p.startDate&&{start_date:p.startDate}), ...(p.endDate&&{end_date:p.endDate}), ...(p.status&&{status:p.status}) });
const cRP = r => ({ id:r.id, productId:r.product_id, productName:r.product_name, quantityAdded:r.quantity_added, costPrice:Number(r.cost_price||0), sellingPrice:Number(r.selling_price), startedAt:r.started_at, endedAt:r.ended_at, status:r.status, adminName:r.admin_name });
const sRP = r => ({ product_id:r.productId, product_name:r.productName, quantity_added:r.quantityAdded, cost_price:r.costPrice, selling_price:r.sellingPrice, status:r.status||'Active', admin_name:r.adminName||'Admin' });
const cRI = r => ({ id:r.id, repId:r.rep_id, repName:r.rep_name, productId:r.product_id, productName:r.product_name, restockPeriodId:r.restock_period_id, quantityAllocated:r.quantity_allocated, quantitySold:r.quantity_sold, quantityConfirmed:r.quantity_confirmed, quantityRemaining:r.quantity_allocated-r.quantity_sold, confirmed:r.confirmed, confirmedAt:r.confirmed_at });
const sRI = r => ({ rep_id:r.repId, rep_name:r.repName, product_id:r.productId, product_name:r.productName, restock_period_id:r.restockPeriodId, quantity_allocated:r.quantityAllocated, quantity_sold:r.quantitySold||0, quantity_confirmed:r.quantityConfirmed||0, confirmed:r.confirmed||false });
const cComm = c => ({ id:c.id, repId:c.rep_id, repName:c.rep_name, restockPeriodId:c.restock_period_id, productName:c.product_name, unitsSold:c.units_sold, sellingPrice:Number(c.selling_price), commissionRate:Number(c.commission_rate), commissionAmount:Number(c.commission_amount), status:c.status, dueAt:c.due_at, paidAt:c.paid_at, paidBy:c.paid_by });

// ─── REPS ────────────────────────────────────────────────────
export const repsDB = {
  getAll: async () => (await api('GET','reps',null,'?order=date_created.asc')).map(cRep),
  getById: async id => { const r=await api('GET','reps',null,`?id=eq.${id}`); return r[0]?cRep(r[0]):null; },
  getByRepId: async rid => { const r=await api('GET','reps',null,`?rep_id=eq.${rid}`); return r[0]?cRep(r[0]):null; },
  create: async data => { const r=await api('POST','reps',sRep(data)); return r[0]?cRep(r[0]):null; },
  update: async (id,data) => { const r=await api('PATCH','reps',sRep(data),`?id=eq.${id}`); return r[0]?cRep(r[0]):null; },
  delete: async id => api('DELETE','reps',null,`?id=eq.${id}`),
  changePassword: async (id,password) => { const r=await api('PATCH','reps',{password,must_change_password:false},`?id=eq.${id}`); return r[0]?cRep(r[0]):null; },
};

// ─── PRODUCTS ────────────────────────────────────────────────
export const productsDB = {
  getAll: async () => (await api('GET','products',null,'?order=date_created.asc')).map(cProd),
  getById: async id => { const r=await api('GET','products',null,`?id=eq.${id}`); return r[0]?cProd(r[0]):null; },
  getAvailable: async () => (await api('GET','products',null,'?inventory_quantity=gt.0&order=product_name.asc')).map(cProd),
  create: async data => { const r=await api('POST','products',{...sProd(data),total_stock_added:data.inventoryQuantity,total_stock_sold:0,inventory_status:data.inventoryQuantity>0?'Available':'Sold Out'}); return r[0]?cProd(r[0]):null; },
  update: async (id,data) => { const p=sProd(data); if(data.inventoryQuantity!==undefined)p.inventory_status=data.inventoryQuantity>0?'Available':'Sold Out'; const r=await api('PATCH','products',p,`?id=eq.${id}`); return r[0]?cProd(r[0]):null; },
  delete: async id => api('DELETE','products',null,`?id=eq.${id}`),
  deductStock: async (id,qty) => {
    const p=await productsDB.getById(id);
    const nq=Math.max(0,p.inventoryQuantity-qty);
    await api('PATCH','products',{inventory_quantity:nq,total_stock_sold:p.totalStockSold+qty,inventory_status:nq>0?'Available':'Sold Out'},`?id=eq.${id}`);
    return productsDB.getById(id);
  },
};

// ─── RESTOCK PERIODS ─────────────────────────────────────────
export const restockPeriodsDB = {
  getAll: async () => (await api('GET','restock_periods',null,'?order=created_at.desc')).map(cRP),
  getById: async id => { const r=await api('GET','restock_periods',null,`?id=eq.${id}`); return r[0]?cRP(r[0]):null; },
  getActive: async productId => { const r=await api('GET','restock_periods',null,`?product_id=eq.${productId}&status=eq.Active&order=created_at.desc&limit=1`); return r[0]?cRP(r[0]):null; },
  getByProduct: async productId => (await api('GET','restock_periods',null,`?product_id=eq.${productId}&order=created_at.desc`)).map(cRP),
  create: async data => { const r=await api('POST','restock_periods',sRP(data)); return r[0]?cRP(r[0]):null; },
  close: async id => { const r=await api('PATCH','restock_periods',{status:'Closed',ended_at:new Date().toISOString()},`?id=eq.${id}`); return r[0]?cRP(r[0]):null; },
};

// ─── REP INVENTORY ───────────────────────────────────────────
export const repInventoryDB = {
  getAll: async () => (await api('GET','rep_inventory',null,'?order=created_at.desc')).map(cRI),
  getByRep: async repId => (await api('GET','rep_inventory',null,`?rep_id=eq.${repId}&order=created_at.desc`)).map(cRI),
  getByRepAndProduct: async (repId,productId) => { const r=await api('GET','rep_inventory',null,`?rep_id=eq.${repId}&product_id=eq.${productId}&order=created_at.desc&limit=1`); return r[0]?cRI(r[0]):null; },
  getByPeriod: async periodId => (await api('GET','rep_inventory',null,`?restock_period_id=eq.${periodId}&order=rep_name.asc`)).map(cRI),
  getAvailableForRep: async repId => (await api('GET','rep_inventory',null,`?rep_id=eq.${repId}&confirmed=eq.true`)).map(cRI).filter(r=>r.quantityRemaining>0),
  create: async data => { const r=await api('POST','rep_inventory',sRI(data)); return r[0]?cRI(r[0]):null; },
  update: async (id,data) => { const r=await api('PATCH','rep_inventory',data,`?id=eq.${id}`); return r[0]?cRI(r[0]):null; },
  confirmReceipt: async (id,qty) => {
    const r=await api('PATCH','rep_inventory',{confirmed:true,quantity_confirmed:qty,confirmed_at:new Date().toISOString()},`?id=eq.${id}`);
    return r[0]?cRI(r[0]):null;
  },
  deductSale: async (id,qty) => {
    const inv=await api('GET','rep_inventory',null,`?id=eq.${id}`);
    if(!inv[0])return null;
    const newSold=inv[0].quantity_sold+qty;
    const r=await api('PATCH','rep_inventory',{quantity_sold:newSold},`?id=eq.${id}`);
    return r[0]?cRI(r[0]):null;
  },
  reassign: async (id,newRepId,newRepName,qty) => {
    const inv=await api('GET','rep_inventory',null,`?id=eq.${id}`);
    if(!inv[0])return null;
    const remaining=inv[0].quantity_allocated-inv[0].quantity_sold;
    const transfer=Math.min(qty,remaining);
    // Reduce from source
    await api('PATCH','rep_inventory',{quantity_allocated:inv[0].quantity_allocated-transfer},`?id=eq.${id}`);
    // Create new allocation for target
    const newInv={rep_id:newRepId,rep_name:newRepName,product_id:inv[0].product_id,product_name:inv[0].product_name,restock_period_id:inv[0].restock_period_id,quantity_allocated:transfer,quantity_sold:0,quantity_confirmed:0,confirmed:false};
    const r=await api('POST','rep_inventory',newInv);
    return r[0]?cRI(r[0]):null;
  },
};

// ─── REP COMMISSIONS ─────────────────────────────────────────
export const commissionsDB = {
  getAll: async () => (await api('GET','rep_commissions',null,'?order=created_at.desc')).map(cComm),
  getByRep: async repId => (await api('GET','rep_commissions',null,`?rep_id=eq.${repId}&order=created_at.desc`)).map(cComm),
  getByPeriod: async periodId => (await api('GET','rep_commissions',null,`?restock_period_id=eq.${periodId}&order=rep_name.asc`)).map(cComm),
  getOrCreate: async (repId,repName,periodId,productName,sellingPrice) => {
    const existing=await api('GET','rep_commissions',null,`?rep_id=eq.${repId}&restock_period_id=eq.${periodId}`);
    if(existing[0])return cComm(existing[0]);
    const r=await api('POST','rep_commissions',{rep_id:repId,rep_name:repName,restock_period_id:periodId,product_name:productName,units_sold:0,selling_price:sellingPrice,commission_rate:0.15,commission_amount:0,status:'Pending'});
    return r[0]?cComm(r[0]):null;
  },
  addSale: async (repId,periodId,qtySold,sellingPrice) => {
    const existing=await api('GET','rep_commissions',null,`?rep_id=eq.${repId}&restock_period_id=eq.${periodId}`);
    if(!existing[0])return null;
    const newUnits=existing[0].units_sold+qtySold;
    const newAmount=newUnits*sellingPrice*0.15;
    const r=await api('PATCH','rep_commissions',{units_sold:newUnits,commission_amount:newAmount},`?id=eq.${existing[0].id}`);
    return r[0]?cComm(r[0]):null;
  },
  markDue: async id => { const r=await api('PATCH','rep_commissions',{status:'Due',due_at:new Date().toISOString()},`?id=eq.${id}`); return r[0]?cComm(r[0]):null; },
  markPaid: async (id,adminName) => { const r=await api('PATCH','rep_commissions',{status:'Paid',paid_at:new Date().toISOString(),paid_by:adminName},`?id=eq.${id}`); return r[0]?cComm(r[0]):null; },
};

// ─── SALES ───────────────────────────────────────────────────
export const salesDB = {
  getAll: async () => (await api('GET','sales',null,'?order=date_sold.asc')).map(cSale),
  getByRep: async repId => (await api('GET','sales',null,`?rep_id=eq.${repId}&order=date_sold.desc`)).map(cSale),
  getByPeriod: async (start,end) => (await api('GET','sales',null,`?date_sold=gte.${start}T00:00:00Z&date_sold=lte.${end}T23:59:59Z&order=date_sold.asc`)).map(cSale),
  create: async data => {
    const sale={...sSale(data)};
    const r=await api('POST','sales',sale);
    const s=r[0]?cSale(r[0]):null;
    // Deduct from overall inventory
    await productsDB.deductStock(data.productId,data.quantitySold);
    // Deduct from rep inventory if repInventoryId provided
    if(data.repInventoryId){
      await repInventoryDB.deductSale(data.repInventoryId,data.quantitySold);
      // Update commission
      if(data.restockPeriodId){
        await commissionsDB.addSale(data.repId,data.restockPeriodId,data.quantitySold,data.unitPrice);
        // Check if rep inventory is exhausted → mark commission Due
        const inv=await api('GET','rep_inventory',null,`?id=eq.${data.repInventoryId}`);
        if(inv[0]&&inv[0].quantity_sold>=inv[0].quantity_allocated){
          const comm=await api('GET','rep_commissions',null,`?rep_id=eq.${data.repId}&restock_period_id=eq.${data.restockPeriodId}`);
          if(comm[0])await commissionsDB.markDue(comm[0].id);
        }
      }
    }
    return s;
  },
};

// ─── RESTOCKS (legacy log) ───────────────────────────────────
export const restocksDB = {
  getAll: async () => (await api('GET','restocks',null,'?order=date_added.desc')).map(cRstock),
  restock: async (productId,quantity,costPrice,adminName) => {
    const product=await productsDB.getById(productId);
    // Close any active restock period for this product
    const active=await restockPeriodsDB.getActive(productId);
    if(active)await restockPeriodsDB.close(active.id);
    // Update product inventory
    const newQty=product.inventoryQuantity+quantity;
    await api('PATCH','products',{inventory_quantity:newQty,total_stock_added:product.totalStockAdded+quantity,inventory_status:newQty>0?'Available':'Sold Out'},`?id=eq.${productId}`);
    // Create new restock period
    const period=await restockPeriodsDB.create({productId,productName:product.productName,quantityAdded:quantity,costPrice,sellingPrice:product.sellingPrice,adminName});
    // Log to legacy restocks table
    await api('POST','restocks',{product_id:productId,product_name:product.productName,quantity_added:quantity,admin_name:adminName||'Admin'});
    return period;
  },
};

// ─── PAYMENT PERIODS ─────────────────────────────────────────
export const periodsDB = {
  getAll: async () => (await api('GET','payment_periods',null,'?order=start_date.desc')).map(cPeriod),
  getOpen: async () => { const r=await api('GET','payment_periods',null,'?status=eq.Open&limit=1'); return r[0]?cPeriod(r[0]):null; },
  create: async data => { const r=await api('POST','payment_periods',sPeriod(data)); return r[0]?cPeriod(r[0]):null; },
  update: async (id,data) => { const r=await api('PATCH','payment_periods',sPeriod(data),`?id=eq.${id}`); return r[0]?cPeriod(r[0]):null; },
  delete: async id => api('DELETE','payment_periods',null,`?id=eq.${id}`),
};
