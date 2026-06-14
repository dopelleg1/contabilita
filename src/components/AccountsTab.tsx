/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Account, Transaction } from '../types';
import { 
  Plus, 
  ArrowRightLeft, 
  CreditCard, 
  DollarSign, 
  FileText, 
  Coins, 
  Calculator, 
  Trash2,
  Bookmark,
  Building,
  Pencil,
  Check,
  X,
  Lock,
  ShieldCheck,
  RefreshCw,
  Wifi,
  AlertCircle,
  ExternalLink,
  Sparkles
} from 'lucide-react';

interface AccountsTabProps {
  accounts: Account[];
  onAddAccount: (account: Account) => void;
  onDeleteAccount: (id: string) => void;
  onExecuteTransfer: (fromId: string, toId: string, amount: number, description: string) => void;
  onAddTransaction?: (transaction: Transaction) => void;
  onUpdateAccount?: (id: string, updates: Partial<Account>) => void;
}

export default function AccountsTab({ 
  accounts, 
  onAddAccount, 
  onDeleteAccount, 
  onExecuteTransfer,
  onAddTransaction,
  onUpdateAccount
}: AccountsTabProps) {
  // New Account state
  const [name, setName] = useState('');
  const [type, setType] = useState<'checking' | 'credit_card' | 'cash' | 'financing'>('checking');
  const [scope, setScope] = useState<'personal' | 'professional' | 'mixed'>('mixed');
  const [balance, setBalance] = useState('');
  const [limit, setLimit] = useState('');
  const [iban, setIban] = useState('');
  const [notes, setNotes] = useState('');

  // Editing Account state
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [editName, setEditName] = useState('');
  const [editType, setEditType] = useState<'checking' | 'credit_card' | 'cash' | 'financing'>('checking');
  const [editScope, setEditScope] = useState<'personal' | 'professional' | 'mixed'>('mixed');
  const [editBalance, setEditBalance] = useState('');
  const [editLimit, setEditLimit] = useState('');
  const [editIban, setEditIban] = useState('');
  const [editNotes, setEditNotes] = useState('');

  // Mock Bank Connection state
  const [showBankModal, setShowBankModal] = useState(false);
  const [bankStep, setBankStep] = useState(1); // 1: Select Bank, 2: Credentials, 3: Connecting/OTP, 4: Select Accounts, 5: Success
  const [selectedBank, setSelectedBank] = useState('');
  const [bankUsername, setBankUsername] = useState('');
  const [bankPassword, setBankPassword] = useState('');
  const [bankOtp, setBankOtp] = useState('');
  const [bankAccountsSelection, setBankAccountsSelection] = useState<Array<{
    name: string;
    type: 'checking' | 'credit_card' | 'financing';
    balance: number;
    iban?: string;
    limit?: number;
    selected: boolean;
  }>>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncPercentage, setSyncPercentage] = useState(0);

  // Transfer state
  const [fromAccountId, setFromAccountId] = useState('');
  const [toAccountId, setToAccountId] = useState('');
  const [transferAmount, setTransferAmount] = useState('');
  const [transferDesc, setTransferDesc] = useState('Giroconto / Trasferimento fondi');

  const [showAddForm, setShowAddForm] = useState(false);
  const [showTransferForm, setShowTransferForm] = useState(false);
  const [errorText, setErrorText] = useState('');
  const [successText, setSuccessText] = useState('');

  // Form submission: Create Account
  const handleSubmitAccount = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || isNaN(parseFloat(balance))) {
      setErrorText('Inserire un nome valido e un saldo iniziale.');
      return;
    }

    const val = parseFloat(balance);
    const isDebt = type === 'credit_card' || type === 'financing';
    const finalBalance = isDebt ? -Math.abs(val) : val;

    const newAcc: Account = {
      id: `acc-${Date.now()}`,
      name: name.trim(),
      type,
      scope,
      balance: finalBalance,
      iban: iban.trim() || undefined,
      limit: limit ? Math.abs(parseFloat(limit)) : undefined,
      notes: notes.trim() || undefined
    };

    onAddAccount(newAcc);
    resetAccountForm();
    setSuccessText('Conto aggiunto con successo!');
    setTimeout(() => setSuccessText(''), 3000);
  };

  const resetAccountForm = () => {
    setName('');
    setType('checking');
    setScope('mixed');
    setBalance('');
    setLimit('');
    setIban('');
    setNotes('');
    setShowAddForm(false);
    setErrorText('');
  };

  // Action handlers for editing account properties (such as current/starting balance, IBAN, and notes)
  const handleStartEditAccount = (acc: Account) => {
    setEditingAccount(acc);
    setEditName(acc.name);
    setEditType(acc.type);
    setEditScope(acc.scope);
    setEditBalance(acc.balance.toString());
    setEditLimit(acc.limit ? acc.limit.toString() : '');
    setEditIban(acc.iban || '');
    setEditNotes(acc.notes || '');
  };

  const handleSubmitEditAccount = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAccount || !onUpdateAccount) return;

    if (!editName.trim() || isNaN(parseFloat(editBalance))) {
      setErrorText('Inserire un nome valido e un valore di saldo.');
      return;
    }

    const updatedBal = parseFloat(editBalance);

    onUpdateAccount(editingAccount.id, {
      name: editName.trim(),
      type: editType,
      scope: editScope,
      balance: updatedBal,
      iban: editIban.trim() || undefined,
      limit: editLimit ? parseFloat(editLimit) : undefined,
      notes: editNotes.trim() || undefined
    });

    setEditingAccount(null);
    setSuccessText('Conto aggiornato correttamente!');
    setTimeout(() => setSuccessText(''), 3000);
  };

  // PSD2 Mock Bank Connection Logic
  const getMockAccountsForBank = (bankName: string) => {
    switch (bankName) {
      case 'Banco BPM':
        return [
          { name: 'Banco BPM C/C Premium', type: 'checking' as const, balance: 4120.50, iban: 'IT89B0306909606000000123456', selected: true },
          { name: 'Banco BPM Mutuo Acquisto', type: 'financing' as const, balance: -68000.00, limit: 100000.00, selected: true },
          { name: 'Banco BPM Nexi Card', type: 'credit_card' as const, balance: -350.00, limit: 3000.00, selected: false }
        ];
      case 'Intesa Sanpaolo':
        return [
          { name: 'Intesa XME Privati', type: 'checking' as const, balance: 1850.20, iban: 'IT45I0306909606000000678910', selected: true },
          { name: 'Intesa Mutuo Giovani', type: 'financing' as const, balance: -115000.00, limit: 150000.00, selected: true },
          { name: 'Intesa Mastercard Classic', type: 'credit_card' as const, balance: -120.00, limit: 1500.00, selected: true }
        ];
      case 'UniCredit':
        return [
          { name: 'UniCredit Genius Business', type: 'checking' as const, balance: 7420.00, iban: 'IT93U0306909606000000987654', selected: true },
          { name: 'UniCredit Mutuo Casa', type: 'financing' as const, balance: -95000.00, limit: 120000.00, selected: false }
        ];
      case 'Poste Italiane':
        return [
          { name: 'Postepay Evolution Smart', type: 'checking' as const, balance: 420.50, iban: 'IT32P0306909606000000812345', selected: true },
          { name: 'BancoPosta Click', type: 'checking' as const, balance: 3600.00, iban: 'IT12P0306909606000000543210', selected: true }
        ];
      case 'FinecoBank':
        return [
          { name: 'Fineco Private Wealth', type: 'checking' as const, balance: 14500.00, iban: 'IT67F0306909606000000246810', selected: true },
          { name: 'Fineco Visa Credit Debit', type: 'credit_card' as const, balance: 0.00, limit: 5000.00, selected: false }
        ];
      default:
        return [
          { name: `${bankName} Conto Online`, type: 'checking' as const, balance: 2500.00, iban: 'IT99X0306909606000000111111', selected: true }
        ];
    }
  };

  const startBankAuthing = (bank: string) => {
    setSelectedBank(bank);
    setBankAccountsSelection(getMockAccountsForBank(bank));
    setBankStep(2);
  };

  const simulateOtpSent = () => {
    if (!bankUsername.trim() || !bankPassword.trim()) {
      alert('Inserisci le credenziali di accesso.');
      return;
    }
    setBankOtp('192837'); // Fixed OTP so user can reproduce it
    setBankStep(3);
  };

  const handleVerifyOtp = () => {
    if (bankOtp !== '192837') {
      alert('Codice OTP non valido. Inserire il codice 192837 visualizzato per procedere.');
      return;
    }
    setIsSyncing(true);
    setSyncPercentage(0);
  };

  useEffect(() => {
    let interval: any;
    if (isSyncing) {
      interval = setInterval(() => {
        setSyncPercentage(prev => {
          if (prev >= 100) {
            clearInterval(interval);
            setIsSyncing(false);
            setBankStep(4);
            return 100;
          }
          return prev + 10;
        });
      }, 150);
    }
    return () => clearInterval(interval);
  }, [isSyncing]);

  const importBankAccounts = () => {
    const selectedAccountsToImport = bankAccountsSelection.filter(acc => acc.selected);
    if (selectedAccountsToImport.length === 0) {
      alert('Seleziona almeno un conto da importare.');
      return;
    }

    selectedAccountsToImport.forEach((acc, index) => {
      const generatedId = `acc-bank-${Date.now()}-${index}`;
      
      // 1. Create Account
      const newAcc: Account = {
        id: generatedId,
        name: acc.name,
        type: acc.type,
        scope: acc.type === 'checking' ? 'mixed' : 'personal',
        balance: acc.balance,
        iban: acc.iban,
        limit: acc.limit,
        notes: `Collegato online con ${selectedBank} via PSD2 (Allineato il 23/05/2026)`
      };
      onAddAccount(newAcc);

      // 2. Generate transactions for this account
      if (acc.type === 'checking' && onAddTransaction) {
        const tx1: Transaction = {
          id: `tx-sync-${Date.now()}-${index}-1`,
          date: '2026-05-15',
          description: `Bonifico Stipendio da S.p.A. (${selectedBank} Sync)`,
          amount: 1950.00,
          type: 'income',
          accountId: generatedId,
          scope: 'personal',
          category: 'entrate',
          subcategory: 'Stipendio'
        };
        const tx2: Transaction = {
          id: `tx-sync-${Date.now()}-${index}-2`,
          date: '2026-05-18',
          description: 'Spesa Esselunga Market (Sync PSD2)',
          amount: -65.40,
          type: 'expense',
          accountId: generatedId,
          scope: 'personal',
          category: 'necessarie',
          subcategory: 'Alimentari'
        };
        const tx3: Transaction = {
          id: `tx-sync-${Date.now()}-${index}-3`,
          date: '2026-05-20',
          description: 'Ricarica Telepass online (Sync PSD2)',
          amount: -25.00,
          type: 'expense',
          accountId: generatedId,
          scope: 'personal',
          category: 'utili',
          subcategory: 'Auto e Trasporti'
        };
        onAddTransaction(tx1);
        onAddTransaction(tx2);
        onAddTransaction(tx3);
      }
    });

    setBankStep(5);
  };

  const closeBankFlow = () => {
    setShowBankModal(false);
    setBankStep(1);
    setSelectedBank('');
    setBankUsername('');
    setBankPassword('');
    setBankOtp('');
    setBankAccountsSelection([]);
    setIsSyncing(false);
    setSyncPercentage(0);
  };

  // Form submission: Execute transfer
  const handleExecuteTransferSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorText('');
    setSuccessText('');

    if (!fromAccountId || !toAccountId || !transferAmount) {
      setErrorText('Seleziona il conto di origine, intestazione di destinazione e importo.');
      return;
    }

    if (fromAccountId === toAccountId) {
      setErrorText('I conti di origine e destinazione devono essere diversi.');
      return;
    }

    const amount = parseFloat(transferAmount);
    if (isNaN(amount) || amount <= 0) {
      setErrorText('L\'importo del trasferimento deve essere un numero positivo.');
      return;
    }

    // Execute the transfer action upstream
    onExecuteTransfer(fromAccountId, toAccountId, amount, transferDesc);
    
    setTransferAmount('');
    setTransferDesc('Giroconto / Trasferimento fondi');
    setShowTransferForm(false);
    
    setSuccessText('Trasferimento eseguito correttamente!');
    setTimeout(() => setSuccessText(''), 3000);
  };

  const formatEuro = (val: number) => {
    return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(val);
  };

  return (
    <div className="space-y-6" id="accounts-tab">
      
      {/* Tab bar header actions */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white border border-slate-200 p-6 rounded-2xl shadow-sm">
        <div>
          <h2 className="text-lg font-bold text-slate-805">Conti & Strumenti di Debito</h2>
          <p className="text-xs text-slate-500 mt-1">
            Gestisci la liquidità, il plafond delle carte di credito e monitora la situazione dei finanziamenti accesi.
          </p>
        </div>
        
        <div className="flex flex-wrap gap-2">
          <button 
            id="btn-connect-bank"
            onClick={() => {
              setShowBankModal(true);
              setBankStep(1);
            }} 
            className="flex items-center gap-1.5 px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-semibold rounded-lg transition-all cursor-pointer shadow-xs"
          >
            <Building className="w-3.5 h-3.5 text-indigo-650 animate-pulse" />
            Collega Banca Online (PSD2)
          </button>

          <button 
            id="btn-open-transfer"
            onClick={() => {
              setShowTransferForm(!showTransferForm);
              setShowAddForm(false);
            }} 
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-semibold rounded-lg transition-all"
          >
            <ArrowRightLeft className="w-3.5 h-3.5 text-indigo-500" />
            Giroconto / Trasferimento
          </button>
          
          <button 
            id="btn-open-add-account"
            onClick={() => {
              setShowAddForm(!showAddForm);
              setShowTransferForm(false);
            }}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg transition-all shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            Nuovo Conto / Carta
          </button>
        </div>
      </div>

      {/* Success/Error Notifications */}
      {successText && (
        <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 p-3.5 rounded-xl text-xs flex items-center gap-2">
          <Bookmark className="w-4 h-4" />
          {successText}
        </div>
      )}
      {errorText && (
        <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-3.5 rounded-xl text-xs flex items-center gap-2">
          <Trash2 className="w-4 h-4" />
          {errorText}
        </div>
      )}

      {/* Adding Account Panel */}
      {showAddForm && (
        <form onSubmit={handleSubmitAccount} className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm space-y-4">
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <Plus className="w-4 h-4 text-emerald-550 animate-pulse" />
            Inserisci Nuovo Conto o Finanziamento
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-slate-600 text-xs mb-1 font-semibold">Nome Conto / Strumento</label>
              <input 
                type="text" 
                placeholder="es: Intesa Business, AMEX Oro, Contanti ufficio"
                value={name} 
                onChange={(e) => setName(e.target.value)}
                className="w-full text-xs bg-white border border-slate-200 text-slate-800 placeholder-slate-400 rounded px-2.5 py-2 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/10"
                required
              />
            </div>

            <div>
              <label className="block text-slate-600 text-xs mb-1 font-semibold">Tipologia</label>
              <select 
                value={type} 
                onChange={(e) => setType(e.target.value as any)}
                className="w-full text-xs bg-white border border-slate-200 text-slate-800 rounded px-2.5 py-2 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/10"
              >
                <option value="checking">Conto Corrente classico</option>
                <option value="credit_card">Carta di Credito (Debito Differito)</option>
                <option value="cash">Cassa Contanti (Salvadanaio)</option>
                <option value="financing">Finanziamento / Prestito erogato</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-600 text-xs mb-1 font-semibold">Ambito di Utilizzo</label>
              <select 
                value={scope} 
                onChange={(e) => setScope(e.target.value as any)}
                className="w-full text-xs bg-white border border-slate-200 text-slate-800 rounded px-2.5 py-2 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/10"
              >
                <option value="mixed">Promiscuo / Misto (Sia Personale che Lavoro)</option>
                <option value="personal">Solo Privato / Personale</option>
                <option value="professional">Solo Professionale Partita IVA</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-600 text-xs mb-1 font-semibold">
                {type === 'credit_card' ? 'Saldo Attuale (Debito Accumulato, es. 200)' : type === 'financing' ? 'Cifra Erogata del Finanziamento (es. 25000)' : 'Saldo Iniziale (€)'}
              </label>
              <input 
                type="number" 
                step="0.01"
                placeholder={type === 'financing' ? "es: 25000" : "es: 1500"}
                value={balance} 
                onChange={(e) => setBalance(e.target.value)}
                className="w-full text-xs bg-white border border-slate-200 text-slate-800 placeholder-slate-400 rounded px-2.5 py-2 outline-none focus:border-emerald-500"
                required
              />
              {type === 'financing' && (
                <span className="block text-[10px] text-indigo-600 font-medium mt-1 leading-snug">
                  N.B. Verrà inserito come saldo iniziale negativo (es. -25.000,00 €). Un giroconto di addebito dal tuo C/C BPM costituirà un accredito che riduce questo debito residuo.
                </span>
              )}
            </div>

            {type === 'credit_card' && (
              <div>
                <label className="block text-slate-600 text-xs mb-1 font-semibold">Limite Plafond Mensile (€)</label>
                <input 
                  type="number" 
                  placeholder="es: 3000"
                  value={limit} 
                  onChange={(e) => setLimit(e.target.value)}
                  className="w-full text-xs bg-white border border-slate-200 text-slate-800 placeholder-slate-400 rounded px-2.5 py-2 focus:border-emerald-500"
                />
              </div>
            )}

            {type === 'checking' && (
              <div>
                <label className="block text-slate-600 text-xs mb-1 font-semibold">IBAN (Opzionale)</label>
                <input 
                  type="text" 
                  placeholder="IT..."
                  value={iban} 
                  onChange={(e) => setIban(e.target.value)}
                  className="w-full text-xs bg-white border border-slate-200 text-slate-800 placeholder-slate-400 rounded px-2.5 py-2 focus:border-emerald-500"
                />
              </div>
            )}

            <div className="md:col-span-3">
              <label className="block text-slate-600 text-xs mb-1 font-semibold">Note aggiuntive / Dettagli tassi</label>
              <textarea 
                rows={2}
                placeholder="Annotazioni particolari, tassi di interesse nel mutuo o ricariche mensili..."
                value={notes} 
                onChange={(e) => setNotes(e.target.value)}
                className="w-full text-xs bg-white border border-slate-200 text-slate-800 placeholder-slate-400 rounded px-2.5 py-2 outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <div className="flex gap-2 justify-end pt-2">
            <button 
              type="button" 
              onClick={resetAccountForm}
              className="px-3.5 py-2 border border-slate-200 hover:bg-slate-50 text-slate-500 text-xs font-semibold rounded"
            >
              Annulla
            </button>
            <button 
              type="submit" 
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded"
            >
              Crea Conto
            </button>
          </div>
        </form>
      )}

      {/* Executing Transfer Panel */}
      {showTransferForm && (
        <form onSubmit={handleExecuteTransferSubmit} className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm space-y-4">
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <ArrowRightLeft className="w-4 h-4 text-indigo-500" />
            Nuovo Giroconto o Appianamento Debiti
          </h3>
          <p className="text-xs text-slate-500 leading-relaxed font-sans">
            Questo strumento registra simultaneamente un'uscita (dal conto origine) e un'entrata (nel conto destinazione). Ottimo per ricaricare la cassa contanti, pagare il saldo della carta di credito, o alimentare conti minori dal conto primario.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-slate-600 text-xs mb-1 font-semibold">Addebita da (Conto Origine)</label>
              <select 
                value={fromAccountId} 
                onChange={(e) => setFromAccountId(e.target.value)}
                className="w-full text-xs bg-white border border-slate-200 text-slate-800 rounded px-2.5 py-2 outline-none focus:border-indigo-550"
              >
                <option value="">Seleziona origine...</option>
                {accounts.map(a => (
                  <option key={a.id} value={a.id}>{a.name} (Disponibile: {formatEuro(a.balance)})</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-slate-600 text-xs mb-1 font-semibold font-sans">Verifica Accredito su (Destinazione)</label>
              <select 
                value={toAccountId} 
                onChange={(e) => setToAccountId(e.target.value)}
                className="w-full text-xs bg-white border border-slate-200 text-slate-800 rounded px-2.5 py-2 outline-none focus:border-indigo-550"
              >
                <option value="">Seleziona destinazione...</option>
                {accounts.map(a => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-slate-600 text-xs mb-1 font-semibold">Somma da Spostare (€)</label>
              <input 
                type="number" 
                step="0.01"
                placeholder="es: 1000"
                value={transferAmount} 
                onChange={(e) => setTransferAmount(e.target.value)}
                className="w-full text-xs bg-white border border-slate-200 text-slate-800 placeholder-slate-400 rounded px-2.5 py-2 focus:border-indigo-550"
                required
              />
            </div>

            <div className="md:col-span-3">
              <label className="block text-slate-600 text-xs mb-1 font-semibold">Descrizione Trasferimento (Causale)</label>
              <input 
                type="text" 
                value={transferDesc} 
                onChange={(e) => setTransferDesc(e.target.value)}
                className="w-full text-xs bg-white border border-slate-200 text-slate-100 rounded px-2.5 py-2 outline-none focus:border-indigo-550"
              />
            </div>
          </div>

          <div className="flex gap-2 justify-end pt-2">
            <button 
              type="button" 
              onClick={() => setShowTransferForm(false)}
              className="px-3.5 py-2 border border-slate-200 hover:bg-slate-50 text-slate-500 text-xs font-semibold rounded"
            >
              Annulla
            </button>
            <button 
              type="submit" 
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded"
            >
              Esegui Giroconto / Trasferimento
            </button>
          </div>
        </form>
       )}

      {/* Grid List of current accounts */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {accounts.map((acc) => {
          let cardColor = 'border-slate-200 hover:border-emerald-500 hover:ring-1 hover:ring-emerald-100';
          let icon = <Coins className="w-5 h-5 text-emerald-600" />;
          let barFillPercent = null;

          if (acc.type === 'credit_card') {
            cardColor = 'border-slate-200 hover:border-indigo-500 hover:ring-1 hover:ring-indigo-100';
            icon = <CreditCard className="w-5 h-5 text-indigo-650" />;
            if (acc.limit && acc.limit > 0) {
              barFillPercent = (Math.abs(acc.balance) / acc.limit) * 100;
            }
          } else if (acc.type === 'cash') {
            cardColor = 'border-slate-200 hover:border-teal-500 hover:ring-1 hover:ring-teal-100';
            icon = <DollarSign className="w-5 h-5 text-teal-600" />;
          } else if (acc.type === 'financing') {
            cardColor = 'border-slate-200 hover:border-amber-500 hover:ring-1 hover:ring-amber-100';
            icon = <Calculator className="w-5 h-5 text-amber-600" />;
            if (acc.limit && acc.limit > 0) {
              barFillPercent = ((acc.limit - Math.abs(acc.balance)) / acc.limit) * 100;
            }
          }

          return (
            <div 
              id={`account-card-${acc.id}`}
              key={acc.id} 
              className={`bg-white border ${cardColor} rounded-2xl p-5 flex flex-col justify-between shadow-sm hover:translate-y-[-2px] transition-all relative group`}
            >
              <div className="flex justify-between items-start">
                <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100">
                  {icon}
                </div>
                <div className="flex gap-1.5">
                  <button 
                    onClick={() => handleStartEditAccount(acc)}
                    className="p-1.5 bg-slate-50 hover:bg-indigo-50 border border-slate-150 text-slate-500 hover:text-indigo-600 rounded-lg transition-all cursor-pointer flex items-center justify-center"
                    title="Modifica Conto e Saldo Iniziale"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  
                  <button 
                    onClick={() => {
                      const showConfirm = (window as any).showCustomConfirm;
                      if (showConfirm) {
                        showConfirm({
                          title: "Elimina Conto",
                          message: `Sei sicuro di voler eliminare il conto "${acc.name}"? Le transazioni esistenti rimarranno ma con riferimento a un conto generico.`,
                          confirmText: "Elimina Conto",
                          variant: "danger",
                          onConfirm: () => onDeleteAccount(acc.id)
                        });
                      } else if (confirm(`Sei sicuro di voler eliminare il conto "${acc.name}"? Le transazioni esistenti rimarranno ma con riferimento a conto generico.`)) {
                        onDeleteAccount(acc.id);
                      }
                    }}
                    className="p-1.5 bg-slate-50 hover:bg-row-50 border border-slate-150 text-slate-400 hover:text-rose-600 rounded-lg transition-all cursor-pointer flex items-center justify-center"
                    title="Elimina Conto"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="mt-4">
                <h4 className="text-xs font-bold text-slate-800 leading-snug truncate" title={acc.name}>
                  {acc.name}
                </h4>
                
                {/* Scope marker */}
                <div className="flex flex-wrap gap-1 mt-1">
                  {acc.scope === 'mixed' && (
                    <span className="bg-slate-100 text-slate-600 text-[9px] px-1.5 py-0.5 rounded border border-slate-200">Misto</span>
                  )}
                  {acc.scope === 'personal' && (
                    <span className="bg-indigo-50 text-indigo-650 border border-indigo-100 text-[9px] px-1.5 py-0.5 rounded font-medium">Personale</span>
                  )}
                  {acc.scope === 'professional' && (
                    <span className="bg-amber-50 text-amber-700 border border-amber-100 text-[9px] px-1.5 py-0.5 rounded font-medium">Partita IVA</span>
                  )}
                  {(acc.name.toLowerCase().includes('unicredit') || acc.name.toLowerCase().includes('alberto') || acc.name.toLowerCase().includes('strada') || acc.name.toLowerCase().includes('monti')) && (
                    <span className="bg-rose-50 text-rose-700 border border-rose-250 text-[9px] px-1.5 py-0.5 rounded font-bold">
                      Figlio (Alberto) - Escluso da Domenico
                    </span>
                  )}
                </div>

                {acc.iban && (
                  <p className="text-[10px] text-slate-400 font-mono mt-1.5 truncate" title={acc.iban}>
                    IBAN: ...{acc.iban.slice(-6)}
                  </p>
                )}
              </div>

              <div className="mt-6 pt-3 border-t border-slate-100 flex flex-col justify-end">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-[10px] uppercase text-slate-405 tracking-wider font-semibold">Saldo Attuale</span>
                  <button 
                    onClick={() => handleStartEditAccount(acc)}
                    className="text-[10px] text-indigo-600 hover:text-indigo-805 font-bold hover:underline cursor-pointer flex items-center gap-0.5"
                    title="Modifica saldo iniziale o corrente"
                  >
                    <Pencil className="w-2.5 h-2.5" />
                    Modifica Saldo
                  </button>
                </div>
                <div 
                  onClick={() => handleStartEditAccount(acc)}
                  className="group/balance cursor-pointer flex items-center justify-between rounded-xl hover:bg-slate-50 p-1.5 -mx-1.5 transition-all text-left"
                  title="Clicca qui per modificare il saldo e altre info del conto"
                >
                  <span className={`text-lg font-bold font-mono leading-none ${acc.balance >= 0 ? 'text-emerald-600' : 'text-rose-650'}`}>
                    {formatEuro(acc.balance)}
                  </span>
                  <Pencil className="w-3 h-3 text-slate-350 mr-1" />
                </div>
                
                {barFillPercent !== null && (
                  <div className="mt-2 text-[9px] text-slate-505">
                    {acc.type === 'credit_card' ? (
                      <div>
                        <div className="flex justify-between mb-1">
                          <span className="text-slate-500">Uso del Plafond:</span>
                          <span className="font-semibold text-slate-700">{Math.round(barFillPercent)}%</span>
                        </div>
                        <div className="w-full bg-slate-150 h-1.5 rounded-full overflow-hidden bg-slate-100">
                          <div 
                            className="bg-indigo-600 h-full rounded" 
                            style={{ width: `${Math.min(barFillPercent, 100)}%` }}
                          />
                        </div>
                        <span className="text-[8px] text-slate-400 block mt-0.5 font-mono">Limite: {formatEuro(acc.limit || 0)}</span>
                      </div>
                    ) : (
                      <div>
                        <div className="flex justify-between mb-1">
                          <span className="text-slate-500">Estinzione Debito:</span>
                          <span className="font-semibold text-slate-700">{Math.round(barFillPercent)}% pagato</span>
                        </div>
                        <div className="w-full bg-slate-150 h-1.5 rounded-full overflow-hidden bg-slate-100">
                          <div 
                            className="bg-amber-600 h-full rounded" 
                            style={{ width: `${Math.min(barFillPercent, 100)}%` }}
                          />
                        </div>
                        <span className="text-[8px] text-slate-400 block mt-0.5 font-mono">Originario: {formatEuro(acc.limit || 0)}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {acc.notes && (
                <div className="mt-2 p-1.5 bg-slate-50 border border-slate-100 rounded text-[9px] text-slate-500 italic">
                  {acc.notes}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Financing Management specific banner with information */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
        <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">Simulazione Strumenti di Debito in Italia</h3>
        <p className="text-xs text-slate-505 leading-relaxed font-sans">
          I finanziamenti e i mutui sono rappresentati come conti a saldo negativo (debito residuo). Quando effettui un <strong>giroconto</strong> dal tuo conto corrente (ad esempio BPM) verso il conto finanziamento, questo rappresenta il pagamento della rata: il conto corrente viene addebitato e il conto finanziamento viene accreditato, riducendo di fatto l'importo rimanente del debito (che si avvicina a zero).
        </p>
      </div>

      {/* MODAL 1: Account Properties & Starting Balance Editor */}
      {editingAccount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto animate-fade-in font-sans">
          <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-xl space-y-4 max-w-lg w-full relative">
            <button 
              type="button"
              onClick={() => setEditingAccount(null)}
              className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-650 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div>
              <h3 className="text-sm font-bold text-slate-80" id="title-edit-account">Modifica Proprietà & Saldo Conto</h3>
              <p className="text-[10px] text-slate-450 mt-1">
                Aggiorna i dettagli identificativi o retroattivi per il conto <span className="font-bold text-indigo-600">"{editingAccount.name}"</span>.
              </p>
            </div>

            <form onSubmit={handleSubmitEditAccount} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="sm:col-span-2">
                  <label className="block text-slate-600 font-semibold mb-1">Nome Strumento</label>
                  <input 
                    type="text" 
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full text-xs bg-white border border-slate-200 text-slate-800 rounded px-2.5 py-2 outline-none focus:border-indigo-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-slate-600 font-semibold mb-1">Tipologia Strumento</label>
                  <select 
                    value={editType} 
                    onChange={(e) => setEditType(e.target.value as any)}
                    className="w-full text-xs bg-white border border-slate-200 text-slate-800 rounded px-2.5 py-2 outline-none focus:border-indigo-500"
                  >
                    <option value="checking">Conto Corrente classico</option>
                    <option value="credit_card">Carta di Credito (Debito Differito)</option>
                    <option value="cash">Cassa Contanti (Salvadanaio)</option>
                    <option value="financing">Finanziamento / Prestito erogato</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-605 font-semibold mb-1">Ambito di Utilizzo</label>
                  <select 
                    value={editScope} 
                    onChange={(e) => setEditScope(e.target.value as any)}
                    className="w-full text-xs bg-white border border-slate-200 text-slate-800 rounded px-2.5 py-2 outline-none focus:border-indigo-500"
                  >
                    <option value="mixed">Promiscuo / Misto (Sia Personale che Lavoro)</option>
                    <option value="personal">Solo Privato / Personale</option>
                    <option value="professional">Solo Professionale Partita IVA</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-600 font-semibold mb-1">
                    {editType === 'financing' ? 'Cifra Residua Mutuo (€ Negative)' : editType === 'credit_card' ? 'Saldo Attuale / Plafond Usato (€ Negative)' : 'Saldo Attuale / Saldo Iniziale (€)'}
                  </label>
                  <input 
                    type="number" 
                    step="0.01"
                    value={editBalance}
                    onChange={(e) => setEditBalance(e.target.value)}
                    className="w-full font-mono font-bold text-xs bg-white border border-slate-200 text-slate-800 rounded px-2.5 py-2 outline-none focus:border-indigo-500"
                    required
                  />
                  <p className="text-[10px] text-slate-450 mt-0.5 italic">
                    {editType === 'financing' ? 'Inserire saldo negativo (es. -45000) per rappresentare il debito residuo.' : 'Modificando questo valore, riallinei istantaneamente il saldo.'}
                  </p>
                </div>

                {editType === 'credit_card' && (
                  <div>
                    <label className="block text-slate-605 font-semibold mb-1">Limite Plafond Mensile (€)</label>
                    <input 
                      type="number" 
                      value={editLimit} 
                      onChange={(e) => setEditLimit(e.target.value)}
                      className="w-full text-xs bg-white border border-slate-200 text-slate-800 rounded px-2.5 py-2"
                      placeholder="3000"
                    />
                  </div>
                )}

                {editType === 'financing' && (
                  <div>
                    <label className="block text-slate-605 font-semibold mb-1">Totale Finanziamento Originario (€)</label>
                    <input 
                      type="number" 
                      value={editLimit} 
                      onChange={(e) => setEditLimit(e.target.value)}
                      className="w-full text-xs bg-white border border-slate-200 text-slate-800 rounded px-2.5 py-2"
                      placeholder="100000"
                    />
                  </div>
                )}

                {editType === 'checking' && (
                  <div className="sm:col-span-2">
                    <label className="block text-slate-600 font-semibold mb-1">IBAN del Conto</label>
                    <input 
                      type="text" 
                      value={editIban} 
                      onChange={(e) => setEditIban(e.target.value)}
                      className="w-full font-mono text-xs bg-white border border-slate-200 text-slate-800 rounded px-2.5 py-2"
                    />
                  </div>
                )}

                <div className="sm:col-span-2">
                  <label className="block text-slate-605 font-semibold mb-1">Note / Dettagli</label>
                  <textarea 
                    rows={2}
                    value={editNotes} 
                    onChange={(e) => setEditNotes(e.target.value)}
                    className="w-full text-xs bg-white border border-slate-200 text-slate-800 rounded px-2.5 py-2"
                  />
                </div>
              </div>

              <div className="flex gap-2 justify-end pt-3 border-t border-slate-100">
                <button 
                  type="button" 
                  onClick={() => setEditingAccount(null)}
                  className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-505 text-xs font-semibold rounded-lg cursor-pointer"
                >
                  Annulla
                </button>
                <button 
                  type="submit" 
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg cursor-pointer"
                >
                  Salva Modifiche
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: PSD2 Open Banking Multi-Step Sync Simulator */}
      {showBankModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto animate-fade-in font-sans">
          <div className="bg-white border border-slate-200 rounded-3xl shadow-2xl p-6 sm:p-7 max-w-lg w-full relative space-y-5">
            
            {/* Modal Exit */}
            <button 
               type="button"
               onClick={closeBankFlow}
               className="absolute top-5 right-5 p-1.5 rounded-lg hover:bg-slate-50 text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Step indicators */}
            <div className="flex flex-wrap items-center gap-1.5 justify-start text-[10px] text-slate-405 uppercase tracking-wider font-extrabold pb-1">
              <span className={bankStep === 1 ? "text-indigo-600 font-black" : "text-emerald-500"}>1. Scelta Banca</span>
              <span className="text-slate-305">/</span>
              <span className={bankStep === 2 ? "text-indigo-600 font-black" : bankStep > 2 ? "text-emerald-500" : ""}>2. Login</span>
              <span className="text-slate-305">/</span>
              <span className={bankStep === 3 ? "text-indigo-600 font-black" : bankStep > 3 ? "text-emerald-500" : ""}>3. OTP & Scarico</span>
              <span className="text-slate-305">/</span>
              <span className={bankStep === 4 ? "text-indigo-600 font-black" : bankStep > 4 ? "text-emerald-500" : ""}>4. Importazione</span>
              <span className="text-slate-305">/</span>
              <span className={bankStep === 5 ? "text-emerald-500 font-extrabold" : ""}>5. Fine 🔌</span>
            </div>

            {/* STEP 1: Select Bank Screen */}
            {bankStep === 1 && (
              <div className="space-y-4 animate-fade-in">
                <div className="text-left">
                  <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                    <Building className="w-5 h-5 text-indigo-600" />
                    Collega Conto Online (Gateway PSD2)
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Seleziona la tua banca per stabilire una connessione cifrata in sola lettura integrata con lo standard europeo open-banking.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-semibold">
                  {[
                    { name: 'Banco BPM', d: 'Integrazione YouWeb & YouBusiness' },
                    { name: 'Intesa Sanpaolo', d: 'Piattaforma XME e MyKey' },
                    { name: 'UniCredit', d: 'Integrazione Genius & Buddy' },
                    { name: 'Poste Italiane', d: 'Bancoposta e Postepay Business' },
                    { name: 'FinecoBank', d: 'Allineamento Private Banking' }
                  ].map((bk) => (
                    <button
                      key={bk.name}
                      type="button"
                      onClick={() => startBankAuthing(bk.name)}
                      className="text-left p-3.5 border border-slate-200 hover:border-indigo-500 hover:bg-slate-50 rounded-2xl transition cursor-pointer flex flex-col justify-start"
                    >
                      <span className="text-slate-800 font-bold font-sans text-xs">{bk.name}</span>
                      <span className="text-[10px] text-slate-400 font-medium mt-0.5">{bk.d}</span>
                    </button>
                  ))}
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-start gap-2.5 text-[10px] text-slate-500">
                  <Lock className="w-4 h-4 text-indigo-500 mt-0.5 shrink-0" />
                  <div>
                    <span className="font-semibold text-slate-700 block">Sicurezza Garantita Open Banking</span>
                    L'applicazione stabilisce un token cifrato temporaneo della durata di 90 giorni. Nessun dato sulle tue credenziali viene archiviato nei nostri sistemi.
                  </div>
                </div>
              </div>
            )}

            {/* STEP 2: Login Input Screen */}
            {bankStep === 2 && (
              <div className="space-y-4 animate-fade-in text-xs">
                <div>
                  <h3 className="text-base font-bold text-slate-800">Accedi a {selectedBank}</h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Inserisci i dati identificativi per collegarti al portale della tua banca.
                  </p>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-slate-600 font-semibold mb-1">Codice Identificativo / Username</label>
                    <input 
                      type="text" 
                      value={bankUsername}
                      onChange={(e) => setBankUsername(e.target.value)}
                      placeholder="es. 12847590"
                      className="w-full bg-white border border-slate-200 text-slate-800 rounded-xl px-2.5 py-2 outline-none font-mono focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-500 font-semibold mb-1">Codice PIN / Password</label>
                    <input 
                      type="password" 
                      value={bankPassword}
                      onChange={(e) => setBankPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full bg-white border border-slate-200 text-slate-800 rounded-xl px-2.5 py-2 outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div className="flex gap-2 justify-end pt-2 border-t border-slate-100">
                  <button 
                    type="button" 
                    onClick={() => setBankStep(1)}
                    className="px-3.5 py-2 border border-slate-200 hover:bg-slate-50 text-slate-500 font-semibold rounded-lg"
                  >
                    Indietro
                  </button>
                  <button 
                    type="button" 
                    onClick={simulateOtpSent}
                    className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg cursor-pointer"
                  >
                    Invia OTP di Verifica
                  </button>
                </div>
              </div>
            )}

            {/* STEP 3: OTP Code verification and Synching Progress */}
            {bankStep === 3 && (
              <div className="space-y-4 animate-fade-in text-xs text-center">
                <div className="max-w-xs mx-auto space-y-2">
                  <h3 className="text-base font-bold text-slate-800">Verifica Autenticazione Forte (SCA)</h3>
                  <p className="text-xs text-slate-500 leading-snug">
                    Verifica il codice OTP monouso richiesto da <span className="font-bold text-slate-800">{selectedBank}</span> per autorizzare il collegamento dei conti.
                  </p>
                </div>

                {!isSyncing ? (
                  <div className="space-y-4 p-4 bg-slate-50 border border-slate-150 rounded-2xl relative max-w-sm mx-auto">
                    {/* Simulated push notification badge from real mobile simulator */}
                    <div className="p-3 bg-indigo-600 text-white rounded-xl text-left flex items-start gap-2.5 shadow-sm">
                      <Wifi className="w-4 h-4 text-white/80 mt-0.5 shrink-0 animate-ping" />
                      <div className="text-[11px] leading-snug">
                        <span className="font-extrabold block">Simulatore Notifica SMS / Push:</span>
                        Il tuo codice OTP Open Banking temporaneo è: <span className="font-mono bg-white/20 px-1 rounded font-black tracking-wide text-xs">192837</span>
                      </div>
                    </div>

                    <div className="space-y-2 text-left">
                      <label className="block text-slate-600 font-semibold text-[11px] mb-1 text-center">Inserisci Codice OTP</label>
                      <input 
                        type="text" 
                        value={bankOtp}
                        onChange={(e) => setBankOtp(e.target.value)}
                        placeholder="es. 192837"
                        className="w-40 mx-auto block bg-white border-2 border-slate-200 text-slate-800 text-center font-mono font-bold text-sm tracking-widest rounded-xl px-2.5 py-2 focus:border-indigo-500 outline-none"
                      />
                    </div>

                    <button 
                      type="button"
                      onClick={handleVerifyOtp}
                      className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl cursor-pointer"
                    >
                      Verifica Codice & Allinea Conti
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4 py-8 max-w-sm mx-auto">
                    <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin mx-auto" />
                    <div className="space-y-1.5">
                      <p className="font-bold text-slate-705">Recupero flussi in corso...</p>
                      <p className="text-[10px] text-slate-500">Sincronizzazione saldi e download storico estratti conto ({syncPercentage}%)</p>
                    </div>

                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                      <div className="bg-gradient-to-r from-indigo-500 to-indigo-600 h-full rounded transition-all duration-150" style={{ width: `${syncPercentage}%` }} />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* STEP 4: Choose accounts matching selection */}
            {bankStep === 4 && (
              <div className="space-y-4 animate-fade-in text-xs text-left">
                <div>
                  <h3 className="text-base font-bold text-slate-800">Seleziona Conti da Importare</h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Sono stati individuati i seguenti rapporti su <span className="font-bold text-slate-800">{selectedBank}</span>. Spunta quelli che desideri mantenere per il calcolo cumulativo del saldo.
                  </p>
                </div>

                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {bankAccountsSelection.map((acc, index) => (
                    <div 
                      key={index} 
                      className={`border rounded-xl p-3.5 flex items-center justify-between transition ${
                        acc.selected ? 'bg-indigo-50/50 border-indigo-200 shadow-xs' : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <label className="flex items-center gap-3 cursor-pointer w-full text-left">
                        <input 
                          type="checkbox" 
                          checked={acc.selected} 
                          onChange={() => {
                            const updated = [...bankAccountsSelection];
                            updated[index].selected = !updated[index].selected;
                            setBankAccountsSelection(updated);
                          }}
                          className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                        />
                        <div>
                          <h4 className="text-xs font-bold text-slate-800">{acc.name}</h4>
                          <p className="text-[10px] text-slate-400 font-mono mt-0.5">{acc.iban || 'Finanziamento Garantito Stato'}</p>
                        </div>
                      </label>
                      <div className="text-right">
                        <span className={`text-xs font-bold font-mono ${acc.balance >= 0 ? 'text-emerald-600' : 'text-rose-650'}`}>
                          {formatEuro(acc.balance)}
                        </span>
                        <span className="block text-[9px] text-slate-400 capitalize">{acc.type === 'checking' ? 'Conto Corrente' : acc.type === 'credit_card' ? 'Carta di Credito' : 'Finanziamento'}</span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex gap-2 justify-end pt-3 border-t border-slate-100">
                  <button 
                    type="button" 
                    onClick={() => setBankStep(3)}
                    className="px-3.5 py-2 border border-slate-200 hover:bg-slate-50 text-slate-500 font-semibold rounded-lg"
                  >
                    Indietro
                  </button>
                  <button 
                    type="button" 
                    onClick={importBankAccounts}
                    className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg cursor-pointer"
                  >
                    Importa ed Allinea Rapporti Select
                  </button>
                </div>
              </div>
            )}

            {/* STEP 5: Success screen */}
            {bankStep === 5 && (
              <div className="space-y-4 animate-fade-in text-xs text-center py-4">
                <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto text-xl shadow-xs ring-1 ring-emerald-100">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                
                <div className="space-y-2">
                  <h3 className="text-base font-bold text-slate-800">Connessione Eseguita!</h3>
                  <p className="text-xs text-slate-500 leading-relaxed max-w-sm mx-auto">
                    I conti selezionati di <span className="font-bold text-slate-700">{selectedBank}</span> sono stati importati con successo nel database dell'applicazione. Sono state inoltre caricate le transazioni di test per popolare istantaneamente il tuo storico.
                  </p>
                </div>

                <div className="pt-2">
                  <button 
                    type="button" 
                    onClick={closeBankFlow}
                    className="w-full sm:w-auto px-6 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl cursor-pointer"
                  >
                    Chiudi Sincronizzazione
                  </button>
                </div>
              </div>
            )}

          </div>
        </div>
      )}

    </div>
  );
}
