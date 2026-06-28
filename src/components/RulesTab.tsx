/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { AutoRule, Transaction, TransactionScope, Account } from '../types';
import {
  Sparkles,
  Plus,
  Trash2,
  CheckCircle,
  AlertCircle,
  HelpCircle,
  Play,
  RotateCcw,
  Briefcase,
  User,
  Key,
  ArrowRightLeft
} from 'lucide-react';

interface RulesTabProps {
  rules: AutoRule[];
  transactions: Transaction[];
  accounts: Account[];
  onAddRule: (rule: AutoRule, applyToTxIds?: string[]) => void;
  onDeleteRule: (id: string) => void;
  onRunRulesOnTransactions: () => number;
  onResetAutoCategorized: () => void;
  onApplyAiCategorization: (aiTxList: any[], aiSuggestedRules: any[]) => void;
}

export default function RulesTab({
  rules,
  transactions,
  accounts,
  onAddRule,
  onDeleteRule,
  onRunRulesOnTransactions,
  onResetAutoCategorized,
  onApplyAiCategorization
}: RulesTabProps) {
  // New rule creation state
  const [name, setName] = useState('');
  const [keyword, setKeyword] = useState('');
  const [scope, setScope] = useState<TransactionScope>('personal');
  const [category, setCategory] = useState<string>('necessarie');
  const [subcategory, setSubcategory] = useState('');
  const [accountId, setAccountId] = useState(accounts[0]?.id || '');
  const [destinationAccountId, setDestinationAccountId] = useState(accounts[1]?.id || accounts[0]?.id || '');
  const isTransferCategory = category === 'trasferimento';

  // Confirmation state for new rule match checks
  const [pendingConfirm, setPendingConfirm] = useState<{
    rule: AutoRule;
    matchingTxs: Transaction[];
    onSuccess: () => void;
  } | null>(null);

  // AI categorization simulation/execution state
  const [loadingAi, setLoadingAi] = useState(false);
  const [aiResult, setAiResult] = useState<{
    success: boolean;
    type: 'gemini' | 'regex';
    matchedCount: number;
    suggestedRules: any[];
    message?: string;
  } | null>(null);

  const [ruleRunCount, setRuleRunCount] = useState<number | null>(null);

  // Check matching transaction occurrences
  const checkAndAddRule = (newRule: AutoRule, onSuccess: () => void) => {
    const matches = transactions.filter(tx => 
      tx.description.toLowerCase().includes(newRule.keyword.toLowerCase()) &&
      (tx.scope !== newRule.scope || tx.category !== newRule.category || tx.subcategory !== newRule.subcategory)
    );

    if (matches.length > 0) {
      setPendingConfirm({
        rule: newRule,
        matchingTxs: matches,
        onSuccess
      });
    } else {
      onAddRule(newRule);
      onSuccess();
    }
  };

  // Submit handler
  const handleAddRuleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !keyword.trim() || !subcategory.trim()) {
      alert('Tutti i campi sono obbligatori.');
      return;
    }

    if (isTransferCategory && accountId === destinationAccountId) {
      alert('Il conto di origine e quello di destinazione devono essere differenti.');
      return;
    }

    const newRule: AutoRule = {
      id: `rule-${Date.now()}`,
      name: name.trim(),
      keyword: keyword.trim(),
      scope,
      category: category as any,
      subcategory: subcategory.trim(),
      ...(isTransferCategory ? { accountId, destinationAccountId } : {})
    };

    checkAndAddRule(newRule, () => {
      setName('');
      setKeyword('');
      setSubcategory('');
    });
  };

  const handleScopeChange = (newScope: TransactionScope) => {
    setScope(newScope);
    if (newScope === 'personal') {
      setCategory('necessarie');
    } else {
      setCategory('necessarie_lavoro');
    }
  };

  // Run normal local regex engine rules
  const handleTriggerRules = () => {
    const count = onRunRulesOnTransactions();
    setRuleRunCount(count);
    setTimeout(() => setRuleRunCount(null), 4000);
  };

  // Run Full Gemini AI Categorization
  const handleTriggerAiCategorization = async () => {
    setLoadingAi(true);
    setAiResult(null);

    // Get transactions that are still uncategorized or standard default (mostly negative non-transfers)
    const candidates = transactions.filter(t => t.category === 'necessarie' && t.subcategory === 'Altro');
    
    // Fallback if no matching transactions
    if (candidates.length === 0) {
      setLoadingAi(false);
      setAiResult({
        success: true,
        type: 'regex',
        matchedCount: 0,
        suggestedRules: [],
        message: "Tutte le transazioni correnti hanno già una categorizzazione specifica."
      });
      return;
    }

    try {
      const response = await fetch('/api/categorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactions: candidates })
      });

      if (!response.ok) {
        throw new Error("Errore di rete nell'API server.");
      }

      const data = await response.json();

      if (data.fallback) {
        // Run regex fallback since no API key is specified
        const count = onRunRulesOnTransactions();
        setAiResult({
          success: true,
          type: 'regex',
          matchedCount: count,
          suggestedRules: [],
          message: "Chiave API Gemini non trovata. Il motore regex locale ha elaborato ed auto-categorizzato i movimenti basandosi sulle parole chiave correnti."
        });
      } else {
        // Apply actual outcomes returned from Gemini on the server!
        const categorizedTxList = data.categorizedTransactions || [];
        const suggestedRules = data.suggestedRules || [];
        
        onApplyAiCategorization(categorizedTxList, suggestedRules);

        setAiResult({
          success: true,
          type: 'gemini',
          matchedCount: categorizedTxList.length,
          suggestedRules: suggestedRules
        });
      }
    } catch (err: any) {
      console.error(err);
      // Run fallback anyway so user gets an outstanding outcome
      const count = onRunRulesOnTransactions();
      setAiResult({
        success: true,
        type: 'regex',
        matchedCount: count,
        suggestedRules: [],
        message: "Si è verificato un errore nel server, è stato attivato il motore locale regex per categorizzare."
      });
    } finally {
      setLoadingAi(false);
    }
  };

  const handleApplySuggestedRule = (sRule: any) => {
    const newRule: AutoRule = {
      id: `rule-${Date.now()}`,
      name: sRule.name,
      keyword: sRule.keyword,
      scope: sRule.scope,
      category: sRule.category,
      subcategory: sRule.subcategory
    };
    checkAndAddRule(newRule, () => {
      // Filter this rule out of outcomes
      if (aiResult) {
        setAiResult({
          ...aiResult,
          suggestedRules: aiResult.suggestedRules.filter(r => r.keyword !== sRule.keyword)
        });
      }
    });
  };

  return (
    <div className="space-y-6" id="rules-tab">
      
      {/* Tab intro */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-6 bg-white border border-slate-200 rounded-2xl shadow-sm gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-800">Regole di Automazione & AI</h2>
          <p className="text-xs text-slate-500 mt-1">
            Usa regole per velocizzare l'ordinamento. L'Intelligenza Artificiale Gemini analizza la causale bancaria e deduce automaticamente se si tratta di vita privata o lavoro!
          </p>
        </div>
        
        <div className="flex gap-2">
          <button 
            id="btn-trigger-ai"
            onClick={handleTriggerAiCategorization}
            disabled={loadingAi}
            className="flex items-center gap-2 px-4 py-2.5 bg-amber-600 hover:bg-amber-700 disabled:bg-slate-100 disabled:text-slate-400 text-white text-xs font-bold rounded-lg transition-all shadow-sm cursor-pointer"
          >
            <Sparkles className={`w-4 h-4 ${loadingAi ? 'animate-spin' : ''}`} />
            {loadingAi ? 'AI in ascolto...' : 'Applica AI di Categorizzazione'}
          </button>
          
          <button 
            id="btn-run-regex"
            onClick={handleTriggerRules}
            className="flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-bold rounded-lg transition-all cursor-pointer"
          >
            <Play className="w-3.5 h-3.5 text-slate-500" />
            Esegui Regole Locali
          </button>
        </div>
      </div>

      {/* Notifications / Alerts */}
      {ruleRunCount !== null && (
        <div className="bg-emerald-50 border border-emerald-100 text-emerald-700 p-4 rounded-xl text-xs flex items-center gap-2.5 shadow-sm">
          <CheckCircle className="w-4 h-4 text-emerald-600" />
          <span>Motore Regex locale avviato: <strong>{ruleRunCount}</strong> transazioni corrispondenti aggiornate con successo!</span>
        </div>
      )}

      {/* AI categorization outcomes */}
      {aiResult && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4 shadow-sm animate-fade-in">
          <div className="flex items-start gap-3.5">
            <div className={`p-2 rounded-xl ${aiResult.type === 'gemini' ? 'bg-amber-50 text-amber-700 border border-amber-100' : 'bg-blue-50 text-blue-700 border border-blue-100'}`}>
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800">
                {aiResult.type === 'gemini' ? 'Analisi Semantica Gemini Completata' : 'Classificazione Regole Completata'}
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                La modellazione ha identificato ed elaborato con successo <strong className="text-slate-800">{aiResult.matchedCount}</strong> transazioni bancarie promiscue.
              </p>
              {aiResult.message && (
                <div className="mt-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-[11px] text-slate-600 leading-relaxed max-w-2xl font-sans">
                  {aiResult.message}
                </div>
              )}
            </div>
          </div>

          {/* Suggested rules from Gemini */}
          {aiResult.suggestedRules && aiResult.suggestedRules.length > 0 && (
            <div className="pt-4 border-t border-slate-100">
              <h4 className="text-xs font-bold text-slate-700 mb-3 flex items-center gap-1.5">
                <Plus className="w-3.5 h-3.5 text-amber-500" />
                Regole di Automazione rilevate dall'AI
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {aiResult.suggestedRules.map((sRule, idx) => (
                  <div key={idx} className="bg-slate-50 p-4 rounded-xl border border-slate-200/80 flex justify-between items-center transition-all hover:shadow-xs hover:border-slate-300">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-slate-800">{sRule.name}</span>
                        <span className="text-[10px] font-mono bg-white px-1.5 py-0.5 rounded border border-slate-200 text-slate-500 font-semibold">{sRule.keyword}</span>
                      </div>
                      <div className="flex gap-2 mt-1.5">
                        <span className="text-[9px] text-slate-500">Scopo: <strong className="text-slate-700">{sRule.scope === 'personal' ? 'Personale' : 'Partita IVA'}</strong></span>
                        <span className="text-[9px] text-slate-500">Cat: <strong className="text-slate-700">{sRule.subcategory}</strong></span>
                      </div>
                    </div>
                    <button 
                      onClick={() => handleApplySuggestedRule(sRule)}
                      className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white text-[10px] font-bold rounded cursor-pointer"
                    >
                      Aggiungi
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Main split: Rule Creator vs Current Rules List */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* RIGHT COLUMN: RULE CREATOR */}
        <div className="lg:col-span-4">
          <form onSubmit={handleAddRuleSubmit} className="space-y-4">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <Plus className="w-4 h-4 text-emerald-600" />
              Crea Nuova Regola
            </h3>
            
            <p className="text-xs text-slate-500 font-sans">
              Definisci quale ambito e categoria deve acquisire una transazione contenente la specifica stringa nell'estratto conto.
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-slate-600 text-xs mb-1 font-semibold">Nome della Regola</label>
                <input 
                  type="text" 
                  placeholder="es: Pranzi di Lavoro, Spesa Conad"
                  value={name} 
                  onChange={(e) => setName(e.target.value)}
                  className="w-full text-xs bg-white border border-slate-200 text-slate-800 placeholder-slate-400 rounded px-2.5 py-2 outline-none focus:border-emerald-500"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-600 text-xs mb-1 font-semibold font-sans">Parola Chiave (Case Insensitive)</label>
                <input 
                  type="text" 
                  placeholder="es: CONAD, ENEL, TELECOM"
                  value={keyword} 
                  onChange={(e) => setKeyword(e.target.value)}
                  className="w-full text-xs bg-white border border-slate-200 text-slate-800 placeholder-slate-400 rounded px-2.5 py-2 font-mono outline-none focus:border-emerald-500"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-600 text-xs mb-1 font-semibold">Assegna Ambito (Scope)</label>
                <div className="grid grid-cols-2 gap-2">
                  <button 
                    type="button"
                    onClick={() => handleScopeChange('personal')}
                    className={`px-2 py-2 text-xs font-semibold rounded border flex items-center justify-center gap-1 transition-all ${
                      scope === 'personal' 
                        ? 'bg-indigo-50 border-indigo-200 text-indigo-700 font-bold' 
                        : 'bg-white border-slate-200 text-slate-500'
                    }`}
                  >
                    <User className="w-3.5 h-3.5" /> Personale
                  </button>
                  <button 
                    type="button"
                    onClick={() => handleScopeChange('professional')}
                    className={`px-2 py-2 text-xs font-semibold rounded border flex items-center justify-center gap-1 transition-all ${
                      scope === 'professional' 
                        ? 'bg-amber-50 border-amber-200 text-amber-800 font-bold' 
                        : 'bg-white border-slate-200 text-slate-500'
                    }`}
                  >
                    <Briefcase className="w-3.5 h-3.5" /> P.IVA
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-slate-600 text-xs mb-1 font-semibold">Macro Categoria</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full text-xs bg-white border border-slate-200 text-slate-800 rounded px-2.5 py-2 outline-none"
                >
                  {scope === 'personal' ? (
                    <>
                      <option value="necessarie">Necessaria (Cibo, Bollette casa, Mutui)</option>
                      <option value="utili">Utile (Corsi privati, Assicurazioni)</option>
                      <option value="tempo_libero">Tempo Libero (Intrattenimento, Ristoranti)</option>
                      <option value="entrate">Entrata Personale (Stipendio, Pensioni, Entrate varie)</option>
                    </>
                  ) : (
                    <>
                      <option value="necessarie_lavoro">Necessaria Lavoro (Commercialista, Tasse, INPS)</option>
                      <option value="utili_lavoro">Utile Lavoro (Software cloud, Dispositivi)</option>
                      <option value="entrate_lavoro">Entrata Lavoro (Spettanze e Fatture Clienti)</option>
                    </>
                  )}
                  <option value="trasferimento">Giroconto / Trasferimento tra conti</option>
                </select>
              </div>

              {isTransferCategory && (
                <div className="bg-indigo-50/50 p-3 rounded-xl border border-indigo-100 space-y-2.5">
                  <div className="flex items-center gap-1.5 text-[11px] font-bold text-indigo-800">
                    <ArrowRightLeft className="w-3.5 h-3.5" />
                    Configurazione Giroconto
                  </div>
                  <div>
                    <label className="block text-slate-600 text-xs mb-1 font-semibold">Conto di Origine</label>
                    <select
                      value={accountId}
                      onChange={(e) => setAccountId(e.target.value)}
                      className="w-full text-xs bg-white border border-slate-200 text-slate-800 rounded px-2.5 py-2 outline-none"
                    >
                      {accounts.map(acc => (
                        <option key={acc.id} value={acc.id}>{acc.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-600 text-xs mb-1 font-semibold">Conto di Destinazione</label>
                    <select
                      value={destinationAccountId}
                      onChange={(e) => setDestinationAccountId(e.target.value)}
                      className="w-full text-xs bg-white border border-slate-200 text-slate-800 rounded px-2.5 py-2 outline-none"
                    >
                      {accounts.map(acc => (
                        <option key={acc.id} value={acc.id}>{acc.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-slate-600 text-xs mb-1 font-semibold">Sottocategoria descrittiva</label>
                <input
                  type="text"
                  placeholder="es: Utenze, Abbonamenti, Tasse"
                  value={subcategory}
                  onChange={(e) => setSubcategory(e.target.value)}
                  className="w-full text-xs bg-white border border-slate-200 text-slate-800 placeholder-slate-400 rounded px-2.5 py-2 outline-none focus:border-emerald-500"
                  required
                />
              </div>
            </div>

            <button 
              type="submit" 
              className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition-all cursor-pointer shadow-sm"
            >
              Crea Nuova Mappatura
            </button>
          </form>
        </div>

        {/* LEFT COLUMN: RULES LIST */}
        <div className="lg:col-span-8 bg-white border border-slate-200 p-6 rounded-2xl shadow-sm">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
              <span>Mappature Attive di Categorizzazione</span>
              <span className="text-xs bg-slate-50 border border-slate-200 text-slate-500 px-2 py-0.5 rounded font-bold">{rules.length}</span>
            </h3>
            <button 
              onClick={onResetAutoCategorized}
              className="text-[10px] text-slate-500 hover:text-rose-600 flex items-center gap-1 transition-all cursor-pointer font-semibold"
              title="Azzera le transazioni auto-categorizzate per rieseguire da zero"
            >
              <RotateCcw className="w-3 h-3 text-slate-400" />
              Resetta classificazioni auto
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50 text-slate-600 text-[10px] font-bold uppercase tracking-wider border-b border-slate-200">
                  <th className="py-2.5 px-3">Regola</th>
                  <th className="py-2.5 px-3">Parola Chiave</th>
                  <th className="py-2.5 px-3">Ambito</th>
                  <th className="py-2.5 px-3">Sottocategoria</th>
                  <th className="py-2.5 px-3 text-center">Rimuovi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                {rules.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-slate-400 text-xs">
                      <HelpCircle className="w-6 h-6 mx-auto mb-1 text-slate-300" />
                      Nessuna regola definita. Creane una qui a destra o esegui il riconoscimento AI!
                    </td>
                  </tr>
                ) : (
                  rules.map((rule) => {
                    const isPersonal = rule.scope === 'personal';
                    const isTransferRule = rule.category === 'trasferimento' && rule.accountId && rule.destinationAccountId;
                    const originName = accounts.find(a => a.id === rule.accountId)?.name;
                    const destName = accounts.find(a => a.id === rule.destinationAccountId)?.name;
                    return (
                      <tr key={rule.id} className="hover:bg-slate-50/50">
                        <td className="py-3 px-3 text-slate-800 font-bold">{rule.name}</td>
                        <td className="py-3 px-3 font-mono font-bold text-amber-700 bg-amber-50/30 border border-amber-100/50 rounded px-1.5 py-0.5 inline-block my-2">{rule.keyword}</td>
                        <td className="py-3 px-3">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[10px] font-bold border ${
                            isPersonal
                              ? 'bg-indigo-50 border-indigo-150 text-indigo-700'
                              : 'bg-amber-50 border-amber-150 text-amber-700'
                          }`}>
                            {isPersonal ? <User className="w-2.5 h-2.5" /> : <Briefcase className="w-2.5 h-2.5" />}
                            {isPersonal ? 'Personale' : 'Partita IVA'}
                          </span>
                        </td>
                        <td className="py-3 px-3 font-sans text-slate-600 font-semibold">
                          {rule.subcategory}
                          {isTransferRule && (
                            <div className="flex items-center gap-1 mt-1 text-[10px] text-indigo-700 font-bold">
                              <ArrowRightLeft className="w-3 h-3" />
                              {originName} ➔ {destName}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-3 text-center">
                          <button
                            onClick={() => onDeleteRule(rule.id)}
                            className="p-1 hover:bg-slate-100 text-slate-400 hover:text-rose-600 rounded transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          
          {/* Key Secret notice regarding Gemini API */}
          <div className="mt-6 flex flex-col sm:flex-row gap-4 p-4 bg-slate-50 rounded-xl border border-slate-150 text-xs text-slate-700">
            <div className="p-2 bg-slate-100 rounded-xl max-h-min text-slate-600 border border-slate-200 shadow-xs">
              <Key className="w-4 h-4" />
            </div>
            <div>
              <h4 className="font-bold text-slate-800">Come funziona la sincronizzazione semantica AI?</h4>
              <p className="mt-1 leading-relaxed text-slate-500 font-sans text-[11px]">
                Quando clicchi su 'Applica AI di Categorizzazione', l'applicazione invia le causali bancarie farraginose della tua banca a un agente Gemini. Viene restituito un output JSON completo contenente la pulizia dei titoli delle ditte e la classificazione in conformità alla fiscalità italiana. La tua chiave API rimane sicura sul nostro server, configurabile facilmente tramite il pannello <strong>Impostazioni &gt; Secrets</strong> nell'AI Studio UI.
              </p>
            </div>
          </div>
        </div>

      </div>

      {pendingConfirm && (
        <div className="fixed inset-0 bg-slate-950/45 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center gap-3.5 pb-3 border-b border-slate-100">
              <div className="p-2.5 bg-amber-50 rounded-xl text-amber-600 border border-amber-100">
                <AlertCircle className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-800">Crea Regola e Aggiorna Movimenti</h3>
                <p className="text-[11px] text-slate-500 font-sans mt-0.5">
                  La parola chiave <strong>"{pendingConfirm.rule.keyword}"</strong> corrisponde a dei movimenti esistenti.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-xs text-slate-600 leading-relaxed font-sans">
                Abbiamo trovato <strong>{pendingConfirm.matchingTxs.length}</strong> {pendingConfirm.matchingTxs.length === 1 ? 'movimento coincidente che non è ' : 'movimenti coincidenti che non sono '} ancora classificati con questa regola. Vuoi aggiornarli ora?
              </p>

              {/* Sneak peek list of matched transactions */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 max-h-40 overflow-y-auto space-y-2">
                {pendingConfirm.matchingTxs.slice(0, 5).map((tx) => (
                  <div key={tx.id} className="flex justify-between items-center text-[11px] py-1 border-b border-slate-100 last:border-none font-sans px-1">
                    <div className="truncate pr-4 flex items-center gap-2">
                      <span className="text-slate-400 font-mono text-[10px]">{tx.date}</span>
                      <span className="text-slate-700 font-bold truncate max-w-[200px]" title={tx.description}>{tx.description}</span>
                    </div>
                    <span className={`font-mono font-bold ${tx.amount < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                      {tx.amount < 0 ? '-' : '+'}{Math.abs(tx.amount).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}
                    </span>
                  </div>
                ))}
                {pendingConfirm.matchingTxs.length > 5 && (
                  <div className="text-[10px] text-slate-400 pt-1 text-center font-semibold italic">
                    ...e altri {pendingConfirm.matchingTxs.length - 5} movimenti trovati
                  </div>
                )}
              </div>

              <div className="bg-indigo-50/50 p-3 rounded-xl border border-indigo-100 text-[10.5px] text-indigo-800 space-y-1 font-sans">
                <div className="font-bold flex items-center gap-1">
                  <span>Nuovo Stato Applicato:</span>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  <div>Ambito: <strong className="font-mono text-[10px] bg-white px-1 py-0.5 rounded border border-indigo-150">{pendingConfirm.rule.scope === 'personal' ? 'Personale' : 'Partita IVA'}</strong></div>
                  <div>Sottocategoria: <strong className="font-mono text-[10px] bg-white px-1 py-0.5 rounded border border-indigo-150">{pendingConfirm.rule.subcategory}</strong></div>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  onAddRule(pendingConfirm.rule, pendingConfirm.matchingTxs.map(t => t.id));
                  pendingConfirm.onSuccess();
                  setPendingConfirm(null);
                }}
                className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition-all cursor-pointer shadow-sm text-center"
              >
                Sì, aggiorna tutti i {pendingConfirm.matchingTxs.length}
              </button>
              <button
                type="button"
                onClick={() => {
                  // Save rule only
                  onAddRule(pendingConfirm.rule);
                  pendingConfirm.onSuccess();
                  setPendingConfirm(null);
                }}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 text-xs font-bold rounded-lg transition-all cursor-pointer text-center"
              >
                No, solo regola
              </button>
              <button
                type="button"
                onClick={() => setPendingConfirm(null)}
                className="px-3 py-2.5 bg-white hover:bg-slate-50 text-slate-500 border border-slate-200 text-xs font-bold rounded-lg transition-all cursor-pointer text-center"
              >
                Annulla
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
