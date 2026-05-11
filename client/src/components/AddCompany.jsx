import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import {
  Building2, MapPin, Globe2, Mail, Phone, User, Shield, Tag,
  ChevronDown, X, Plus, Check, AlertCircle, Loader2, Sparkles,
  Briefcase, Link2, FileText, Award, StickyNote, ArrowLeft
} from 'lucide-react';

const SUPPLY_CHAIN_ROLES = [
  'Manufacturer', 'Supplier', 'Distributor', 'Logistics', 'Retailer'
];

/* ═══════════════════════════════════════════════
   TAG INPUT COMPONENT
   ═══════════════════════════════════════════════ */
function TagInput({ tags, setTags, suggestions = [], placeholder = 'Add tag...', maxTags = 20 }) {
  const [input, setInput] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef(null);

  const filtered = suggestions
    .filter(s => s.toLowerCase().includes(input.toLowerCase()) && !tags.includes(s))
    .slice(0, 8);

  const addTag = (tag) => {
    const clean = tag.trim().toLowerCase();
    if (clean && !tags.includes(clean) && tags.length < maxTags) {
      setTags([...tags, clean]);
      setInput('');
    }
  };

  const removeTag = (idx) => setTags(tags.filter((_, i) => i !== idx));

  return (
    <div className="relative">
      <div className="flex flex-wrap gap-1.5 p-3 bg-slate-800/50 rounded-xl border border-slate-700/50 focus-within:border-violet-500/50 focus-within:ring-1 focus-within:ring-violet-500/20 transition-all min-h-[48px]">
        {tags.map((tag, i) => (
          <span key={i} className="inline-flex items-center gap-1 bg-violet-500/20 text-violet-300 text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg border border-violet-500/30">
            {tag}
            <button onClick={() => removeTag(i)} className="hover:text-white transition-colors ml-0.5"><X size={10} /></button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => { setInput(e.target.value); setShowSuggestions(true); }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(input); }
            if (e.key === 'Backspace' && !input && tags.length > 0) removeTag(tags.length - 1);
          }}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
          placeholder={tags.length === 0 ? placeholder : ''}
          className="flex-1 min-w-[120px] bg-transparent text-white text-sm outline-none placeholder:text-slate-500"
        />
      </div>
      <AnimatePresence>
        {showSuggestions && filtered.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="absolute z-50 w-full mt-1 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl max-h-48 overflow-y-auto"
          >
            {filtered.map((s, i) => (
              <button key={i} onMouseDown={() => addTag(s)} className="w-full text-left px-4 py-2.5 text-sm text-slate-300 hover:bg-violet-500/20 hover:text-white transition-colors first:rounded-t-xl last:rounded-b-xl">
                {s}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   DROPDOWN COMPONENT
   ═══════════════════════════════════════════════ */
function Dropdown({ value, onChange, options, placeholder, icon: Icon }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = options.filter(o => o.toLowerCase().includes(search.toLowerCase()));

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 p-3 bg-slate-800/50 rounded-xl border border-slate-700/50 hover:border-slate-600 text-left transition-all"
      >
        {Icon && <Icon size={16} className="text-slate-500 shrink-0" />}
        <span className={`flex-1 text-sm ${value ? 'text-white' : 'text-slate-500'}`}>{value || placeholder}</span>
        <ChevronDown size={14} className={`text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="absolute z-50 w-full mt-1 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl max-h-60 overflow-hidden"
          >
            <div className="p-2 border-b border-slate-700/50">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search..."
                className="w-full bg-slate-700/50 text-white text-sm px-3 py-2 rounded-lg outline-none placeholder:text-slate-500"
                autoFocus
              />
            </div>
            <div className="max-h-48 overflow-y-auto">
              {filtered.map((opt, i) => (
                <button
                  key={i}
                  onClick={() => { onChange(opt); setOpen(false); setSearch(''); }}
                  className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                    opt === value ? 'bg-violet-500/20 text-violet-300' : 'text-slate-300 hover:bg-slate-700/50 hover:text-white'
                  }`}
                >
                  {opt}
                </button>
              ))}
              {filtered.length === 0 && search.trim() !== '' && (
                <button
                  onClick={() => { onChange(search.trim()); setOpen(false); setSearch(''); }}
                  className="w-full text-left px-4 py-3 text-sm text-violet-400 font-bold hover:bg-violet-500/10 transition-colors border-t border-slate-700/50"
                >
                  <span className="text-slate-400 font-normal mr-2">Use custom:</span>
                  "{search.trim()}"
                </button>
              )}
              {filtered.length === 0 && search.trim() === '' && (
                <div className="px-4 py-3 text-sm text-slate-500 italic">No matches found</div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   TOAST NOTIFICATION
   ═══════════════════════════════════════════════ */
function Toast({ message, type, onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 5000);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <motion.div
      initial={{ opacity: 0, y: -20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -20, scale: 0.95 }}
      className={`fixed top-24 right-6 z-[9999] flex items-start gap-3 px-5 py-4 rounded-2xl shadow-2xl border backdrop-blur-xl max-w-md w-full ${
        type === 'success'
          ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-300'
          : 'bg-red-500/20 border-red-500/30 text-red-300'
      }`}
    >
      <div className="mt-0.5 shrink-0">
        {type === 'success' ? <Check size={18} /> : <AlertCircle size={18} />}
      </div>
      <span className="text-sm font-bold flex-1 leading-relaxed">{message}</span>
      <button onClick={onClose} className="ml-2 mt-0.5 opacity-60 hover:opacity-100 transition-opacity shrink-0"><X size={14} /></button>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════
   FIELD WRAPPER
   ═══════════════════════════════════════════════ */
const Field = ({ label, required, icon: Icon, children, className = '' }) => (
  <div className={className}>
    <label className="flex items-center gap-2 text-[11px] font-black uppercase tracking-wider text-slate-400 mb-2">
      {Icon && <Icon size={12} />}
      {label}
      {required && <span className="text-violet-400">*</span>}
    </label>
    {children}
  </div>
);

/* ═══════════════════════════════════════════════
   MAIN ADD COMPANY COMPONENT
   ═══════════════════════════════════════════════ */
export default function AddCompany({ onBack }) {
  // ─── Form State ───
  const [form, setForm] = useState({
    companyName: '', description: '', industry: '', standardizedIndustry: '',
    country: '', city: '', latitude: '', longitude: '',
    email: '', contactPerson: '', supplyChainRole: '', confidence: '',
    website: '', phone: '', state: '', postalCode: '', linkedin: '',
    secondaryIndustries: '', certifications: '', notes: ''
  });
  const [bomFilters, setBomFilters] = useState([]);
  const [additionalBom, setAdditionalBom] = useState([]);

  // ─── Metadata ───
  const [industries, setIndustries] = useState([]);
  const [countries, setCountries] = useState([]);
  const [bomSuggestions, setBomSuggestions] = useState([]);
  const [duplicateStatus, setDuplicateStatus] = useState(null); // null | 'checking' | 'clear' | 'duplicate'

  // ─── UI State ───
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const [showOptional, setShowOptional] = useState(false);
  const debounceRef = useRef(null);

  // ─── Load Industries & Countries on Mount ───
  useEffect(() => {
    axios.get('/api/register/industries').then(r => setIndustries(r.data.industries || [])).catch(() => {});
    axios.get('/api/register/countries').then(r => setCountries(r.data.countries || [])).catch(() => {});
  }, []);

  // ─── Auto-load BOM suggestions when industry changes ───
  useEffect(() => {
    if (form.standardizedIndustry) {
      axios.get('/api/register/bom-suggestions', { params: { industry: form.standardizedIndustry } })
        .then(r => setBomSuggestions(r.data.suggestions || []))
        .catch(() => setBomSuggestions([]));
    }
  }, [form.standardizedIndustry]);

  // ─── Live Duplicate Check ───
  const checkDuplicate = useCallback((name) => {
    if (!name || name.trim().length < 2) { setDuplicateStatus(null); return; }
    setDuplicateStatus('checking');
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      axios.get('/api/register/check-duplicate', { params: { name: name.trim() } })
        .then(r => setDuplicateStatus(r.data.exists ? 'duplicate' : 'clear'))
        .catch(() => setDuplicateStatus(null));
    }, 500);
  }, []);

  const updateField = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
    if (field === 'companyName') checkDuplicate(value);
  };

  // ─── Submit ───
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (duplicateStatus === 'duplicate') {
      setToast({ message: 'This company already exists in the database.', type: 'error' });
      return;
    }

    setLoading(true);
    try {
      const payload = { ...form, bomFilters, additionalBom };
      const res = await axios.post('/api/register', payload);
      setToast({ message: res.data.message, type: 'success' });

      // Reset form
      setForm({
        companyName: '', description: '', industry: '', standardizedIndustry: '',
        country: '', city: '', latitude: '', longitude: '',
        email: '', contactPerson: '', supplyChainRole: '', confidence: '',
        website: '', phone: '', state: '', postalCode: '', linkedin: '',
        secondaryIndustries: '', certifications: '', notes: ''
      });
      setBomFilters([]);
      setAdditionalBom([]);
      setDuplicateStatus(null);
    } catch (err) {
      setToast({ message: err.response?.data?.error || 'Registration failed. Please try again.', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const inputClass = "w-full p-3 bg-slate-800/50 rounded-xl border border-slate-700/50 text-white text-sm outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/20 transition-all placeholder:text-slate-500";

  return (
    <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 overflow-y-auto">
      <AnimatePresence>{toast && <Toast {...toast} onClose={() => setToast(null)} />}</AnimatePresence>

      <div className="max-w-4xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="flex items-center gap-4 mb-10">
          <button onClick={onBack} className="w-10 h-10 rounded-xl bg-slate-800/80 border border-slate-700/50 flex items-center justify-center text-slate-400 hover:text-white hover:border-slate-600 transition-all">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Register Company</h1>
            <p className="text-sm text-slate-500 mt-1">Add a new entity to the FlowScope intelligence network</p>
          </div>
          <div className="ml-auto flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">Live Pipeline</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* ═══ SECTION: IDENTITY ═══ */}
          <div className="bg-slate-900/50 rounded-2xl border border-slate-800/50 p-6 space-y-5">
            <div className="flex items-center gap-2 mb-2">
              <Building2 size={16} className="text-violet-400" />
              <span className="text-xs font-black uppercase tracking-wider text-violet-400">Company Identity</span>
            </div>

            <Field label="Company Name" required icon={Building2}>
              <div className="relative">
                <input value={form.companyName} onChange={(e) => updateField('companyName', e.target.value)} placeholder="e.g. Mahindra & Mahindra" className={inputClass} />
                {duplicateStatus && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    {duplicateStatus === 'checking' && <Loader2 size={14} className="text-slate-500 animate-spin" />}
                    {duplicateStatus === 'clear' && <Check size={14} className="text-emerald-400" />}
                    {duplicateStatus === 'duplicate' && <AlertCircle size={14} className="text-red-400" />}
                  </div>
                )}
              </div>
              {duplicateStatus === 'duplicate' && (
                <p className="text-[11px] text-red-400 mt-1 font-bold">⚠ This company already exists in the database</p>
              )}
            </Field>

            <Field label="Description" required icon={FileText}>
              <textarea value={form.description} onChange={(e) => updateField('description', e.target.value)} placeholder="Brief description of the company's operations..." rows={3} className={`${inputClass} resize-none`} />
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Industry" required icon={Briefcase}>
                <input value={form.industry} onChange={(e) => updateField('industry', e.target.value)} placeholder="e.g. automotive industry" className={inputClass} />
              </Field>
              <Field label="Standardized Industry" required icon={Tag}>
                <Dropdown value={form.standardizedIndustry} onChange={(v) => updateField('standardizedIndustry', v)} options={industries} placeholder="Select industry..." icon={Tag} />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Supply Chain Role" required icon={Briefcase}>
                <Dropdown value={form.supplyChainRole} onChange={(v) => updateField('supplyChainRole', v)} options={SUPPLY_CHAIN_ROLES} placeholder="Select role..." icon={Shield} />
              </Field>
              <Field label="Confidence Score (0-10)" required icon={Shield}>
                <input type="number" min="0" max="10" value={form.confidence} onChange={(e) => updateField('confidence', e.target.value)} placeholder="0-10" className={inputClass} />
              </Field>
            </div>
          </div>

          {/* ═══ SECTION: LOCATION ═══ */}
          <div className="bg-slate-900/50 rounded-2xl border border-slate-800/50 p-6 space-y-5">
            <div className="flex items-center gap-2 mb-2">
              <MapPin size={16} className="text-cyan-400" />
              <span className="text-xs font-black uppercase tracking-wider text-cyan-400">Location & Coordinates</span>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Country" required icon={Globe2}>
                <Dropdown value={form.country} onChange={(v) => updateField('country', v)} options={countries} placeholder="Select country..." icon={Globe2} />
              </Field>
              <Field label="City" required icon={MapPin}>
                <input value={form.city} onChange={(e) => updateField('city', e.target.value)} placeholder="e.g. Mumbai" className={inputClass} />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Latitude (-90 to 90)" required icon={MapPin}>
                <input type="number" step="any" min="-90" max="90" value={form.latitude} onChange={(e) => updateField('latitude', e.target.value)} placeholder="e.g. 19.076" className={inputClass} />
              </Field>
              <Field label="Longitude (-180 to 180)" required icon={MapPin}>
                <input type="number" step="any" min="-180" max="180" value={form.longitude} onChange={(e) => updateField('longitude', e.target.value)} placeholder="e.g. 72.877" className={inputClass} />
              </Field>
            </div>
          </div>

          {/* ═══ SECTION: BOM FILTERS ═══ */}
          <div className="bg-slate-900/50 rounded-2xl border border-slate-800/50 p-6 space-y-5">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles size={16} className="text-amber-400" />
              <span className="text-xs font-black uppercase tracking-wider text-amber-400">BOM Filters & Components</span>
            </div>

            <Field label="BOM Filters" required icon={Tag}>
              <TagInput tags={bomFilters} setTags={setBomFilters} suggestions={bomSuggestions} placeholder="Type and press Enter..." />
              {bomSuggestions.length > 0 && (
                <p className="text-[10px] text-slate-500 mt-1.5 italic">
                  <Sparkles size={10} className="inline mr-1" />
                  Auto-suggestions based on {form.standardizedIndustry}
                </p>
              )}
            </Field>
          </div>

          {/* ═══ SECTION: CONTACT ═══ */}
          <div className="bg-slate-900/50 rounded-2xl border border-slate-800/50 p-6 space-y-5">
            <div className="flex items-center gap-2 mb-2">
              <User size={16} className="text-emerald-400" />
              <span className="text-xs font-black uppercase tracking-wider text-emerald-400">Contact Information</span>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Contact Person" required icon={User}>
                <input value={form.contactPerson} onChange={(e) => updateField('contactPerson', e.target.value)} placeholder="Full name" className={inputClass} />
              </Field>
              <Field label="Email" required icon={Mail}>
                <input type="email" value={form.email} onChange={(e) => updateField('email', e.target.value)} placeholder="company@example.com" className={inputClass} />
              </Field>
            </div>
          </div>

          {/* ═══ SECTION: OPTIONAL ═══ */}
          <div className="bg-slate-900/50 rounded-2xl border border-slate-800/50 overflow-hidden">
            <button type="button" onClick={() => setShowOptional(!showOptional)} className="w-full flex items-center justify-between p-6 hover:bg-slate-800/30 transition-colors">
              <div className="flex items-center gap-2">
                <StickyNote size={16} className="text-slate-500" />
                <span className="text-xs font-black uppercase tracking-wider text-slate-500">Optional Details</span>
              </div>
              <ChevronDown size={14} className={`text-slate-500 transition-transform ${showOptional ? 'rotate-180' : ''}`} />
            </button>
            <AnimatePresence>
              {showOptional && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="p-6 pt-0 space-y-5">
                    <div className="grid grid-cols-2 gap-4">
                      <Field label="Website" icon={Link2}>
                        <input value={form.website} onChange={(e) => updateField('website', e.target.value)} placeholder="https://..." className={inputClass} />
                      </Field>
                      <Field label="Phone Number" icon={Phone}>
                        <input value={form.phone} onChange={(e) => updateField('phone', e.target.value)} placeholder="+91..." className={inputClass} />
                      </Field>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <Field label="State / Province" icon={MapPin}>
                        <input value={form.state} onChange={(e) => updateField('state', e.target.value)} placeholder="e.g. Maharashtra" className={inputClass} />
                      </Field>
                      <Field label="Postal Code" icon={MapPin}>
                        <input value={form.postalCode} onChange={(e) => updateField('postalCode', e.target.value)} placeholder="e.g. 400001" className={inputClass} />
                      </Field>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <Field label="LinkedIn" icon={Link2}>
                        <input value={form.linkedin} onChange={(e) => updateField('linkedin', e.target.value)} placeholder="LinkedIn URL" className={inputClass} />
                      </Field>
                      <Field label="Secondary Industries" icon={Briefcase}>
                        <input value={form.secondaryIndustries} onChange={(e) => updateField('secondaryIndustries', e.target.value)} placeholder="e.g. defense, EV" className={inputClass} />
                      </Field>
                    </div>
                    <Field label="Additional Components / BOM">
                      <TagInput tags={additionalBom} setTags={setAdditionalBom} suggestions={[]} placeholder="Additional components..." />
                    </Field>
                    <div className="grid grid-cols-2 gap-4">
                      <Field label="Certifications" icon={Award}>
                        <input value={form.certifications} onChange={(e) => updateField('certifications', e.target.value)} placeholder="e.g. ISO 9001, IATF 16949" className={inputClass} />
                      </Field>
                      <Field label="Notes" icon={StickyNote}>
                        <input value={form.notes} onChange={(e) => updateField('notes', e.target.value)} placeholder="Any additional notes..." className={inputClass} />
                      </Field>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* ═══ SUBMIT ═══ */}
          <button
            type="submit"
            disabled={loading || duplicateStatus === 'duplicate'}
            className="w-full py-4 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:from-slate-700 disabled:to-slate-700 text-white rounded-2xl font-black text-sm uppercase tracking-wider transition-all shadow-xl shadow-violet-500/20 disabled:shadow-none flex items-center justify-center gap-3"
          >
            {loading ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                Registering Entity...
              </>
            ) : (
              <>
                <Plus size={18} />
                Register Company
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
