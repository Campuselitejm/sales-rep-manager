// ============================================================
// SALES REP INVENTORY MANAGER — Supabase Cloud Version
// Supports 10 reps, real-time sync across all devices
// ============================================================
// SETUP: Edit src/supabase.js and add your Supabase URL + Key
// ============================================================

import { useState, useEffect, useMemo, createContext, useContext, useCallback } from "react";
import { repsDB, productsDB, salesDB, restocksDB, periodsDB } from "./supabase.js";

// ─── UTILS ───────────────────────────────────────────────────
const fmt = {
  currency: n => `$${Number(n||0).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}`,
  number: n => Number(n||0).toLocaleString("en-US"),
  date: d => { if(!d)return"—"; return new Date(d).toLocaleDateString("en-US",{year:"numeric",month:"short",day:"numeric"}); },
};
const PAYMENT_METHODS = ["Cash","Card","Bank Transfer","Other"];
const PRODUCT_CATEGORIES = ["Electronics","Tools","Furniture","Clothing","Food & Beverage","Other"];

function calcRepStats(repId, sales) {
  const s = sales.filter(x => x.repId === repId);
  return { totalValue: s.reduce((a,b)=>a+b.totalSaleValue,0), unitsSold: s.reduce((a,b)=>a+b.quantitySold,0), salesCount: s.length };
}
function groupSalesByProduct(sales) {
  const m = {};
  sales.forEach(s => { if(!m[s.productName])m[s.productName]={name:s.productName,value:0,units:0}; m[s.productName].value+=s.totalSaleValue; m[s.productName].units+=s.quantitySold; });
  return Object.values(m).sort((a,b)=>b.value-a.value);
}
function groupSalesByRep(sales) {
  const m = {};
  sales.forEach(s => { if(!m[s.repId])m[s.repId]={repId:s.repId,name:s.repName,value:0,units:0}; m[s.repId].value+=s.totalSaleValue; m[s.repId].units+=s.quantitySold; });
  return Object.values(m).sort((a,b)=>b.value-a.value);
}
function downloadCSV(filename, headers, rows) {
  const esc = v => { const s=String(v??""); return s.includes(",")||s.includes('"')?`"${s.replace(/"/g,'""')}"`:`${s}`; };
  const csv = [headers,...rows].map(r=>r.map(esc).join(",")).join("\n");
  const a = document.createElement("a"); a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"})); a.download=filename; a.click();
}

// ─── AUTH ────────────────────────────────────────────────────
const AuthCtx = createContext(null);
const SESSION_KEY = "srm_session_v2";

function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    try { const s = sessionStorage.getItem(SESSION_KEY); if(s) setUser(JSON.parse(s)); } catch {}
    setLoading(false);
  }, []);
  const loginAdmin = (u, p) => {
    if(u==="QKadmin"&&p==="eatthecake") { const s={type:"admin",name:"Admin",id:"admin"}; sessionStorage.setItem(SESSION_KEY,JSON.stringify(s)); setUser(s); return{success:true}; }
    return { success:false, message:"Invalid admin credentials." };
  };
  const loginRep = async (repId, pw) => {
    try {
      const rep = await repsDB.getByRepId(repId.toUpperCase());
      if(!rep) return { success:false, message:"Rep ID not found." };
      if(rep.status==="Inactive") return { success:false, message:"Account inactive. Contact admin." };
      if(rep.password!==pw) return { success:false, message:"Incorrect password." };
      const s = { type:"rep", name:rep.name, id:rep.id, repId:rep.repId };
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(s)); setUser(s); return { success:true };
    } catch(e) { return { success:false, message:"Connection error. Check your internet." }; }
  };
  const logout = () => { sessionStorage.removeItem(SESSION_KEY); setUser(null); };
  return <AuthCtx.Provider value={{user,loading,loginAdmin,loginRep,logout}}>{children}</AuthCtx.Provider>;
}
const useAuth = () => useContext(AuthCtx);

