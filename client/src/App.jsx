import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import SearchBar from './components/SearchBar';
import HSNSelector from './components/HSNSelector';
import GraphView from './components/GraphView';
import MapView from './components/MapView';
import DetailsPanel from './components/DetailsPanel';

const QUICK = ['Adani Ports','Reliance','Tata Steel','BYD','Volkswagen','Nestlé','Pfizer','Foxconn'];

export default function App() {
  const [company,   setCompany]   = useState(null);
  const [hsn,       setHsn]       = useState(null);
  const [graphData, setGraphData] = useState(null);
  const [selNode,   setSelNode]   = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [stats,     setStats]     = useState(null);
  const [error,     setError]     = useState(null);

  useEffect(() => {
    axios.get('/api/graph/stats').then(({ data }) => setStats(data.stats)).catch(() => {});
  }, []);

  const fetchGraph = useCallback(async (c, h) => {
    if (!c || !h) return;
    setLoading(true); setError(null);
    try {
      const { data } = await axios.get('/api/graph/traverse', {
        params: { company: c.name, hsn: h, depth: 5 },
      });
      setGraphData(data);
    } catch {
      setError('Failed to load supply chain.');
      setGraphData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (company && hsn) fetchGraph(company, hsn);
  }, [company, hsn, fetchGraph]);

  const selectCompany = (c) => {
    setCompany(c); setHsn(c ? 'all' : null);
    setGraphData(null); setSelNode(null); setError(null);
  };

  return (
    <div className="h-screen flex flex-col bg-[#F8FAFC] overflow-hidden text-slate-800">
      
      {/* ─── HEADER ─── */}
      <header className="h-16 bg-white border-b border-slate-200 flex items-center px-6 gap-6 shadow-sm z-30">
        <div className="flex items-center gap-3 w-48">
          <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-200">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
            </svg>
          </div>
          <div>
            <div className="text-lg font-black tracking-tighter text-slate-900 leading-none">FlowScope</div>
            <div className="text-[10px] uppercase tracking-widest font-bold text-slate-400 mt-1">Intelligence</div>
          </div>
        </div>

        <div className="flex-1 max-w-xl">
          <SearchBar onCompanySelect={selectCompany} />
        </div>

        {stats && (
          <div className="flex items-center gap-6 border-l border-slate-100 pl-6 h-8">
            <div className="text-center">
              <div className="text-sm font-bold text-blue-600">{stats.totalCompanies}</div>
              <div className="text-[9px] uppercase font-bold text-slate-400">Companies</div>
            </div>
            <div className="text-center">
              <div className="text-sm font-bold text-violet-600">{stats.totalTradeLinks}</div>
              <div className="text-[9px] uppercase font-bold text-slate-400">Trade Links</div>
            </div>
            <div className="text-center">
              <div className="text-sm font-bold text-emerald-600">{stats.totalCountries}</div>
              <div className="text-[9px] uppercase font-bold text-slate-400">Countries</div>
            </div>
          </div>
        )}
      </header>

      {/* ─── MAIN CONTENT AREA ─── */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* LEFT FILTERS */}
        <aside className="w-64 bg-white border-r border-slate-200 flex flex-col overflow-hidden z-20">
          <div className="p-4 border-b border-slate-50 bg-slate-50/50">
            <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">HSN Filter</h3>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            {company ? (
              <HSNSelector companyName={company.name} onHSNSelect={setHsn} selectedHSN={hsn} />
            ) : (
              <div className="text-center py-10 px-4">
                <div className="text-[11px] text-slate-300 font-medium leading-relaxed">
                  Search a company to begin exploring networks
                </div>
              </div>
            )}
          </div>
          
          <div className="p-4 border-t border-slate-100">
             <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3">Quick List</h3>
             <div className="flex flex-wrap gap-1.5">
               {QUICK.map(q => (
                 <button key={q} onClick={() => selectCompany({name: q, country: ''})}
                   className="px-2.5 py-1.5 bg-slate-50 hover:bg-blue-50 text-slate-600 hover:text-blue-700 
                              text-[11px] font-bold rounded-lg transition-all border border-slate-100">
                   {q}
                 </button>
               ))}
             </div>
          </div>
        </aside>

        {/* CENTER GRAPH (MAIN) */}
        <main className="flex-1 bg-[#F8FAFC] relative overflow-hidden">
          {!company ? (
            <div className="h-full flex items-center justify-center">
              <div className="text-center max-w-sm px-6">
                <div className="mb-6 opacity-40">
                   <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="mx-auto text-blue-500">
                     <circle cx="12" cy="12" r="3"/><circle cx="5" cy="6" r="2"/><circle cx="19" cy="6" r="2"/>
                     <circle cx="5" cy="18" r="2"/><circle cx="19" cy="18" r="2"/>
                     <path d="M7 6h10M6 8l5 8M18 8l-5 8"/>
                   </svg>
                </div>
                <h2 className="text-xl font-bold text-slate-800 mb-2">Build Trade Networks</h2>
                <p className="text-sm text-slate-500">
                  Select a company to visualize multi-tier supplier relationships and global product flows.
                </p>
              </div>
            </div>
          ) : (
            <div className="h-full relative">
              {loading && (
                <div className="absolute inset-0 bg-white/60 backdrop-blur-sm z-10 flex items-center justify-center">
                  <div className="w-10 h-10 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin"/>
                </div>
              )}
              <GraphView 
                graphData={graphData} 
                onNodeClick={setSelNode} 
                selectedNode={selNode?.name}
                highlightCompany={company?.name}
              />
            </div>
          )}
        </main>

        {/* RIGHT SIDEBAR (DETAILS + MAP) */}
        <aside className="w-[360px] bg-white border-l border-slate-200 flex flex-col overflow-hidden z-20">
          
          {/* Details (Top 60%) */}
          <div className="flex-1 flex flex-col overflow-hidden border-b border-slate-200">
            <div className="p-4 border-b border-slate-50 bg-slate-50/50 flex justify-between items-center">
              <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Selected Detail</h3>
              {selNode && <span className="text-[10px] font-bold bg-blue-50 text-blue-600 px-2 py-0.5 rounded-md">Live</span>}
            </div>
            <div className="flex-1 overflow-y-auto">
              <DetailsPanel selectedCompany={company} selectedNode={selNode} />
            </div>
          </div>

          {/* Map (Bottom 40%) */}
          <div className="h-[320px] bg-slate-50 flex flex-col overflow-hidden">
            <div className="p-3 border-b border-slate-100 bg-white shadow-sm flex justify-between items-center">
              <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Geographic Flow</h3>
              {graphData?.tradeRoutes?.length > 0 && 
                <span className="text-[10px] font-bold text-emerald-600">{graphData.tradeRoutes.length} Routes</span>
              }
            </div>
            <div className="flex-1 relative">
              <MapView tradeRoutes={graphData?.tradeRoutes} nodes={graphData?.nodes} />
            </div>
          </div>

        </aside>

      </div>
    </div>
  );
}
