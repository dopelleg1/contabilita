import React, { useState, useEffect, useRef } from 'react';
import { Account, Transaction } from '../types';
import { 
  Sparkles, 
  Brain, 
  TrendingUp, 
  Home, 
  Briefcase, 
  BadgeAlert, 
  Loader2, 
  RefreshCw, 
  CheckCircle, 
  HelpCircle,
  PiggyBank,
  Send,
  MessageSquare,
  Trash2,
  Bot,
  User,
  ArrowRight,
  ShieldCheck,
  Percent
} from 'lucide-react';

interface AiAdvisorTabProps {
  accounts: Account[];
  transactions: Transaction[];
  taxpayerName: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: string;
}

export default function AiAdvisorTab({ accounts, transactions, taxpayerName }: AiAdvisorTabProps) {
  // Sub-tab selection: 'report' is the Daily Strategy Report, 'chat' is the Interactive Chat
  const [activeSubTab, setActiveSubTab] = useState<'report' | 'chat'>('chat');
  
  // Daily Strategy state
  const [adviceText, setAdviceText] = useState<string>(() => {
    return localStorage.getItem('contosmart_ai_advice') || '';
  });
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Interactive Live Chat State
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(() => {
    const saved = localStorage.getItem('contosmart_ai_chat_history');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return [];
      }
    }
    return [];
  });
  const [inputMessage, setInputMessage] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Initial welcome message from the coach if history empty
  useEffect(() => {
    if (chatMessages.length === 0) {
      const initialWelcome: ChatMessage = {
        id: 'welcome',
        role: 'model',
        text: `### 🎯 Ciao Domenico, benvenuto nel tuo Spazio di Consulenza Personale!

Sono il tuo **Advisor Finanziario AI**. Ho analizzato il tuo profilo: hai **66 anni**, un contratto d'insegnamento che scade il **30 Giugno** e andrai felicemente in pensione a **Settembre 2027**. 

Sono qui per supportarti attivamente a:
- **Dividere le spese** fisse necessarie da quelle utili, lavorative (P.IVA) ed extra/benessere.
- **Ottimizzare le spese extra** per salvaguardare il tuo tenore di vita.
- **Pianificare i debiti aperti** (Compass, Mutuo Lavoro, carta AMEX con saldi negativi).
- **Abbassare legalmente l'ISEE** per proteggere la tua NASPI estiva o agevolarti fiscalmente.

*Come posso esserti di supporto oggi? Scegli un argomento qui sotto o digitami la tua volontà.*`,
        timestamp: new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
      };
      setChatMessages([initialWelcome]);
    }
  }, [chatMessages]);

  // Handle chat scrolling to bottom when new messages arrive
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, chatLoading]);

  // Auto-save advice to avoid losing it on tab switches
  useEffect(() => {
    if (adviceText) {
      localStorage.setItem('contosmart_ai_advice', adviceText);
    }
  }, [adviceText]);

  // Auto-save chat history
  useEffect(() => {
    if (chatMessages.length > 0) {
      localStorage.setItem('contosmart_ai_chat_history', JSON.stringify(chatMessages));
    }
  }, [chatMessages]);

  // Compute stats for visualization inside the Coach Card
  const totalBalance = accounts.reduce((sum, acc) => sum + acc.balance, 0);
  const personalTxs = transactions.filter(t => t.scope === 'personal');
  const professionalTxs = transactions.filter(t => t.scope === 'professional');

  const personalExpenses = personalTxs.filter(t => t.type === 'expense').reduce((sum, t) => sum + Math.abs(t.amount), 0);
  const personalIncomes = personalTxs.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
  const personalNet = personalIncomes - personalExpenses;

  const professionalExpenses = professionalTxs.filter(t => t.type === 'expense').reduce((sum, t) => sum + Math.abs(t.amount), 0);
  const professionalIncomes = professionalTxs.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
  const professionalNet = professionalIncomes - professionalExpenses;

  const unverifiedCount = transactions.filter(t => !t.isVerified).length;
  const verifiedCount = transactions.filter(t => t.isVerified).length;
  const verifyRate = transactions.length > 0 ? Math.round((verifiedCount / transactions.length) * 100) : 100;

  // Active Outstanding Debts List
  const activeDebts = accounts.filter(acc => acc.balance < 0);
  const totalOutstandingDebts = Math.abs(activeDebts.reduce((sum, acc) => sum + acc.balance, 0));

  const handleGenerateStrategy = async () => {
    setLoading(true);
    setErrorMsg('');
    setAdviceText('');
    
    const steps = [
      "Aggregazione dati conto correnti ditta e famigliari...",
      "Suddivisione flussi di cassa (Scope: Personal vs Professional)...",
      "Calcolo del tasso di quadratura per le verifiche estratti conti...",
      "Esecuzione motore AI Gemini 3.5 per l'elaborazione del report strategico..."
    ];

    let currentStep = 0;
    setLoadingStep(steps[0]);

    const interval = setInterval(() => {
      currentStep++;
      if (currentStep < steps.length) {
        setLoadingStep(steps[currentStep]);
      }
    }, 1200);

    try {
      const response = await fetch('/api/daily-strategy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          transactions,
          accounts,
          taxpayerName
        }),
      });

      if (!response.ok) {
        throw new Error("Impossibile connettersi al servizio di intelligenza artificiale.");
      }

      const data = await response.json();
      
      if (data.fallback) {
        setAdviceText(`### 📊 1. ANDAMENTO DEL GIORNO & SALUTE FINANZIARIA (Festa o Lavoro)
La liquidità complessiva è pari a **€ ${totalBalance.toLocaleString('it-IT', { minimumFractionDigits: 2 })}**. Il bilancio netto indica:
- **Flusso Familiare**: € ${personalNet >= 0 ? '+' : ''}${personalNet.toLocaleString('it-IT', { minimumFractionDigits: 2 })}
- **Flusso Professionale (P.IVA)**: € ${professionalNet >= 0 ? '+' : ''}${professionalNet.toLocaleString('it-IT', { minimumFractionDigits: 2 })}

### 🏡 2. STRATEGIA GESTIONE FAMILIARE ('personal')
- **Spese fisse sotto controllo**: Le spese principali sono focalizzate su categorie necessarie. Consigliamo di mantenere la spesa del tempo libero al di sotto del 20% delle entrate correnti per rafforzare i risparmi.
- **Risparmio Attivo**: Dedica una piccola quota quotidiana automatica al fondo di emergenza personale.

### 💼 3. STRATEGIA PARTITA IVA & FISCO ('professional')
- **Pianificazione fiscale**: Ti ricordiamo di accantonare circa il **25-30%** dei tuoi incassi ditta (€ ${professionalIncomes.toLocaleString('it-IT', { minimumFractionDigits: 2 })}) su un conto separato per far fronte alle imposte e all'INPS Gestione Separata durante la scadenza di acconto e saldo.
- **Ottimizzazione delle Risorse**: Valuta l'acquisto di software e strumenti di marketing deducibili nei mesi strategici per massimizzare la competitività lavorativa.

### 🔍 4. QUADRATURA DEI CONTI (Spunta di Verifica)
Attualmente ci sono **${unverifiedCount} movimenti da verificare**. È fondamentale aprire l'estratto conto e cliccare sul tasto "Spunta" della transazione per contrassegnarla ufficialmente come riconciliata per evitare sanzioni o ammanchi.`);
      } else {
        setAdviceText(data.text);
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg("Si è verificato un errore nel completare l'analisi AI. Controllare i log di sistema o verificare la connessione.");
    } finally {
      clearInterval(interval);
      setLoading(false);
      setLoadingStep('');
    }
  };

  // Handle interactive chat submit
  const handleSendChatMessage = async (msgToSend?: string) => {
    const messageText = msgToSend || inputMessage;
    if (!messageText.trim() || chatLoading) return;

    // Create user message
    const userMsg: ChatMessage = {
      id: `usr-${Date.now()}`,
      role: 'user',
      text: messageText,
      timestamp: new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
    };

    setChatMessages(prev => [...prev, userMsg]);
    setInputMessage('');
    setChatLoading(true);

    // Save previous history to send to Gemini
    const mappedHistory = chatMessages.map(m => ({
      role: m.role,
      text: m.text
    }));

    try {
      const response = await fetch('/api/ai-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: messageText,
          history: mappedHistory,
          transactions,
          accounts
        })
      });

      if (!response.ok) {
        throw new Error("Errore di connessione col motore di intelligenza artificiale.");
      }

      const data = await response.json();

      const coachMsg: ChatMessage = {
        id: `coach-${Date.now()}`,
        role: 'model',
        text: data.text,
        timestamp: new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
      };

      setChatMessages(prev => [...prev, coachMsg]);
    } catch (err) {
      console.error(err);
      const errorMsgObj: ChatMessage = {
        id: `err-${Date.now()}`,
        role: 'model',
        text: `⚠️ *Si è verificato un errore di comunicazione con il consulente.\nPer favore ricalcola la connessione o inserisci la tua chiave API nei segreti.*`,
        timestamp: new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
      };
      setChatMessages(prev => [...prev, errorMsgObj]);
    } finally {
      setChatLoading(false);
    }
  };

  const clearChatHistory = () => {
    if (confirm("Sei sicuro di voler ripulire lo storico della chat?")) {
      localStorage.removeItem('contosmart_ai_chat_history');
      setChatMessages([]);
    }
  };

  // Helper custom parser to format Gemini text nicely with inline spans & lists
  const parseMarkdownToReact = (text: string) => {
    if (!text) return null;
    const lines = text.split('\n');
    return lines.map((line, idx) => {
      let cleanLine = line.trim();
      if (!cleanLine) return <div key={idx} className="h-2" />;

      // Match ### titles
      if (cleanLine.startsWith('###')) {
        return (
          <h4 key={idx} className="text-[12.5px] font-bold text-indigo-950 border-b border-slate-100 pb-1.5 mt-5 mb-2.5 flex items-center gap-1.5 font-sans">
            <span className="w-1.5 h-3 bg-indigo-600 rounded-xs inline-block"></span>
            {cleanLine.replace('###', '').trim()}
          </h4>
        );
      }

      // Match lists (-)
      if (cleanLine.startsWith('-') || cleanLine.startsWith('*')) {
        const content = cleanLine.substring(1).trim();
        return (
          <li key={idx} className="ml-4 pl-0.5 list-disc text-slate-705 text-xs leading-relaxed mb-1.5 font-sans">
            {renderInlineMarkdown(content)}
          </li>
        );
      }

      return (
        <p key={idx} className="text-slate-705 text-xs leading-relaxed mb-2.5 font-sans">
          {renderInlineMarkdown(cleanLine)}
        </p>
      );
    });
  };

  // Render inline formatting (**bold**)
  const renderInlineMarkdown = (str: string) => {
    const parts = str.split(/(\*\*.*?\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i} className="font-extrabold text-slate-900">{part.slice(2, -2)}</strong>;
      }
      return part;
    });
  };

  const chatSuggestions = [
    {
      title: "📊 Dividimi le Spese",
      prompt: "Analizza le mie spese dividendo tra necessarie, utili, lavorative (P.IVA) ed extra/benessere.",
      desc: "Vedi quanto spendi nelle 4 categorie"
    },
    {
      title: "🌾 NASPI e ISEE Basso",
      prompt: "Come posso gestire le mie passività e conti per tenere basso l'ISEE a tutela della NASPI post 30 giugno?",
      desc: "Regole utili per massimizzare l'indennità"
    },
    {
      title: "👵 Pensionamento 2027",
      prompt: "Ho 66 anni e andrò in pensione a Settembre 2027. Come posso regolare le extra per risparmiare e tutelare il tenore di vita?",
      desc: "Modelli di pianificazione prima del traguardo"
    },
    {
      title: "💳 Gestione Debiti Aperti",
      prompt: "I miei debiti aperti (es. Compass, AMEX) impattano l'andamento. Consigliami un modello per gestirli al meglio.",
      desc: "Strategia di rientro e pianificazione"
    }
  ];

  return (
    <div className="space-y-6 animate-fade-in" id="ai-advisor-tab">
      
      {/* Header section with dark slate gradient */}
      <div className="bg-gradient-to-r from-slate-950 via-indigo-950 to-slate-900 border border-slate-800 rounded-2xl p-6 text-white shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 translate-x-12 -translate-y-12 bg-indigo-500 opacity-10 w-96 h-96 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute left-1/3 bottom-0 translate-y-24 bg-purple-500 opacity-10 w-80 h-80 rounded-full blur-3xl pointer-events-none" />

        <div className="max-w-4xl space-y-4 relative z-10">
          <div className="inline-flex items-center gap-1.5 bg-indigo-500/15 border border-indigo-500/30 rounded-lg px-2.5 py-1">
            <Sparkles className="w-3.5 h-3.5 text-indigo-400 animate-pulse" />
            <span className="text-[9px] font-bold text-indigo-300 uppercase tracking-wider leading-none">AI Advisor Finanziario</span>
          </div>

          <h2 className="text-xl font-black font-sans tracking-tight">
            Consulting Strategico Domenico Pellegrino
          </h2>

          <p className="text-slate-350 text-xs leading-relaxed max-w-3xl">
            Il motore intelligente integrato analizza i tuoi flussi di cassa dividendo l'andamento del tuo <strong className="text-white">stipendio</strong> scolastico e delle <strong className="text-white">entrate professionali P.IVA</strong>, suggerisce piani di ammortamento per i <strong className="text-white">debiti aperti</strong> e offre consigli strategici per l'abbattimento regolare dell'ISEE, preparandoti al pensionamento di Settembre 2027.
          </p>

          {/* Sub-Tabs Switch Navigation */}
          <div className="flex gap-2 pt-2 border-t border-slate-800">
            <button
              onClick={() => setActiveSubTab('chat')}
              className={`px-4 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-2 cursor-pointer ${
                activeSubTab === 'chat' 
                  ? 'bg-indigo-600 text-white shadow' 
                  : 'bg-slate-900/40 text-slate-300 hover:text-white border border-slate-800'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              Chat Interattiva & Consigli Personali
            </button>
            <button
              onClick={() => setActiveSubTab('report')}
              className={`px-4 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-2 cursor-pointer ${
                activeSubTab === 'report' 
                  ? 'bg-indigo-600 text-white shadow' 
                  : 'bg-slate-900/40 text-slate-300 hover:text-white border border-slate-800'
              }`}
            >
              <Brain className="w-3.5 h-3.5" />
              Il Mio Report Giornaliero Completo
            </button>
          </div>
        </div>
      </div>

      {/* Financial Snapshot Widgets explicitly showing Debts and split-flows */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        
        {/* Family budget flows */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4.5 shadow-sm space-y-2">
          <div className="flex justify-between items-center text-slate-400">
            <div className="flex items-center gap-1.5">
              <Home className="w-3.5 h-3.5 text-sky-600" />
              <span className="text-[9px] font-bold uppercase tracking-wider">Cassa Personale</span>
            </div>
            <span className="text-[9px] font-mono text-slate-450">{personalTxs.length} Mov</span>
          </div>
          <div>
            <span className="block text-[10px] text-slate-400">Netto Familiare Corrente</span>
            <span className={`text-base font-black font-mono ${personalNet >= 0 ? "text-emerald-700" : "text-rose-600"}`}>
              {personalNet >= 0 ? '+' : ''}€ {personalNet.toLocaleString('it-IT', { minimumFractionDigits: 2 })}
            </span>
          </div>
          <div className="text-[9px] text-slate-500 border-t border-slate-50 pt-1.5 flex justify-between">
            <span>Stipendi/Entrate: <strong>€{personalIncomes.toLocaleString('it-IT')}</strong></span>
            <span>Uscite: <strong>€{personalExpenses.toLocaleString('it-IT')}</strong></span>
          </div>
        </div>

        {/* Business ditta individual flows */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4.5 shadow-sm space-y-2">
          <div className="flex justify-between items-center text-slate-400">
            <div className="flex items-center gap-1.5">
              <Briefcase className="w-3.5 h-3.5 text-amber-600" />
              <span className="text-[9px] font-bold uppercase tracking-wider">Flussi Partita IVA</span>
            </div>
            <span className="text-[9px] font-mono text-slate-450">{professionalTxs.length} Mov</span>
          </div>
          <div>
            <span className="block text-[10px] text-slate-400">Fatturato Netto ditta</span>
            <span className="text-base font-black font-mono text-indigo-950">
              € {professionalNet.toLocaleString('it-IT', { minimumFractionDigits: 2 })}
            </span>
          </div>
          <div className="text-[9px] text-slate-500 border-t border-slate-50 pt-1.5 flex justify-between">
            <span>Fatture Incassate: <strong>€{professionalIncomes.toLocaleString('it-IT')}</strong></span>
            <span>Spese Lavoro: <strong>€{professionalExpenses.toLocaleString('it-IT')}</strong></span>
          </div>
        </div>

        {/* Indebitamento outstanding debt */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4.5 shadow-sm space-y-2">
          <div className="flex justify-between items-center text-slate-400">
            <div className="flex items-center gap-1.5">
              <BadgeAlert className="w-3.5 h-3.5 text-rose-500" />
              <span className="text-[9px] font-bold uppercase tracking-wider">Stato Debiti</span>
            </div>
            <span className="text-[9px] bg-rose-50 text-rose-600 font-bold px-1.5 py-0.5 rounded-full">{activeDebts.length} Posizioni</span>
          </div>
          <div>
            <span className="block text-[10px] text-slate-400">Totale Indebitamento Aperto</span>
            <span className="text-base font-black font-mono text-red-650">
              - € {totalOutstandingDebts.toLocaleString('it-IT', { minimumFractionDigits: 2 })}
            </span>
          </div>
          <div className="text-[9px] text-slate-500 border-t border-slate-50 pt-1.5 flex justify-between items-center">
            <span className="truncate">Finanziam. Mutuo, Compass, AMEX</span>
            <HelpCircle className="w-3 h-3 text-slate-400 cursor-pointer" title="I prestiti e passività aperte riducono la base imponibile mobiliare ai fini del calcolo ISEE!" />
          </div>
        </div>

        {/* Spunta & Verifiche */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4.5 shadow-sm space-y-2">
          <div className="flex justify-between items-center text-slate-400">
            <div className="flex items-center gap-1.5">
              <CheckCircle className="w-3.5 h-3.5 text-purple-600" />
              <span className="text-[9px] font-bold uppercase tracking-wider">Quadratura</span>
            </div>
            <span className="text-[10px] bg-purple-50 text-purple-700 font-bold px-1.5 py-0.5 rounded-full">{verifyRate}% Spuntato</span>
          </div>
          <div>
            <span className="block text-[10px] text-slate-400">Transazioni non Verificate</span>
            <span className={`text-base font-black font-mono ${unverifiedCount > 0 ? "text-amber-600" : "text-slate-800"}`}>
              {unverifiedCount} Movimenti f.f.
            </span>
          </div>
          <div className="text-[10px] text-slate-400 border-t border-slate-50 pt-1.5">
            {unverifiedCount > 0 ? "Spunta per blindare l'estratto conto" : "Tutti i movimenti riconciliati correttamente"}
          </div>
        </div>

      </div>

      {/* VIEW 1: INTERACTIVE ADV-CHAT WITH SAGE ADVISOR */}
      {activeSubTab === 'chat' && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
          
          {/* Suggestion Column / Quick Prompts */}
          <div className="lg:col-span-1 space-y-3.5">
            <div className="bg-slate-50 p-4.5 border border-slate-250/70 rounded-2xl">
              <h4 className="text-[11px] font-black uppercase text-indigo-950 tracking-wider mb-2.5 flex items-center gap-1.5">
                <Brain className="w-3.5 h-3.5 text-indigo-600" />
                Domande Strategiche
              </h4>
              <p className="text-[10px] text-slate-500 leading-relaxed mb-4">
                Usa questi prompt preimpostati per chiedere all'AI Advisor un'analisi immediata basata sulle tue reali transazioni caricate:
              </p>
              
              <div className="space-y-3">
                {chatSuggestions.map((s, index) => (
                  <button
                    key={index}
                    onClick={() => handleSendChatMessage(s.prompt)}
                    disabled={chatLoading}
                    className="w-full text-left p-3 bg-white hover:bg-indigo-50/20 active:bg-indigo-50 border border-slate-200/80 rounded-xl transition-all shadow-2xs hover:border-indigo-200 group cursor-pointer"
                  >
                    <span className="block text-[10.5px] font-bold text-indigo-950 group-hover:text-indigo-600 truncate">
                      {s.title}
                    </span>
                    <span className="block text-[9.5px] text-slate-450 mt-0.5 leading-snug">
                      {s.desc}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Micro saving tips/rules guide */}
            <div className="bg-gradient-to-br from-indigo-50/40 to-slate-50/50 p-4 border border-indigo-150/40 rounded-2xl text-[10.5px] text-slate-600 space-y-2">
              <span className="font-extrabold text-indigo-950 uppercase text-[9.5px] block tracking-wide flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" />
                Tasso Sostitutivo & NASPI ISEE
              </span>
              <p className="leading-relaxed text-slate-500">
                L'indennità NASPI aumenta le entrate imponibili. Per calmierare l'ISEE dei prossimi anni, è utile pianificare deduzioni di previdenza complementare (massimo di € 5.164,57 annui deducibili d'imposta sul quadro RP) o investimenti speciali esenti d'imposta (Titoli di Stato, Buoni Fruttiferi).
              </p>
            </div>
          </div>

          {/* Interactive Chat Board panel */}
          <div className="lg:col-span-3 bg-white border border-slate-200 rounded-3xl shadow-sm flex flex-col h-[580px] overflow-hidden">
            
            {/* Board Header */}
            <div className="px-5 py-4 bg-slate-50/60 border-b border-slate-150 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 bg-indigo-600 text-white rounded-xl flex items-center justify-center shadow-md relative">
                  <span className="w-2.5 h-2.5 bg-emerald-500 border border-white rounded-full absolute -right-0.5 -bottom-0.5 animate-pulse" />
                  <Bot className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-slate-900 leading-none">AI Advisor Finanziario</h3>
                  <span className="text-[9.5px] text-slate-450 mt-1 block">Sempre informato sul tuo saldo e debito reale ditta/privato</span>
                </div>
              </div>
              
              <button
                onClick={clearChatHistory}
                className="p-1.5 hover:bg-slate-200/50 text-slate-450 hover:text-slate-650 rounded-lg transition-all cursor-pointer"
                title="Svuota cronologia chat"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            {/* Chat message flow container */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-slate-50/20">
              {chatMessages.map((msg) => {
                const isModel = msg.role === 'model';
                return (
                  <div
                    key={msg.id}
                    className={`flex items-start gap-3 max-w-[85%] ${isModel ? 'mr-auto' : 'ml-auto flex-row-reverse'}`}
                  >
                    {/* Avatar icon bubble */}
                    <div className={`w-7 h-7 rounded-lg shrink-0 flex items-center justify-center text-xs ${
                      isModel ? 'bg-indigo-50 text-indigo-650 border border-indigo-100' : 'bg-slate-900 text-white'
                    }`}>
                      {isModel ? <Bot className="w-4 h-4" /> : <User className="w-4 h-4" />}
                    </div>

                    {/* Speech bubble contents */}
                    <div className="space-y-1">
                      <div className={`p-4 rounded-2xl shadow-2xs ${
                        isModel 
                          ? 'bg-white border border-slate-200/80 rounded-tl-xs text-slate-805' 
                          : 'bg-indigo-600 text-white rounded-tr-xs'
                      }`}>
                        {isModel ? (
                          <div className="space-y-1 text-xs">{parseMarkdownToReact(msg.text)}</div>
                        ) : (
                          <p className="text-xs leading-relaxed whitespace-pre-wrap font-sans">{msg.text}</p>
                        )}
                      </div>
                      <span className={`block text-[8px] text-slate-400 font-mono ${isModel ? 'pl-1 text-left' : 'pr-1 text-right'}`}>
                        {msg.timestamp}
                      </span>
                    </div>
                  </div>
                );
              })}

              {chatLoading && (
                <div className="flex items-start gap-3 max-w-[85%] mr-auto">
                  <div className="w-7 h-7 rounded-lg shrink-0 bg-indigo-50 border border-indigo-100 flex items-center justify-center text-xs">
                    <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                  </div>
                  <div className="p-3.5 bg-white border border-slate-200/85 rounded-2xl rounded-tl-xs flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              )}

              <div ref={chatEndRef} />
            </div>

            {/* Footer input form */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendChatMessage();
              }}
              className="p-3.5 bg-white border-t border-slate-150 flex gap-2 items-center"
            >
              <input
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                disabled={chatLoading}
                placeholder="Discuti del tuo tenore di vita, della pensione 2027 o di come ottimizzare l'ISEE..."
                className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs focus:bg-white focus:outline-none focus:border-indigo-505 font-sans"
              />
              <button
                type="submit"
                disabled={chatLoading || !inputMessage.trim()}
                className="p-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-100 text-white disabled:text-slate-400 rounded-xl transition-all font-bold text-xs flex items-center justify-center shrink-0 cursor-pointer active:scale-95"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>

          </div>
        </div>
      )}

      {/* VIEW 2: ORIGINAL COMPREHENSIVE DAILY STRATEGY REPORT */}
      {activeSubTab === 'report' && (
        <div className="space-y-6 animate-fade-in-long">
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4 max-w-4xl">
            <h4 className="text-xs font-black uppercase text-indigo-950 tracking-wider flex items-center gap-1.5 border-b border-slate-100 pb-2">
              <Brain className="w-4 h-4 text-indigo-600" />
              Motore di Calcolo Daily Strategy
            </h4>
            <p className="text-xs text-slate-500 leading-relaxed">
              Questa sezione genera in un unico macro-blocco di testo un report strategico completo basato interamente sui dati attuali delle tue transazioni caricate. Rileva automaticamente i flussi familiari, ditta individuale, debiti contratti ed elabora indicazioni operative mirate.
            </p>
            <div>
              <button
                onClick={handleGenerateStrategy}
                disabled={loading}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-300 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer active:scale-95"
              >
                {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin text-white" /> : <RefreshCw className="w-3.5 h-3.5" />}
                {adviceText ? "Rigenera Analisi di Oggi" : "Calcola Strategia di Oggi"}
              </button>
            </div>
          </div>

          {loading && (
            <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm flex flex-col items-center justify-center text-center space-y-4 max-w-4xl">
              <Loader2 className="w-10 h-10 animate-spin text-indigo-600" />
              <div className="space-y-1.5 max-w-md">
                <h4 className="text-sm font-bold text-slate-800">Gemini sta elaborando i flussi finanziari</h4>
                <p className="text-xs text-slate-500 animate-pulse font-mono">{loadingStep}</p>
              </div>
            </div>
          )}

          {errorMsg && (
            <div className="bg-rose-50 border border-rose-150 rounded-2xl p-4 flex gap-3 text-rose-805 text-xs font-medium max-w-4xl">
              <BadgeAlert className="w-4 h-4 shrink-0 text-rose-600" />
              <p>{errorMsg}</p>
            </div>
          )}

          {adviceText && !loading && (
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm animate-fade-in-long max-w-4xl">
              <div className="p-4 bg-slate-50 border-b border-slate-150 flex justify-between items-center">
                <div className="flex items-center gap-2 text-slate-800">
                  <PiggyBank className="w-5 h-5 text-indigo-605" />
                  <h3 className="text-xs font-bold font-sans">Il tuo Report Strategico integrato</h3>
                </div>
                <button
                  onClick={handleGenerateStrategy}
                  className="flex items-center gap-1.5 text-[10px] text-indigo-600 hover:text-indigo-805 font-bold cursor-pointer transition-all active:scale-95"
                >
                  <RefreshCw className="w-3 h-3" />
                  Ricalcola Analisi
                </button>
              </div>
              <div className="p-6 md:p-8 space-y-1 text-slate-705">
                {parseMarkdownToReact(adviceText)}
              </div>
              <div className="p-4 bg-slate-50 border-t border-slate-100 text-[10px] text-slate-400 flex items-center justify-between">
                <span>Dati aggiornati secondo le ultime transazioni caricate nel libro giornale.</span>
                <span className="font-mono">Metatarga: AI-CONSULENTE-L2</span>
              </div>
            </div>
          )}
        </div>
      )}

    </div>
  );
}
