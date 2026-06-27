/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Account, RecurringTransaction, TransactionScope } from '../types';
import {
  TrendingUp,
  TrendingDown,
  Calendar,
  Sparkles,
  Plus,
  Trash2,
  Check,
  AlertTriangle,
  Loader2,
  RefreshCw,
  Info,
  Clock,
  X,
  CreditCard
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid
} from 'recharts';

interface ForecastsTabProps {
  accounts: Account[];
  isDemoMode: boolean;
}

export default function ForecastsTab({ accounts, isDemoMode }: ForecastsTabProps) {
  const [recurrences, setRecurrences] = useState<RecurringTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingAi, setLoadingAi] = useState(false);
  const [loadingForecast, setLoadingForecast] = useState(true);
  
  // Forecast state
  const [forecastData, setForecastData] = useState<{
    startingBalance: number;
    forecastEvents: any[];
    dailyBalancePoints: any[];
  } | null>(null);

  // Filter state for the chart
  const [selectedCurve, setSelectedCurve] = useState<'total' | 'personal' | 'professional'>('total');

  // Suggestion Wizard state
  const [suggestedRecs, setSuggestedRecs] = useState<any[]>([]);
  const [showWizard, setShowWizard] = useState(false);
  const [wizardSuccessMessage, setWizardSuccessMessage] = useState<string | null>(null);

  // Manual creation state
  const [showManualForm, setShowManualForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newKeyword, setNewKeyword] = useState('');
  const [newAmount, setNewAmount] = useState<number>(-100);
  const [newFrequency, setNewFrequency] = useState<'weekly' | 'monthly' | 'bi_monthly' | 'quarterly' | 'annual'>('monthly');
  const [newScope, setNewScope] = useState<TransactionScope>('personal');
  const [newCategory, setNewCategory] = useState('necessarie');
  const [newSubcategory, setNewSubcategory] = useState('Bollette');
  const [newAccountId, setNewAccountId] = useState(accounts[0]?.id || '');
  const [newNextDueDate, setNewNextDueDate] = useState(() => {
    const today = new Date();
    today.setDate(today.getDate() + 30);
    return today.toISOString().split('T')[0];
  });

  // Fetch all recurrences and generate forecast
  const fetchData = async () => {
    setLoading(true);
    setLoadingForecast(true);
    try {
      // 1. Fetch saved recurrences
      const recRes = await fetch('/api/recurrences');
      if (recRes.ok) {
        const data = await recRes.json();
        // Filter demo mode items
        setRecurrences(data.filter((r: RecurringTransaction) => isDemoMode ? r.isDemo : !r.isDemo));
      }

      // 2. Fetch forecast calculations
      const fcRes = await fetch(`/api/forecast?isDemoMode=${isDemoMode}`);
      if (fcRes.ok) {
        const fcData = await fcRes.json();
        setForecastData(fcData);
      }
    } catch (err) {
      console.error("Error fetching forecasting data:", err);
    } finally {
      setLoading(false);
      setLoadingForecast(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [isDemoMode, accounts]);

  // Handle manual creation
  const handleCreateManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName || !newKeyword || !newNextDueDate || !newAccountId) return;

    const newRt: any = {
      id: `rec-${Date.now()}`,
      name: newName,
      keyword: newKeyword,
      amount: Number(newAmount),
      frequency: newFrequency,
      scope: newScope,
      category: newCategory,
      subcategory: newSubcategory,
      accountId: newAccountId,
      nextDueDate: newNextDueDate,
      isActive: true,
      isDemo: isDemoMode
    };

    try {
      const res = await fetch('/api/recurrences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newRt)
      });

      if (res.ok) {
        setShowManualForm(false);
        // Reset state fields
        setNewName('');
        setNewKeyword('');
        setNewAmount(-100);
        // Refresh
        fetchData();
      }
    } catch (err) {
      console.error("Error creating recurrence:", err);
    }
  };

  // Toggle active state
  const handleToggleActive = async (rt: RecurringTransaction) => {
    const updated = { ...rt, isActive: !rt.isActive };
    try {
      const res = await fetch(`/api/recurrences/${rt.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated)
      });
      if (res.ok) {
        fetchData();
      }
    } catch (err) {
      console.error("Error updating recurrence state:", err);
    }
  };

  // Delete recurrence
  const handleDeleteRecurrence = async (id: string) => {
    if (!window.confirm("Sei sicuro di voler eliminare questa scadenza ricorrente?")) return;
    try {
      const res = await fetch(`/api/recurrences/${id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        fetchData();
      }
    } catch (err) {
      console.error("Error deleting recurrence:", err);
    }
  };

  // Trigger AI analysis scan
  const handleRunAiAnalysis = async () => {
    setLoadingAi(true);
    setWizardSuccessMessage(null);
    try {
      const res = await fetch('/api/recurrences/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isDemoMode })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.suggestedRecurrences) {
          setSuggestedRecs(data.suggestedRecurrences);
          setShowWizard(true);
        }
      }
    } catch (err) {
      console.error("Error running AI analysis:", err);
    } finally {
      setLoadingAi(false);
    }
  };

  // Save approved recurrence from AI Suggestions Wizard
  const handleApproveSuggestion = async (index: number, suggestion: any) => {
    const finalRt = {
      ...suggestion,
      id: `rec-ai-${Date.now()}-${index}`,
      accountId: suggestion.accountId || accounts[0]?.id || '',
      isDemo: isDemoMode,
      isActive: true
    };

    try {
      const res = await fetch('/api/recurrences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(finalRt)
      });

      if (res.ok) {
        // Remove from list
        setSuggestedRecs(prev => prev.filter((_, i) => i !== index));
        setWizardSuccessMessage(`Scadenza "${finalRt.name}" approvata e salvata con successo!`);
        setTimeout(() => setWizardSuccessMessage(null), 3000);
        fetchData();
      }
    } catch (err) {
      console.error("Error saving approved suggestion:", err);
    }
  };

  // Reject a suggestion
  const handleRejectSuggestion = (index: number) => {
    setSuggestedRecs(prev => prev.filter((_, i) => i !== index));
  };

  // Format currency
  const formatEuro = (value: number) => {
    return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(value);
  };

  // Frequency translation
  const translateFreq = (f: string) => {
    switch (f) {
      case 'weekly': return 'Settimanale';
      case 'monthly': return 'Mensile';
      case 'bi_monthly': return 'Bimestrale';
      case 'quarterly': return 'Trimestrale';
      case 'annual': return 'Annuale';
      default: return f;
    }
  };

  // Scope translation
  const translateScope = (s: string) => {
    return s === 'personal' ? 'Personale' : 'Professionale (P.IVA)';
  };

  const getEndingBalance = () => {
    if (!forecastData || forecastData.dailyBalancePoints.length === 0) return 0;
    const lastPoint = forecastData.dailyBalancePoints[forecastData.dailyBalancePoints.length - 1];
    return selectedCurve === 'personal' 
      ? lastPoint.personalBalance 
      : selectedCurve === 'professional' 
        ? lastPoint.professionalBalance 
        : lastPoint.balance;
  };

  const currentTotalBalance = accounts.reduce((acc, a) => acc + a.balance, 0);

  return (
    <div className="space-y-6">
      
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Calendar className="w-6 h-6 text-indigo-600 animate-pulse" />
            Previsioni di Spesa e Scadenze Ricorrenti
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Analizza l'andamento dei tuoi flussi di cassa reali e proietta il saldo futuro a 6 mesi basandoti sugli addebiti ricorrenti.
          </p>
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto">
          <button
            onClick={handleRunAiAnalysis}
            disabled={loadingAi}
            className="flex-1 md:flex-initial flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white rounded-xl text-sm font-semibold transition-all shadow-md disabled:opacity-50"
          >
            {loadingAi ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            Cerca Scadenze (AI)
          </button>
          <button
            onClick={() => setShowManualForm(!showManualForm)}
            className="flex-1 md:flex-initial flex items-center justify-center gap-2 px-4 py-2 border border-indigo-200 hover:bg-indigo-50 text-indigo-600 rounded-xl text-sm font-semibold transition-all"
          >
            <Plus className="w-4 h-4" />
            Aggiungi Scadenza
          </button>
        </div>
      </div>

      {/* METRIC CARD WIDGETS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Current Balance */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex items-center gap-4">
          <div className="p-3.5 bg-indigo-50 text-indigo-600 rounded-2xl">
            <CreditCard className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider block">Saldo Attuale (Totale)</span>
            <span className="text-2xl font-bold text-slate-800 mt-0.5 block">{formatEuro(currentTotalBalance)}</span>
          </div>
        </div>

        {/* Expected Balance 6 Months */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex items-center gap-4">
          <div className="p-3.5 bg-violet-50 text-violet-600 rounded-2xl">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider block">Previsione a 6 Mesi</span>
            <span className="text-2xl font-bold text-slate-800 mt-0.5 block">{formatEuro(getEndingBalance())}</span>
          </div>
        </div>

        {/* Dynamic Trend Card */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex items-center gap-4">
          {getEndingBalance() >= currentTotalBalance ? (
            <>
              <div className="p-3.5 bg-emerald-50 text-emerald-600 rounded-2xl">
                <TrendingUp className="w-6 h-6" />
              </div>
              <div>
                <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider block">Trend Cash Flow</span>
                <span className="text-sm font-semibold text-emerald-600 mt-0.5 flex items-center gap-1">
                  In crescita di +{formatEuro(getEndingBalance() - currentTotalBalance)}
                </span>
              </div>
            </>
          ) : (
            <>
              <div className="p-3.5 bg-rose-50 text-rose-600 rounded-2xl">
                <TrendingDown className="w-6 h-6" />
              </div>
              <div>
                <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider block">Trend Cash Flow</span>
                <span className="text-sm font-semibold text-rose-600 mt-0.5 flex items-center gap-1">
                  Deficit previsto: {formatEuro(getEndingBalance() - currentTotalBalance)}
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* MANUAL CREATION FORM MODAL/DRAWER */}
      {showManualForm && (
        <form onSubmit={handleCreateManual} className="bg-slate-50 border border-slate-200 rounded-2xl p-6 shadow-inner space-y-4">
          <div className="flex justify-between items-center border-b border-slate-200 pb-3">
            <h3 className="font-semibold text-slate-700">Aggiungi Nuova Scadenza Ricorrente</h3>
            <button type="button" onClick={() => setShowManualForm(false)} className="text-slate-400 hover:text-slate-600">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs text-slate-500 font-semibold mb-1">Nome Scadenza</label>
              <input
                type="text"
                required
                placeholder="es: Affitto Studio"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                className="w-full text-sm px-3 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 font-semibold mb-1">Parola Chiave (Banca)</label>
              <input
                type="text"
                required
                placeholder="es: LOCAZIONE"
                value={newKeyword}
                onChange={e => setNewKeyword(e.target.value)}
                className="w-full text-sm px-3 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 font-semibold mb-1">Importo (Negativo per spese)</label>
              <input
                type="number"
                step="0.01"
                required
                placeholder="es: -600"
                value={newAmount}
                onChange={e => setNewAmount(Number(e.target.value))}
                className="w-full text-sm px-3 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-500 font-mono"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 font-semibold mb-1">Frequenza</label>
              <select
                value={newFrequency}
                onChange={e => setNewFrequency(e.target.value as any)}
                className="w-full text-sm px-3 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-500"
              >
                <option value="weekly">Settimanale</option>
                <option value="monthly">Mensile</option>
                <option value="bi_monthly">Bimestrale</option>
                <option value="quarterly">Trimestrale</option>
                <option value="annual">Annuale</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs text-slate-500 font-semibold mb-1">Ambito</label>
              <select
                value={newScope}
                onChange={e => setNewScope(e.target.value as any)}
                className="w-full text-sm px-3 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-500"
              >
                <option value="personal">Personale</option>
                <option value="professional">Professionale (P.IVA)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-500 font-semibold mb-1">Conto di Appoggio</label>
              <select
                value={newAccountId}
                onChange={e => setNewAccountId(e.target.value)}
                className="w-full text-sm px-3 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-500"
              >
                {accounts.map(acc => (
                  <option key={acc.id} value={acc.id}>{acc.name} ({formatEuro(acc.balance)})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-500 font-semibold mb-1">Prossima Scadenza</label>
              <input
                type="date"
                required
                value={newNextDueDate}
                onChange={e => setNewNextDueDate(e.target.value)}
                className="w-full text-sm px-3 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div className="flex items-end">
              <button
                type="submit"
                className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold transition-all"
              >
                Salva Scadenza
              </button>
            </div>
          </div>
        </form>
      )}

      {/* AI SUGGESTED REC WIZARD */}
      {showWizard && suggestedRecs.length > 0 && (
        <div className="bg-gradient-to-r from-violet-50 to-indigo-50 border border-indigo-200 rounded-2xl p-6 shadow-sm space-y-4">
          <div className="flex justify-between items-center border-b border-indigo-200 pb-3">
            <h3 className="font-semibold text-indigo-900 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-indigo-600 animate-spin" />
              Scadenze Ricorrenti Rilevate dall'AI ({suggestedRecs.length})
            </h3>
            <button onClick={() => setShowWizard(false)} className="text-indigo-400 hover:text-indigo-600">
              <X className="w-5 h-5" />
            </button>
          </div>

          {wizardSuccessMessage && (
            <div className="bg-emerald-100 border border-emerald-300 text-emerald-800 rounded-xl p-3 text-xs flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-600" />
              {wizardSuccessMessage}
            </div>
          )}

          <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
            {suggestedRecs.map((s, idx) => (
              <div key={idx} className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 hover:shadow-md transition-all">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-800">{s.name}</span>
                    <span className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded-full ${s.confidence === 'certain' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                      {s.confidence === 'certain' ? 'Certo' : 'Probabile'}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 space-x-3">
                    <span>Parola chiave: <code className="bg-slate-100 px-1 py-0.5 rounded text-indigo-600 font-mono font-bold">{s.keyword}</code></span>
                    <span>•</span>
                    <span>Importo Stimato: <strong className={s.amount < 0 ? 'text-rose-600' : 'text-emerald-600'}>{formatEuro(s.amount)}</strong></span>
                    <span>•</span>
                    <span>Frequenza: <strong>{translateFreq(s.frequency)}</strong></span>
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Prossima data stimata: <strong>{s.nextDueDate}</strong> ({translateScope(s.scope)} / {s.category} ➔ {s.subcategory})
                  </div>
                </div>

                <div className="flex items-center gap-2 w-full md:w-auto">
                  <div className="w-full md:w-44">
                    <select
                      className="w-full text-xs px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg"
                      value={s.accountId || ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        setSuggestedRecs(prev => prev.map((item, i) => i === idx ? { ...item, accountId: val } : item));
                      }}
                    >
                      <option value="">Seleziona conto appoggio...</option>
                      {accounts.map(a => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                    </select>
                  </div>
                  <button
                    onClick={() => handleApproveSuggestion(idx, s)}
                    className="flex-1 md:flex-initial flex items-center justify-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold"
                  >
                    <Check className="w-3.5 h-3.5" /> Approva
                  </button>
                  <button
                    onClick={() => handleRejectSuggestion(idx)}
                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg"
                    title="Scarta"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* FORECAST MAIN INTERACTIVE AREA */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* CHART COL (2/3) */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h3 className="font-bold text-slate-800">Andamento Cassa Previsionale (6 Mesi)</h3>
              <p className="text-xs text-slate-400">Proiezione cumulativa del saldo sui conti bancari attivi</p>
            </div>
            
            {/* Filter Toggle */}
            <div className="flex bg-slate-100 p-1 rounded-xl gap-1 text-xs">
              <button
                onClick={() => setSelectedCurve('total')}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${selectedCurve === 'total' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
              >
                Totale
              </button>
              <button
                onClick={() => setSelectedCurve('personal')}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${selectedCurve === 'personal' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
              >
                Personale
              </button>
              <button
                onClick={() => setSelectedCurve('professional')}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${selectedCurve === 'professional' ? 'bg-white text-violet-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
              >
                P.IVA
              </button>
            </div>
          </div>

          <div className="h-80 w-full">
            {loadingForecast ? (
              <div className="h-full flex items-center justify-center text-slate-400 text-xs gap-2">
                <Loader2 className="w-5 h-5 animate-spin" />
                Calcolo previsionale in corso...
              </div>
            ) : !forecastData || forecastData.dailyBalancePoints.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 text-xs">
                <AlertTriangle className="w-8 h-8 mb-2 text-slate-400" />
                Aggiungi o scansiona le prime scadenze per visualizzare la proiezione futura.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={forecastData.dailyBalancePoints}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="date" stroke="#94a3b8" fontSize={9} tickLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={9} tickLine={false} tickFormatter={(v) => `€${v}`} />
                  <Tooltip
                    formatter={(value: any) => [formatEuro(value), 'Saldo Previsto']}
                    contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.05)' }}
                    labelStyle={{ color: '#475569', fontSize: '11px', fontWeight: 'bold' }}
                  />
                  {selectedCurve === 'total' && (
                    <Line type="monotone" dataKey="balance" name="Saldo Totale" stroke="#4f46e5" strokeWidth={3} dot={false} activeDot={{ r: 5 }} />
                  )}
                  {selectedCurve === 'personal' && (
                    <Line type="monotone" dataKey="personalBalance" name="Saldo Personale" stroke="#3b82f6" strokeWidth={3} dot={false} activeDot={{ r: 5 }} />
                  )}
                  {selectedCurve === 'professional' && (
                    <Line type="monotone" dataKey="professionalBalance" name="Saldo P.IVA" stroke="#8b5cf6" strokeWidth={3} dot={false} activeDot={{ r: 5 }} />
                  )}
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* SCADENZE TIMELINE (1/3) */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col">
          <div className="mb-4">
            <h3 className="font-bold text-slate-800">Scadenziario Cronologico</h3>
            <p className="text-xs text-slate-400">Prossimi addebiti/accrediti previsti (6 mesi)</p>
          </div>

          <div className="flex-1 overflow-y-auto space-y-3 max-h-[310px] pr-2">
            {loadingForecast ? (
              <div className="h-full flex items-center justify-center text-slate-400 text-xs">
                Caricamento...
              </div>
            ) : !forecastData || forecastData.forecastEvents.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 text-xs py-10">
                <Clock className="w-8 h-8 mb-2 text-slate-400" />
                Nessuna scadenza imminente.
              </div>
            ) : (
              forecastData.forecastEvents.map((evt, index) => (
                <div key={index} className="flex items-start gap-3 p-3 bg-slate-50 border border-slate-100 rounded-xl hover:bg-slate-100 transition-all">
                  <div className={`p-2 rounded-lg mt-0.5 text-xs font-bold ${evt.amount < 0 ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'}`}>
                    {evt.amount < 0 ? '-' : '+'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-center gap-1.5">
                      <span className="font-semibold text-slate-700 text-xs truncate">{evt.name}</span>
                      <span className={`font-mono text-xs font-bold whitespace-nowrap ${evt.amount < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                        {formatEuro(evt.amount)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center mt-1 text-[10px] text-slate-400">
                      <span>Data: <strong>{evt.date}</strong></span>
                      <span className="bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded capitalize font-medium">{evt.subcategory}</span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* LIST OF ACTIVE RECURRENCES */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <div className="mb-4">
          <h3 className="font-bold text-slate-800">Scadenze Ricorrenti Attive ({recurrences.length})</h3>
          <p className="text-xs text-slate-400">Abbonamenti, utenze e contratti registrati e monitorati</p>
        </div>

        {loading ? (
          <div className="py-10 text-center text-slate-400 text-xs gap-2 flex items-center justify-center">
            <Loader2 className="w-4 h-4 animate-spin" /> Caricamento scadenze...
          </div>
        ) : recurrences.length === 0 ? (
          <div className="py-12 border border-dashed border-slate-200 rounded-xl text-center text-slate-400 text-xs">
            <Info className="w-8 h-8 mx-auto mb-2 text-slate-300" />
            Nessuna scadenza ricorrente salvata nel database. Usa il pulsante in alto per scansionare lo storico o aggiungine una manualmente!
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-slate-400 text-xs font-bold uppercase">
                  <th className="py-3 px-4">Nome Scadenza</th>
                  <th className="py-3 px-4">Keyword</th>
                  <th className="py-3 px-4">Importo</th>
                  <th className="py-3 px-4">Frequenza</th>
                  <th className="py-3 px-4">Prossimo Addebito</th>
                  <th className="py-3 px-4">Ambito</th>
                  <th className="py-3 px-4 text-center">Stato</th>
                  <th className="py-3 px-4 text-right">Azioni</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recurrences.map((rt) => (
                  <tr key={rt.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="py-3 px-4 font-bold text-slate-700">{rt.name}</td>
                    <td className="py-3 px-4">
                      <code className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-mono font-bold text-xs">{rt.keyword}</code>
                    </td>
                    <td className={`py-3 px-4 font-mono font-bold ${rt.amount < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                      {formatEuro(rt.amount)}
                    </td>
                    <td className="py-3 px-4 text-slate-500 font-medium">{translateFreq(rt.frequency)}</td>
                    <td className="py-3 px-4 text-slate-600 font-bold">{rt.nextDueDate}</td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${rt.scope === 'personal' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'}`}>
                        {translateScope(rt.scope)}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <button
                        onClick={() => handleToggleActive(rt)}
                        className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${rt.isActive ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                      >
                        {rt.isActive ? 'Attiva' : 'Disattivata'}
                      </button>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => handleDeleteRecurrence(rt.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                        title="Elimina"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
}
