import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { LayoutDashboard, Cloud, Search as SearchIcon } from 'lucide-react';
import Dashboard from './components/Dashboard';
import SearchBar from './components/SearchBar';
import HSNSelector from './components/HSNSelector';
import GraphView from './components/GraphView';
import MapView from './components/MapView';
import DetailsPanel from './components/DetailsPanel';

export default function App() {
  const [page, setPage] = useState('dashboard');
  const [viewMode, setViewMode] = useState('map'); // Map as background
  
  const [company,   setCompany]   = useState(null);
  const [hsn,       setHsn]       = useState(null);
  const [hsnDesc,   setHsnDesc]   = useState('');
  const [graphData, setGraphData] = useState(null);
  const [selNode,   setSelNode]   = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [stats,     setStats]     = useState(null);
  const [error,     setError]     = useState(null);
  const [traceLog,  setTraceLog]  = useState('');
  const [expandingNode, setExpandingNode] = useState(null);

  const graphRef = useRef(null);
  useEffect(() => { graphRef.current = graphData; }, [graphData]);

  useEffect(() => {
    axios.get('/api/graph/stats').then(({ data }) => setStats(data.stats)).catch(() => {});
  }, []);

  const fetchGraph = useCallback(async (c, h, desc) => {
    if (!c || !h) return;
    setLoading(true); setError(null); setTraceLog('TRACING SUPPLY CHAIN...');
    try {
      const payload = { companyName: c.name, companyCountry: c.country || 'Unknown', targetHsCode: h, hsnDescription: desc || '', maxTiers: 3 };
      const { data } = await axios.post('/api/trace/expand', payload, { timeout: 120000 });
      setGraphData({ nodes: data.nodes || [], edges: data.edges || [], tradeRoutes: data.tradeRoutes || [] });
      setTraceLog(`TRACE COMPLETE: ${data.meta?.totalNodes || 0} NODES`);
    } catch (err) {
      setError('Trace engine error. Check connection.');
    } finally {
      setLoading(false);
    }
  }, []);

  const expandNode = useCallback(async (node) => {
    if (!node || !node.id) return;
    const current = graphRef.current;
    if (!current) return;
    let traceHsCode = current.edges.find(e => e.source === node.id)?.hsn || hsn || '87';
    setExpandingNode(node.id);
    try {
      const payload = { companyName: node.id, companyCountry: node.country || 'Unknown', targetHsCode: traceHsCode, maxTiers: 2 };
      const { data } = await axios.post('/api/trace/expand', payload);
      setGraphData(prev => ({
        nodes: [...prev.nodes, ...(data.nodes || []).filter(n => !prev.nodes.some(ex => ex.id === n.id))],
        edges: [...prev.edges, ...(data.edges || []).filter(e => !prev.edges.some(ex => `${ex.source}-${ex.target}` === `${e.source}-${e.target}`))],
        tradeRoutes: [...(prev.tradeRoutes || []), ...(data.tradeRoutes || []).filter(r => !prev.tradeRoutes.some(ex => `${ex.from}-${ex.to}` === `${r.from}-${r.to}`))]
      }));
    } catch (e) {} finally { setExpandingNode(null); }
  }, [hsn]);

  return (
    <div className="relative h-screen w-screen bg-gray-50 text-black font-sans overflow-hidden flex">
      
      {/* 🚀 SIDE NAV - B&W Style */}
      {page === 'dashboard' && (
        <aside className="w-64 bg-white border-r border-gray-200 flex flex-col shrink-0 z-50 animate-in slide-in-from-left duration-300">
          <div className="p-6">
            <div className="flex items-center gap-2 mb-8">
               <div className="w-8 h-8 bg-black rounded flex items-center justify-center">
                 <Cloud size={18} className="text-white" />
               </div>
               <span className="font-bold text-xl tracking-tight">FlowScope</span>
            </div>
            
            <nav className="space-y-1">
              {[
                { id: 'dashboard', icon: <LayoutDashboard size={20} />, label: 'Dashboard' },
                { id: 'analytics', icon: <Cloud size={20} />,           label: 'Analytics' },
              ].map(item => (
                <button
                  key={item.id}
                  onClick={() => setPage(item.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-bold transition-all ${
                    page === item.id 
                      ? 'bg-gray-100 text-black' 
                      : 'text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </button>
              ))}
            </nav>
          </div>
          <div className="mt-auto p-6 border-t border-gray-100 bg-white">
             <div className="flex items-center gap-3 mb-4">
               <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold">N</div>
               <div className="flex flex-col">
                 <span className="text-[10px] font-bold text-gray-400 uppercase">Admin v1.0</span>
                 <span className="text-xs font-bold text-gray-800">team@flowscope.app</span>
               </div>
             </div>
             <button className="w-full py-2 bg-white hover:bg-gray-50 text-gray-400 hover:text-red-500 rounded-lg transition-all font-bold text-xs border border-gray-200">
                Sign Out
             </button>
          </div>
        </aside>
      )}

      {/* 🎯 MASTER CANVAS */}
      <main className="flex-1 relative flex flex-col min-w-0">
        
        {/* Immersive View Layer (Analytics Only) */}
        {page === 'analytics' && (
          <div className="absolute inset-0 z-0 bg-white">
            {viewMode === 'map' ? (
              <MapView tradeRoutes={graphData?.tradeRoutes} nodes={graphData?.nodes} />
            ) : (
              <GraphView graphData={graphData} highlightCompany={company?.name} selectedNode={selNode?.id} onNodeClick={setSelNode} onExpandNode={expandNode} expandingNode={expandingNode} />
            )}
          </div>
        )}

        {/* Global Control Bar */}
        <header className={`h-16 flex items-center justify-between px-6 z-[60] shrink-0 ${page === 'dashboard' ? 'bg-white border-b border-gray-200' : 'pointer-events-none'}`}>
          <div className="flex items-center gap-4 pointer-events-auto">
            {page === 'analytics' && (
              <button onClick={() => { setPage('dashboard'); setCompany(null); }} className="flex items-center gap-2 px-3 py-1.5 bg-white hover:bg-gray-100 text-black rounded-lg transition-all font-bold text-xs border border-gray-200 shadow-sm">
                ← Back
              </button>
            )}
          </div>

          <div className="max-w-xl w-full flex items-center justify-center pointer-events-auto px-4">
             <SearchBar onCompanySelect={(c) => { setCompany(c); setPage('analytics'); setHsn(null); }} selectedCompany={company} />
          </div>

          <div className="flex items-center gap-4 pointer-events-auto min-w-[150px] justify-end">
             {(loading || traceLog) && (
               <div className="flex items-center gap-3 bg-black px-4 py-2 rounded-lg shadow-lg">
                  <div className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-white">{traceLog}</span>
               </div>
             )}
          </div>
        </header>

        {/* Dynamic Surface */}
        <div className="flex-1 relative overflow-hidden">
          {page === 'dashboard' ? (
             <div className="h-full overflow-y-auto bg-gray-50">
               <Dashboard stats={stats} onExplore={() => setPage('analytics')} onTrace={(c) => { setCompany(c); setPage('analytics'); }} />
             </div>
          ) : (
            <div className="absolute inset-0 z-50 pointer-events-none">
              
              {/* Mini-Map radar overlay */}
              {company && hsn && (
                <div className="absolute bottom-6 right-6 w-[380px] h-[280px] rounded-2xl overflow-hidden border border-gray-200 shadow-2xl pointer-events-auto transition-all hover:scale-[1.02] bg-white group">
                    <div className="absolute top-4 left-4 z-20">
                       <button onClick={() => setViewMode(viewMode === 'map' ? 'graph' : 'map')} className="px-3 py-1.5 bg-black hover:bg-gray-800 text-white font-bold text-[10px] uppercase rounded-lg shadow-lg transition-all active:scale-95">
                         Switch to {viewMode === 'map' ? 'Graph' : 'Map'}
                       </button>
                    </div>
                    <div className="w-full h-full opacity-90 group-hover:opacity-100 transition-opacity">
                      {viewMode === 'map' ? <GraphView graphData={graphData} selectedNode={selNode?.id} onNodeClick={setSelNode} /> : <MapView tradeRoutes={graphData?.tradeRoutes} nodes={graphData?.nodes} />}
                    </div>
                </div>
              )}

              {/* HSN Selector overlay */}
              {company && !hsn && !loading && (
                <div className="absolute inset-0 flex items-center justify-center p-8 pointer-events-auto bg-white/40 backdrop-blur-sm">
                  <div className="bg-white p-8 rounded-2xl border border-gray-200 shadow-2xl max-w-lg w-full">
                    <HSNSelector companyName={company.name} selectedHSN={hsn} onHSNSelect={(code, desc) => { setHsn(code); setHsnDesc(desc); fetchGraph(company, code, desc); }} />
                  </div>
              </div>
              )}

              {/* Idle Splash */}
              {!company && page === 'analytics' && (
                 <div className="absolute inset-0 flex flex-col items-center justify-center p-12 text-center bg-white/80 backdrop-blur-sm">
                    <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center text-gray-400 mb-6 border border-gray-200">
                      <SearchIcon size={32} />
                    </div>
                    <h2 className="text-xl font-bold text-black mb-2 uppercase tracking-tight">Supply Chain Analytics</h2>
                    <p className="text-gray-400 max-w-xs text-sm font-medium">Search for a company to initialize the tracing engine.</p>
                 </div>
              )}

              {/* Node panel overlay */}
              {selNode && <div className="pointer-events-auto h-full"><DetailsPanel selectedCompany={company} selectedNode={selNode} onClose={() => setSelNode(null)} /></div>}

            </div>
          )}
        </div>
      </main>

      {/* Error notification */}
      {error && (
        <div className="fixed bottom-6 left-6 bg-black text-white px-6 py-4 rounded-xl shadow-2xl flex items-center gap-4 z-[100] border border-gray-800 animate-in slide-in-from-bottom-6">
           <span className="text-xs font-bold leading-relaxed">{error}</span>
           <button onClick={() => setError(null)} className="ml-4 text-xs font-bold text-gray-400 hover:text-white">✕</button>
        </div>
      )}
    </div>
  );
}
