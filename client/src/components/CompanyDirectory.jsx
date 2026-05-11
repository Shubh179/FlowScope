import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import {
  Search, X, Filter, MapPin, Globe2, Tag, ChevronDown, ChevronLeft, ChevronRight,
  Building2, Shield, ArrowLeft, Loader2, Database, ArrowUpDown
} from 'lucide-react';

/* ═══════════════════════════════════════════════
   COMPANY CARD
   ═══════════════════════════════════════════════ */
function CompanyCard({ company, index, onSelect }) {
  const [expanded, setExpanded] = useState(false);

  const confidenceColor = company.confidence >= 7
    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
    : company.confidence >= 4
    ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
    : 'bg-red-500/20 text-red-400 border-red-500/30';

  // Extract role from description if available
  const roleMatch = (company.description || '').match(/Role:\s*([^|]+)/);
  const role = roleMatch ? roleMatch[1].trim() : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03 }}
      onClick={() => onSelect && onSelect(company)}
      className="bg-slate-900/50 rounded-2xl border border-slate-800/50 hover:border-slate-700/80 hover:bg-slate-800/50 cursor-pointer transition-all group"
    >
      <div className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500/20 to-indigo-500/20 border border-violet-500/20 flex items-center justify-center shrink-0">
                <Building2 size={16} className="text-violet-400" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-black text-white truncate">{company.name}</h3>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px] font-bold text-slate-500 flex items-center gap-1">
                    <MapPin size={9} /> {company.city}{company.city && company.country ? ', ' : ''}{company.country}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {role && (
              <span className="text-[9px] font-bold uppercase tracking-wider bg-indigo-500/15 text-indigo-400 border border-indigo-500/20 px-2 py-1 rounded-lg">
                {role}
              </span>
            )}
            <span className={`text-[10px] font-black px-2 py-1 rounded-lg border ${confidenceColor}`}>
              {company.confidence}/10
            </span>
          </div>
        </div>

        {/* Industry & BOM Tags */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {company.standardizedIndustry && (
            <span className="text-[9px] font-bold uppercase tracking-wider bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 px-2 py-1 rounded-lg">
              {company.standardizedIndustry}
            </span>
          )}
          {(company.bomFilter || []).slice(0, expanded ? 20 : 4).map((bom, i) => (
            <span key={i} className="text-[9px] font-bold uppercase tracking-wider bg-slate-800 text-slate-400 border border-slate-700/50 px-2 py-1 rounded-lg">
              {bom}
            </span>
          ))}
          {!expanded && (company.bomFilter || []).length > 4 && (
            <button onClick={() => setExpanded(true)} className="text-[9px] font-bold text-violet-400 hover:text-violet-300 transition-colors px-1">
              +{company.bomFilter.length - 4} more
            </button>
          )}
        </div>

        {/* Coordinates */}
        <div className="mt-3 flex items-center gap-4 text-[10px] font-bold text-slate-600">
          <span className="flex items-center gap-1"><Globe2 size={10} /> {company.lat?.toFixed(4)}, {company.lng?.toFixed(4)}</span>
          {company.industry && company.industry !== company.standardizedIndustry && (
            <span className="truncate">{company.industry}</span>
          )}
        </div>
      </div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════
   MAIN COMPANY DIRECTORY COMPONENT
   ═══════════════════════════════════════════════ */
export default function CompanyDirectory({ onBack, onSelect }) {
  // ─── State ───
  const [companies, setCompanies] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  // ─── Filters ───
  const [searchQuery, setSearchQuery] = useState('');
  const [industryFilter, setIndustryFilter] = useState('');
  const [countryFilter, setCountryFilter] = useState('');
  const [bomFilter, setBomFilter] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // ─── Metadata ───
  const [industries, setIndustries] = useState([]);
  const [countries, setCountries] = useState([]);

  const debounceRef = useRef(null);

  // ─── Load Metadata ───
  useEffect(() => {
    axios.get('/api/register/industries').then(r => setIndustries(r.data.industries || [])).catch(() => {});
    axios.get('/api/register/countries').then(r => setCountries(r.data.countries || [])).catch(() => {});
  }, []);

  // ─── Fetch Companies ───
  const fetchCompanies = useCallback(async (pageNum = 1) => {
    setLoading(true);
    try {
      const params = { page: pageNum, limit: 20 };
      if (searchQuery.trim()) params.q = searchQuery.trim();
      if (industryFilter) params.industry = industryFilter;
      if (countryFilter) params.country = countryFilter;
      if (bomFilter.trim()) params.bom = bomFilter.trim();

      const res = await axios.get('/api/register/directory', { params });
      setCompanies(res.data.companies || []);
      setTotal(res.data.total || 0);
      setTotalPages(res.data.totalPages || 0);
      setPage(pageNum);
    } catch (err) {
      console.error('[Directory] Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [searchQuery, industryFilter, countryFilter, bomFilter]);

  // ─── Debounced Search ───
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchCompanies(1), 400);
    return () => clearTimeout(debounceRef.current);
  }, [searchQuery, industryFilter, countryFilter, bomFilter, fetchCompanies]);

  const clearFilters = () => {
    setSearchQuery('');
    setIndustryFilter('');
    setCountryFilter('');
    setBomFilter('');
  };

  const hasFilters = searchQuery || industryFilter || countryFilter || bomFilter;

  return (
    <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 overflow-y-auto">
      <div className="max-w-5xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <button onClick={onBack} className="w-10 h-10 rounded-xl bg-slate-800/80 border border-slate-700/50 flex items-center justify-center text-slate-400 hover:text-white hover:border-slate-600 transition-all">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Company Directory</h1>
            <p className="text-sm text-slate-500 mt-1">Search and explore the FlowScope intelligence network</p>
          </div>
          <div className="ml-auto flex items-center gap-2 px-3 py-1.5 bg-slate-800/80 border border-slate-700/50 rounded-lg">
            <Database size={12} className="text-slate-500" />
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{total.toLocaleString()} Entities</span>
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative mb-4">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by company name, industry, or description..."
            className="w-full pl-11 pr-12 py-4 bg-slate-800/50 rounded-2xl border border-slate-700/50 text-white text-sm outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/20 transition-all placeholder:text-slate-500"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition-colors">
              <X size={16} />
            </button>
          )}
        </div>

        {/* Filter Toggle */}
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => setShowFilters(!showFilters)} className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all border ${
            showFilters ? 'bg-violet-500/20 text-violet-400 border-violet-500/30' : 'bg-slate-800/50 text-slate-400 border-slate-700/50 hover:border-slate-600'
          }`}>
            <Filter size={13} />
            Filters
            {hasFilters && <span className="w-1.5 h-1.5 rounded-full bg-violet-400" />}
          </button>
          {hasFilters && (
            <button onClick={clearFilters} className="text-xs font-bold text-slate-500 hover:text-white transition-colors">
              Clear all
            </button>
          )}
        </div>

        {/* Filters Panel */}
        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden mb-6"
            >
              <div className="bg-slate-900/50 rounded-2xl border border-slate-800/50 p-5 grid grid-cols-3 gap-4">
                {/* Industry Filter */}
                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-2 block">Industry</label>
                  <div className="relative">
                    <select
                      value={industryFilter}
                      onChange={(e) => setIndustryFilter(e.target.value)}
                      className="w-full p-3 pr-10 bg-slate-800/50 rounded-xl border border-slate-700/50 text-white text-sm outline-none focus:border-violet-500/50 transition-all appearance-none cursor-pointer"
                    >
                      <option value="">All Industries</option>
                      {industries.map((ind, i) => <option key={i} value={ind}>{ind}</option>)}
                    </select>
                    <ChevronDown size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                  </div>
                </div>

                {/* Country Filter */}
                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-2 block">Country</label>
                  <div className="relative">
                    <select
                      value={countryFilter}
                      onChange={(e) => setCountryFilter(e.target.value)}
                      className="w-full p-3 pr-10 bg-slate-800/50 rounded-xl border border-slate-700/50 text-white text-sm outline-none focus:border-violet-500/50 transition-all appearance-none cursor-pointer"
                    >
                      <option value="">All Countries</option>
                      {countries.map((c, i) => <option key={i} value={c}>{c}</option>)}
                    </select>
                    <ChevronDown size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                  </div>
                </div>

                {/* BOM Filter */}
                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-2 block">BOM / Component</label>
                  <input
                    value={bomFilter}
                    onChange={(e) => setBomFilter(e.target.value)}
                    placeholder="e.g. lithium, steel"
                    className="w-full p-3 bg-slate-800/50 rounded-xl border border-slate-700/50 text-white text-sm outline-none focus:border-violet-500/50 transition-all placeholder:text-slate-500"
                  />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Results */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 size={32} className="text-violet-400 animate-spin mb-4" />
            <span className="text-sm font-bold text-slate-500">Searching intelligence network...</span>
          </div>
        ) : companies.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Database size={40} className="text-slate-700 mb-4" />
            <span className="text-sm font-bold text-slate-500">No companies found matching your criteria</span>
            {hasFilters && (
              <button onClick={clearFilters} className="mt-3 text-xs font-bold text-violet-400 hover:text-violet-300 transition-colors">
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="grid gap-3">
              {companies.map((company, i) => (
                <CompanyCard key={`${company.name}-${i}`} company={company} index={i} onSelect={onSelect} />
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-8">
                <span className="text-xs font-bold text-slate-500">
                  Page {page} of {totalPages} · Showing {companies.length} of {total.toLocaleString()} results
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => fetchCompanies(page - 1)}
                    disabled={page <= 1}
                    className="w-9 h-9 rounded-xl bg-slate-800/50 border border-slate-700/50 flex items-center justify-center text-slate-400 hover:text-white hover:border-slate-600 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  {/* Page numbers */}
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let p;
                    if (totalPages <= 5) p = i + 1;
                    else if (page <= 3) p = i + 1;
                    else if (page >= totalPages - 2) p = totalPages - 4 + i;
                    else p = page - 2 + i;
                    return (
                      <button
                        key={p}
                        onClick={() => fetchCompanies(p)}
                        className={`w-9 h-9 rounded-xl text-xs font-bold transition-all ${
                          p === page
                            ? 'bg-violet-500/20 text-violet-400 border border-violet-500/30'
                            : 'bg-slate-800/50 text-slate-400 border border-slate-700/50 hover:text-white hover:border-slate-600'
                        }`}
                      >
                        {p}
                      </button>
                    );
                  })}
                  <button
                    onClick={() => fetchCompanies(page + 1)}
                    disabled={page >= totalPages}
                    className="w-9 h-9 rounded-xl bg-slate-800/50 border border-slate-700/50 flex items-center justify-center text-slate-400 hover:text-white hover:border-slate-600 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