// ─── SHARED UI ───────────────────────────────────────────────
function StatCard({title,value,subtitle,icon,color="red",onClick,loading}) {
  const colors={red:"from-red-500 to-red-700",blue:"from-blue-500 to-blue-700",green:"from-emerald-500 to-emerald-700",purple:"from-purple-500 to-purple-700",orange:"from-orange-500 to-orange-700",gray:"from-gray-500 to-gray-700",indigo:"from-indigo-500 to-indigo-700",teal:"from-teal-500 to-teal-700"};
  return (
    <div className={`bg-white rounded-2xl shadow-sm border border-gray-100 p-4 ${onClick?"cursor-pointer hover:shadow-md transition-shadow":""}`} onClick={onClick}>
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1 truncate">{title}</p>
          {loading ? <div className="h-6 w-20 bg-gray-100 rounded animate-pulse mt-1"/> : <p className="text-xl font-bold text-gray-900 leading-tight">{value}</p>}
          {subtitle&&<p className="text-xs text-gray-400 mt-0.5 truncate">{subtitle}</p>}
        </div>
        {icon&&<div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${colors[color]} flex items-center justify-center text-white text-base flex-shrink-0 ml-2`}>{icon}</div>}
      </div>
    </div>
  );
}

function Modal({isOpen,onClose,title,children,size="md"}) {
  if(!isOpen) return null;
  const sizes={sm:"max-w-sm",md:"max-w-md",lg:"max-w-lg",xl:"max-w-2xl"};
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm"/>
      <div className={`relative bg-white rounded-2xl shadow-2xl w-full ${sizes[size]} max-h-[90vh] overflow-y-auto`} onClick={e=>e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">{title}</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 text-sm">✕</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function ConfirmModal({isOpen,onClose,onConfirm,title,message,confirmLabel="Confirm",danger}) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm">
      <p className="text-gray-600 mb-6 text-sm">{message}</p>
      <div className="flex gap-3">
        <button onClick={onClose} className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-gray-700 font-medium hover:bg-gray-50 text-sm">Cancel</button>
        <button onClick={()=>{onConfirm();onClose();}} className={`flex-1 px-4 py-2.5 rounded-xl font-medium text-white text-sm ${danger?"bg-red-500 hover:bg-red-600":"bg-gray-900 hover:bg-gray-800"}`}>{confirmLabel}</button>
      </div>
    </Modal>
  );
}

function Toast({message,visible}) {
  if(!visible) return null;
  return <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-emerald-600 text-white px-6 py-3 rounded-2xl shadow-xl flex items-center gap-2 text-sm font-semibold">✓ {message}</div>;
}

function ErrorBanner({message}) {
  if(!message) return null;
  return <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4 text-sm text-red-700 flex items-center gap-2">⚠️ {message}</div>;
}

function Badge({label,type="default"}) {
  const s={success:"bg-emerald-50 text-emerald-700 border-emerald-200",danger:"bg-red-50 text-red-700 border-red-200",warning:"bg-amber-50 text-amber-700 border-amber-200",info:"bg-blue-50 text-blue-700 border-blue-200",default:"bg-gray-100 text-gray-600 border-gray-200",purple:"bg-purple-50 text-purple-700 border-purple-200"};
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-semibold border ${s[type]}`}>{label}</span>;
}

const inputCls = "w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent bg-white";

function FF({label,required,error,children,hint}) {
  return (
    <div>
      {label&&<label className="block text-sm font-semibold text-gray-700 mb-1.5">{label}{required&&<span className="text-red-500 ml-1">*</span>}</label>}
      {children}
      {hint&&<p className="text-xs text-gray-400 mt-1">{hint}</p>}
      {error&&<p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}

function EmptyState({icon="📭",title,message}) {
  return <div className="text-center py-12 px-4"><div className="text-4xl mb-3">{icon}</div><h3 className="text-base font-semibold text-gray-800 mb-1">{title}</h3><p className="text-gray-400 text-sm">{message}</p></div>;
}

function Spinner({size="md"}) {
  return <div className={`${size==="sm"?"w-4 h-4 border-2":"w-8 h-8 border-4"} border-gray-200 border-t-red-500 rounded-full animate-spin`}/>;
}

function PageLoader() {
  return <div className="flex-1 flex items-center justify-center min-h-48"><Spinner/></div>;
}

function PBtn({children,onClick,disabled,loading,className="",variant="red"}) {
  const v={red:"bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white",dark:"bg-gray-900 hover:bg-gray-800 text-white",outline:"border-2 border-gray-200 hover:border-gray-300 text-gray-700 bg-white",green:"bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white"};
  return <button onClick={onClick} disabled={disabled||loading} className={`px-5 py-3 text-sm ${v[variant]} font-semibold rounded-xl transition-all flex items-center gap-2 justify-center disabled:opacity-50 disabled:cursor-not-allowed shadow-sm ${className}`}>{loading?<Spinner size="sm"/>:children}</button>;
}

function SearchBar({value,onChange,placeholder="Search..."}) {
  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
      <input type="text" value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-500 bg-white"/>
    </div>
  );
}

function SHeader({title,subtitle,action}) {
  return <div className="flex items-start justify-between mb-5 gap-3"><div><h2 className="text-xl font-bold text-gray-900">{title}</h2>{subtitle&&<p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}</div>{action&&<div className="flex-shrink-0">{action}</div>}</div>;
}

function Table({headers,rows,empty="No data",loading}) {
  if(loading) return <div className="space-y-3 py-4">{[1,2,3].map(i=><div key={i} className="h-12 bg-gray-50 rounded-xl animate-pulse"/>)}</div>;
  if(!rows.length) return <div className="text-center py-10 text-gray-400 text-sm">{empty}</div>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className="border-b border-gray-100">{headers.map((h,i)=><th key={i} className="text-left py-3 px-3 text-xs font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">{h}</th>)}</tr></thead>
        <tbody>{rows.map((row,i)=><tr key={i} className="border-b border-gray-50 hover:bg-gray-50/50">{row.map((c,j)=><td key={j} className="py-3 px-3 text-gray-800 whitespace-nowrap">{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

function BarChart({data,vk,lk,color="#DC143C"}) {
  if(!data?.length) return <div className="text-center text-gray-400 text-sm py-8">No data yet</div>;
  const max = Math.max(...data.map(d=>d[vk]));
  return (
    <div className="space-y-2.5">
      {data.map((item,i)=>(
        <div key={i}>
          <div className="flex justify-between text-xs mb-1"><span className="text-gray-600 truncate max-w-[65%]">{item[lk]}</span><span className="font-semibold text-gray-800 ml-2">{item[vk]>999?`$${(item[vk]/1000).toFixed(1)}k`:item[vk]}</span></div>
          <div className="w-full bg-gray-100 rounded-full h-2"><div className="h-2 rounded-full transition-all" style={{width:`${max>0?(item[vk]/max)*100:0}%`,backgroundColor:color}}/></div>
        </div>
      ))}
    </div>
  );
}

function useToast() {
  const [toast,setToast] = useState({visible:false,message:""});
  const show = msg => { setToast({visible:true,message:msg}); setTimeout(()=>setToast({visible:false,message:""}),3000); };
  return {toast,show};
}

function useAsync(fn, deps=[]) {
  const [data,setData] = useState(undefined);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState(null);
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const result = await fn();
      // If result is null/undefined, keep as null so =[] defaults work
      // If result is an array (most DB calls), ensure it's always an array
      setData(Array.isArray(result) ? result : (result ?? undefined));
    } catch(e) {
      setError(e.message);
      setData(undefined);
      console.error('useAsync error:', e.message);
    }
    setLoading(false);
  }, deps);
  useEffect(() => { load(); }, [load]);
  return {data, loading, error, reload:load};
}

// ─── LOGIN ───────────────────────────────────────────────────
function LoginScreen() {
  const [tab,setTab] = useState("admin");
  const [aForm,setAForm] = useState({username:"",password:""});
  const [rForm,setRForm] = useState({repId:"",password:""});
  const [error,setError] = useState(""); const [loading,setLoading] = useState(false);
  const {loginAdmin,loginRep} = useAuth();
  const doAdmin = async e => { e.preventDefault(); setError(""); setLoading(true); await new Promise(r=>setTimeout(r,300)); const res=loginAdmin(aForm.username,aForm.password); if(!res.success)setError(res.message); setLoading(false); };
  const doRep = async e => { e.preventDefault(); setError(""); setLoading(true); const res=await loginRep(rForm.repId,rForm.password); if(!res.success)setError(res.message); setLoading(false); };
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center p-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 -left-24 w-96 h-96 bg-red-600/10 rounded-full blur-3xl"/>
        <div className="absolute bottom-1/4 -right-24 w-96 h-96 bg-red-600/5 rounded-full blur-3xl"/>
      </div>
      <div className="relative w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-red-500 to-red-700 rounded-2xl shadow-2xl mb-4"><span className="text-2xl">📦</span></div>
          <h1 className="text-2xl font-bold text-white">Sales Rep Manager</h1>
          <p className="text-gray-400 text-sm mt-1">Cloud-Powered · Real-Time Sync</p>
        </div>
        <div className="bg-white/5 backdrop-blur border border-white/10 rounded-3xl p-6 shadow-2xl">
          <div className="flex bg-white/5 rounded-2xl p-1 mb-6">
            {["admin","rep"].map(t=><button key={t} onClick={()=>{setTab(t);setError("");}} className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${tab===t?"bg-white text-gray-900 shadow-sm":"text-gray-400 hover:text-gray-200"}`}>{t==="admin"?"Admin":"Sales Rep"}</button>)}
          </div>
          {error&&<div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 mb-4 text-red-300 text-sm">⚠️ {error}</div>}
          {tab==="admin"?(
            <form onSubmit={doAdmin} className="space-y-4">
              <div><label className="block text-sm font-medium text-gray-300 mb-1.5">Username</label><input value={aForm.username} onChange={e=>setAForm({...aForm,username:e.target.value})} placeholder="admin" className="w-full px-4 py-3.5 bg-white/10 border border-white/20 rounded-xl text-white placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-red-500" required/></div>
              <div><label className="block text-sm font-medium text-gray-300 mb-1.5">Password</label><input type="password" value={aForm.password} onChange={e=>setAForm({...aForm,password:e.target.value})} placeholder="••••••••" className="w-full px-4 py-3.5 bg-white/10 border border-white/20 rounded-xl text-white placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-red-500" required/></div>
              <button type="submit" disabled={loading} className="w-full py-3.5 bg-gradient-to-r from-red-600 to-red-700 text-white font-semibold rounded-xl flex items-center justify-center gap-2 disabled:opacity-60">{loading?<Spinner size="sm"/>:"🔐  Sign In as Admin"}</button>
            </form>
          ):(
            <form onSubmit={doRep} className="space-y-4">
              <div><label className="block text-sm font-medium text-gray-300 mb-1.5">Rep ID</label><input value={rForm.repId} onChange={e=>setRForm({...rForm,repId:e.target.value})} placeholder="e.g. REP001" className="w-full px-4 py-3.5 bg-white/10 border border-white/20 rounded-xl text-white placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 uppercase" required/></div>
              <div><label className="block text-sm font-medium text-gray-300 mb-1.5">Password</label><input type="password" value={rForm.password} onChange={e=>setRForm({...rForm,password:e.target.value})} placeholder="••••••••" className="w-full px-4 py-3.5 bg-white/10 border border-white/20 rounded-xl text-white placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-red-500" required/></div>
              <button type="submit" disabled={loading} className="w-full py-3.5 bg-gradient-to-r from-red-600 to-red-700 text-white font-semibold rounded-xl flex items-center justify-center gap-2 disabled:opacity-60">{loading?<Spinner size="sm"/>:"🚀  Sign In"}</button>
            </form>
          )}
          <div className="mt-5 pt-4 border-t border-white/10 text-center"><p className="text-xs text-gray-500">{tab==="admin"?"admin / admin123":"REP001–REP010 / rep123"}</p></div>
        </div>
      </div>
    </div>
  );
}

// ─── ADMIN LAYOUT ────────────────────────────────────────────
const NAV=[
  {id:"dashboard",label:"Dashboard",icon:"📊"},
  {id:"reps",label:"Sales Reps",icon:"👥"},
  {id:"products",label:"Products",icon:"🏷️"},
  {id:"inventory",label:"Inventory",icon:"📦"},
  {id:"sales",label:"Sales",icon:"💰"},
  {id:"restocks",label:"Restocks",icon:"🔄"},
  {id:"periods",label:"Payment Periods",icon:"📅"},
  {id:"reports",label:"Reports",icon:"📈"},
  {id:"settings",label:"Settings",icon:"⚙️"},
];

function AdminLayout({page,setPage,children}) {
  const {logout} = useAuth();
  const [mob,setMob] = useState(false);
  const NL = ({item}) => <button onClick={()=>{setPage(item.id);setMob(false);}} className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${page===item.id?"bg-gradient-to-r from-red-600 to-red-700 text-white shadow-lg":"text-gray-600 hover:bg-gray-100"}`}><span>{item.icon}</span><span>{item.label}</span></button>;
  return (
    <div className="min-h-screen bg-gray-50 flex">
      <aside className="hidden lg:flex flex-col w-60 bg-white border-r border-gray-100 fixed h-screen">
        <div className="p-4 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-gradient-to-br from-red-500 to-red-700 rounded-xl flex items-center justify-center"><span className="text-white text-sm">📦</span></div>
            <div><p className="text-sm font-bold text-gray-900">Sales Rep Manager</p><p className="text-xs text-gray-400">Cloud Edition</p></div>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">{NAV.map(n=><NL key={n.id} item={n}/>)}</nav>
        <div className="p-3 border-t border-gray-100">
          <div className="flex items-center gap-2 px-2 py-1.5 mb-1">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-red-400 to-red-600 flex items-center justify-center text-white text-xs font-bold">A</div>
            <div><p className="text-xs font-semibold text-gray-800">Admin</p><p className="text-xs text-emerald-500 font-medium">● Live</p></div>
          </div>
          <button onClick={logout} className="w-full px-3 py-2 text-xs font-semibold text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-xl text-left">🚪 Sign Out</button>
        </div>
      </aside>
      {mob&&(
        <div className="fixed inset-0 z-40 lg:hidden" onClick={()=>setMob(false)}>
          <div className="absolute inset-0 bg-black/50"/>
          <aside className="absolute left-0 top-0 h-full w-64 bg-white shadow-2xl p-3" onClick={e=>e.stopPropagation()}>
            <div className="flex items-center justify-between px-2 py-2 mb-2">
              <div className="flex items-center gap-2"><div className="w-7 h-7 bg-gradient-to-br from-red-500 to-red-700 rounded-xl flex items-center justify-center"><span className="text-white text-xs">📦</span></div><p className="text-sm font-bold text-gray-900">Sales Rep Manager</p></div>
              <button onClick={()=>setMob(false)} className="text-gray-400 text-lg">✕</button>
            </div>
            <nav className="space-y-0.5">{NAV.map(n=><NL key={n.id} item={n}/>)}</nav>
            <div className="mt-4 pt-4 border-t border-gray-100"><button onClick={logout} className="w-full px-4 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50 rounded-xl text-left">🚪 Sign Out</button></div>
          </aside>
        </div>
      )}
      <div className="flex-1 flex flex-col lg:ml-60">
        <header className="bg-white border-b border-gray-100 px-4 lg:px-6 py-3 flex items-center justify-between sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <button onClick={()=>setMob(true)} className="lg:hidden w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center text-gray-600 text-sm">☰</button>
            <div>
              <h1 className="text-base font-bold text-gray-900">{NAV.find(n=>n.id===page)?.label||"Dashboard"}</h1>
              <p className="text-xs text-gray-400 hidden sm:block">{new Date().toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric",year:"numeric"})}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 bg-emerald-50 px-3 py-1 rounded-xl">● Live</span>
          </div>
        </header>
        <main className="flex-1 p-4 lg:p-6 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}

// ─── ADMIN DASHBOARD ─────────────────────────────────────────
function AdminDashboard({setPage}) {
  const {data:sales=[],loading:sl} = useAsync(()=>salesDB.getAll());
  const {data:products=[],loading:pl} = useAsync(()=>productsDB.getAll());
  const {data:reps=[],loading:rl} = useAsync(()=>repsDB.getAll());
  const {data:openPeriod} = useAsync(()=>periodsDB.getOpen());
  const loading = sl||pl||rl;

  const totalRev = sales.reduce((s,x)=>s+x.totalSaleValue,0);
  const totalInv = products.reduce((s,p)=>s+p.inventoryQuantity,0);
  const totalSold = products.reduce((s,p)=>s+p.totalStockSold,0);
  const soldOut = products.filter(p=>p.inventoryQuantity===0).length;
  const byProduct = groupSalesByProduct(sales);
  const byRep = groupSalesByRep(sales);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard title="Total Products" value={products.length} icon="🏷️" color="blue" subtitle={`${soldOut} sold out`} onClick={()=>setPage("products")} loading={loading}/>
        <StatCard title="Total Inventory" value={fmt.number(totalInv)} icon="📦" color="indigo" subtitle="units in stock" onClick={()=>setPage("inventory")} loading={loading}/>
        <StatCard title="Units Sold" value={fmt.number(totalSold)} icon="📤" color="green" subtitle="all time" onClick={()=>setPage("sales")} loading={loading}/>
        <StatCard title="Total Revenue" value={fmt.currency(totalRev)} icon="💰" color="red" loading={loading}/>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard title="Active Reps" value={reps.filter(r=>r.status==="Active").length} icon="👥" color="teal" subtitle={`${reps.length} total`} onClick={()=>setPage("reps")} loading={loading}/>
        <StatCard title="Total Reps" value={reps.length} icon="👤" color="purple" subtitle="registered" loading={loading}/>
        <StatCard title="Sold Out Items" value={soldOut} icon="⚠️" color="gray" onClick={()=>setPage("restocks")} loading={loading}/>
        <StatCard title="Total Sales" value={sales.length} icon="🧾" color="orange" onClick={()=>setPage("sales")} loading={loading}/>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-4"><div><h3 className="font-bold text-gray-900">Sales by Product</h3><p className="text-xs text-gray-400">Revenue breakdown</p></div><span className="text-xl">🏷️</span></div>
          {loading ? <div className="space-y-2">{[1,2,3].map(i=><div key={i} className="h-6 bg-gray-50 rounded animate-pulse"/>)}</div> : <BarChart data={byProduct.slice(0,5)} vk="value" lk="name" color="#DC143C"/>}
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-4"><div><h3 className="font-bold text-gray-900">Sales by Rep</h3><p className="text-xs text-gray-400">Revenue per representative</p></div><span className="text-xl">👥</span></div>
          {loading ? <div className="space-y-2">{[1,2,3].map(i=><div key={i} className="h-6 bg-gray-50 rounded animate-pulse"/>)}</div> : <BarChart data={byRep.slice(0,10)} vk="value" lk="name" color="#6366F1"/>}
        </div>
      </div>
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <div className="flex items-center justify-between mb-4"><h3 className="font-bold text-gray-900">Recent Sales</h3><button onClick={()=>setPage("sales")} className="text-xs font-semibold text-red-600">View All →</button></div>
        {loading ? <div className="space-y-3">{[1,2,3,4].map(i=><div key={i} className="h-10 bg-gray-50 rounded-xl animate-pulse"/>)}</div> : (
          <div className="space-y-3">
            {sales.slice(-6).reverse().map((s,i)=>(
              <div key={i} className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-red-50 flex items-center justify-center text-sm flex-shrink-0">💰</div>
                <div className="flex-1 min-w-0"><p className="text-xs font-semibold text-gray-800 truncate">{s.productName}</p><p className="text-xs text-gray-400">{s.repName} · {fmt.date(s.dateSold)}</p></div>
                <span className="text-sm font-bold text-emerald-600">{fmt.currency(s.totalSaleValue)}</span>
              </div>
            ))}
            {sales.length===0&&<EmptyState icon="💰" title="No sales yet" message="Sales will appear here once reps start logging"/>}
          </div>
        )}
      </div>
      <div className="bg-gradient-to-r from-gray-900 to-gray-800 rounded-2xl p-5">
        <h3 className="text-white font-bold mb-4">Quick Actions</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[{label:"Add Product",icon:"➕",page:"products"},{label:"Restock Item",icon:"🔄",page:"restocks"},{label:"Add Rep",icon:"👤",page:"reps"},{label:"Reports",icon:"📈",page:"reports"}].map(a=>(
            <button key={a.label} onClick={()=>setPage(a.page)} className="flex flex-col items-center gap-2 p-4 bg-white/10 hover:bg-white/20 rounded-xl text-white transition-all">
              <span className="text-2xl">{a.icon}</span><span className="text-xs font-semibold">{a.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── ADMIN REPS ──────────────────────────────────────────────
function RepForm({initial,onSave,onClose,saving}) {
  const [form,setForm] = useState(initial||{name:"",repId:"",phone:"",email:"",password:"",status:"Active"});
  const [errors,setErrors] = useState({});
  const isEdit = !!initial?.id;
  const validate = () => { const e={}; if(!form.name.trim())e.name="Required"; if(!form.repId.trim())e.repId="Required"; if(!isEdit&&!form.password.trim())e.password="Required"; if(!form.email.trim())e.email="Required"; setErrors(e); return!Object.keys(e).length; };
  const submit = e => { e.preventDefault(); if(!validate())return; onSave({...form,repId:form.repId.toUpperCase()}); };
  const set = (k,v) => setForm(f=>({...f,[k]:v}));
  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <FF label="Full Name" required error={errors.name}><input className={inputCls} value={form.name} onChange={e=>set("name",e.target.value)} placeholder="Full name"/></FF>
        <FF label="Rep ID" required error={errors.repId}><input className={`${inputCls} uppercase`} value={form.repId} onChange={e=>set("repId",e.target.value)} placeholder="REP011" disabled={isEdit}/></FF>
      </div>
      <FF label="Phone"><input className={inputCls} value={form.phone||""} onChange={e=>set("phone",e.target.value)} placeholder="+1 876-555-0000"/></FF>
      <FF label="Email" required error={errors.email}><input className={inputCls} type="email" value={form.email} onChange={e=>set("email",e.target.value)} placeholder="email@example.com"/></FF>
      <FF label={isEdit?"New Password (blank = keep)":"Password"} required={!isEdit} error={errors.password}><input className={inputCls} type="password" value={form.password} onChange={e=>set("password",e.target.value)} placeholder="Password"/></FF>
      <FF label="Status"><select className={inputCls} value={form.status} onChange={e=>set("status",e.target.value)}><option>Active</option><option>Inactive</option></select></FF>
      <div className="flex gap-3 pt-1"><button type="button" onClick={onClose} className="flex-1 px-4 py-3 border border-gray-200 rounded-xl text-sm font-semibold text-gray-700">Cancel</button><PBtn className="flex-1" loading={saving}>{isEdit?"Save Changes":"Create Rep"}</PBtn></div>
    </form>
  );
}

function AdminReps() {
  const {data:reps=[],loading,error,reload} = useAsync(()=>repsDB.getAll());
  const {data:sales=[]} = useAsync(()=>salesDB.getAll());
  const [search,setSearch] = useState(""); const [modal,setModal] = useState(null);
  const [rpTarget,setRpTarget] = useState(null); const [newPw,setNewPw] = useState(""); const [saving,setSaving] = useState(false);
  const {toast,show} = useToast();
  const filtered = reps.filter(r=>r.name.toLowerCase().includes(search.toLowerCase())||r.repId.toLowerCase().includes(search.toLowerCase())||r.email.toLowerCase().includes(search.toLowerCase()));

  const save = async form => {
    setSaving(true);
    try {
      if(modal?.rep) { const u={...form}; if(!form.password)delete u.password; await repsDB.update(modal.rep.id,u); show("Rep updated"); }
      else { await repsDB.create(form); show("Rep created"); }
      setModal(null); reload();
    } catch(e) { show("Error: "+e.message); }
    setSaving(false);
  };

  const rows = filtered.map(rep => {
    const s = calcRepStats(rep.repId, sales);
    return [
      <div><p className="font-semibold text-gray-900 text-sm">{rep.name}</p><p className="text-xs text-gray-400">{rep.email}</p></div>,
      <span className="font-mono text-xs bg-gray-100 px-2 py-0.5 rounded-lg">{rep.repId}</span>,
      <span className="text-xs text-gray-600">{rep.phone||"—"}</span>,
      <Badge label={rep.status} type={rep.status==="Active"?"success":"danger"}/>,
      <span className="font-semibold text-sm">{fmt.currency(s.totalValue)}</span>,
      <span className="text-sm">{s.unitsSold}</span>,
      <div className="flex gap-1">
        <button onClick={()=>setModal({type:"edit",rep})} className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 text-xs flex items-center justify-center" title="Edit">✏️</button>
        <button onClick={()=>{setRpTarget(rep);setNewPw("");}} className="w-7 h-7 rounded-lg bg-amber-50 text-amber-600 hover:bg-amber-100 text-xs flex items-center justify-center" title="Reset Password">🔑</button>
        <button onClick={async()=>{await repsDB.update(rep.id,{status:rep.status==="Active"?"Inactive":"Active"});show("Status updated");reload();}} className={`w-7 h-7 rounded-lg text-xs flex items-center justify-center ${rep.status==="Active"?"bg-orange-50 text-orange-600":"bg-green-50 text-green-600"}`} title={rep.status==="Active"?"Deactivate":"Activate"}>{rep.status==="Active"?"🚫":"✅"}</button>
        <button onClick={()=>setModal({type:"delete",rep})} className="w-7 h-7 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 text-xs flex items-center justify-center" title="Delete">🗑️</button>
      </div>
    ];
  });

  return (
    <div>
      <SHeader title="Sales Reps" subtitle={`${reps.length} / 10 reps registered`} action={<PBtn onClick={()=>setModal({type:"create"})}>➕ Add Rep</PBtn>}/>
      {error&&<ErrorBanner message={error}/>}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <div className="mb-4"><SearchBar value={search} onChange={setSearch} placeholder="Search reps..."/></div>
        {filtered.length===0&&!loading?<EmptyState icon="👥" title="No reps found" message="Add your first sales rep"/>:<Table headers={["Rep","Rep ID","Phone","Status","Total Sales","Units","Actions"]} rows={rows} loading={loading}/>}
      </div>
      <Modal isOpen={modal?.type==="create"||modal?.type==="edit"} onClose={()=>setModal(null)} title={modal?.type==="edit"?`Edit: ${modal.rep?.name}`:"Add New Rep"}>
        <RepForm initial={modal?.rep} onSave={save} onClose={()=>setModal(null)} saving={saving}/>
      </Modal>
      <ConfirmModal isOpen={modal?.type==="delete"} onClose={()=>setModal(null)} onConfirm={async()=>{await repsDB.delete(modal.rep.id);show("Rep deleted");reload();}} title="Delete Rep" message={`Delete ${modal?.rep?.name}? This cannot be undone.`} confirmLabel="Delete" danger/>
      <Modal isOpen={!!rpTarget} onClose={()=>setRpTarget(null)} title="Reset Password" size="sm">
        <p className="text-sm text-gray-600 mb-4">Set a new password for <strong>{rpTarget?.name}</strong></p>
        <FF label="New Password" required><input className={inputCls} type="password" value={newPw} onChange={e=>setNewPw(e.target.value)} placeholder="New password"/></FF>
        <div className="flex gap-3 mt-4"><button onClick={()=>setRpTarget(null)} className="flex-1 px-4 py-3 border border-gray-200 rounded-xl text-sm font-semibold text-gray-700">Cancel</button><PBtn className="flex-1" onClick={async()=>{if(!newPw.trim())return;await repsDB.update(rpTarget.id,{password:newPw});show("Password reset");setRpTarget(null);}}>Reset</PBtn></div>
      </Modal>
      <Toast message={toast.message} visible={toast.visible}/>
    </div>
  );
}

// ─── ADMIN PRODUCTS ──────────────────────────────────────────
function ProdForm({initial,onSave,onClose,saving}) {
  const [form,setForm] = useState(initial||{productName:"",sku:"",category:"Electronics",sellingPrice:"",inventoryQuantity:""});
  const [errors,setErrors] = useState({});
  const isEdit = !!initial?.id;
  const validate = () => { const e={}; if(!form.productName.trim())e.productName="Required"; if(!form.sku.trim())e.sku="Required"; if(!form.sellingPrice||Number(form.sellingPrice)<=0)e.sellingPrice="Valid price required"; if(!isEdit&&(form.inventoryQuantity===""||Number(form.inventoryQuantity)<0))e.inventoryQuantity="Valid qty required"; setErrors(e); return!Object.keys(e).length; };
  const submit = e => { e.preventDefault(); if(!validate())return; onSave({...form,sellingPrice:Number(form.sellingPrice),inventoryQuantity:isEdit?initial.inventoryQuantity:Number(form.inventoryQuantity)}); };
  const set = (k,v) => setForm(f=>({...f,[k]:v}));
  return (
    <form onSubmit={submit} className="space-y-4">
      <FF label="Product Name" required error={errors.productName}><input className={inputCls} value={form.productName} onChange={e=>set("productName",e.target.value)} placeholder="Product name"/></FF>
      <div className="grid grid-cols-2 gap-3">
        <FF label="SKU" required error={errors.sku}><input className={`${inputCls} uppercase`} value={form.sku} onChange={e=>set("sku",e.target.value)} placeholder="WDG-001"/></FF>
        <FF label="Category"><select className={inputCls} value={form.category} onChange={e=>set("category",e.target.value)}>{PRODUCT_CATEGORIES.map(c=><option key={c}>{c}</option>)}</select></FF>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <FF label="Price ($)" required error={errors.sellingPrice}><input className={inputCls} type="number" min="0" step="0.01" value={form.sellingPrice} onChange={e=>set("sellingPrice",e.target.value)} placeholder="0.00"/></FF>
        <FF label="Starting Qty" required={!isEdit} error={errors.inventoryQuantity} hint={isEdit?"Use Restock to add stock":""}>
          <input className={inputCls} type="number" min="0" value={isEdit?initial.inventoryQuantity:form.inventoryQuantity} onChange={e=>{if(!isEdit)set("inventoryQuantity",e.target.value);}} disabled={isEdit} placeholder="0"/>
        </FF>
      </div>
      <div className="flex gap-3 pt-1"><button type="button" onClick={onClose} className="flex-1 px-4 py-3 border border-gray-200 rounded-xl text-sm font-semibold text-gray-700">Cancel</button><PBtn className="flex-1" loading={saving}>{isEdit?"Save Changes":"Add Product"}</PBtn></div>
    </form>
  );
}

function AdminProducts() {
  const {data:products=[],loading,error,reload} = useAsync(()=>productsDB.getAll());
  const [search,setSearch] = useState(""); const [modal,setModal] = useState(null); const [qty,setQty] = useState(""); const [saving,setSaving] = useState(false);
  const {toast,show} = useToast();
  const filtered = products.filter(p=>p.productName.toLowerCase().includes(search.toLowerCase())||p.sku.toLowerCase().includes(search.toLowerCase()));
  const rows = filtered.map(p=>[
    <div><p className="font-semibold text-sm text-gray-900">{p.productName}</p><p className="text-xs text-gray-400 font-mono">{p.sku}</p></div>,
    <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-lg font-medium">{p.category}</span>,
    <span className="font-bold">{fmt.currency(p.sellingPrice)}</span>,
    <span className={`font-semibold ${p.inventoryQuantity===0?"text-red-600":p.inventoryQuantity<=5?"text-amber-600":"text-gray-900"}`}>{p.inventoryQuantity}</span>,
    <span className="text-gray-600">{p.totalStockSold}</span>,
    <Badge label={p.inventoryStatus} type={p.inventoryStatus==="Available"?"success":"danger"}/>,
    <div className="flex gap-1">
      <button onClick={()=>{setModal({type:"restock",product:p});setQty("");}} className="w-7 h-7 rounded-lg bg-green-50 text-green-600 hover:bg-green-100 text-xs flex items-center justify-center" title="Restock">🔄</button>
      <button onClick={()=>setModal({type:"edit",product:p})} className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 text-xs flex items-center justify-center" title="Edit">✏️</button>
      <button onClick={()=>setModal({type:"delete",product:p})} className="w-7 h-7 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 text-xs flex items-center justify-center" title="Delete">🗑️</button>
    </div>
  ]);
  return (
    <div>
      <SHeader title="Products" subtitle={`${products.length} products · ${products.filter(p=>p.inventoryStatus==="Sold Out").length} sold out`} action={<PBtn onClick={()=>setModal({type:"create"})}>➕ Add Product</PBtn>}/>
      {error&&<ErrorBanner message={error}/>}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <div className="mb-4"><SearchBar value={search} onChange={setSearch} placeholder="Search products..."/></div>
        {filtered.length===0&&!loading?<EmptyState icon="🏷️" title="No products" message="Add your first product"/>:<Table headers={["Product","Category","Price","In Stock","Sold","Status","Actions"]} rows={rows} loading={loading}/>}
      </div>
      <Modal isOpen={modal?.type==="create"||modal?.type==="edit"} onClose={()=>setModal(null)} title={modal?.type==="edit"?`Edit: ${modal.product?.productName}`:"Add Product"}>
        <ProdForm initial={modal?.product} onSave={async form=>{setSaving(true);try{if(modal?.product?.id){await productsDB.update(modal.product.id,form);show("Product updated");}else{await productsDB.create(form);show("Product added");}setModal(null);reload();}catch(e){show("Error: "+e.message);}setSaving(false);}} onClose={()=>setModal(null)} saving={saving}/>
      </Modal>
      <Modal isOpen={modal?.type==="restock"} onClose={()=>setModal(null)} title="Restock Product" size="sm">
        {modal?.product&&(
          <div className="space-y-4">
            <div className="bg-gray-50 rounded-xl p-3"><p className="font-semibold text-sm">{modal.product.productName}</p><p className="text-xs text-gray-500 mt-0.5">Current stock: <strong>{modal.product.inventoryQuantity}</strong> units</p></div>
            <FF label="Quantity to Add" required><input className={inputCls} type="number" min="1" value={qty} onChange={e=>setQty(e.target.value)} placeholder="Enter quantity" autoFocus/></FF>
            <div className="flex gap-3">
              <button onClick={()=>setModal(null)} className="flex-1 px-4 py-3 border border-gray-200 rounded-xl text-sm font-semibold text-gray-700">Cancel</button>
              <PBtn variant="green" className="flex-1" loading={saving} onClick={async()=>{if(!qty||Number(qty)<=0)return;setSaving(true);try{await productsDB.restock(modal.product.id,Number(qty),"Admin");show(`Added ${qty} units`);setModal(null);reload();}catch(e){show("Error: "+e.message);}setSaving(false);}}>Add Stock</PBtn>
            </div>
          </div>
        )}
      </Modal>
      <ConfirmModal isOpen={modal?.type==="delete"} onClose={()=>setModal(null)} onConfirm={async()=>{await productsDB.delete(modal.product.id);show("Product deleted");reload();}} title="Delete Product" message={`Delete "${modal?.product?.productName}"?`} confirmLabel="Delete" danger/>
      <Toast message={toast.message} visible={toast.visible}/>
    </div>
  );
}

// ─── ADMIN INVENTORY ─────────────────────────────────────────
function AdminInventory() {
  const {data:products=[],loading,error} = useAsync(()=>productsDB.getAll());
  const [search,setSearch] = useState("");
  const filtered = products.filter(p=>p.productName.toLowerCase().includes(search.toLowerCase())||p.sku.toLowerCase().includes(search.toLowerCase()));
  const rows = filtered.map(p=>{
    const pct = p.totalStockAdded>0?Math.round((p.totalStockSold/p.totalStockAdded)*100):0;
    return [
      <div><p className="font-semibold text-sm text-gray-900">{p.productName}</p><p className="text-xs text-gray-400 font-mono">{p.sku}</p></div>,
      <span>{fmt.number(p.totalStockAdded)}</span>,
      <span className="font-semibold text-emerald-600">{fmt.number(p.totalStockSold)}</span>,
      <span className={`font-bold ${p.inventoryQuantity===0?"text-red-600":p.inventoryQuantity<=5?"text-amber-600":"text-gray-900"}`}>{fmt.number(p.inventoryQuantity)}</span>,
      <div className="w-24"><div className="flex justify-between text-xs mb-0.5"><span className="text-gray-400">Sold</span><span className="font-semibold">{pct}%</span></div><div className="w-full bg-gray-100 rounded-full h-1.5"><div className="h-1.5 rounded-full bg-red-500" style={{width:`${pct}%`}}/></div></div>,
      <Badge label={p.inventoryStatus} type={p.inventoryStatus==="Available"?"success":"danger"}/>,
    ];
  });
  return (
    <div className="space-y-5">
      <SHeader title="Inventory" subtitle="Live stock levels — synced across all devices"/>
      {error&&<ErrorBanner message={error}/>}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard title="Total in Stock" value={fmt.number(products.reduce((s,p)=>s+p.inventoryQuantity,0))} icon="📦" color="blue" loading={loading}/>
        <StatCard title="Total Sold" value={fmt.number(products.reduce((s,p)=>s+p.totalStockSold,0))} icon="📤" color="green" loading={loading}/>
        <StatCard title="Sold Out" value={products.filter(p=>p.inventoryQuantity===0).length} icon="🚫" color="red" loading={loading}/>
        <StatCard title="Low Stock (≤5)" value={products.filter(p=>p.inventoryQuantity>0&&p.inventoryQuantity<=5).length} icon="⚠️" color="orange" loading={loading}/>
      </div>
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <div className="mb-4"><SearchBar value={search} onChange={setSearch} placeholder="Search products..."/></div>
        <Table headers={["Product","Total Added","Total Sold","In Stock","Sell-Through","Status"]} rows={rows} loading={loading} empty="No products found"/>
      </div>
    </div>
  );
}

// ─── ADMIN SALES ─────────────────────────────────────────────
function AdminSales() {
  const {data:sales=[],loading,error} = useAsync(()=>salesDB.getAll());
  const [search,setSearch] = useState(""); const [filterRep,setFilterRep] = useState(""); const [filterMethod,setFilterMethod] = useState("");
  const totalRevenue = sales.reduce((s,x)=>s+x.totalSaleValue,0);
  const repNames = [...new Set(sales.map(s=>s.repName))].sort();
  const filtered = sales.filter(s=>{
    const ms = !search||s.productName.toLowerCase().includes(search.toLowerCase())||s.repName.toLowerCase().includes(search.toLowerCase())||(s.customerName||"").toLowerCase().includes(search.toLowerCase());
    return ms&&(!filterRep||s.repName===filterRep)&&(!filterMethod||s.paymentMethod===filterMethod);
  }).reverse();
  const rows = filtered.slice(0,100).map(s=>[
    <div><p className="font-semibold text-sm text-gray-900">{s.productName}</p><p className="text-xs text-gray-400">{s.customerName||"Walk-in"}</p></div>,
    <span className="text-sm">{s.repName}</span>,
    <span className="font-semibold">{s.quantitySold}</span>,
    <span className="font-bold text-emerald-600">{fmt.currency(s.totalSaleValue)}</span>,
    <Badge label={s.paymentMethod} type={s.paymentMethod==="Cash"?"success":s.paymentMethod==="Card"?"info":s.paymentMethod==="Bank Transfer"?"purple":"default"}/>,
    <span className="text-xs text-gray-500">{fmt.date(s.dateSold)}</span>,
  ]);
  return (
    <div className="space-y-5">
      <SHeader title="Sales" subtitle={`${sales.length} total · ${fmt.currency(totalRevenue)}`}/>
      {error&&<ErrorBanner message={error}/>}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard title="Total Sales" value={sales.length} icon="💰" color="red" loading={loading}/>
        <StatCard title="Total Revenue" value={fmt.currency(totalRevenue)} icon="💵" color="green" loading={loading}/>
        <StatCard title="Avg Sale Value" value={fmt.currency(sales.length>0?totalRevenue/sales.length:0)} icon="📊" color="blue" loading={loading}/>
        <StatCard title="Filtered" value={filtered.length} icon="🔍" color="purple" loading={loading}/>
      </div>
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="flex-1"><SearchBar value={search} onChange={setSearch} placeholder="Search by product, rep, or customer..."/></div>
          <select className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-500 bg-white" value={filterRep} onChange={e=>setFilterRep(e.target.value)}>
            <option value="">All Reps</option>{repNames.map(r=><option key={r}>{r}</option>)}
          </select>
          <select className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-500 bg-white" value={filterMethod} onChange={e=>setFilterMethod(e.target.value)}>
            <option value="">All Methods</option>{PAYMENT_METHODS.map(m=><option key={m}>{m}</option>)}
          </select>
        </div>
        <Table headers={["Product / Customer","Rep","Qty","Total","Payment","Date"]} rows={rows} loading={loading} empty="No sales found"/>
      </div>
    </div>
  );
}

// ─── ADMIN RESTOCKS ──────────────────────────────────────────
function AdminRestocks({setPage}) {
  const {data:restocks=[],loading,error} = useAsync(()=>restocksDB.getAll());
  const rows = restocks.map(r=>[
    <p className="font-semibold text-sm text-gray-900">{r.productName}</p>,
    <span className="font-bold text-emerald-600">+{fmt.number(r.quantityAdded)}</span>,
    <span className="text-sm text-gray-600">{r.adminName}</span>,
    <span className="text-xs text-gray-500">{fmt.date(r.dateAdded)}</span>,
  ]);
  return (
    <div className="space-y-5">
      <SHeader title="Restock History" subtitle={`${restocks.length} events`} action={<button onClick={()=>setPage("products")} className="px-4 py-2.5 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white text-sm font-semibold rounded-xl hover:from-emerald-600 hover:to-emerald-700">🔄 Restock a Product</button>}/>
      {error&&<ErrorBanner message={error}/>}
      <div className="grid grid-cols-2 gap-3">
        <StatCard title="Total Events" value={restocks.length} icon="🔄" color="green" loading={loading}/>
        <StatCard title="Total Units Added" value={fmt.number(restocks.reduce((s,r)=>s+r.quantityAdded,0))} icon="📦" color="blue" loading={loading}/>
      </div>
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <Table headers={["Product","Qty Added","By","Date"]} rows={rows} loading={loading} empty="No restocks yet"/>
      </div>
    </div>
  );
}


// ─── PERIOD DETAIL COMPONENT ─────────────────────────────────
function PeriodDetail({period, pSales, reps, onClose, onShow}) {
  const [paid, setPaid] = useState({});
  const repStats = reps.map(r => {
    const rs = pSales.filter(s => s.repId === r.repId);
    return {
      ...r,
      value: rs.reduce((s,x) => s+x.totalSaleValue, 0),
      units: rs.reduce((s,x) => s+x.quantitySold, 0),
      count: rs.length,
      commission: rs.reduce((s,x) => s+x.totalSaleValue, 0) * 0.10
    };
  }).filter(r => r.count > 0);
  const totRev = repStats.reduce((s,r) => s+r.value, 0);
  const totComm = repStats.reduce((s,r) => s+r.commission, 0);
  return (
    <div className="space-y-4">
      <div className="bg-gray-50 rounded-xl p-4 flex items-center justify-between">
        <div><p className="font-bold text-gray-900">{period.periodName}</p><p className="text-xs text-gray-500">{fmt.date(period.startDate)} – {fmt.date(period.endDate)}</p></div>
        <Badge label={period.status} type={period.status==="Open"?"success":"warning"}/>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-emerald-50 rounded-xl p-3 text-center"><p className="text-xs text-emerald-600 font-semibold">Total Revenue</p><p className="text-lg font-bold text-emerald-800">{fmt.currency(totRev)}</p></div>
        <div className="bg-blue-50 rounded-xl p-3 text-center"><p className="text-xs text-blue-600 font-semibold">Commission (10%)</p><p className="text-lg font-bold text-blue-800">{fmt.currency(totComm)}</p></div>
      </div>
      {repStats.length===0 ? <p className="text-sm text-gray-400 text-center py-4">No sales in this period</p> : (
        <div className="space-y-3">
          {repStats.map(rep => (
            <div key={rep.id} className="border border-gray-100 rounded-xl p-3">
              <div className="flex items-start justify-between mb-2">
                <div><p className="font-semibold text-sm text-gray-900">{rep.name}</p><p className="text-xs text-gray-400">{rep.repId} · {rep.count} sales · {rep.units} units</p></div>
                {paid[rep.id] && <Badge label="Paid" type="success"/>}
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500">Sales: <span className="font-bold text-gray-800">{fmt.currency(rep.value)}</span></p>
                  <p className="text-xs text-gray-500">Commission: <span className="font-bold text-emerald-600">{fmt.currency(rep.commission)}</span></p>
                </div>
                {!paid[rep.id] && <button onClick={()=>{setPaid(p=>({...p,[rep.id]:true}));onShow("Marked as paid");}} className="px-3 py-1.5 bg-emerald-500 text-white text-xs font-semibold rounded-lg hover:bg-emerald-600">Mark Paid</button>}
              </div>
            </div>
          ))}
        </div>
      )}
      <button onClick={onClose} className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm font-semibold text-gray-700">Close</button>
    </div>
  );
}

// ─── ADMIN PERIODS ───────────────────────────────────────────
function AdminPeriods() {
  const {data:periods=[],loading,error,reload} = useAsync(()=>periodsDB.getAll());
  const {data:sales=[]} = useAsync(()=>salesDB.getAll());
  const {data:reps=[]} = useAsync(()=>repsDB.getAll());
  const [modal,setModal] = useState(null); const [saving,setSaving] = useState(false);
  const {toast,show} = useToast();
  const open = periods.find(p=>p.status==="Open");
  const now = new Date(); const mm=String(now.getMonth()+1).padStart(2,"0"); const ld=new Date(now.getFullYear(),now.getMonth()+1,0).getDate();
  const [pForm,setPForm] = useState({periodName:`${now.toLocaleString("default",{month:"long"})} ${now.getFullYear()} Sales Period`,startDate:`${now.getFullYear()}-${mm}-01`,endDate:`${now.getFullYear()}-${mm}-${ld}`,status:"Open"});

  const rows = periods.map(p=>{
    const pSales = sales.filter(s=>{ const d=new Date(s.dateSold); return d>=new Date(p.startDate)&&d<=new Date(p.endDate+"T23:59:59Z"); });
    const rev = pSales.reduce((s,x)=>s+x.totalSaleValue,0);
    return [
      <div><p className="font-semibold text-sm text-gray-900">{p.periodName}</p><p className="text-xs text-gray-400">{fmt.date(p.startDate)} – {fmt.date(p.endDate)}</p></div>,
      <Badge label={p.status} type={p.status==="Open"?"success":p.status==="Paid"?"info":"warning"}/>,
      <span className="font-bold text-emerald-600">{fmt.currency(rev)}</span>,
      <span className="text-sm">{pSales.length}</span>,
      <div className="flex gap-1">
        <button onClick={()=>setModal({type:"detail",period:p,pSales})} className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 text-xs flex items-center justify-center" title="View">👁️</button>
        {p.status==="Open"&&<button onClick={async()=>{await periodsDB.update(p.id,{status:"Closed"});show("Period closed");reload();}} className="w-7 h-7 rounded-lg bg-amber-50 text-amber-600 hover:bg-amber-100 text-xs flex items-center justify-center" title="Close">🔒</button>}
        <button onClick={()=>setModal({type:"delete",period:p})} className="w-7 h-7 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 text-xs flex items-center justify-center" title="Delete">🗑️</button>
      </div>
    ];
  });

  return (
    <div className="space-y-5">
      <SHeader title="Payment Periods" subtitle={open?`Current: ${open.periodName}`:"No open period"} action={<PBtn onClick={()=>setModal({type:"create"})}>📅 New Period</PBtn>}/>
      {error&&<ErrorBanner message={error}/>}
      {open&&(
        <div className="bg-gradient-to-r from-emerald-500 to-emerald-600 rounded-2xl p-5 text-white flex items-start justify-between">
          <div><p className="text-xs font-semibold opacity-75 uppercase tracking-wider">Active Period</p><p className="text-lg font-bold mt-0.5">{open.periodName}</p><p className="text-sm opacity-75 mt-1">{fmt.date(open.startDate)} – {fmt.date(open.endDate)}</p></div>
          <span className="text-3xl">📅</span>
        </div>
      )}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <Table headers={["Period","Status","Revenue","Sales","Actions"]} rows={rows} loading={loading} empty="No periods yet"/>
      </div>
      <Modal isOpen={modal?.type==="create"} onClose={()=>setModal(null)} title="Create Payment Period">
        <div className="space-y-4">
          <FF label="Period Name" required><input className={inputCls} value={pForm.periodName} onChange={e=>setPForm(f=>({...f,periodName:e.target.value}))}/></FF>
          <div className="grid grid-cols-2 gap-3">
            <FF label="Start Date" required><input className={inputCls} type="date" value={pForm.startDate} onChange={e=>setPForm(f=>({...f,startDate:e.target.value}))}/></FF>
            <FF label="End Date" required><input className={inputCls} type="date" value={pForm.endDate} onChange={e=>setPForm(f=>({...f,endDate:e.target.value}))}/></FF>
          </div>
          <div className="flex gap-3 pt-1">
            <button onClick={()=>setModal(null)} className="flex-1 px-4 py-3 border border-gray-200 rounded-xl text-sm font-semibold text-gray-700">Cancel</button>
            <PBtn className="flex-1" loading={saving} onClick={async()=>{setSaving(true);try{await periodsDB.create(pForm);show("Period created");setModal(null);reload();}catch(e){show("Error: "+e.message);}setSaving(false);}}>Create Period</PBtn>
          </div>
        </div>
      </Modal>
      <Modal isOpen={modal?.type==="detail"} onClose={()=>setModal(null)} title="Period Details" size="lg">
        {modal?.period&&<PeriodDetail period={modal.period} pSales={modal.pSales||[]} reps={reps} onClose={()=>setModal(null)} onShow={show}/>}
      </Modal>
      <ConfirmModal isOpen={modal?.type==="delete"} onClose={()=>setModal(null)} onConfirm={async()=>{await periodsDB.delete(modal.period.id);show("Period deleted");reload();}} title="Delete Period" message={`Delete "${modal?.period?.periodName}"?`} confirmLabel="Delete" danger/>
      <Toast message={toast.message} visible={toast.visible}/>
    </div>
  );
}

// ─── ADMIN REPORTS ───────────────────────────────────────────
function AdminReports() {
  const {data:sales=[],loading:sl} = useAsync(()=>salesDB.getAll());
  const {data:products=[],loading:pl} = useAsync(()=>productsDB.getAll());
  const {data:reps=[],loading:rl} = useAsync(()=>repsDB.getAll());
  const {data:restocks=[],loading:rtl} = useAsync(()=>restocksDB.getAll());
  const {data:periods=[]} = useAsync(()=>periodsDB.getAll());
  const loading = sl||pl||rl||rtl;
  const totalRev = sales.reduce((s,x)=>s+x.totalSaleValue,0);

  const RCard = ({title,desc,icon,onCSV}) => (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
      <div className="flex items-start gap-4 mb-4"><div className="w-11 h-11 rounded-2xl bg-gray-900 flex items-center justify-center text-2xl flex-shrink-0">{icon}</div><div className="flex-1"><h3 className="font-bold text-gray-900">{title}</h3><p className="text-xs text-gray-500 mt-0.5">{desc}</p></div></div>
      <button onClick={onCSV} disabled={loading} className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50 flex items-center justify-center gap-2 disabled:opacity-50">📄 Export CSV</button>
    </div>
  );

  return (
    <div className="space-y-5">
      <SHeader title="Reports" subtitle="Export live data from cloud database"/>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard title="Total Revenue" value={fmt.currency(totalRev)} icon="💰" color="green" loading={loading}/>
        <StatCard title="Total Sold" value={fmt.number(products.reduce((s,p)=>s+p.totalStockSold,0))} icon="📤" color="red" loading={loading}/>
        <StatCard title="In Stock" value={fmt.number(products.reduce((s,p)=>s+p.inventoryQuantity,0))} icon="📦" color="blue" loading={loading}/>
        <StatCard title="Active Reps" value={reps.filter(r=>r.status==="Active").length} icon="👥" color="purple" loading={loading}/>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <RCard title="Sales Report" desc={`${sales.length} total transactions`} icon="💰" onCSV={()=>downloadCSV(`sales_${new Date().toISOString().slice(0,10)}.csv`,["ID","Date","Rep ID","Rep","Product","Qty","Unit Price","Total","Payment","Customer","Phone"],sales.map(s=>[s.id,fmt.date(s.dateSold),s.repId,s.repName,s.productName,s.quantitySold,fmt.currency(s.unitPrice),fmt.currency(s.totalSaleValue),s.paymentMethod,s.customerName||"",s.customerPhone||""]))}/>
        <RCard title="Inventory Report" desc={`${products.length} products`} icon="📦" onCSV={()=>downloadCSV(`inventory_${new Date().toISOString().slice(0,10)}.csv`,["ID","Name","SKU","Category","Price","In Stock","Total Added","Total Sold","Status"],products.map(p=>[p.id,p.productName,p.sku,p.category,fmt.currency(p.sellingPrice),p.inventoryQuantity,p.totalStockAdded,p.totalStockSold,p.inventoryStatus]))}/>
        <RCard title="Rep Performance" desc={`${reps.length} sales reps`} icon="👥" onCSV={()=>downloadCSV(`reps_${new Date().toISOString().slice(0,10)}.csv`,["Rep ID","Name","Email","Phone","Status","Total Sales","Units Sold","Sales Count"],reps.map(r=>{const s=calcRepStats(r.repId,sales);return[r.repId,r.name,r.email,r.phone,r.status,fmt.currency(s.totalValue),s.unitsSold,s.salesCount];}))}/>
        <RCard title="Restock Report" desc={`${restocks.length} restock events`} icon="🔄" onCSV={()=>downloadCSV(`restocks_${new Date().toISOString().slice(0,10)}.csv`,["ID","Product","Qty Added","Date","By"],restocks.map(r=>[r.id,r.productName,r.quantityAdded,fmt.date(r.dateAdded),r.adminName]))}/>
        <RCard title="Payment Report" desc={`${periods.length} payment periods`} icon="📅" onCSV={()=>{const rows=[];periods.forEach(p=>{const ps=sales.filter(s=>{const d=new Date(s.dateSold);return d>=new Date(p.startDate)&&d<=new Date(p.endDate+"T23:59:59Z");});reps.forEach(r=>{const rs=ps.filter(s=>s.repId===r.repId);if(rs.length){const v=rs.reduce((s,x)=>s+x.totalSaleValue,0);rows.push([p.periodName,r.repId,r.name,rs.length,rs.reduce((s,x)=>s+x.quantitySold,0),fmt.currency(v),fmt.currency(v*0.1),p.status]);}});});downloadCSV(`payments_${new Date().toISOString().slice(0,10)}.csv`,["Period","Rep ID","Name","Sales","Units","Value","Commission (10%)","Status"],rows);}}/>
      </div>
    </div>
  );
}

// ─── ADMIN SETTINGS ──────────────────────────────────────────
function AdminSettings() {
  return (
    <div className="space-y-5">
      <SHeader title="Settings" subtitle="System configuration"/>
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <h3 className="font-bold text-gray-900 mb-4">System Information</h3>
        <div className="space-y-3">
          {[["Application","Sales Rep Inventory Manager"],["Version","2.0.0 — Cloud Edition"],["Database","Supabase (PostgreSQL)"],["Max Reps","10"],["Commission Rate","10% of sales value"],["Data Sync","Real-time across all devices"]].map(([l,v])=>(
            <div key={l} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
              <span className="text-sm text-gray-500">{l}</span><span className="text-sm font-semibold text-gray-800">{v}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5">
        <h3 className="font-bold text-blue-900 mb-3">🔑 Change Admin Password</h3>
        <p className="text-sm text-blue-800">Admin credentials are set in <code className="bg-blue-100 px-1 rounded text-xs">src/App.jsx</code> on the <code className="bg-blue-100 px-1 rounded text-xs">loginAdmin</code> function. Change <code className="bg-blue-100 px-1 rounded text-xs">admin123</code> to your desired password and redeploy.</p>
      </div>
      <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5">
        <h3 className="font-bold text-emerald-900 mb-3">✅ Cloud Database Connected</h3>
        <p className="text-sm text-emerald-800">All data is stored in Supabase and synced in real-time. Any rep logging in from any device will see up-to-date inventory and their own sales history instantly.</p>
      </div>
    </div>
  );
}

// ─── REP: LOG SALE ───────────────────────────────────────────
function LogSale({repInfo,onSuccess}) {
  const {data:products=[],loading:pl} = useAsync(()=>productsDB.getAvailable());
  const [form,setForm] = useState({productId:"",quantitySold:1,customerName:"",customerPhone:"",paymentMethod:"Cash"});
  const [loading,setLoading] = useState(false); const [error,setError] = useState(""); const [confirmation,setConfirmation] = useState(null);
  const selected = products.find(p=>p.id===form.productId);
  const set = (k,v) => setForm(f=>({...f,[k]:v}));

  const submit = async e => {
    e.preventDefault(); setError("");
    if(!form.productId){setError("Please select a product");return;}
    if(!form.quantitySold||Number(form.quantitySold)<=0){setError("Enter a valid quantity");return;}
    setLoading(true);
    try {
      const prod = await productsDB.getById(form.productId);
      if(!prod||prod.inventoryQuantity===0){setError("This product is sold out");setLoading(false);return;}
      if(Number(form.quantitySold)>prod.inventoryQuantity){setError(`Only ${prod.inventoryQuantity} units available`);setLoading(false);return;}
      const sale = await salesDB.create({repId:repInfo.repId,repName:repInfo.name,productId:prod.id,productName:prod.productName,quantitySold:Number(form.quantitySold),unitPrice:prod.sellingPrice,totalSaleValue:prod.sellingPrice*Number(form.quantitySold),paymentMethod:form.paymentMethod,customerName:form.customerName,customerPhone:form.customerPhone});
      const updated = await productsDB.getById(prod.id);
      setConfirmation({sale,remaining:updated.inventoryQuantity});
      onSuccess();
    } catch(e) { setError("Error saving sale: "+e.message); }
    setLoading(false);
  };

  if(confirmation) return (
    <div className="text-center py-8">
      <div className="w-20 h-20 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-full flex items-center justify-center mx-auto mb-5 shadow-xl shadow-emerald-200"><span className="text-white text-4xl font-bold">✓</span></div>
      <h2 className="text-2xl font-bold text-gray-900 mb-1">Sale Logged!</h2>
      <p className="text-gray-500 text-sm mb-6">Saved to cloud — synced instantly</p>
      <div className="bg-gray-50 rounded-2xl p-5 text-left mb-6 space-y-3">
        <div className="flex justify-between"><span className="text-sm text-gray-500">Product</span><span className="text-sm font-semibold">{confirmation.sale.productName}</span></div>
        <div className="flex justify-between"><span className="text-sm text-gray-500">Qty Sold</span><span className="text-sm font-semibold">{confirmation.sale.quantitySold} units</span></div>
        <div className="flex justify-between"><span className="text-sm text-gray-500">Total Value</span><span className="text-lg font-bold text-emerald-600">{fmt.currency(confirmation.sale.totalSaleValue)}</span></div>
        <div className="flex justify-between border-t border-gray-200 pt-3"><span className="text-sm text-gray-500">Remaining Stock</span><span className={`text-sm font-bold ${confirmation.remaining===0?"text-red-600":"text-gray-800"}`}>{confirmation.remaining===0?"⚠️ SOLD OUT":`${confirmation.remaining} units`}</span></div>
      </div>
      <button onClick={()=>{setConfirmation(null);setForm({productId:"",quantitySold:1,customerName:"",customerPhone:"",paymentMethod:"Cash"});}} className="w-full py-4 bg-gradient-to-r from-red-600 to-red-700 text-white font-bold rounded-2xl text-lg">Log Another Sale</button>
    </div>
  );

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="bg-gradient-to-r from-red-600 to-red-700 rounded-2xl p-4 text-white"><p className="text-xs font-semibold opacity-75">Logging sale as</p><p className="text-lg font-bold">{repInfo.name}</p><p className="text-xs opacity-75">{repInfo.repId}</p></div>
      {error&&<div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">⚠️ {error}</div>}
      <FF label="Select Product" required>
        {pl?<div className="h-12 bg-gray-50 rounded-xl animate-pulse"/>:<select className={inputCls} value={form.productId} onChange={e=>set("productId",e.target.value)}>
          <option value="">Choose a product...</option>
          {products.map(p=><option key={p.id} value={p.id}>{p.productName} — {fmt.currency(p.sellingPrice)} ({p.inventoryQuantity} left)</option>)}
        </select>}
      </FF>
      {selected&&(
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
          <div className="flex justify-between items-center"><span className="text-xs text-emerald-700 font-semibold">Unit Price</span><span className="text-sm font-bold text-emerald-800">{fmt.currency(selected.sellingPrice)}</span></div>
          <div className="flex justify-between items-center mt-1"><span className="text-xs text-emerald-700 font-semibold">Available</span><span className="text-sm font-bold text-emerald-800">{selected.inventoryQuantity} units</span></div>
          {form.quantitySold>0&&<div className="flex justify-between items-center mt-2 pt-2 border-t border-emerald-200"><span className="text-xs text-emerald-700 font-semibold">Sale Total</span><span className="text-base font-bold text-emerald-900">{fmt.currency(selected.sellingPrice*Number(form.quantitySold))}</span></div>}
        </div>
      )}
      <FF label="Quantity" required>
        <div className="flex items-center gap-3">
          <button type="button" onClick={()=>set("quantitySold",Math.max(1,Number(form.quantitySold)-1))} className="w-12 h-12 bg-gray-100 hover:bg-gray-200 rounded-xl text-xl font-bold text-gray-700 flex-shrink-0 flex items-center justify-center">−</button>
          <input className={`${inputCls} text-center text-lg font-bold`} type="number" min="1" max={selected?.inventoryQuantity||999} value={form.quantitySold} onChange={e=>set("quantitySold",e.target.value)}/>
          <button type="button" onClick={()=>set("quantitySold",Number(form.quantitySold)+1)} className="w-12 h-12 bg-gray-100 hover:bg-gray-200 rounded-xl text-xl font-bold text-gray-700 flex-shrink-0 flex items-center justify-center">+</button>
        </div>
      </FF>
      <FF label="Payment Method" required>
        <div className="grid grid-cols-2 gap-2">
          {PAYMENT_METHODS.map(m=><button key={m} type="button" onClick={()=>set("paymentMethod",m)} className={`py-3 px-4 rounded-xl text-sm font-semibold border-2 transition-all ${form.paymentMethod===m?"border-red-500 bg-red-50 text-red-700":"border-gray-200 bg-white text-gray-700 hover:border-gray-300"}`}>{m==="Cash"?"💵":m==="Card"?"💳":m==="Bank Transfer"?"🏦":"📱"} {m}</button>)}
        </div>
      </FF>
      <FF label="Customer Name" hint="Optional"><input className={inputCls} value={form.customerName} onChange={e=>set("customerName",e.target.value)} placeholder="Customer name"/></FF>
      <FF label="Customer Phone" hint="Optional"><input className={inputCls} type="tel" value={form.customerPhone} onChange={e=>set("customerPhone",e.target.value)} placeholder="+1 876-555-0000"/></FF>
      <PBtn className="w-full py-4 text-base mt-2" loading={loading} disabled={products.length===0}>💰 Submit Sale</PBtn>
      {products.length===0&&!pl&&<p className="text-center text-xs text-gray-500">No products available. Contact your admin.</p>}
    </form>
  );
}

// ─── REP: MY SALES ───────────────────────────────────────────
function MySales({repInfo}) {
  const {data:sales=[],loading} = useAsync(()=>salesDB.getByRep(repInfo.repId));
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <StatCard title="Total Revenue" value={fmt.currency(sales.reduce((s,x)=>s+x.totalSaleValue,0))} icon="💰" color="red" loading={loading}/>
        <StatCard title="Units Sold" value={sales.reduce((s,x)=>s+x.quantitySold,0)} icon="📦" color="blue" loading={loading}/>
      </div>
      {loading?<div className="space-y-3">{[1,2,3].map(i=><div key={i} className="h-20 bg-white rounded-2xl border border-gray-100 animate-pulse"/>)}</div>:
        sales.length===0?<EmptyState icon="💰" title="No sales yet" message="Log your first sale to see it here"/>:(
          <div className="space-y-3">
            {sales.map(s=>(
              <div key={s.id} className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
                <div className="flex items-start justify-between mb-2">
                  <div><p className="font-bold text-gray-900 text-sm">{s.productName}</p><p className="text-xs text-gray-400">{new Date(s.dateSold).toLocaleString()}</p></div>
                  <span className="text-base font-bold text-emerald-600">{fmt.currency(s.totalSaleValue)}</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-500">
                  <span>📦 {s.quantitySold} units</span><span>·</span>
                  <span>{s.paymentMethod==="Cash"?"💵":s.paymentMethod==="Card"?"💳":s.paymentMethod==="Bank Transfer"?"🏦":"📱"} {s.paymentMethod}</span>
                  {s.customerName&&<><span>·</span><span>👤 {s.customerName}</span></>}
                </div>
              </div>
            ))}
          </div>
        )
      }
    </div>
  );
}

// ─── REP: MY PERFORMANCE ─────────────────────────────────────
function MyPerformance({repInfo}) {
  const {data:sales=[],loading} = useAsync(()=>salesDB.getByRep(repInfo.repId));
  const {data:open} = useAsync(()=>periodsDB.getOpen());
  const periodSales = open ? sales.filter(s=>{ const d=new Date(s.dateSold); return d>=new Date(open.startDate)&&d<=new Date(open.endDate+"T23:59:59Z"); }) : [];
  const byProduct = groupSalesByProduct(sales);
  const methods = PAYMENT_METHODS.map(m=>({m,count:sales.filter(s=>s.paymentMethod===m).length})).filter(x=>x.count>0);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <StatCard title="All-Time Revenue" value={fmt.currency(sales.reduce((s,x)=>s+x.totalSaleValue,0))} icon="💰" color="red" loading={loading}/>
        <StatCard title="All-Time Units" value={sales.reduce((s,x)=>s+x.quantitySold,0)} icon="📦" color="blue" loading={loading}/>
      </div>
      {open&&<div className="bg-gradient-to-r from-indigo-500 to-indigo-600 rounded-2xl p-4 text-white"><p className="text-xs font-semibold opacity-75 mb-2">📅 {open.periodName}</p><div className="grid grid-cols-2 gap-3"><div><p className="text-xs opacity-75">Period Revenue</p><p className="text-lg font-bold">{fmt.currency(periodSales.reduce((s,x)=>s+x.totalSaleValue,0))}</p></div><div><p className="text-xs opacity-75">Period Units</p><p className="text-lg font-bold">{periodSales.reduce((s,x)=>s+x.quantitySold,0)}</p></div></div></div>}
      {byProduct.length>0&&<div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm"><p className="font-bold text-gray-900 mb-3">Sales by Product</p><BarChart data={byProduct.slice(0,5)} vk="value" lk="name" color="#DC143C"/></div>}
      {methods.length>0&&<div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm"><p className="font-bold text-gray-900 mb-3">Payment Methods</p><div className="space-y-2">{methods.map(x=><div key={x.m} className="flex items-center justify-between text-sm"><span className="text-gray-600">{x.m}</span><span className="font-bold text-gray-900">{x.count} sale{x.count!==1?"s":""}</span></div>)}</div></div>}
    </div>
  );
}

// ─── REP DASHBOARD ───────────────────────────────────────────
function RepDashboard() {
  const {user,logout} = useAuth();
  const [screen,setScreen] = useState("home");
  const [salesKey,setSalesKey] = useState(0);
  const {data:repInfo,loading} = useAsync(()=>repsDB.getById(user.id),[user.id]);
  const {data:repSales=[]} = useAsync(()=>salesDB.getByRep(user.repId),[user.repId,salesKey]);

  if(loading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><Spinner/></div>;
  if(!repInfo) return <div className="p-8 text-center text-gray-500">Rep not found.</div>;

  const titles = {home:null,"log-sale":"Log a Sale","my-sales":"My Sales","my-performance":"My Performance"};
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100 sticky top-0 z-20">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {screen!=="home"&&<button onClick={()=>setScreen("home")} className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center text-gray-700 font-bold">←</button>}
            <div><p className="text-base font-bold text-gray-900">{screen==="home"?`Hi, ${repInfo.name.split(" ")[0]} 👋`:titles[screen]}</p>{screen==="home"&&<p className="text-xs text-emerald-500 font-medium">● Live sync enabled</p>}</div>
          </div>
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-red-400 to-red-600 flex items-center justify-center text-white font-bold text-sm">{repInfo.name[0]}</div>
        </div>
      </header>
      <main className="px-4 py-5 max-w-lg mx-auto">
        {screen==="home"&&(
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <StatCard title="My Revenue" value={fmt.currency(repSales.reduce((s,x)=>s+x.totalSaleValue,0))} icon="💰" color="red"/>
              <StatCard title="Units Sold" value={repSales.reduce((s,x)=>s+x.quantitySold,0)} icon="📦" color="blue"/>
            </div>
            <button onClick={()=>setScreen("log-sale")} className="w-full py-5 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white rounded-2xl font-bold text-xl shadow-lg shadow-red-200 transition-all flex items-center justify-center gap-3"><span className="text-2xl">💰</span>Log a Sale</button>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={()=>setScreen("my-sales")} className="w-full py-6 bg-white border-2 border-gray-100 hover:border-gray-200 rounded-2xl font-bold text-gray-800 shadow-sm flex flex-col items-center gap-2"><span className="text-3xl">📋</span><span className="text-sm">My Sales</span></button>
              <button onClick={()=>setScreen("my-performance")} className="w-full py-6 bg-white border-2 border-gray-100 hover:border-gray-200 rounded-2xl font-bold text-gray-800 shadow-sm flex flex-col items-center gap-2"><span className="text-3xl">📈</span><span className="text-sm">Performance</span></button>
            </div>
            <button onClick={logout} className="w-full py-4 border-2 border-gray-200 hover:border-red-200 hover:bg-red-50 rounded-2xl font-semibold text-gray-600 hover:text-red-600 transition-all flex items-center justify-center gap-2"><span>🚪</span>Sign Out</button>
          </div>
        )}
        {screen==="log-sale"&&<LogSale key={salesKey} repInfo={repInfo} onSuccess={()=>setSalesKey(k=>k+1)}/>}
        {screen==="my-sales"&&<MySales key={salesKey} repInfo={repInfo}/>}
        {screen==="my-performance"&&<MyPerformance repInfo={repInfo}/>}
      </main>
    </div>
  );
}

// ─── MAIN APP ────────────────────────────────────────────────
function AppContent() {
  const {user,loading} = useAuth();
  const [adminPage,setAdminPage] = useState("dashboard");

  if(loading) return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center">
      <div className="text-center"><div className="w-12 h-12 border-4 border-gray-700 border-t-red-500 rounded-full animate-spin mx-auto mb-4"/><p className="text-gray-400 text-sm">Loading...</p></div>
    </div>
  );

  if(!user) return <LoginScreen/>;
  if(user.type==="rep") return <RepDashboard/>;

  const pages = {
    dashboard:<AdminDashboard setPage={setAdminPage}/>,
    reps:<AdminReps/>,
    products:<AdminProducts/>,
    inventory:<AdminInventory/>,
    sales:<AdminSales/>,
    restocks:<AdminRestocks setPage={setAdminPage}/>,
    periods:<AdminPeriods/>,
    reports:<AdminReports/>,
    settings:<AdminSettings/>,
  };

  return <AdminLayout page={adminPage} setPage={setAdminPage}>{pages[adminPage]||pages.dashboard}</AdminLayout>;
}

export default function App() {
  return <AuthProvider><AppContent/></AuthProvider>;
}
