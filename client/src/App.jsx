import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { LayoutDashboard, Cloud, FileText, Settings, Search as SearchIcon } from 'lucide-react';
import Dashboard from './components/Dashboard';
import SearchBar from './components/SearchBar';
import HSNSelector from './components/HSNSelector';
import GraphView from './components/GraphView';
import MapView from './components/MapView';
import DetailsPanel from './components/DetailsPanel';

const QUICK = ['isuzu','škoda auto','cage warriors','kaipan','ineos group'];

export default function App() {
  const [page, setPage] = useState('dashboard');
  const [viewMode, setViewMode] = useState('split'); // 'graph', 'map', 'split'
  
  // Graph/Trace states
  const [company,   setCompany]   = useState(null);
  const [hsn,       setHsn]       = useState(null);
  const [hsnDesc,   setHsnDesc]   = useState('');
  const [graphData, setGraphData] = useState(null);
  const [selNode,   setSelNode]   = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [stats,     setStats]     = useState(null);
  const [error,     setError]     = useState(null);
  const [traceLog,  setTraceLog]  = useState('');
  const [expandingNode, setExpandingNode] = useState(null); // track which node is being expanded

  // Keep a ref to graphData so expandNode always has the latest
  const graphRef = useRef(null);
  useEffect(() => { graphRef.current = graphData; }, [graphData]);

  useEffect(() => {
    axios.get('/api/graph/stats').then(({ data }) => setStats(data.stats)).catch(() => {});
  }, []);

  const fetchGraph = useCallback(async (c, h, desc) => {
    if (!c || !h) return;
    setLoading(true); setError(null); setTraceLog('Connecting to AI trace engine...');
    try {
      const payload = {
        companyName: c.name,
        companyCountry: c.country || 'Unknown',
        targetHsCode: h,
        hsnDescription: desc || '',
        maxTiers: 3,
      };
      setTraceLog(`Tracing supply chain for ${c.name} (HS ${h})...`);
      const { data } = await axios.post('/api/trace/expand', payload, { timeout: 120000 });

      setGraphData({
        nodes: data.nodes || [],
        edges: data.edges || [],
        tradeRoutes: data.tradeRoutes || [],
      });
      setTraceLog(`Found ${data.meta?.totalNodes || 0} companies across ${data.meta?.tiersTraversed || 0} tiers`);
    } catch (err) {
      console.error(err);
      setError('Trace engine encountered an error. Check server logs.');
      setGraphData(null);
      setTraceLog('');
    } finally {
      setLoading(false);
    }
  }, []);

  // ─── EXPAND NODE: Click a node to recursively discover its suppliers ───
  const expandNode = useCallback(async (node) => {
    if (!node || !node.name) return;
    
    // Find the node's HS code from existing edges (what does this node supply?)
    const current = graphRef.current;
    if (!current) return;

    // Determine the HS code to trace — look for edges where this node is the source
    let traceHsCode = null;
    for (const edge of current.edges) {
      if (edge.source === node.name) {
        traceHsCode = edge.hsn;
        break;
      }
    }
    // If no outgoing edge, look for incoming edges (what is supplied to this node)
    if (!traceHsCode) {
      for (const edge of current.edges) {
        if (edge.target === node.name) {
          traceHsCode = edge.hsn;
          break;
        }
      }
    }
    // Fallback: use the current HSN filter
    if (!traceHsCode) traceHsCode = hsn || '87';

    setExpandingNode(node.name);
    setTraceLog(`Expanding ${node.name}...`);

    try {
      const payload = {
        companyName: node.name,
        companyCountry: node.country || 'Unknown',
        targetHsCode: traceHsCode,
        hsnDescription: '',
        maxTiers: 2, // 2 tiers from this sub-node
      };

      const { data } = await axios.post('/api/trace/expand', payload, { timeout: 120000 });

      // ─── MERGE new data into existing graph (don't replace!) ───
      setGraphData(prev => {
        if (!prev) return {
          nodes: data.nodes || [],
          edges: data.edges || [],
          tradeRoutes: data.tradeRoutes || [],
        };

        // Merge nodes (deduplicate by id)
        const existingNodeIds = new Set(prev.nodes.map(n => n.id));
        const newNodes = (data.nodes || []).filter(n => !existingNodeIds.has(n.id));

        // Merge edges (deduplicate by source+target+hsn)
        const existingEdgeKeys = new Set(prev.edges.map(e => `${e.source}→${e.target}→${e.hsn}`));
        const newEdges = (data.edges || []).filter(e => !existingEdgeKeys.has(`${e.source}→${e.target}→${e.hsn}`));

        // Merge trade routes
        const existingRouteKeys = new Set(prev.tradeRoutes?.map(r => `${r.from}→${r.to}`) || []);
        const newRoutes = (data.tradeRoutes || []).filter(r => !existingRouteKeys.has(`${r.from}→${r.to}`));

        return {
          nodes: [...prev.nodes, ...newNodes],
          edges: [...prev.edges, ...newEdges],
          tradeRoutes: [...(prev.tradeRoutes || []), ...newRoutes],
        };
      });

      const addedNodes = data.nodes?.length ? data.nodes.length - 1 : 0; // -1 for the anchor
      setTraceLog(`Expanded ${node.name}: +${addedNodes} new suppliers found`);

    } catch (err) {
      console.error('Expand failed:', err);
      setTraceLog(`Failed to expand ${node.name}`);
    } finally {
      setExpandingNode(null);
    }
  }, [hsn]);

  const selectCompany = (c) => {
    setCompany(c); setHsn(null); setHsnDesc('');
    setGraphData(null); setSelNode(null); setError(null); setTraceLog('');
  };

  const selectHsn = (code, description) => {
    if (code === 'all') {
      setHsn('all');
      setHsnDesc('');
      return;
    }
    setHsn(code);
    setHsnDesc(description || '');
    if (company) {
      fetchGraph(company, code === 'all' ? '87' : code, description);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50 text-gray-900 font-sans overflow-hidden">
      {/* Top Header */}
      <header className="flex items-center justify-center h-16 bg-white border-b border-gray-200 shrink-0 px-4">
        <div className="w-full max-w-xl relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <SearchIcon size={16} className="text-gray-400" />
          </div>
          <input
            type="text"
            className="block w-full pl-10 pr-3 py-2 border border-gray-200 rounded-md leading-5 bg-gray-50 placeholder-gray-400 focus:outline-none focus:bg-white focus:ring-1 focus:ring-gray-400 focus:border-gray-400 sm:text-sm transition-colors"
            placeholder="Enter company name"
          />
        </div>
      </header>

      {/* Main Area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-56 bg-white border-r border-gray-200 flex flex-col p-4 shrink-0">
          <nav className="flex-1 space-y-1">
            <button
              onClick={() => setPage('dashboard')}
              className={`flex items-center gap-3 w-full px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                page === 'dashboard' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'
              }`}
            >
              <LayoutDashboard size={18} />
              <span>Dashboard</span>
            </button>
            <button
              onClick={() => setPage('analytics')}
              className={`flex items-center gap-3 w-full px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                page === 'analytics' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'
              }`}
            >
              <Cloud size={18} />
              <span>Analytics</span>
            </button>
            <button
              onClick={() => setPage('reports')}
              className={`flex items-center gap-3 w-full px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                page === 'reports' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'
              }`}
            >
              <FileText size={18} />
              <span>Reports</span>
            </button>
            <button
              onClick={() => setPage('settings')}
              className={`flex items-center gap-3 w-full px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                page === 'settings' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'
              }`}
            >
              <Settings size={18} />
              <span>Settings</span>
            </button>
          </nav>

          <div className="mt-auto pt-4 border-t border-gray-100 space-y-4">
            <div className="px-3">
              <div className="text-xs font-medium text-gray-900">team@flowscope.app</div>
              <div className="text-[10px] text-gray-500 font-medium">Admin Panel v1.0</div>
            </div>
            <button className="flex items-center gap-3 w-full px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-md transition-colors">
              <div className="w-6 h-6 rounded-full bg-gray-900 text-white flex items-center justify-center text-[10px] font-bold">N</div>
              <span>Log Out</span>
            </button>
          </div>
        </aside>

        {/* Content */}
        <main className="flex-1 overflow-y-auto bg-[#F9FAFB] custom-scrollbar relative">
          {page === 'dashboard' ? <Dashboard /> : page === 'analytics' ? (
            <div className="flex h-full w-full">
              {/* Left Controls */}
              <div className="w-80 bg-white border-r border-slate-200 flex flex-col z-20 shadow-sm shrink-0">
                <div className="p-5 border-b border-slate-100">
                  <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-blue-500"></span> Tracing Engine
                  </h2>
                </div>
                <div className="flex-1 overflow-y-auto">
                  <SearchBar onCompanySelect={selectCompany} />
                  {company && <HSNSelector companyName={company.name} selectedHSN={hsn} onHSNSelect={selectHsn} />}
                  
                  {company && (
                    <div className="px-4 py-4 mt-2 border-t border-slate-100">
                      <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">View Mode</div>
                      <div className="flex bg-slate-100 p-1 rounded-xl">
                        {[
                          { id: 'graph', label: 'Network' },
                          { id: 'split', label: 'Dual View' },
                          { id: 'map',   label: 'Global' },
                        ].map(v => (
                          <button key={v.id} onClick={() => setViewMode(v.id)}
                            className={`flex-1 flex items-center justify-center py-1.5 rounded-lg text-[10px] font-black uppercase tracking-tight transition-all
                              ${viewMode === v.id ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
                            {v.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              
              {/* Center Graph */}
              <div className="flex-1 bg-[#F8FAFC] relative overflow-hidden">
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
                      <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-10 flex flex-col items-center justify-center gap-4">
                        <div className="w-12 h-12 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin"/>
                        <div className="text-sm font-bold text-slate-600">{traceLog}</div>
                        <div className="text-[10px] text-slate-400">Querying Gemini AI + UN Comtrade API...</div>
                      </div>
                    )}
                    {error && (
                      <div className="absolute top-4 left-4 right-4 z-10 bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700 font-medium">
                        {error}
                      </div>
                    )}
                    {!hsn && !loading && (
                      <div className="absolute inset-0 flex items-center justify-center z-30 bg-white/60 backdrop-blur-sm">
                        <div className="text-center max-w-sm px-6 bg-white p-6 rounded-2xl shadow-lg border border-slate-100">
                          <div className="text-4xl mb-4">🏭</div>
                          <h3 className="text-lg font-bold text-slate-700 mb-2">Select an HSN Code</h3>
                          <p className="text-sm text-slate-400">
                            Pick a product category from the left panel to begin tracing the supply chain for <strong>{company.name}</strong>.
                          </p>
                        </div>
                      </div>
                    )}
                    
                    {/* SPLIT VIEW DRIVER — always rendered, overlays sit on top */}
                    <div className="absolute inset-0 flex">
                      {/* GRAPH PANEL */}
                      <div className={`transition-all duration-500 border-r border-slate-200 bg-white h-full
                        ${viewMode === 'map' ? 'w-0 opacity-0 pointer-events-none' : 'flex-1'} relative`}>
                        <GraphView 
                          graphData={graphData} 
                          onNodeClick={setSelNode} 
                          onExpandNode={expandNode}
                          expandingNode={expandingNode}
                          selectedNode={selNode?.name || selNode?.id}
                          highlightCompany={company?.name}
                        />
                      </div>

                      {/* MAP PANEL */}
                      <div className={`transition-all duration-500 bg-[#e8ecf1] h-full
                        ${viewMode === 'graph' ? 'w-0 opacity-0 pointer-events-none' : 'flex-1'} relative`}>
                        <MapView tradeRoutes={graphData?.tradeRoutes} nodes={graphData?.nodes} />
                      </div>
                    </div>

                    {/* Expand Status Banner */}
                    {expandingNode && (
                      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 
                                      bg-blue-600 text-white px-5 py-2.5 rounded-2xl shadow-xl
                                      flex items-center gap-3 animate-pulse">
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>
                        <span className="text-sm font-bold">Expanding {expandingNode}...</span>
                      </div>
                    )}

                    {/* Trace Log */}
                    {traceLog && !loading && !expandingNode && (
                      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20
                                      bg-white/90 backdrop-blur-md text-slate-600 px-4 py-2 rounded-xl shadow-sm
                                      border border-slate-200 text-xs font-bold">
                        {traceLog}
                      </div>
                    )}
                  </div>
                )}
              </div>
              
              {/* Right Details */}
              <DetailsPanel selectedCompany={company} selectedNode={selNode} />
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-400">
              Coming Soon
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
