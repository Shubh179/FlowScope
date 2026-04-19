import { useState, useEffect } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Building2, TrendingUp, Users, Package, 
  MapPin, ShoppingCart, Truck, Activity
} from 'lucide-react';

const FLAGS = {
  'India':'🇮🇳','United States':'🇺🇸','China':'🇨🇳','Japan':'🇯🇵',
  'South Korea':'🇰🇷','Germany':'🇩🇪','Taiwan':'🇹🇼','France':'🇫🇷',
  'United Kingdom':'🇬🇧','Switzerland':'🇨🇭','Singapore':'🇸🇬','Finland':'🇫🇮',
  'Sweden':'🇸🇪','Brazil':'🇧🇷','Australia':'🇦🇺','Norway':'🇳🇴',
  'Belgium':'🇧🇪','Luxembourg':'🇱🇺','Netherlands':'🇳🇱','Denmark':'🇩🇰',
  'Italy':'🇮🇹','Canada':'🇨🇦','Malaysia':'🇲🇾','Congo':'🇨🇩',
  'Peru':'🇵🇪','Ivory Coast':'🇨🇮','Saudi Arabia':'🇸🇦','Ireland':'🇮🇪',
};

function fmt(n) {
  if (!n) return '—';
  if (n>=1e6) return (n/1e6).toFixed(2)+'M';
  if (n>=1e3) return (n/1e3).toFixed(1)+'K';
  return n.toLocaleString();
}

