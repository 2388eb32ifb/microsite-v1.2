import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, doc, onSnapshot, setDoc, increment } from 'firebase/firestore';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged, signOut } from 'firebase/auth';
import { Loader2, Send, Copy, ShieldCheck, Zap, FileText, CheckCircle, BarChart3, LogOut, User, Mail, Clock, Plus, Trash2, Database, X, MessageSquare, ExternalLink, Table as TableIcon } from 'lucide-react';
const firebaseConfig = JSON.parse(window.__firebase_config);
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof window.__app_id !== 'undefined' ? window.__app_id : 'sourcewhale-proposal-system';
const GEMINI_MODEL = "gemini-2.5-flash-preview-09-2025";
const GEMINI_API_KEY = process.env.REACT_APP_GEMINI_API_KEY || "";
const SECTION_NAMES = { 'section-hero': 'Hero', 'section-challenges': 'Challenges', 'section-solution': 'Solution', 'section-roi': 'ROI', 'section-pricing': 'Commercials', 'section-map': 'Action Plan' };
const INTEGRATION_MAP = { 'Salesforce': { 'Lead': ['Full Name', 'Company Name', 'Lead Source', 'Email Address'], 'Opportunity': ['Amount', 'Expected Revenue', 'Close Date', 'Next Step'], 'Account': ['Account Name', 'Industry', 'Billing City', 'Annual Revenue'] }, 'HubSpot': { 'Deal': ['Deal Name', 'Amount', 'Pipeline Stage', 'Close Date'], 'Company': ['Domain Name', 'City', 'Industry', 'Total Revenue'], 'Contact': ['First Name', 'Last Name', 'Job Title', 'Last Activity Date'] }, 'Ashby': { 'Candidate': ['Full Name', 'Current Company', 'LinkedIn URL', 'Application Date'], 'Job': ['Job Title', 'Department', 'Hiring Manager', 'Open Date'], 'Interview': ['Interview Stage', 'Score', 'Feedback Summary', 'Date'] }, 'LinkedIn Recruiter': { 'Project': ['Project Name', 'Recruiter Owner', 'Total Candidates', 'Creation Date'], 'Candidate Profile': ['Headline', 'Past Role', 'Skills Summary', 'Connection Degree'] } };
const MOCK_DATA_PREVIEWS = { 'Full Name': 'Strategic Lead Contact', 'Company Name': 'Verified Enterprise Account', 'Amount': '£125,500.00 ARR', 'Next Step': 'Final Executive Review', 'Pipeline Stage': 'Proposal Stage' };
export default function App() {
    const [user, setUser] = useState(null);
    const [isDomainVerified, setIsDomainVerified] = useState(false);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('builder');
    const [userEmail, setUserEmail] = useState('');
    const [authEmailInput, setAuthEmailInput] = useState('');
    const [transcriptRows, setTranscriptRows] = useState([{ text: '' }]);
    const [prospectDomain, setProspectDomain] = useState('');
    const [pricingTableData, setPricingTableData] = useState('');
    const [integrationRows, setIntegrationRows] = useState([{ app: '', object: '', field: '', preview: '' }]);
    const [isGenerating, setIsGenerating] = useState(false);
    const [generatedHtml, setGeneratedHtml] = useState('');
    const [proposalId, setProposalId] = useState(null);
    const [step, setStep] = useState('input');
    const [visitors, setVisitors] = useState([]);
    const [totalViews, setTotalViews] = useState(0);

    useEffect(() => {
        const initAuth = async () => {
            try {
                if (typeof window.__initial_auth_token !== 'undefined' && window.__initial_auth_token) {
                    await signInWithCustomToken(auth, window.__initial_auth_token);
                } else {
                    await signInAnonymously(auth);
                }
            } catch (err) {
                console.error("Auth Init Failed:", err);
            } finally {
                setLoading(false);
            }
        };
        initAuth();
        const unsubscribe = onAuthStateChanged(auth, (u) => setUser(u));
        return () => unsubscribe();
    }, []);

    useEffect(() => {
        if (!user || !isDomainVerified || activeTab !== 'analytics') return;
        const statsRef = doc(db, 'artifacts', appId, 'public', 'data', 'stats', 'views');
        const unsubStats = onSnapshot(statsRef, (snap) => {
            setTotalViews(snap.exists() ? snap.data().total : 0);
        }, (err) => console.error(err));
        const visitorsRef = collection(db, 'artifacts', appId, 'public', 'data', 'visitors');
        const unsubVisitors = onSnapshot(visitorsRef, (snap) => {
            const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            data.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            setVisitors(data);
        }, (err) => console.error(err));
        return () => {
            unsubStats();
            unsubVisitors();
        };
    }, [user, isDomainVerified, activeTab]);

    const groupedAnalytics = useMemo(() => {
        return visitors.reduce((acc, visitor) => {
            const pId = visitor.proposalId || 'unknown-proposal';
            if (!acc[pId]) acc[pId] = { prospect: visitor.prospect || 'Unknown Prospect', visitors: [] };
            acc[pId].visitors.push(visitor);
            return acc;
        }, {});
    }, [visitors]);

    const handleSSO = (e) => {
        e.preventDefault();
        if (authEmailInput.toLowerCase().endsWith('@sourcewhale.com')) {
            setUserEmail(authEmailInput.toLowerCase());
            setIsDomainVerified(true);
        } else {
            alert("Please use a @sourcewhale.com email address");
        }
    };

    const updateIntegrationRow = (index, fieldName, value) => {
        setIntegrationRows(prevRows => {
            const newRows = [...prevRows];
            const updatedRow = { ...newRows[index], [fieldName]: value };
            if (fieldName === 'app') {
                updatedRow.object = '';
                updatedRow.field = '';
                updatedRow.preview = '';
            } else if (fieldName === 'object') {
                updatedRow.field = '';
                updatedRow.preview = '';
            } else if (fieldName === 'field') {
                updatedRow.preview = MOCK_DATA_PREVIEWS[value] || 'Connecting to CRM...';
            }
            newRows[index] = updatedRow;
            return newRows;
        });
    };

    const updateTranscriptRow = (index, text) => {
        setTranscriptRows(prevRows => {
            const newRows = [...prevRows];
            newRows[index] = { text };
            return newRows;
        });
    };

    const generateProposal = async () => {
        if (!transcriptRows[0].text || !prospectDomain) {
            alert("Please provide at least one transcript and a prospect domain.");
            return;
        }
        if (!GEMINI_API_KEY) {
            alert("API Key not configured. Please set REACT_APP_GEMINI_API_KEY in your environment.");
            return;
        }
        setIsGenerating(true);
        const integrationData = integrationRows
            .filter(r => r.app && r.object && r.field)
            .map(r => `${r.app} > ${r.object} > ${r.field}: ${r.preview}`)
            .join('\n');
        const systemPrompt = `You are the SourceWhale Proposal Architect. Output ONLY a complete, valid HTML document following this blueprint. CRITICAL: Include full <!DOCTYPE html> and <html> tags. Include Tailwind CDN and fonts in <head>. LOCKED SECTIONS & IDs (must be exact): 1. Header: sticky nav with "SOURCEWHALE | ${prospectDomain}" 2. section-hero: "${prospectDomain} | Strategic Framework" 3. section-challenges: "${prospectDomain} Challenges" - Extract exactly 3 key challenges from transcript 4. section-solution: "The Solution" - 3 cards addressing those challenges 5. section-roi: "The ROI" - Summary + 3 metric cards 6. section-pricing: "The Commercials" - Table with pricing data: ${pricingTableData} 7. section-map: "Mutual Action Plan" - Table with steps, owners, dates (use TBC for unknowns) 8. section-cta: "Ready to Scale?" - CTA button DESIGN SYSTEM: Use Tailwind CSS. Navy: #0c1427, Indigo: #4f46e5. Font: Inter from Google Fonts. Spacing: py-32, px-8. Do NOT output code blocks or markdown. Output ONLY raw HTML.`;
        try {
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: [{ text: `Prospect: ${prospectDomain}\nPricing: ${pricingTableData}\nIntegrations: ${integrationData}\nTranscripts: ${JSON.stringify(transcriptRows)}` }] }], systemInstruction: { parts: [{ text: systemPrompt }] } })
            });
            const data = await response.json();
            const content = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
            setGeneratedHtml(content.replace(/```html|```/g, '').trim());
            setStep('preview');
        } catch (err) {
            console.error(err);
            alert("Error generating proposal. Check API key and try again.");
        } finally {
            setIsGenerating(false);
        }
    };

    const publishProposal = async () => {
        if (!user) return;
        try {
            const docRef = await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'proposals'), {
                html: generatedHtml,
                prospect: prospectDomain,
                author: userEmail,
                createdAt: new Date().toISOString()
            });
            setProposalId(docRef.id);
            setStep('success');
        } catch (err) {
            console.error(err);
            alert("Error publishing proposal.");
        }
    };

    if (loading) return <div className="min-h-screen flex items-center justify-center bg-[#0c1427]"><Loader2 className="animate-spin text-indigo-500" size={48} /></div>;
    if (!isDomainVerified) {
        return (<div className="min-h-screen flex items-center justify-center bg-[#0c1427] p-6"><div className="bg-white p-12 rounded-[3.5rem] shadow-2xl max-w-md w-full text-center"><div className="bg-indigo-600 w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-xl shadow-indigo-500/20"><ShieldCheck size={40} className="text-white" /></div><h1 className="text-3xl font-black mb-4 uppercase tracking-tighter">SourceWhale SSO</h1><p className="text-slate-400 mb-10 text-sm">Employee verification required.</p><form onSubmit={handleSSO} className="space-y-4"><input type="email" required value={authEmailInput} onChange={e => setAuthEmailInput(e.target.value)} placeholder="name@sourcewhale.com" className="w-full p-5 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-indigo-600 outline-none transition-all shadow-sm" /><button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-black py-5 rounded-2xl shadow-lg transition transform active:scale-95">Authorize</button></form></div></div>);
    }
    return (<div className="min-h-screen bg-slate-50 flex font-sans text-slate-900 text-sm overflow-hidden"><aside className="w-64 bg-[#0c1427] text-white flex flex-col shrink-0"><div className="p-8 flex items-center space-x-3"><div className="bg-indigo-500 p-2 rounded-lg"><Zap size={20} /></div><span className="font-black uppercase tracking-tighter text-xl">WhaleHub</span></div><nav className="flex-1 px-4 space-y-2"><button onClick={() => setActiveTab('builder')} className={`w-full flex items-center space-x-3 p-4 rounded-2xl transition-all ${activeTab === 'builder' ? 'bg-indigo-600 shadow-lg' : 'opacity-40 hover:opacity-100 hover:bg-white/5'}`}><FileText size={20} /><span className="font-bold">Builder</span></button><button onClick={() => setActiveTab('analytics')} className={`w-full flex items-center space-x-3 p-4 rounded-2xl transition-all ${activeTab === 'analytics' ? 'bg-indigo-600 shadow-lg' : 'opacity-40 hover:opacity-100 hover:bg-white/5'}`}><BarChart3 size={20} /><span className="font-bold">Analytics</span></button></nav><div className="p-8 border-t border-white/5 text-[10px] truncate opacity-50 italic">{userEmail}</div></aside><main className="flex-1 overflow-y-auto p-12">{activeTab === 'builder' && (<div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500">{step === 'input' && (<div className="bg-white p-12 rounded-[3.5rem] shadow-sm border border-slate-100 space-y-10"><div className="space-y-2"><label className="text-xs font-black uppercase text-slate-400 tracking-widest px-1">Prospect Domain</label><input value={prospectDomain} onChange={e => setProspectDomain(e.target.value)} placeholder="e.g. faculty.ai" className="w-full p-5 bg-slate-50 border-none rounded-2xl outline-none focus:ring-2 focus:ring-indigo-600 transition-all shadow-sm" /></div><div className="space-y-4"><div className="flex items-center space-x-2 text-indigo-600"><TableIcon size={18} /><label className="text-xs font-black uppercase tracking-widest">Commercial Data (Raw Table)</label></div><textarea value={pricingTableData} onChange={e => setPricingTableData(e.target.value)} rows={6} placeholder="Paste pricing grid values here..." className="w-full p-6 bg-slate-50 border-2 border-dashed border-slate-200 rounded-[2rem] outline-none focus:ring-2 focus:ring-indigo-600 font-mono text-xs shadow-inner" /></div><div className="p-10 bg-slate-50 rounded-[3rem] space-y-8 border border-slate-100"><div className="flex items-center space-x-2 text-indigo-600"><Database size={20} /><h3 className="text-xs font-black uppercase tracking-[0.2em]">Contextual Integrations</h3></div>{integrationRows.map((row, idx) => (<div key={idx} className="grid grid-cols-12 gap-4 items-center"><div className="col-span-2"><select value={row.app} onChange={e => updateIntegrationRow(idx, 'app', e.target.value)} className="w-full p-4 bg-white border border-slate-200 rounded-2xl text-[10px] font-black uppercase outline-none focus:ring-2 focus:ring-indigo-600"><option value="">App</option>{Object.keys(INTEGRATION_MAP).map(a => <option key={a} value={a}>{a}</option>)}</select></div><div className="col-span-2"><select disabled={!row.app} value={row.object} onChange={e => updateIntegrationRow(idx, 'object', e.target.value)} className="w-full p-4 bg-white border border-slate-200 rounded-2xl text-[10px] font-black uppercase outline-none focus:ring-2 focus:ring-indigo-600 disabled:opacity-30"><option value="">Object</option>{row.app && Object.keys(INTEGRATION_MAP[row.app]).map(o => <option key={o} value={o}>{o}</option>)}</select></div><div className="col-span-2"><select disabled={!row.object} value={row.field} onChange={e => updateIntegrationRow(idx, 'field', e.target.value)} className="w-full p-4 bg-white border border-slate-200 rounded-2xl text-[10px] font-black uppercase outline-none focus:ring-2 focus:ring-indigo-600 disabled:opacity-30"><option value="">Field</option>{row.app && row.object && INTEGRATION_MAP[row.app][row.object].map(f => <option key={f} value={f}>{f}</option>)}</select></div><div className="col-span-5"><div className="p-4 bg-white border border-slate-200 rounded-2xl text-[10px] text-slate-500 truncate h-[54px] flex items-center shadow-sm font-medium">{row.preview || <span className="opacity-30 italic font-bold">Awaiting Selection...</span>}</div></div><div className="col-span-1 flex justify-end"><button onClick={() => setIntegrationRows(integrationRows.filter((_,i) => i!==idx))} className="p-3 text-slate-300 hover:text-red-500 transition-colors"><Trash2 size={18} /></button></div></div>))}<button onClick={() => setIntegrationRows([...integrationRows, {app:'',object:'',field:'',preview:''}])} className="text-[10px] font-black uppercase tracking-widest text-indigo-600 flex items-center space-x-2 hover:bg-white p-2 rounded-xl transition-all w-fit"><div className="bg-indigo-600 text-white p-1 rounded-md"><Plus size={14} /></div><span>Connect Integration</span></button></div><div className="p-10 bg-indigo-50/40 rounded-[3rem] space-y-8 border border-indigo-100/50"><div className="flex items-center space-x-2 text-indigo-600"><MessageSquare size={20} /><h3 className="text-xs font-black uppercase tracking-[0.2em]">Meeting Transcripts</h3></div>{transcriptRows.map((row, idx) => (<div key={idx} className="space-y-3"><div className="flex justify-between items-center px-4"><span className="text-[10px] font-black text-indigo-600 uppercase bg-white px-3 py-1 rounded-full shadow-sm">Meeting {idx+1}</span><button onClick={() => setTranscriptRows(transcriptRows.filter((_,i)=>i!==idx))} className="text-indigo-300 hover:text-red-500 transition-colors"><Trash2 size={16} /></button></div><textarea value={row.text} onChange={e => updateTranscriptRow(idx, e.target.value)} rows={4} placeholder="Paste transcript text here..." className="w-full p-6 bg-white rounded-[2rem] border border-indigo-100 outline-none focus:ring-2 focus:ring-indigo-600 text-sm font-mono shadow-sm transition-all" /></div>))}<button onClick={() => setTranscriptRows([...transcriptRows, {text:''}])} className="text-[10px] font-black uppercase tracking-widest text-indigo-600 flex items-center space-x-2 hover:bg-white p-2 rounded-xl transition-all w-fit"><div className="bg-indigo-600 text-white p-1 rounded-md"><Plus size={14} /></div><span>Add Transcript</span></button></div><button onClick={generateProposal} disabled={isGenerating} className="w-full bg-indigo-600 text-white font-black py-7 rounded-[2.5rem] shadow-2xl shadow-indigo-600/30 hover:bg-indigo-700 transition-all flex items-center justify-center space-x-4 disabled:opacity-50">{isGenerating ? <><Loader2 className="animate-spin" size={24} /><span>Architecting Proposal...</span></> : <><Send size={24} /><span>Generate Standard Framework</span></>}</button></div>)}{step === 'preview' && (<div className="space-y-6 animate-in fade-in duration-300"><div className="flex justify-between items-center bg-white p-6 rounded-3xl border border-slate-100 shadow-sm"><button onClick={() => setStep('input')} className="font-black text-[10px] uppercase text-slate-400 hover:text-indigo-600 transition-colors">← Adjust Inputs</button><button onClick={publishProposal} className="bg-indigo-600 text-white px-12 py-5 rounded-[2rem] font-black shadow-xl hover:scale-[1.02] transition-all">Publish & Generate Link</button></div><div className="bg-white rounded-[3rem] shadow-2xl h-[800px] overflow-hidden border border-slate-200"><iframe srcDoc={generatedHtml} className="w-full h-full" title="Proposal Preview" /></div></div>)}{step === 'success' && (<div className="bg-white p-20 rounded-[4rem] text-center border border-indigo-100 animate-in zoom-in duration-300 shadow-2xl"><div className="bg-green-100 w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-10 text-green-500 shadow-inner"><CheckCircle size={48} /></div><h1 className="text-5xl font-black mb-4 uppercase tracking-tighter text-slate-900">Proposal Live!</h1><p className="text-slate-400 mb-12 max-w-sm mx-auto font-medium italic">The framework blueprint is active. Tracking enabled.</p><div className="bg-slate-50 p-10 rounded-[2.5rem] border-2 border-dashed border-indigo-200 mb-12 flex justify-between items-center group transition-all hover:border-indigo-400"><code className="text-indigo-600 font-mono text-sm break-all font-bold">{window.location.origin}/proposal.html?id={proposalId}</code><button onClick={() => {navigator.clipboard.writeText(`${window.location.origin}/proposal.html?id=${proposalId}`); alert('Copied!');}} className="p-5 bg-white rounded-2xl shadow-sm text-indigo-600 ml-6 hover:bg-indigo-600 hover:text-white transition-all transform hover:rotate-3"><Copy size={24}/></button></div><button onClick={() => window.open(`${window.location.origin}/proposal.html?id=${proposalId}`, '_blank')} className="font-black text-xs uppercase tracking-widest text-indigo-600 flex items-center space-x-3 mx-auto hover:scale-105 transition-transform"><span>Launch Live Site</span><ExternalLink size={16}/></button></div>)} </div>)}</main></div>);