export default function DetailsPanel({ selectedCompany, selectedNode, graphData }) {
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab]         = useState('overview');

  const name = selectedNode?.name || selectedCompany?.name;

  useEffect(() => {
    if (!name) { setDetails(null); return; }
    setLoading(true);
    axios.get(`/api/companies/${encodeURIComponent(name)}/details`)
      .then(({ data }) => { setDetails(data.company); setTab('overview'); })
      .catch(() => setDetails(null))
      .finally(() => setLoading(false));
  }, [name]);

  if (!name) return (
    <div className="flex flex-col items-center justify-center h-full p-8 text-center bg-slate-50/30">
      <motion.div 
        animate={{ scale: [1, 1.05, 1], opacity: [0.3, 0.5, 0.3] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        className="w-16 h-16 rounded-[2rem] bg-white border border-slate-200 flex items-center justify-center mb-6 shadow-sm"
      >
        <Building2 size={28} className="text-slate-200" />
      </motion.div>
      <p className="text-sm font-black text-slate-400 uppercase tracking-widest leading-relaxed">
        Neural Selection Required
      </p>
      <p className="text-[11px] text-slate-300 mt-3 max-w-[180px] font-medium">
        Select a node from the neural map to fetch real-time trade intelligence.
      </p>
    </div>
  );

  if (loading) return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-2xl shimmer flex-shrink-0" />
        <div className="space-y-2 flex-1">
          <div className="h-4 w-3/4 shimmer" />
          <div className="h-3 w-1/4 shimmer" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 mt-6">
        {[1,2,3,4].map(i=><div key={i} className="h-16 shimmer border border-slate-100" />)}
      </div>
      <div className="space-y-3 mt-8">
        {[1,2,3].map(i=><div key={i} className="h-12 shimmer" />)}
      </div>
    </div>
  );

  if (!details) return null;

  let liveImports = 0, liveExports = 0;
  const liveSuppliersMap = new Map();
  const liveCustomersMap = new Map();

  if (graphData && graphData.edges) {
    graphData.edges.forEach(e => {
      const vol = e.quantity || e.tradeValue || 0;
      if (e.target === name) {
        liveImports += vol;
        const sNode = graphData.nodes?.find(n => n.id === e.source);
        liveSuppliersMap.set(e.source, { name: e.source, country: sNode?.country || 'Unknown' });
      }
      if (e.source === name) {
        liveExports += vol;
        const cNode = graphData.nodes?.find(n => n.id === e.target);
        liveCustomersMap.set(e.target, { name: e.target, country: cNode?.country || 'Unknown' });
      }
    });
  }

  const allSuppliers = [...(details.suppliers || [])];
  liveSuppliersMap.forEach((val, key) => {
    if (!allSuppliers.some(s => s.name === key)) allSuppliers.push(val);
  });

  const allCustomers = [...(details.customers || [])];
  liveCustomersMap.forEach((val, key) => {
    if (!allCustomers.some(c => c.name === key)) allCustomers.push(val);
  });

  const totalSuppliers = allSuppliers.length || details.supplierCount || 0;
  const totalCustomers = allCustomers.length || details.customerCount || 0;
  const totalImportVol = Math.max(details.totalImportVolume || 0, liveImports);
  const totalExportVol = Math.max(details.totalExportVolume || 0, liveExports);

  const stats = [
    { label: 'Imports', value: totalImportVol > 0 ? fmt(totalImportVol) : '—', icon: Truck, color: 'text-slate-800', bg: 'bg-slate-50', border: 'border-slate-200' },
    { label: 'Exports', value: totalExportVol > 0 ? fmt(totalExportVol) : '—', icon: TrendingUp, color: 'text-slate-800', bg: 'bg-white', border: 'border-slate-200' },
    { label: 'Suppliers', value: totalSuppliers, icon: Package, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-100' },
    { label: 'Clients', value: totalCustomers, icon: Users, color: 'text-slate-500', bg: 'bg-white', border: 'border-slate-200' },
  ];

  return (
    <div className="flex flex-col h-full bg-white/50">
      {/* Entity Card */}
      <div className="p-5 border-b border-slate-100 bg-white/80 backdrop-blur-md flex-shrink-0 z-10">
        <div className="flex items-start gap-4 mb-5">
          <motion.div 
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="w-14 h-14 rounded-2xl bg-white border border-slate-200 shadow-premium
                            flex items-center justify-center text-2xl flex-shrink-0 group relative overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-slate-50 to-white opacity-0 group-hover:opacity-100 transition-opacity" />
            <span className="relative z-10 drop-shadow-sm">{FLAGS[details.country] || '🏢'}</span>
          </motion.div>
          <div className="min-w-0 pt-1">
            <h3 className="text-base font-black text-slate-800 truncate leading-tight tracking-tight italic">{details.name}</h3>
            <div className="flex items-center gap-1.5 mt-1.5 text-slate-400">
               <MapPin size={10} className="text-blue-500" />
               <span className="text-[10px] font-bold uppercase tracking-wider">{details.country}</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {stats.map((s, i) => (
            <motion.div 
              key={s.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className={`p-3 rounded-2xl ${s.bg} border ${s.border} group transition-all duration-300 hover:shadow-sm hover:scale-[1.02]`}
            >
              <div className="flex items-center justify-between mb-2">
                 <div className={`p-1.5 rounded-lg bg-white/80 ${s.color} shadow-sm group-hover:scale-110 transition-transform`}>
                    <s.icon size={12} strokeWidth={2.5} />
                 </div>
                 <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{s.label}</div>
              </div>
              <div className={`text-lg font-black tabular-nums leading-none ${s.color} drop-shadow-sm tracking-tight`}>{s.value}</div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex px-4 pt-4 border-b border-slate-100 bg-white/40 backdrop-blur-sm sticky top-0 z-20">
        {['overview', 'suppliers', 'customers'].map(t => (
          <button 
            key={t} 
            onClick={() => setTab(t)}
            className={`relative flex-1 pb-3 text-[10px] font-black uppercase tracking-[0.15em] transition-all
              ${tab === t ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
          >
            {t}
            {tab === t && (
              <motion.div 
                layoutId="activeTab"
                className="absolute bottom-0 inset-x-0 h-0.5 bg-blue-500 rounded-full"
              />
            )}
          </button>
        ))}
      </div>

      {/* Intel Feed */}
      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-1">
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="p-3"
          >
            {tab === 'overview' && (
              <div className="space-y-3">
                {details.hsnCodes?.length > 0 ? details.hsnCodes.map((h, i) => (
                  <motion.div 
                    key={h.code}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.03 }}
                    className="p-4 bg-white border border-slate-100 rounded-2xl shadow-premium hover:border-blue-200 transition-all duration-300 group"
                  >
                    <div className="flex items-center justify-between mb-2.5">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-lg bg-blue-50 text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                          <Activity size={12} />
                        </div>
                        <span className="font-black text-[11px] text-slate-700 tracking-tight">ASSET #{h.code}</span>
                      </div>
                      <span className="text-[10px] font-black text-slate-400 tabular-nums bg-slate-50 px-2 py-0.5 rounded-full border border-slate-100">{fmt(h.totalQuantity)} U</span>
                    </div>
                    <p className="text-[10px] text-slate-500 leading-relaxed font-medium pl-1 mb-3">{h.description}</p>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden shadow-inner">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.min(100, maxVol > 0 ? (h.totalQuantity / maxVol) * 250 : 0)}%` }}
                        className="h-full bg-gradient-to-r from-blue-500 via-indigo-500 to-violet-600 rounded-full shadow-lg"
                      />
                    </div>
                  </motion.div>
                ) ) : (
                  <div className="py-20 text-center">
                    <p className="text-[11px] text-slate-300 font-bold uppercase tracking-widest">No Asset Data Streamed</p>
                  </div>
                )}
              </div>
            )}

            {tab === 'suppliers' && (
              <div className="space-y-2">
                {allSuppliers.length > 0 ? allSuppliers.map((s, i) => (
                  <motion.div 
                    key={s.name}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.03 }}
                    className="flex items-center gap-3 p-3 bg-white/50 border border-slate-100 rounded-2xl hover:bg-white hover:shadow-premium hover:border-emerald-200 transition-all cursor-pointer group"
                  >
                    <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-lg shadow-inner group-hover:bg-blue-50 transition-colors">
                      {FLAGS[s.country] || '🏢'}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] font-black text-slate-700 truncate group-hover:text-blue-600 transition-colors tracking-tight">{s.name}</div>
                      <div className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">{s.country}</div>
                    </div>
                    <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]" />
                  </motion.div>
                )) : (
                  <div className="py-20 text-center">
                    <p className="text-[11px] text-slate-300 font-bold uppercase tracking-widest">No Supplier Links Found</p>
                  </div>
                )}
              </div>
            )}

            {tab === 'customers' && (
              <div className="space-y-2">
                {allCustomers.length > 0 ? allCustomers.map((c, i) => (
                  <motion.div 
                    key={c.name}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.03 }}
                    className="flex items-center gap-3 p-3 bg-white/50 border border-slate-100 rounded-2xl hover:bg-white hover:shadow-premium hover:border-violet-200 transition-all cursor-pointer group"
                  >
                    <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-lg shadow-inner group-hover:bg-violet-50 transition-colors">
                      {FLAGS[c.country] || '🏢'}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] font-black text-slate-700 truncate group-hover:text-violet-600 transition-colors tracking-tight">{c.name}</div>
                      <div className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">{c.country}</div>
                    </div>
                    <div className="w-2 h-2 rounded-full bg-violet-400 shadow-[0_0_8px_rgba(167,139,250,0.6)]" />
                  </motion.div>
                )) : (
                  <div className="py-20 text-center">
                    <p className="text-[11px] text-slate-300 font-bold uppercase tracking-widest">No Customer Links Found</p>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
