/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { Account, Transaction, BankSyncConnection, AccountType, AccountScope, PersonalCategory, ProfessionalCategory, AutoRule } from '../types';
import { exportToCSV, applyLocalRules } from '../utils/financeHelpers';
import { 
  Upload, 
  Download, 
  Link2, 
  RefreshCw, 
  AlertCircle, 
  Clock, 
  CheckCircle,
  SlidersHorizontal,
  Building,
  Sparkles,
  HelpCircle,
  ShieldCheck,
  Zap,
  Check,
  Plus,
  ArrowRight,
  PlusCircle,
  FolderPlus,
  Building2,
  Trash2,
  CheckSquare,
  Square,
  ChevronRight,
  ArrowLeftRight,
  Database
} from 'lucide-react';

interface ImportExportTabProps {
  accounts: Account[];
  transactions: Transaction[];
  rules?: AutoRule[];
  onImportTransactions: (txs: Partial<Transaction>[]) => void;
  onAddTransaction: (tx: Transaction) => void;
  onAddAccount: (acc: Account) => void;
  onAddRule?: (rule: AutoRule) => void;
  onRefreshDbState?: () => Promise<any>;
  onUpdateTransaction?: (id: string, updates: Partial<Transaction>) => void;
  isDemoMode?: boolean;
}

const SUPPORTED_BANKS = [
  { id: 'bank-unicredit', name: 'UniCredit Spa', logo: '🏦' },
  { id: 'bank-intesa', name: 'Intesa Sanpaolo Spa', logo: '🦁' },
  { id: 'bank-fineco', name: 'Fineco Bank', logo: '📈' },
  { id: 'bank-revolut', name: 'Revolut Italia', logo: '💳' },
  { id: 'bank-bbva', name: 'BBVA Italia', logo: '📱' },
  { id: 'bank-poste', name: 'Poste Italiane (Postepay)', logo: '✉️' },
  { id: 'bank-bpm', name: 'Banco BPM', logo: '🏢' },
  { id: 'bank-sella', name: 'Banca Sella', logo: '💎' }
];

const isFinancingOrCreditCard = (name: string): boolean => {
  if (!name) return false;
  const n = name.toUpperCase();
  return (
    n.includes('MUTUO') || 
    n.includes('FIAT') || 
    n.includes('FINANZ') || 
    n.includes('AMEX') || 
    n.includes('AMERICAN') || 
    n.includes('CARTA') || 
    n.includes('CREDIT') || 
    n.includes('LOAN') || 
    n.includes('AGOS')
  );
};

// Structure for rows ready for smart validation
interface ParsedWizardRow {
  id: string;
  date: string;
  description: string;
  amount: number;
  type: 'income' | 'expense' | 'transfer';
  rawAccountName: string; // The account string identified in the CSV
  matchedAccountId: string; // The selected or created internal account ID
  destinationAccountId?: string; // Optional destination account ID for transfers
  rawDestinationAccountName?: string; // Optional raw destination account name for transfers
  scope: 'personal' | 'professional';
  category: PersonalCategory | ProfessionalCategory;
  subcategory: string;
  matchType: 'rule' | 'past' | 'default' | 'user';
  selected: boolean;
  isApproved: boolean;
  saveAsRule: boolean;
  isDuplicate?: boolean;
}

export default function ImportExportTab({ 
  accounts, 
  transactions, 
  rules = [],
  onImportTransactions, 
  onAddTransaction,
  onAddAccount,
  onAddRule,
  onRefreshDbState,
  onUpdateTransaction,
  isDemoMode = true
}: ImportExportTabProps) {

  const getApiUrl = (apiPath: string) => {
    const path = window.location.pathname;
    const segments = path.split('/');
    if (segments.length > 1) {
      const last = segments[segments.length - 1];
      if (last.includes('.') || last === '') {
        segments.pop();
      }
    }
    const subFolder = segments.join('/');
    return subFolder === '/' ? apiPath : subFolder + apiPath;
  };

  const getDownloadUrl = (apiPath: string, actionName: string) => {
    const hostname = window.location.hostname;
    const isLocalOrContainer = 
      hostname.includes('localhost') || 
      hostname.includes('127.0.0.1') || 
      hostname.includes('run.app') || 
      hostname.includes('ai.studio');

    if (!isLocalOrContainer) {
      // Reindirizziamo direttamente all'installer.php con l'action corrispondente per Hostinger
      const path = window.location.pathname;
      const segments = path.split('/');
      if (segments.length > 1) {
        const last = segments[segments.length - 1];
        if (last.includes('.') || last === '') {
          segments.pop();
        }
      }
      const subFolder = segments.join('/');
      const baseInstaller = subFolder === '/' ? '/installer.php' : subFolder + '/installer.php';
      return `${baseInstaller}?action=${actionName}`;
    }

    return getApiUrl(apiPath);
  };

  // Bank session and verification states for Interactive Association Wizard
  const [retrievedAccounts, setRetrievedAccounts] = useState<any[]>([]);
  const [allExistingAccounts, setAllExistingAccounts] = useState<any[]>([]);
  const [sessionBankName, setSessionBankName] = useState('');
  const [activeSessionId, setActiveSessionId] = useState('');
  const [activeBankId, setActiveBankId] = useState('');
  const [showAssociationModal, setShowAssociationModal] = useState(false);
  const [accountAssociations, setAccountAssociations] = useState<Record<string, string>>({});
  const [syncingAccountId, setSyncingAccountId] = useState<string | null>(null);

  const [targetAccountId, setTargetAccountId] = useState(accounts[0]?.id || '');
  const [csvText, setCsvText] = useState('');
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Invoice Manager Reconciliation State
  const [activeImportSubTab, setActiveImportSubTab] = useState<'bancario' | 'fatture'>('bancario');
  const [invoiceCsvText, setInvoiceCsvText] = useState('');
  const [parsedInvoices, setParsedInvoices] = useState<any[]>([]);
  const [manualSelections, setManualSelections] = useState<{[invoiceNum: string]: string}>({});
  const invoiceFileInputRef = useRef<HTMLInputElement>(null);
  const [invoiceDragging, setInvoiceDragging] = useState(false);

  // Synchronized computation of invoice matches based on current transactions and parsedInvoices
  const computedInvoiceReconciliationResults = React.useMemo(() => {
    if (parsedInvoices.length === 0) return [];
    
    return parsedInvoices.map(inv => {
      const numero = inv['Numero'] || inv['numero'] || '';
      const cliente = inv['Cliente'] || inv['cliente'] || '';
      const dataDoc = inv['Data documento'] || inv['data documento'] || inv['Data invio'] || inv['data invio'] || '';
      
      // Parse amount "Netto a pagare" or "Totale documento"
      const rawNetto = inv['Netto a pagare'] || inv['Netto A Pagare'] || inv['netto a pagare'] || inv['Totale documento'] || '0';
      const cleanNettoStr = rawNetto.replace(/[^0-9,-]/g, '').replace(',', '.');
      const invoiceAmount = Math.abs(parseFloat(cleanNettoStr)) || 0;
      
      if (!numero || !cliente || invoiceAmount === 0) {
        return {
          invoiceNumber: numero || 'N/D',
          clientName: cliente || 'Sconosciuto',
          invoiceAmount,
          invoiceDate: dataDoc,
          matches: [],
          isValidated: false,
          validatedTx: null,
          rawInvoice: inv
        };
      }
      
      // Is there an already validated transaction for this invoice?
      const validatedTx = transactions.find(t => t.invoiceId === numero);
      if (validatedTx) {
        return {
          invoiceNumber: numero,
          clientName: cliente,
          invoiceAmount,
          invoiceDate: dataDoc,
          matches: [{ tx: validatedTx, score: 100, statusLabel: 'Riconciliata (ID Corretto)' }],
          selectedTxId: validatedTx.id,
          isValidated: true,
          validatedTx,
          rawInvoice: inv
        };
      }
      
      // Find possible candidate transactions (amount matches, type is income, tagged as Partita Iva and account is NOT financing)
      const potentialTxs = transactions.filter(t => {
        const txAmount = Math.abs(t.amount);
        const isAmountMatch = Math.abs(txAmount - invoiceAmount) < 0.05; // 5 cent margin for rounds/stamps
        const isPos = t.amount > 0 || t.type === 'income';
        // Avoid transactions already assigned to other invoices
        const isNotAssigned = !t.invoiceId || t.invoiceId === numero;
        
        // Match must ONLY apply to incoming amounts tagged as Partita Iva (professional scope)
        const isPartitaIva = t.scope === 'professional';
        
        // Must be on any account EXCEPT financing (finanziamenti)
        const associatedAccount = accounts.find(a => a.id === t.accountId);
        const isNotFinancing = associatedAccount ? associatedAccount.type !== 'financing' : true;
        
        return isAmountMatch && isPos && isNotAssigned && isPartitaIva && isNotFinancing;
      });
      
      const matchingTxs = potentialTxs.map(tx => {
        return {
          tx,
          score: 100,
          statusLabel: 'Importo Coincidente (Partita IVA)',
          hasNameMatch: false,
          matchedWord: ''
        };
      });
      
      return {
        invoiceNumber: numero,
        clientName: cliente,
        invoiceAmount,
        invoiceDate: dataDoc,
        matches: matchingTxs,
        selectedTxId: matchingTxs[0]?.tx.id || '',
        isValidated: false,
        validatedTx: null,
        rawInvoice: inv
      };
    });
  }, [parsedInvoices, transactions]);

  const getSelectedTxId = (invNum: string, bestMatchId: string) => {
    if (manualSelections[invNum] !== undefined) {
      return manualSelections[invNum];
    }
    return bestMatchId;
  };

  const processInvoiceCSV = (text: string) => {
    try {
      const { headers, rows } = parseSmartCSV(text);
      if (rows.length === 0) {
        setImportStatus("Nessun record fattura individuato nel file CSV.");
        setTimeout(() => setImportStatus(null), 3000);
        return;
      }
      
      // Let's compute matching results against the state's transactions
      setParsedInvoices(rows);
      setManualSelections({});
      
      const calculatmatches = rows.map(inv => {
        const numero = inv['Numero'] || inv['numero'] || '';
        const cliente = inv['Cliente'] || inv['cliente'] || '';
        const rawNetto = inv['Netto a pagare'] || inv['Netto A Pagare'] || inv['netto a pagare'] || inv['Totale documento'] || '0';
        const cleanNettoStr = rawNetto.replace(/[^0-9,-]/g, '').replace(',', '.');
        const invoiceAmount = Math.abs(parseFloat(cleanNettoStr)) || 0;
        
        const potentialTxs = transactions.filter(t => {
          const txAmount = Math.abs(t.amount);
          const isAmountMatch = Math.abs(txAmount - invoiceAmount) < 0.05;
          const isPos = t.amount > 0 || t.type === 'income';
          
          // Match must ONLY apply to incoming amounts tagged as Partita Iva (professional scope)
          const isPartitaIva = t.scope === 'professional';
          
          // Must be on any account EXCEPT financing (finanziamenti)
          const associatedAccount = accounts.find(a => a.id === t.accountId);
          const isNotFinancing = associatedAccount ? associatedAccount.type !== 'financing' : true;

          return isAmountMatch && isPos && isPartitaIva && isNotFinancing;
        });
        return potentialTxs.length;
      });
      
      const numWithMatches = calculatmatches.filter(cnt => cnt > 0).length;
      setImportStatus(`Fatture caricate! ${rows.length} fatture acquisite. Abbiamo trovato potenziali corrispondenze bancarie per ${numWithMatches} fatture.`);
      setTimeout(() => setImportStatus(null), 6500);
    } catch (err: any) {
      console.error("Error processing invoice CSV", err);
      setImportStatus("Errore nell'analisi del CSV fatture. Assicurati che contenga le colonne Numero, Cliente e Netto a pagare.");
      setTimeout(() => setImportStatus(null), 5000);
    }
  };

  const handleValidateInvoiceMatch = (invoiceNum: string, clientName: string, txId: string) => {
    if (!onUpdateTransaction) {
      alert("La funzione di aggiornamento transazioni non è configurata.");
      return;
    }
    if (!txId) {
      alert("Nessuna transazione selezionata per questo match.");
      return;
    }
    
    onUpdateTransaction(txId, {
      customer: clientName,
      invoiceId: invoiceNum
    });
    
    setImportStatus(`Fattura ${invoiceNum} riconciliata e validata con successo sul movimento bancario!`);
    setTimeout(() => {
      setImportStatus(null);
    }, 4000);
  };

  const handleValidateAllMatches = (results: any[]) => {
    if (!onUpdateTransaction) {
      alert("La funzione di aggiornamento transazioni non è configurata.");
      return;
    }
    
    let count = 0;
    results.forEach(res => {
      if (!res.isValidated) {
        const txId = getSelectedTxId(res.invoiceNumber, res.selectedTxId);
        if (txId) {
          onUpdateTransaction(txId, {
            customer: res.clientName,
            invoiceId: res.invoiceNumber
          });
          count++;
        }
      }
    });
    
    if (count > 0) {
      setImportStatus(`Ottimo! Auto-riconciliazione completata con successo per ${count} fatture.`);
    } else {
      setImportStatus("Nessuna fattura con match valido da riconciliare in blocco.");
    }
    setTimeout(() => setImportStatus(null), 5000);
  };

  const getPrimaryCheckingAccountIdAndName = () => {
    const checking = accounts.find(a => a.type === 'checking' || a.id?.includes('bpm') || a.name?.toLowerCase().includes('bpm') || a.name?.toLowerCase().includes('banco') || a.id?.includes('unicredit') || a.id?.includes('fineco'));
    if (checking) {
      return { id: checking.id, name: checking.name };
    }
    const anyNonFinancing = accounts.find(a => a.type !== 'financing' && a.type !== 'credit_card');
    if (anyNonFinancing) {
      return { id: anyNonFinancing.id, name: anyNonFinancing.name };
    }
    return accounts[0] ? { id: accounts[0].id, name: accounts[0].name } : { id: '', name: 'Conto Corrente' };
  };

  // Backup & Restore Database states & handlers
  const [isExportingJson, setIsExportingJson] = useState(false);
  const [isDownloadingSql, setIsDownloadingSql] = useState(false);
  const [isDownloadingZip, setIsDownloadingZip] = useState(false);
  const [isImportingBackup, setIsImportingBackup] = useState(false);
  const [isImportingSqlite, setIsImportingSqlite] = useState(false);
  const [backupStatus, setBackupStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const backupFileInputRef = useRef<HTMLInputElement>(null);
  const sqliteFileInputRef = useRef<HTMLInputElement>(null);

  const handleSqliteRestore = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const confirmMessage = "ATTENZIONE:\nIl ripristino di un database SQLite (.db) sovrascriverà IMMEDIATAMENTE e COMPLETAMENTE tutti i dati correnti di Conti, Transazioni, Regole ed Impostazioni sul server!\n\nSei completamente sicuro di procedere?\nQuesta azione non è revocabile.";
    if (!window.confirm(confirmMessage)) {
      e.target.value = '';
      return;
    }

    setIsImportingSqlite(true);
    setBackupStatus(null);

    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const result = event.target?.result as string;
          // Extract base64 part
          const base64Data = result.split(',')[1];

          const response = await fetch('/api/backup/sqlite/upload', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ fileBase64: base64Data }),
          });

          if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.error || "Errore nel caricamento del file SQLite");
          }

          setBackupStatus({ type: 'success', message: 'Database SQLite (.db) caricato ed installato fisicamente con successo!' });
          
          if (onRefreshDbState) {
            await onRefreshDbState();
          }
        } catch (err: any) {
          console.error(err);
          setBackupStatus({ type: 'error', message: 'Errore durante la sovrascrittura SQLite: ' + (err.message || err) });
        } finally {
          setIsImportingSqlite(false);
          e.target.value = '';
        }
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      console.error(err);
      setBackupStatus({ type: 'error', message: 'Errore generico della lettura database: ' + (err.message || err) });
      setIsImportingSqlite(false);
      e.target.value = '';
    }
  };

  const handleBackupExportJson = async () => {
    setIsExportingJson(true);
    setBackupStatus(null);
    try {
      const res = await fetch('/api/backup/export');
      if (!res.ok) throw new Error("Errore durante l'esportazione");
      const data = await res.json();
      
      const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(
        JSON.stringify(data, null, 2)
      )}`;
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute('href', jsonString);
      const dateStr = new Date().toISOString().slice(0, 10);
      downloadAnchor.setAttribute('download', `contosmart_backup_${dateStr}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      
      setBackupStatus({ type: 'success', message: 'Backup JSON scaricato con successo!' });
    } catch (err: any) {
      console.error(err);
      setBackupStatus({ type: 'error', message: 'Errore nel download del backup: ' + (err.message || err) });
    } finally {
      setIsExportingJson(false);
    }
  };

  const handleDownloadSqlBlob = async () => {
    const hostname = window.location.hostname;
    const isSandbox = 
      hostname.includes('run.app') || 
      hostname.includes('ai.studio') ||
      hostname.includes('localhost') || 
      hostname.includes('127.0.0.1');

    if (!isSandbox) {
      // On real Hostinger hosting, direct link download is extremely safe and doesn't get blocked
      window.location.href = getDownloadUrl("/api/backup/sqlite", "download_sqlite");
      return;
    }

    setIsDownloadingSql(true);
    setBackupStatus(null);
    try {
      const url = getDownloadUrl("/api/backup/sqlite", "download_sqlite");
      const res = await fetch(url);
      if (!res.ok) throw new Error("Errore durante il recupero del database SQLite dal server");
      
      const blob = await res.blob();
      
      // Verification
      if (blob.size < 1000) {
        const textStr = await blob.text();
        if (textStr.includes('<!DOCTYPE') || textStr.includes('<html>')) {
          throw new Error("Il download ha restituito una pagina di errore proxy. Prova ad aprire l'app in una nuova scheda.");
        }
      }

      const downloadUrl = URL.createObjectURL(blob);
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute('href', downloadUrl);
      downloadAnchor.setAttribute('download', 'database.db');
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      URL.revokeObjectURL(downloadUrl);
      
      setBackupStatus({ type: 'success', message: 'Database SQLite scaricato correttamente!' });
    } catch (err: any) {
      console.error(err);
      setBackupStatus({ type: 'error', message: 'Errore nel download del database: ' + (err.message || err) });
    } finally {
      setIsDownloadingSql(false);
    }
  };

  const handleDownloadZipBlob = async () => {
    const hostname = window.location.hostname;
    const isSandbox = 
      hostname.includes('run.app') || 
      hostname.includes('ai.studio') ||
      hostname.includes('localhost') || 
      hostname.includes('127.0.0.1');

    if (!isSandbox) {
      // On real Hostinger hosting, direct link download is extremely safe and doesn't get blocked
      window.location.href = getDownloadUrl("/api/backup/export/full-zip", "build_master_zip");
      return;
    }

    setIsDownloadingZip(true);
    setBackupStatus(null);
    try {
      const url = getDownloadUrl("/api/backup/export/full-zip", "build_master_zip");
      const res = await fetch(url);
      if (!res.ok) throw new Error("Errore durante la generazione del Master Backup sul server");
      
      const blob = await res.blob();
      
      // Security/Proxy block verification
      if (blob.size < 15000) {
        const textStr = await blob.text();
        if (textStr.includes('<!DOCTYPE') || textStr.includes('<html>') || textStr.includes('{"error"')) {
          let errorMsg = "Il server ha restituito una pagina di errore o sessione scaduta della sandbox.";
          try {
            const parsed = JSON.parse(textStr);
            if (parsed.error) errorMsg = parsed.error;
          } catch(e) {}
          throw new Error(errorMsg);
        }
      }

      const downloadUrl = URL.createObjectURL(blob);
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute('href', downloadUrl);
      downloadAnchor.setAttribute('download', 'contosmart_master_backup.zip');
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      URL.revokeObjectURL(downloadUrl);
      
      setBackupStatus({ type: 'success', message: 'Master Backup ZIP scaricato correttamente con successo!' });
    } catch (err: any) {
      console.error(err);
      setBackupStatus({ type: 'error', message: 'Errore nel download del Master Backup ZIP: ' + (err.message || err) });
    } finally {
      setIsDownloadingZip(false);
    }
  };

  const handleBackupRestoreJson = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const confirmMessage = "ATTENZIONE:\nIl ripristino di un backup sovrascriverà COMPLETAMENTE i dati attuali del database (conti, transazioni, regole e impostazioni).\n\nProcedere solo se si è sicuri della validità del file di backup.\nQUESTA OPERAZIONE È IRREVERSIBILE.\n\nVuoi continuare?";
    const proceed = window.confirm(confirmMessage);
    if (!proceed) {
      e.target.value = '';
      return;
    }

    setIsImportingBackup(true);
    setBackupStatus(null);
    try {
      const fileReader = new FileReader();
      fileReader.onload = async (event) => {
        try {
          const content = event.target?.result as string;
          const parsedData = JSON.parse(content);

          const response = await fetch('/api/backup/import', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(parsedData),
          });

          if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.error || "Errore nel caricamento del file sullo store");
          }

          setBackupStatus({ type: 'success', message: 'Database ripristinato con successo dal file di backup!' });
          
          if (onRefreshDbState) {
            await onRefreshDbState();
          }
        } catch (err: any) {
          console.error(err);
          setBackupStatus({ type: 'error', message: 'Errore nel caricamento del file: ' + (err.message || err) });
        } finally {
          setIsImportingBackup(false);
          e.target.value = '';
        }
      };
      fileReader.readAsText(file);
    } catch (err: any) {
      console.error(err);
      setBackupStatus({ type: 'error', message: 'Errore nella lettura del file: ' + (err.message || err) });
      setIsImportingBackup(false);
      e.target.value = '';
    }
  };

  // Bank Connection Sim State
  const [demoConnections, setDemoConnections] = useState<BankSyncConnection[]>(() => {
    const saved = localStorage.getItem('contosmart_demo_connections');
    if (saved !== null) {
      try {
        return JSON.parse(saved);
      } catch (err) {
        // Fallback
      }
    }
    return [
      { id: 'conn-revolut-sim', bankName: 'Revolut (Simulato)', status: 'connected', logo: '💳', lastSynced: 'Oggi alle 12:40' }
    ];
  });

  useEffect(() => {
    localStorage.setItem('contosmart_demo_connections', JSON.stringify(demoConnections));
  }, [demoConnections]);

  const [isConnecting, setIsConnecting] = useState(false);
  const [connectingBankId, setConnectingBankId] = useState('');
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [consentApproved, setConsentApproved] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [syncedCountMsg, setSyncedCountMsg] = useState<string | null>(null);

  // --- REAL OPEN BANKING (PSD2) STATE & EFFECT HOOKS ---
  const [showApiConfig, setShowApiConfig] = useState(false);
  const [clientIdInput, setClientIdInput] = useState('');
  const [keyIdInput, setKeyIdInput] = useState('');
  const [privateKeyInput, setPrivateKeyInput] = useState('');
  const [customAspspId, setCustomAspspId] = useState('');

  // Fetch Open Banking Config metadata on startup
  useEffect(() => {
    const fetchBankConfig = async () => {
      try {
        const r = await fetch('/api/bank/config');
        if (r.ok) {
          const data = await r.json();
          if (data.clientId) {
            setClientIdInput(data.clientId);
          }
          if (data.keyId) {
            setKeyIdInput(data.keyId);
          }
          if (data.isConfigured) {
            setPrivateKeyInput("••••••••••••••••••••••••••••••••");
          }
        }
      } catch (err) {
        console.error("Errore caricamento configurazione open banking:", err);
      }
    };
    fetchBankConfig();
  }, []);

  // Listen to incoming callback redirects
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('bank_sync_code');
    const state = params.get('state');
    const errorMsg = params.get('bank_sync_error');

    if (errorMsg) {
      alert(`Errore sincronizzazione banca: ${decodeURIComponent(errorMsg)}`);
      // clean url
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (code) {
      handleCompleteBankSync(code);
    }
  }, []);

  // Resolve active connections (combining real accounts in sqlite and simulated demo ones)
  const connections = React.useMemo(() => {
    const realList: BankSyncConnection[] = [];
    const bankNamesSeen = new Set<string>();

    for (const acc of accounts) {
      if (acc.id.startsWith("bank-acc-")) {
        let bankName = "Banca Open Banking";
        let logo = "🏦";
        if (acc.name.includes("Banco BPM") || acc.name.includes("BPM")) {
          bankName = "Banco BPM";
          logo = "🏢";
        } else if (acc.name.includes("BBVA")) {
          bankName = "BBVA Italia";
          logo = "📱";
        } else if (acc.name.includes("UniCredit")) {
          bankName = "UniCredit Spa";
          logo = "🏦";
        } else if (acc.name.includes("Intesa")) {
          bankName = "Intesa Sanpaolo";
          logo = "🦁";
        } else if (acc.name.includes("Fineco")) {
          bankName = "Fineco Bank";
          logo = "📈";
        } else if (acc.name.includes("Revolut")) {
          bankName = "Revolut";
          logo = "💳";
        }

        if (!bankNamesSeen.has(bankName)) {
          bankNamesSeen.add(bankName);
          realList.push({
            id: acc.id,
            bankName,
            logo,
            status: 'connected',
            lastSynced: 'Sincronizzato'
          });
        }
      }
    }
    // Only return demoConnections if we are in demo mode
    return isDemoMode ? [...realList, ...demoConnections] : realList;
  }, [accounts, demoConnections, isDemoMode]);

  // --- SMART INTERACTIVE WIZARD STATES ---
  const [wizardActive, setWizardActive] = useState(false);
  const [wizardStep, setWizardStep] = useState<'accounts' | 'categories' | 'preview'>('accounts');
  const [wizardRows, setWizardRows] = useState<ParsedWizardRow[]>([]);
  const [detectedRawAccounts, setDetectedRawAccounts] = useState<string[]>([]);
  const [accountMappings, setAccountMappings] = useState<{[key: string]: string}>({});

  // Recalculate and update the matched target account on all rows reactively whenever mappings or accounts list changes
  React.useEffect(() => {
    if (wizardActive && wizardRows.length > 0) {
      setWizardRows(prev => prev.map(row => {
        const mappedId = accountMappings[row.rawAccountName] || accounts[0]?.id || '';
        const destMappedId = row.rawDestinationAccountName 
          ? (accountMappings[row.rawDestinationAccountName] || accounts[1]?.id || accounts[0]?.id || '')
          : undefined;
        
        if (row.matchedAccountId !== mappedId || row.destinationAccountId !== destMappedId) {
          return { ...row, matchedAccountId: mappedId, destinationAccountId: destMappedId };
        }
        return row;
      }));
    }
  }, [accountMappings, accounts, wizardActive]);

  // Dynamically auto-update accountMappings if a new account is added that matches a raw name
  React.useEffect(() => {
    if (wizardActive && detectedRawAccounts.length > 0) {
      setAccountMappings(prev => {
        const updated = { ...prev };
        let changed = false;
        
        detectedRawAccounts.forEach(rawName => {
          const currentMappedId = prev[rawName];
          // If unmapped or mapped to first fallback account, or doesn't exist
          const isInvalid = !currentMappedId || !accounts.some(a => a.id === currentMappedId);
          const isFirstFallback = currentMappedId === accounts[0]?.id;
          
          if (isInvalid || isFirstFallback) {
            const matchedAcc = accounts.find(a => 
              a.name.toLowerCase().includes(rawName.toLowerCase()) || 
              rawName.toLowerCase().includes(a.name.toLowerCase()) ||
              (a.iban && a.iban.toLowerCase().includes(rawName.toLowerCase()))
            );
            if (matchedAcc && matchedAcc.id !== currentMappedId) {
              updated[rawName] = matchedAcc.id;
              changed = true;
            }
          }
        });
        
        return changed ? updated : prev;
      });
    }
  }, [accounts, detectedRawAccounts, wizardActive]);
  
  // Custom Account Creation Inline during Step 1
  const [showNewAccountForm, setShowNewAccountForm] = useState(false);
  const [newAccName, setNewAccName] = useState('');
  const [newAccType, setNewAccType] = useState<AccountType>('checking');
  const [newAccScope, setNewAccScope] = useState<AccountScope>('mixed');
  const [newAccBalance, setNewAccBalance] = useState('0');

  // Load custom user rules from rules prop or localStorage for category auto-mapping
  const getRulesList = () => {
    if (rules && rules.length > 0) {
      return rules;
    }
    try {
      return JSON.parse(localStorage.getItem('contosmart_rules') || '[]');
    } catch {
      return [];
    }
  };

  // Safe manual CSV Parsing supporting quotes and commas/semicolons
  const parseSmartCSV = (text: string): { headers: string[], rows: {[key: string]: string}[] } => {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) return { headers: [], rows: [] };

    const firstLine = lines[0];
    let separator = ',';
    if (firstLine.includes(';')) separator = ';';
    else if (firstLine.includes('\t')) separator = '\t';

    const splitLine = (line: string) => {
      const result = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === separator && !inQuotes) {
          result.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      result.push(current.trim());
      return result;
    };

    const headers = splitLine(lines[0]).map(h => h.replace(/^"|"$/g, '').trim());
    const parsedRows = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = splitLine(lines[i]);
      const rowObj: {[key: string]: string} = {};
      headers.forEach((header, idx) => {
        rowObj[header] = cols[idx]?.replace(/^"|"$/g, '').trim() || '';
      });
      parsedRows.push(rowObj);
    }

    return { headers, rows: parsedRows };
  };

  // Convert raw values into a cohesive formatted date string (YYYY-MM-DD)
  const parseFlexibleDate = (raw: string): string => {
    if (!raw) return new Date().toISOString().split('T')[0];
    const cleaned = raw.replace(/"/g, '').trim();
    
    // Pattern YYYY-MM-DD (possibly followed by space or T and time/timezone)
    const ymdMatch = cleaned.match(/^(\d{4})[-/.](\d{2})[-/.](\d{2})/);
    if (ymdMatch) {
      return `${ymdMatch[1]}-${ymdMatch[2]}-${ymdMatch[3]}`;
    }

    // Pattern DD-MM-YYYY or DD/MM/YYYY or DD.MM.YYYY (possibly followed by space or T and time)
    const dmyMatch = cleaned.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
    if (dmyMatch) {
      let day = dmyMatch[1];
      let month = dmyMatch[2];
      let year = dmyMatch[3];
      if (day.length === 1) day = '0' + day;
      if (month.length === 1) month = '0' + month;
      if (year.length === 2) year = '20' + year;
      return `${year}-${month}-${day}`;
    }
    
    return cleaned;
  };

  // Main entry function to start Wizard with a string (either clipboard paste or CSV file read)
  const startSmartImportWizard = (rawText: string, tempRulesOverridden?: AutoRule[], targetStep: 'accounts' | 'categories' = 'accounts') => {
    if (!rawText.trim()) {
      alert("Il testo CSV inserito è vuoto!");
      return;
    }

    const { headers, rows } = parseSmartCSV(rawText);
    if (rows.length === 0) {
      alert("Nessuna riga valida trovata nel file CSV.");
      return;
    }

    // Try to guess key columns based on header keywords
    let dateCol = '';
    let descCol = '';
    let amountCol = '';
    let accountCol = '';
    let catCol = '';
    let subCol = '';
    let typeCol = '';
    let transferCol = '';
    let payeeCol = '';
    let noteCol = '';

    headers.forEach(h => {
      const hLower = h.toLowerCase().trim();
      if (hLower.includes('dat') || hLower.includes('date') || hLower.includes('giorno')) dateCol = h;
      else if (hLower.includes('desc') || hLower.includes('caus') || hLower.includes('dett') || hLower.includes('benef') || hLower.includes('movim') || hLower.includes('info')) descCol = h;
      else if (hLower.includes('imp') || hLower.includes('val') || hLower.includes('amm') || hLower.includes('amou') || hLower.includes('cifr') || hLower.includes('sold') || hLower.includes('spesa')) amountCol = h;
      else if (hLower.includes('cont') || hLower.includes('banc') || hLower.includes('istit') || hLower.includes('iban') || hLower.includes('acc')) accountCol = h;
      else if (hLower.includes('macro') || (hLower.includes('cat') && !hLower.includes('sotto'))) catCol = h;
      else if (hLower.includes('sotto') || hLower.includes('sub')) subCol = h;
      else if (hLower.includes('tipo') || hLower.includes('type') || hLower.includes('operaz') || hLower.includes('direzio') || hLower.includes('segno') || hLower.includes('entrata_uscita') || hLower.includes('causale_tipo')) typeCol = h;

      if (hLower === 'transfer' || hLower === 'giroconto' || hLower.includes('is_transfer') || hLower.includes('transfer')) transferCol = h;
      if (hLower === 'payee' || hLower === 'destinatario' || hLower.includes('payee') || hLower.includes('benefic')) payeeCol = h;
      if (hLower === 'note' || hLower.includes('note') || hLower === 'causale' || hLower.includes('memo')) noteCol = h;
    });

    // Fallback description match using note or payee
    if (!descCol) {
      const fallbackDescCol = headers.find(h => {
        const hLower = h.toLowerCase();
        return hLower === 'note' || hLower === 'payee' || hLower.includes('note') || hLower.includes('payee') || hLower.includes('dettaglio') || hLower.includes('causale');
      });
      if (fallbackDescCol) descCol = fallbackDescCol;
    }

    // Smart type column auto-detector: scan down rows if headers didn't match immediately
    if (!typeCol && rows.length > 0) {
      for (const h of headers) {
        let matchCount = 0;
        const totalToSample = Math.min(rows.length, 15);
        for (let s = 0; s < totalToSample; s++) {
          const val = (rows[s][h] || '').toLowerCase().trim().replace(/["']/g, '');
          if (
            val === 'uscita' || val === 'entrata' || val === 'trasferimento' ||
            val === 'giroconto' || val === 'spesa' || val === 'ricavo' ||
            val === 'addebito' || val === 'accredito' ||
            val === 'out' || val === 'in' || val === 'transfer' ||
            val === 'debit' || val === 'credit'
          ) {
            matchCount++;
          }
        }
        if (matchCount >= 2 || (rows.length === 1 && matchCount === 1)) {
          typeCol = h;
          break;
        }
      }
    }

    // Ask fallbacks if headers are missing
    const finalDateCol = dateCol || headers[0];
    const finalDescCol = descCol || headers[1] || headers[0];
    const finalAmountCol = amountCol || headers[2] || headers[0];

    // Find and map accounts
    const uniqueRawAccs: string[] = [];
    rows.forEach(r => {
      const val = accountCol ? r[accountCol]?.trim() : '';
      if (val && !uniqueRawAccs.includes(val)) {
        uniqueRawAccs.push(val);
      }

      // Check for transfer payee
      const transferValStr = transferCol ? (r[transferCol] || '').toLowerCase().trim() : '';
      const isTransfer = transferValStr === 'true' || transferValStr === '1' || transferValStr === 'si' || transferValStr === 'sì' || transferValStr === 'yes';
      const noteStr = noteCol ? (r[noteCol] || '').trim() : '';
      let payeeStr = payeeCol ? (r[payeeCol] || '').trim() : '';

      if (isTransfer && !payeeStr && noteStr.toUpperCase().includes('RIMBORSO FINANZ. - MUTUO')) {
        if (isFinancingOrCreditCard(val)) {
          const checking = getPrimaryCheckingAccountIdAndName();
          payeeStr = checking.name;
        } else {
          payeeStr = 'MUTUO LAVORO';
        }
      }

      if (isTransfer && payeeStr && !uniqueRawAccs.includes(payeeStr)) {
        uniqueRawAccs.push(payeeStr);
      }
    });

    // If no bank accounts found in columns, simulate one single generic fallback
    if (uniqueRawAccs.length === 0) {
      uniqueRawAccs.push("Account Principale");
    }

    setDetectedRawAccounts(uniqueRawAccs);

    // Build the initial auto-match for discovered accounts
    const initialMappings: {[key: string]: string} = {};
    uniqueRawAccs.forEach(rawName => {
      // Find matching bank by containing name strings
      const match = accounts.find(a => 
        a.name.toLowerCase().includes(rawName.toLowerCase()) || 
        rawName.toLowerCase().includes(a.name.toLowerCase()) ||
        a.iban?.toLowerCase().includes(rawName.toLowerCase())
      );
      if (match) {
        initialMappings[rawName] = match.id;
      } else {
        // Correct fallback: leave it empty so the user can easily see it is unmatched and trigger the auto-create action
        initialMappings[rawName] = '';
      }
    });
    setAccountMappings(initialMappings);

    // Extract user custom rules and previous transactions to perform automatic classification
    const customRules = tempRulesOverridden || getRulesList();

    const parsedRows: ParsedWizardRow[] = [];

    // Helper to parse decimal values with both comma and dot formats robustly
    const parseAmountVal = (rawStr: string): number => {
      if (!rawStr) return 0;
      let cleaned = rawStr.trim();
      // Keep only numeric characters plus punctuation details
      cleaned = cleaned.replace(/[^\d.,-]/g, '');
      const hasDot = cleaned.includes('.');
      const hasComma = cleaned.includes(',');
      if (hasDot && hasComma) {
        // 1.250,50 format or similar
        if (cleaned.indexOf('.') < cleaned.indexOf(',')) {
          cleaned = cleaned.replace(/\./g, '').replace(',', '.');
        } else {
          // US format structure e.g. 1,250.50
          cleaned = cleaned.replace(/,/g, '');
        }
      } else if (hasComma) {
        // Simple comma decimal separator
        cleaned = cleaned.replace(',', '.');
      }
      return parseFloat(cleaned) || 0;
    };

    // First, compile temporary representation of all rows
    const tempRows: {
      index: number;
      dateVal: string;
      descVal: string;
      amtVal: number;
      rawBankMark: string;
      isTransfer: boolean;
      hasExplicitNoTransfer: boolean;
      isCardOrWithdrawal: boolean;
      payeeStr: string;
      r: any;
    }[] = [];

    rows.forEach((r, i) => {
      const dateVal = parseFlexibleDate(r[finalDateCol] || '');
      const descVal = r[finalDescCol] || 'Transazione Importata';
      let amtVal = parseAmountVal(r[finalAmountCol] || '0');
      const rawBankMark = accountCol ? (r[accountCol]?.trim() || "Account Principale") : "Account Principale";

      // Extract raw values for transfer evaluation
      const transferValStr = transferCol ? (r[transferCol] || '').toLowerCase().trim() : '';
      let isTransferRow = transferValStr === 'true' || transferValStr === '1' || transferValStr === 'si' || transferValStr === 'sì' || transferValStr === 'yes';
      const hasExplicitNoTransfer = transferCol && (transferValStr === 'false' || transferValStr === '0' || transferValStr === 'no');
      const noteStr = noteCol ? (r[noteCol] || '').trim() : '';
      let payeeStr = payeeCol ? (r[payeeCol] || '').trim() : '';

      // Check for POS, Card payments or ATM cash withdrawals in description / notes / payee
      const combinedUpper = `${descVal} ${noteStr} ${payeeStr}`.toUpperCase();
      const isCardOrWithdrawal = 
        combinedUpper.includes('PREL.BANCOMAT') ||
        combinedUpper.includes('PRELIEVO') ||
        combinedUpper.includes('PAGOBANCOMAT') ||
        combinedUpper.includes('SPESA PAGOBANCOMAT') ||
        combinedUpper.includes('PAGO CON TARJETA') ||
        combinedUpper.includes('CARTA*') ||
        combinedUpper.includes('CRV*') ||
        combinedUpper.includes('CARTA ') ||
        combinedUpper.includes('TARJETA') ||
        combinedUpper.includes('COMPRAS A DISTANCIA') ||
        combinedUpper.includes('COMMISSIONE') ||
        combinedUpper.includes('ADDEBITO DIRETTO SDD') ||
        (combinedUpper.includes('ADDEBITO DIRETTO') && !combinedUpper.includes('SATISPAY'));

      if (isCardOrWithdrawal) {
        isTransferRow = false;
      }

      // Check specific note override
      if (isTransferRow && !payeeStr && noteStr.toUpperCase().includes('RIMBORSO FINANZ. - MUTUO')) {
        if (isFinancingOrCreditCard(rawBankMark)) {
          const checking = getPrimaryCheckingAccountIdAndName();
          payeeStr = checking.name;
        } else {
          payeeStr = 'MUTUO LAVORO';
        }
      }

      const getInitialDirectionOfRow = (rowObj: any): 'income' | 'expense' => {
        const checkTypeWord = (val: string): 'income' | 'expense' | null => {
          const v = val.toLowerCase().trim().replace(/["']/g, '');
          if (
            v.startsWith('uscita') || v.startsWith('spesa') || v.startsWith('addebito') || 
            v.includes('addebito') || v.includes('spesa') || v.includes('pagamento') || v.includes('commissione') || v.includes('acquisto') ||
            v === 'expense' || v === 'out' || v === 'debit' || v === 'u' || v === 'd'
          ) return 'expense';
          if (
            v.startsWith('entrata') || v.startsWith('ricavo') || v.startsWith('accredito') || 
            v.includes('accredito') || v.includes('ricevuto') || v.includes('bonifico entrata') || v.includes('stipendio') ||
            v === 'income' || v === 'in' || v === 'credit' || v === 'e' || v === 'c'
          ) return 'income';
          return null;
        };

        if (typeCol && rowObj[typeCol]) {
          const detected = checkTypeWord(rowObj[typeCol]);
          if (detected) return detected;
        }

        for (const key of Object.keys(rowObj)) {
          const val = rowObj[key];
          if (val) {
            const detected = checkTypeWord(val);
            if (detected) return detected;
          }
        }

        return amtVal >= 0 ? 'income' : 'expense';
      };

      const rawDirection = getInitialDirectionOfRow(r);
      if (rawDirection === 'expense') {
        amtVal = -Math.abs(amtVal);
      } else {
        amtVal = Math.abs(amtVal);
      }

      tempRows.push({
        index: i,
        dateVal,
        descVal,
        amtVal,
        rawBankMark,
        isTransfer: isTransferRow,
        hasExplicitNoTransfer: !!hasExplicitNoTransfer,
        isCardOrWithdrawal: !!isCardOrWithdrawal,
        payeeStr,
        r
      });
    });

    // Match opposing debit/credit pairs with the exact same date and amount magnitude across different bank accounts
    const matchedIndices = new Set<number>();

    for (let u = 0; u < tempRows.length; u++) {
      if (matchedIndices.has(u)) continue;

      const rowA = tempRows[u];

      let foundPairIdx = -1;
      for (let v = u + 1; v < tempRows.length; v++) {
        if (matchedIndices.has(v)) continue;

        const rowB = tempRows[v];
        
        // Calculate date difference in days
        const dA = new Date(rowA.dateVal);
        const dB = new Date(rowB.dateVal);
        let daysDiff = 999;
        if (!isNaN(dA.getTime()) && !isNaN(dB.getTime())) {
          daysDiff = Math.abs(dB.getTime() - dA.getTime()) / (1000 * 60 * 60 * 24);
        }

        const oppositeSigns = (rowA.amtVal < 0 && rowB.amtVal > 0) || (rowA.amtVal > 0 && rowB.amtVal < 0);
        const neitherIsExplicitNoTransfer = !rowA.hasExplicitNoTransfer && !rowB.hasExplicitNoTransfer;
        const neitherIsCardOrWithdrawal = !rowA.isCardOrWithdrawal && !rowB.isCardOrWithdrawal;

        if (
          daysDiff <= 3 &&
          Math.abs(rowA.amtVal) === Math.abs(rowB.amtVal) &&
          rowA.amtVal !== 0 &&
          rowA.rawBankMark !== rowB.rawBankMark &&
          oppositeSigns &&
          neitherIsExplicitNoTransfer &&
          neitherIsCardOrWithdrawal
        ) {
          foundPairIdx = v;
          break;
        }
      }

      if (foundPairIdx !== -1) {
        const rowB = tempRows[foundPairIdx];
        matchedIndices.add(u);
        matchedIndices.add(foundPairIdx);

        // Source = debit (negative checking account), Destination = credit (positive financing or second leg)
        let debitRow = rowA;
        let creditRow = rowB;

        if (rowA.amtVal < 0 && rowB.amtVal > 0) {
          debitRow = rowA;
          creditRow = rowB;
        } else if (rowA.amtVal > 0 && rowB.amtVal < 0) {
          debitRow = rowB;
          creditRow = rowA;
        } else {
          // Both have same sign
          const isAFin = isFinancingOrCreditCard(rowA.rawBankMark);
          const isBFin = isFinancingOrCreditCard(rowB.rawBankMark);
          if (isBFin && !isAFin) {
            debitRow = rowA;
            creditRow = rowB;
          } else if (isAFin && !isBFin) {
            debitRow = rowB;
            creditRow = rowA;
          } else {
            // Default fallback
            debitRow = rowA;
            creditRow = rowB;
          }
        }

        // Generate clean double-entry description
        const unifiedDescription = `Giroconto da ${debitRow.rawBankMark} a ${creditRow.rawBankMark}: ${debitRow.descVal}`;

        const getCategorizationInfo = (tVal: 'income' | 'expense' | 'transfer', desc: string) => {
          let mappedScope: 'personal' | 'professional' = 'personal';
          let mappedCat: PersonalCategory | ProfessionalCategory = 'trasferimento';
          let mappedSub = 'Giroconto';
          let matchType: 'rule' | 'past' | 'default' | 'user' = 'default';

          const ruleMatch = customRules.find((ru: any) => 
            desc.toUpperCase().includes(ru.keyword.toUpperCase())
          );

          if (ruleMatch) {
            mappedScope = ruleMatch.scope;
            mappedCat = ruleMatch.category;
            mappedSub = ruleMatch.subcategory;
            matchType = 'rule';
          } else {
            const historicalMatch = transactions.find(t => 
              t.description.toUpperCase() === desc.toUpperCase()
            );
            if (historicalMatch) {
              mappedScope = historicalMatch.scope;
              mappedCat = historicalMatch.category;
              mappedSub = historicalMatch.subcategory;
              matchType = 'past';
            } else {
              const fallbackMatches = applyLocalRules(desc, []);
              if (fallbackMatches) {
                mappedScope = fallbackMatches.scope;
                mappedCat = fallbackMatches.category as any;
                mappedSub = fallbackMatches.subcategory;
                matchType = 'rule';
              }
            }
          }

          if (mappedCat !== 'trasferimento') {
            mappedScope = 'personal';
            mappedCat = 'trasferimento';
            mappedSub = 'Giroconto';
          }

          return { mappedScope, mappedCat, mappedSub, matchType };
        };

        const { mappedScope, mappedCat, mappedSub } = getCategorizationInfo('transfer', debitRow.descVal);

        parsedRows.push({
          id: `wiz-row-unified-${Date.now()}-${debitRow.index}-${creditRow.index}-${Math.random()}`,
          date: debitRow.dateVal,
          description: unifiedDescription,
          amount: -Math.abs(debitRow.amtVal), // Always negative outflow of the transferred amount magnitude from Source
          type: 'transfer',
          rawAccountName: debitRow.rawBankMark,
          matchedAccountId: initialMappings[debitRow.rawBankMark] || '',
          rawDestinationAccountName: creditRow.rawBankMark,
          destinationAccountId: initialMappings[creditRow.rawBankMark] || '',
          scope: mappedScope,
          category: mappedCat,
          subcategory: mappedSub,
          matchType: 'user',
          selected: true,
          isApproved: true,
          saveAsRule: false
        });
      }
    }

    // Process remaining unmatched rows
    for (let u = 0; u < tempRows.length; u++) {
      if (matchedIndices.has(u)) continue;

      const row = tempRows[u];
      const isTransfer = row.isTransfer;
      const payeeStr = row.payeeStr;
      const i = row.index;
      const r = row.r;
      const dateVal = row.dateVal;
      const descVal = row.descVal;
      const amtVal = row.amtVal;
      const rawBankMark = row.rawBankMark;
      const noteStr = noteCol ? (r[noteCol] || '').trim() : '';

      const getCategorizationInfo = (tVal: 'income' | 'expense' | 'transfer') => {
        let mappedScope: 'personal' | 'professional' = tVal === 'income' ? 'professional' : 'personal';
        let mappedCat: PersonalCategory | ProfessionalCategory = tVal === 'income' ? 'entrate_lavoro' : 'necessarie';
        
        if (tVal === 'transfer') {
          mappedScope = 'personal';
          mappedCat = 'trasferimento';
        }

        let mappedSub = tVal === 'transfer' ? 'Giroconto' : 'Altro';
        let matchType: 'rule' | 'past' | 'default' | 'user' = 'default';

        // 1. Check custom user rules
        const ruleMatch = customRules.find((ru: any) => 
          descVal.toUpperCase().includes(ru.keyword.toUpperCase())
        );

        if (ruleMatch) {
          mappedScope = ruleMatch.scope;
          mappedCat = ruleMatch.category;
          mappedSub = ruleMatch.subcategory;
          matchType = 'rule';
        } else {
          // 2. See if there is a similar transaction in past records
          const historicalMatch = transactions.find(t => 
            t.description.toUpperCase() === descVal.toUpperCase()
          );
          if (historicalMatch) {
            mappedScope = historicalMatch.scope;
            mappedCat = historicalMatch.category;
            mappedSub = historicalMatch.subcategory;
            matchType = 'past';
          } else {
            // 3. Fallback to hardcoded keywords helper
            const fallbackMatches = applyLocalRules(descVal, []);
            if (fallbackMatches) {
              mappedScope = fallbackMatches.scope;
              mappedCat = fallbackMatches.category as any;
              mappedSub = fallbackMatches.subcategory;
              matchType = 'rule';
            }
          }
        }

        // Explicit TRANSFER categorization override
        if (tVal === 'transfer') {
          mappedScope = 'personal';
          mappedCat = 'trasferimento';
          mappedSub = 'Giroconto';
        }

        // If category and subcategory are explicitly passed in the CSV, match them as User/Excel config
        if (catCol && r[catCol]) {
          const fileCat = r[catCol].toLowerCase();
          
          if (fileCat.includes('energia') || fileCat.includes('utenze') || fileCat.includes('bollett') || fileCat.includes('luce') || fileCat.includes('gas')) {
            mappedScope = 'personal';
            mappedCat = 'necessarie';
            mappedSub = 'Utenze';
          } else if (fileCat.includes('alimentar') || fileCat.includes('spesa') || fileCat.includes('supermercat') || fileCat.includes('cibo')) {
            mappedScope = 'personal';
            mappedCat = 'necessarie';
            mappedSub = 'Alimentari';
          } else if (fileCat.includes('casa') || fileCat.includes('giardino') || fileCat.includes('arredament') || fileCat.includes('deghi')) {
            mappedScope = 'personal';
            mappedCat = 'necessarie';
            mappedSub = 'Casa & Giardino';
          } else if (fileCat.includes('internet') || fileCat.includes('telefono') || fileCat.includes('cellul') || fileCat.includes('fastweb') || fileCat.includes('hostinger')) {
            mappedScope = 'personal';
            mappedCat = 'necessarie';
            mappedSub = 'Utenze & Connettività';
          } else if (fileCat.includes('pellegrino') || fileCat.includes('lavoro') || fileCat.includes('cliente') || fileCat.includes('fattur') || fileCat.includes('professional')) {
            mappedScope = 'professional';
            mappedCat = tVal === 'income' ? 'entrate_lavoro' : 'necessarie_lavoro';
            mappedSub = tVal === 'income' ? 'Fattura Cliente' : 'Spese Professionali';
          } else if (fileCat.includes('trasferisci') || fileCat.includes('preleva') || fileCat.includes('giro')) {
            // Is it a withdrawal or payment?
            const combined = `${descVal} ${noteStr}`.toUpperCase();
            if (combined.includes('PREL.BANCOMAT') || combined.includes('PRELIEVO') || combined.includes('ATM')) {
              mappedScope = 'personal';
              mappedCat = 'necessarie';
              mappedSub = 'Prelevamento Contanti';
            } else if (combined.includes('SPESA') || combined.includes('PAGOBANCOMAT') || combined.includes('CARTA')) {
              mappedScope = 'personal';
              mappedCat = 'necessarie';
              mappedSub = 'Spesa Carte';
            } else {
              mappedScope = 'personal';
              mappedCat = 'trasferimento';
              mappedSub = 'Giroconto';
            }
          } else if (fileCat.includes('necessar') && fileCat.includes('lavor')) {
            mappedScope = 'professional';
            mappedCat = 'necessarie_lavoro';
            mappedSub = 'Necessarie Professionali';
          } else if (fileCat.includes('necessar')) {
            mappedScope = 'personal';
            mappedCat = 'necessarie';
            mappedSub = 'Spese Necessarie';
          } else if (fileCat.includes('util') && fileCat.includes('lavor')) {
            mappedScope = 'professional';
            mappedCat = 'utili_lavoro';
            mappedSub = 'Spese Utili';
          } else if (fileCat.includes('util')) {
            mappedScope = 'personal';
            mappedCat = 'utili';
            mappedSub = 'Spese Utili';
          } else if (fileCat.includes('tempo') || fileCat.includes('libero') || fileCat.includes('svago')) {
            mappedScope = 'personal';
            mappedCat = 'tempo_libero';
            mappedSub = 'Svago & Intrattenimento';
          } else if (fileCat.includes('entrat') && fileCat.includes('lavor')) {
            mappedScope = 'professional';
            mappedCat = 'entrate_lavoro';
            mappedSub = 'Fattura Cliente';
          } else if (fileCat.includes('entrat')) {
            mappedScope = 'personal';
            mappedCat = 'entrate';
            mappedSub = 'Altre Entrate';
          } else if (fileCat.includes('trasf') || fileCat.includes('giro')) {
            mappedScope = 'personal';
            mappedCat = 'trasferimento';
            mappedSub = 'Giroconto';
          } else {
            // Fallback
            mappedScope = tVal === 'income' ? 'professional' : 'personal';
            mappedCat = tVal === 'income' ? 'entrate_lavoro' : 'necessarie';
            mappedSub = r[catCol];
          }

          if (subCol && r[subCol]) {
            mappedSub = r[subCol];
          }
          matchType = 'user';
        }

        return { mappedScope, mappedCat, mappedSub, matchType };
      };

      const typeVal: 'income' | 'expense' | 'transfer' = isTransfer ? 'transfer' : (amtVal >= 0 ? 'income' : 'expense');

      // Process double-entry transfer legs vs standard direct banking operations
      if (isTransfer) {
        const sourceMappedId = initialMappings[rawBankMark] || '';
        const destMappedId = initialMappings[payeeStr] || '';
        const isSelfTransfer = payeeStr && (payeeStr === rawBankMark || sourceMappedId === destMappedId);

        if (!payeeStr || payeeStr === '' || isSelfTransfer) {
          // Single-leg transfer Outward or Inward (destination is external/unregistered)
          const { mappedScope, mappedCat, mappedSub, matchType } = getCategorizationInfo('transfer');
          parsedRows.push({
            id: `wiz-row-${Date.now()}-${i}-out-${Math.random()}`,
            date: dateVal,
            description: descVal,
            amount: amtVal, // Keeps the correctly computed positive/negative direction
            type: 'transfer',
            rawAccountName: rawBankMark,
            matchedAccountId: initialMappings[rawBankMark] || '',
            scope: mappedScope,
            category: mappedCat,
            subcategory: mappedSub,
            matchType,
            selected: true,
            isApproved: matchType !== 'default',
            saveAsRule: false
          });
        } else {
          // Dual-leg double entry transfer Leg A: Outflow from the source account
          const outCat = getCategorizationInfo('transfer');
          parsedRows.push({
            id: `wiz-row-${Date.now()}-${i}-out-pair-${Math.random()}`,
            date: dateVal,
            description: `${descVal} (Giroconto in Addebito)`,
            amount: -Math.abs(amtVal), // Always negative outflow
            type: 'transfer',
            rawAccountName: rawBankMark,
            matchedAccountId: initialMappings[rawBankMark] || '',
            scope: outCat.mappedScope,
            category: outCat.mappedCat,
            subcategory: outCat.mappedSub,
            matchType: outCat.matchType,
            selected: true,
            isApproved: outCat.matchType !== 'default',
            saveAsRule: false
          });

          // Dual-leg double entry transfer Leg B: Corresponding Inflow/Accredito on the destination account
          const inCat = getCategorizationInfo('transfer');
          parsedRows.push({
            id: `wiz-row-${Date.now()}-${i}-in-pair-${Math.random()}`,
            date: dateVal,
            description: `${descVal} (Giroconto in Accredito)`,
            amount: Math.abs(amtVal), // Always positive inflow
            type: 'transfer',
            rawAccountName: payeeStr,
            matchedAccountId: initialMappings[payeeStr] || '',
            scope: inCat.mappedScope,
            category: inCat.mappedCat,
            subcategory: inCat.mappedSub,
            matchType: inCat.matchType,
            selected: true,
            isApproved: inCat.matchType !== 'default',
            saveAsRule: false
          });
        }
      } else {
        // Standard normal transaction ("operazione diretta della banca" since transfer is false or none)
        const { mappedScope, mappedCat, mappedSub, matchType } = getCategorizationInfo(typeVal);
        
        // Correctly determine type based on the resolved category
        let finalType: 'income' | 'expense' | 'transfer' = typeVal;
        if (mappedCat === 'entrate' || mappedCat === 'entrate_lavoro') {
          finalType = 'income';
        } else if (mappedCat === 'trasferimento') {
          finalType = 'transfer';
        } else if (mappedCat === 'necessarie' || mappedCat === 'utili' || mappedCat === 'tempo_libero' || mappedCat === 'necessarie_lavoro' || mappedCat === 'utili_lavoro') {
          finalType = 'expense';
        }

        let finalAmt = amtVal;
        if (finalType === 'expense' && finalAmt > 0) {
          finalAmt = -finalAmt;
        } else if (finalType === 'income' && finalAmt < 0) {
          finalAmt = Math.abs(finalAmt);
        }

        parsedRows.push({
          id: `wiz-row-${Date.now()}-${i}-direct-${Math.random()}`,
          date: dateVal,
          description: descVal,
          amount: finalAmt,
          type: finalType,
          rawAccountName: rawBankMark,
          matchedAccountId: initialMappings[rawBankMark] || '',
          scope: mappedScope,
          category: mappedCat,
          subcategory: mappedSub,
          matchType,
          selected: true,
          isApproved: matchType !== 'default',
          saveAsRule: false
        });
      }
    }

    // Simple helper so that we always retrieve absolute numbers of the transferred amount
    function amtAmtExt(r: any, currentAmt: number) {
      return currentAmt !== 0 ? Math.abs(currentAmt) : 0;
    }

    // Dynamic duplicate verification: check each parsed row against existing database transactions
    parsedRows.forEach(row => {
      const isDuplicate = (transactions || []).some(t => {
        // Match day part only to handle different date-time subscales securely
        const sameDate = t.date.substring(0, 10) === row.date.substring(0, 10);
        // Match exact numeric absolute value and direction (magnitude check)
        const sameAmount = Math.abs(t.amount) === Math.abs(row.amount);
        
        // Match account IDs
        const sameAccount = t.accountId === row.matchedAccountId;
        
        // Fuzzy description matching to handle small layout changes
        const cleanT = t.description.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
        const cleanRow = row.description.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
        
        // Dual-leg indicators check also
        const isLegAMatch = cleanT === cleanRow || cleanT.includes(cleanRow) || cleanRow.includes(cleanT);
        
        return sameDate && sameAmount && sameAccount && isLegAMatch;
      });

      if (isDuplicate) {
        row.isDuplicate = true;
        row.selected = false; // Exclude from bulk import by default!
      }
    });

    setWizardRows(parsedRows);
    setWizardStep(targetStep);
    setWizardActive(true);
  };

  // Re-interprets and parses all csvText rows again applying newly learned rules
  const handleReinterpretRows = () => {
    // 1. Find all rows where saveAsRule is true
    const rowsToLearn = wizardRows.filter(row => row.saveAsRule && row.description.trim());
    if (rowsToLearn.length === 0) {
      alert("Nessuna riga modificata rilevata con l'opzione 'Memorizza regola per il futuro' attiva. Per addestrare l'AI, modifica l'ambito o la categoria di una riga.");
      return;
    }

    const currentRules = [...rules];
    try {
      const localRules = JSON.parse(localStorage.getItem('contosmart_rules') || '[]');
      localRules.forEach((lr: any) => {
        if (!currentRules.some(r => r.keyword.toLowerCase() === lr.keyword.toLowerCase())) {
          currentRules.push(lr);
        }
      });
    } catch (e) {
      console.error(e);
    }

    const newRulesAdded: AutoRule[] = [];
    rowsToLearn.forEach(row => {
      const kw = row.description.trim();
      const ruleExists = currentRules.some(
        r => r.keyword.toLowerCase() === kw.toLowerCase()
      );
      if (!ruleExists) {
        const newRule: AutoRule = {
          id: `rule-learned-${Date.now()}-${Math.random()}`,
          name: `Da CSV: ${kw}`,
          keyword: kw,
          scope: row.scope,
          category: row.category,
          subcategory: row.subcategory || 'Altro'
        };
        if (onAddRule) {
          onAddRule(newRule);
        }
        newRulesAdded.push(newRule);
        currentRules.push(newRule);
      }
    });

    // Write newly learned rules to localStorage to be instantly retrieveable
    try {
      const localRules = JSON.parse(localStorage.getItem('contosmart_rules') || '[]');
      newRulesAdded.forEach(nr => {
        if (!localRules.some((lr: any) => lr.keyword.toLowerCase() === nr.keyword.toLowerCase())) {
          localRules.push(nr);
        }
      });
      localStorage.setItem('contosmart_rules', JSON.stringify(localRules));
    } catch (e) {
      console.error("Errore salvataggio regole locale:", e);
    }

    // 2. Re-run startSmartImportWizard with the original csvText and the merged list of rules!
    startSmartImportWizard(csvText, currentRules, 'categories');

    setImportStatus(`Rilettura CSV eseguita con successo! Abbiamo appreso ${newRulesAdded.length} nuove regole di classificazione automatica.`);
    setTimeout(() => setImportStatus(null), 5000);
  };

  // Helper inside step 2 to suggest custom subcategories
  const getExistingSubcategoriesMatches = (cat: string) => {
    const fromTransactions = Array.from(new Set(
      transactions.filter(t => t.category === cat).map(t => t.subcategory)
    )).filter(Boolean);

    const standardMapping: {[key: string]: string[]} = {
      necessarie: ['Alimentari', 'Affitto Casa', 'Bollette Luce/Gas', 'Mutuo / Prestiti', 'Salute', 'Spostamenti'],
      utili: ['Abbonamenti', 'Arredamento', 'Manutenzione', 'Tecnologia', 'Vestiario'],
      tempo_libero: ['Sport & Wellness', 'Cinema & Libri', 'Vacanze', 'Ristorazione', 'Regali'],
      entrate: ['Stipendio', 'Rimborso Spese', 'Regalo Ricevuto', 'Rendita Attiva'],
      necessarie_lavoro: ['Commercialista', 'Tasse Sostitutive', 'Contributi INPS', 'Affitto Studio', 'Fattura Fornitore', 'Assicurazione prof.'],
      utili_lavoro: ['Software & Cloud', 'Formazione', 'Attrezzatura', 'Pubblicità', 'Viaggi Lavoro'],
      entrate_lavoro: ['Fattura Cliente', 'Ritenute d\'acconto', 'Royalty', 'Consulenza']
    };

    return Array.from(new Set([...(standardMapping[cat] || []), ...fromTransactions]));
  };

  // Inline Account Creation inside Wizard Step 1
  const handleCreateAccountInline = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAccName.trim()) {
      alert("Specifica un nome valido per il conto.");
      return;
    }

    const uniqueId = `acc-created-${Date.now()}`;
    const newAccountObject: Account = {
      id: uniqueId,
      name: newAccName,
      type: newAccType,
      scope: newAccScope,
      balance: parseFloat(newAccBalance) || 0
    };

    onAddAccount(newAccountObject);

    // Update the mapping directly for the selected custom raw account to match this new ID
    if (detectedRawAccounts.length > 0) {
      // Auto-assign it to the first unmapped or first available detected account
      const firstUnmapped = detectedRawAccounts.find(x => !accountMappings[x]);
      const keyToAssign = firstUnmapped || detectedRawAccounts[0];
      setAccountMappings(prev => ({
        ...prev,
        [keyToAssign]: uniqueId
      }));
    }

    // Reset inline form
    setNewAccName('');
    setNewAccBalance('0');
    setShowNewAccountForm(false);
    
    // Quick success toast message simulated
    setImportStatus(`Conto bancario "${newAccName}" aggiunto ed associato correttamente!`);
    setTimeout(() => setImportStatus(null), 3500);
  };

  // Automated batch creation for unmapped raw bank names found in CSV
  const handleAutoCreateMissingAccounts = () => {
    // Find raw names that don't map to a valid existing account AND either have no mapping or mapped to empty
    const unmappedRowsOfCsv = detectedRawAccounts.filter(rawName => {
      const mappedId = accountMappings[rawName];
      return !mappedId || !accounts.some(a => a.id === mappedId);
    });

    if (unmappedRowsOfCsv.length === 0) {
      alert("Tutti i conti rilevati sono già stati associati!");
      return;
    }

    let createdCount = 0;
    const newMappings: Record<string, string> = { ...accountMappings };

    unmappedRowsOfCsv.forEach(rawName => {
      const uniqueId = `acc-created-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      
      // Determine logical types based on row string
      let guessedType: AccountType = 'checking';
      let guessedScope: AccountScope = 'mixed';
      
      const slug = rawName.toUpperCase();
      if (slug.includes('CARTA') || slug.includes('CREDITO') || slug.includes('AMEX') || slug.includes('VISA') || slug.includes('MASTERCARD') || slug.includes('CARD')) {
        guessedType = 'credit_card';
      } else if (slug.includes('CONTANTI') || slug.includes('CASH') || slug.includes('TASCA') || slug.includes('LIQUIDITA')) {
        guessedType = 'cash';
        guessedScope = 'personal';
      } else if (slug.includes('MUTUO') || slug.includes('DEBITO') || slug.includes('PRESTITO') || slug.includes('FINANZ')) {
        guessedType = 'financing';
      }

      // Shorten name if extremely long
      let userFriendlyName = rawName;
      if (slug.includes('BANCO BPM PRIVATI')) {
        userFriendlyName = 'Banco BPM (YouWeb)';
      } else if (slug.includes('BBVA')) {
        userFriendlyName = 'Conto BBVA';
      } else if (slug.includes('UNICREDIT')) {
        userFriendlyName = 'UniCredit S.p.A.';
      } else if (slug.includes('SATISPAY')) {
        userFriendlyName = 'Satispay Europe';
      }

      const freshAccount: Account = {
        id: uniqueId,
        name: userFriendlyName,
        type: guessedType,
        scope: guessedScope,
        balance: 0, // Calculated logically on subsequent transfer/transaction processes
        isDemo: false
      };

      onAddAccount(freshAccount);
      newMappings[rawName] = uniqueId;
      createdCount++;
    });

    setAccountMappings(newMappings);
    setImportStatus(`Fatto! Creati e associati con successo ${createdCount} nuovi rapporti di conto corrente reali.`);
    setTimeout(() => setImportStatus(null), 5000);
  };

  // File drag-and-drop helpers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith('.csv') || file.type === 'text/csv')) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        if (text) {
          setCsvText(text);
          startSmartImportWizard(text);
        }
      };
      reader.readAsText(file);
    } else {
      alert("Formato non valido! Trascina esclusivamente file in formato .CSV");
    }
  };

  const handleManualUploadClick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        if (text) {
          setCsvText(text);
          startSmartImportWizard(text);
        }
      };
      reader.readAsText(file);
    }
  };

  // Submit parsed items to step 2 configuration
  const handleAdvanceToStep2 = () => {
    // Apply resolved accountMappings to all rows
    const updatedRows = wizardRows.map(row => {
      const mappedId = accountMappings[row.rawAccountName] || accounts[0]?.id || '';
      const matchedAcc = accounts.find(a => a.id === mappedId);
      let correctedAmount = row.amount;

      // Auto-correct transferring sign for financing/loan accounts to be positive (repayments)
      if (row.category === 'trasferimento' && matchedAcc && matchedAcc.type === 'financing') {
        correctedAmount = Math.abs(row.amount);
      }

      return {
        ...row,
        matchedAccountId: mappedId,
        amount: correctedAmount
      };
    });

    // Smart automatic pairing: match and merge equal-magnitude opposite flows on the same date across different mapped accounts into a single "Giroconto"
    const finalMergedRows: ParsedWizardRow[] = [];
    const mergedIndices = new Set<number>();

    for (let u = 0; u < updatedRows.length; u++) {
      if (mergedIndices.has(u)) continue;

      const rowA = updatedRows[u];

      let foundPairIdx = -1;
      for (let v = u + 1; v < updatedRows.length; v++) {
        if (mergedIndices.has(v)) continue;

        const rowB = updatedRows[v];
        if (
          rowA.date === rowB.date &&
          Math.abs(rowA.amount) === Math.abs(rowB.amount) &&
          rowA.amount !== 0 &&
          rowA.matchedAccountId !== rowB.matchedAccountId &&
          rowA.amount * rowB.amount < 0 // Opposite signs
        ) {
          foundPairIdx = v;
          break;
        }
      }

      if (foundPairIdx !== -1) {
        const rowB = updatedRows[foundPairIdx];
        mergedIndices.add(u);
        mergedIndices.add(foundPairIdx);

        // Sort out the Source (debit / outflow / negative) and Destination (credit / inflow / positive)
        const debitRow = rowA.amount < 0 ? rowA : rowB;
        const creditRow = rowA.amount > 0 ? rowA : rowB;

        const sourceAccName = accounts.find(a => a.id === debitRow.matchedAccountId)?.name || debitRow.rawAccountName;
        const destAccName = accounts.find(a => a.id === creditRow.matchedAccountId)?.name || creditRow.rawAccountName;

        const cleanDesc = debitRow.description;
        const unifiedDescription = cleanDesc.toUpperCase().includes('GIROCONTO') 
          ? cleanDesc 
          : `Giroconto da ${sourceAccName} a ${destAccName}: ${cleanDesc}`;

        finalMergedRows.push({
          id: `wiz-row-unified-advance-${Date.now()}-${debitRow.id}-${creditRow.id}`,
          date: debitRow.date,
          description: unifiedDescription,
          amount: -Math.abs(debitRow.amount), // Keep negative flow
          type: 'transfer',
          rawAccountName: debitRow.rawAccountName,
          matchedAccountId: debitRow.matchedAccountId,
          rawDestinationAccountName: creditRow.rawAccountName,
          destinationAccountId: creditRow.matchedAccountId,
          scope: debitRow.scope === 'professional' || creditRow.scope === 'professional' ? 'professional' : 'personal',
          category: 'trasferimento',
          subcategory: 'Giroconto',
          matchType: 'user',
          selected: debitRow.selected || creditRow.selected,
          isApproved: true,
          saveAsRule: false
        });
      } else {
        finalMergedRows.push(rowA);
      }
    }

    setWizardRows(finalMergedRows);
    setWizardStep('categories');
  };

  // Submit to Step 3 configuration
  const handleAdvanceToStep3 = () => {
    setWizardStep('preview');
  };

  // Apply final transaction batch loading
  const handleFinalWizardSubmit = () => {
    const selectedRows = wizardRows.filter(r => r.selected);
    if (selectedRows.length === 0) {
      alert("Nessun movimento selezionato per il caricamento finale.");
      return;
    }

    // "chiedi se ok" -> check if any selected transactions are not approved/confirmed yet
    const unapprovedRows = selectedRows.filter(r => !r.isApproved);
    if (unapprovedRows.length > 0) {
      const proceed = window.confirm(
        `Attenzione: ci sono ${unapprovedRows.length} transazioni pronte che non hai ancora approvato in modo esplicito (cliccando "Conferma").\n\nVuoi importarle tutte approvandole in blocco?`
      );
      if (!proceed) {
        return;
      }
    }

    // Dynamic Learning: "impara da quello che ti mostro"
    let learnedCount = 0;
    if (onAddRule) {
      selectedRows.forEach(row => {
        if (row.saveAsRule && row.description.trim()) {
          const kw = row.description.trim();
          // Check if a rule for this exact keyword already exists to avoid duplication
          const ruleExists = (rules || []).some(
            r => r.keyword.toLowerCase() === kw.toLowerCase()
          );
          if (!ruleExists) {
            onAddRule({
              id: `rule-learned-${Date.now()}-${Math.random()}`,
              name: `Appresa da Import: ${kw}`,
              keyword: kw,
              scope: row.scope,
              category: row.category,
              subcategory: row.subcategory
            });
            learnedCount++;
          }
        }
      });
    }

    selectedRows.forEach((row, index) => {
      const txToInsert: Transaction = {
        id: `tx-smart-imported-${Date.now()}-${index}-${Math.floor(Math.random() * 10000000)}`,
        date: row.date,
        description: row.description,
        amount: row.amount,
        type: row.type,
        accountId: row.matchedAccountId,
        destinationAccountId: row.destinationAccountId,
        scope: row.scope,
        category: row.category,
        subcategory: row.subcategory,
        isAutoMatched: row.matchType === 'rule' || row.matchType === 'past',
        isVerified: true // Auto verified since estratti conti imported are verified
      };
      onAddTransaction(txToInsert);
    });

    // Clear state
    setWizardActive(false);
    setWizardRows([]);
    setCsvText('');
    
    let successMessage = `Procedura guidata Smart completata! Caricati con successo ${selectedRows.length} movimenti bancari.`;
    if (learnedCount > 0) {
      successMessage += ` Il sistema ha memorizzato con successo ${learnedCount} nuove regole per i prossimi caricamenti!`;
    }
    setImportStatus(successMessage);
    setTimeout(() => setImportStatus(null), 7000);
  };

  // Export CSV
  const handleTriggerExport = () => {
    const csvContent = exportToCSV(transactions, accounts);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `EstrattoConto_Ripartito_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Handle traditional basic manual paste imports (fallback)
  const handleTriggerImport = (e: React.FormEvent) => {
    e.preventDefault();
    if (!csvText.trim()) {
      setImportStatus('Inserisci o incolla i dati CSV per procedere.');
      return;
    }
    // Launch smart wizard instead to guide through steps
    startSmartImportWizard(csvText);
  };

  // Real PSD2 & Mock Open Banking Connection handlers
  
  const handleSaveApiConfig = async () => {
    try {
      const response = await fetch('/api/bank/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: clientIdInput,
          keyId: keyIdInput,
          privateKey: privateKeyInput === "••••••••••••••••••••••••••••••••" ? undefined : privateKeyInput
        })
      });
      if (response.ok) {
        alert("Credenziali Open Banking salvate con successo sul database locale!");
        setShowApiConfig(false);
      } else {
        alert("Impossibile salvare le credenziali bancarie.");
      }
    } catch (err: any) {
      alert("Errore nel salvataggio: " + err.message);
    }
  };

  const handleInitiateBankConnection = async (bankId: string) => {
    setConnectingBankId(bankId);
    setIsConnecting(true);
    setStatusMsg("Inizializzazione della sessione crittografata PSD2 Open Banking...");

    try {
      // Resolve bank identifier (ASPSP Name) expected by Enable Banking
      let aspsp = 'mock-aspsp';
      if (bankId === 'bank-unicredit') aspsp = 'unicredit-it';
      else if (bankId === 'bank-bpm') aspsp = 'bancobpm-it';
      else if (bankId === 'bank-bbva') aspsp = 'bbva-it';
      else if (bankId === 'bank-sella') aspsp = 'sella-it';
      else if (bankId === 'bank-revolut') aspsp = 'revolut-it';
      else if (bankId === 'bank-intesa') aspsp = 'intesa-it';
      else if (bankId === 'bank-fineco') aspsp = 'fineco-it';

      const response = await fetch('/api/bank/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aspsp, isDemoMode: false })
      });

      const resData = await response.json();
      setIsConnecting(false);

      if (resData.requiresConfig) {
        setShowApiConfig(true);
        alert("Configura prima l'Application ID e la RSA Private Key di Enable Banking nelle impostazioni sottostanti.");
      } else if (resData.url) {
        // Redirect the top-level parent document if we are in an iframe
        if (window.top) {
          window.top.location.href = resData.url;
        } else {
          window.location.href = resData.url;
        }
      } else {
        // Fallback to local sandbox sim modal if credentials absent or error
        setShowConnectModal(true);
      }
    } catch (err: any) {
      console.error(err);
      setIsConnecting(false);
      // Fallback
      setShowConnectModal(true);
    }
  };

  const handleApproveBankConsent = () => {
    setShowConnectModal(false);
    setIsConnecting(true);
    setStatusMsg("Verifica credenziali crittografiche d'accesso e scaricamento consensi...");
    
    setTimeout(async () => {
      const selectedBank = SUPPORTED_BANKS.find(b => b.id === connectingBankId);
      if (selectedBank) {
        // 1. If we are currently synchronizing an existing account, do NOT create a new account!
        if (syncingAccountId) {
          try {
            const targetId = syncingAccountId;
            const existingAcc = accounts.find(a => a.id === targetId);

            // Seed simulated new transaction
            const mockTxObj = {
              id: `bank-tx-sim-sync-${Date.now()}`,
              date: new Date().toISOString().split('T')[0],
              description: `INCASSO SEPA SIMULATO - COMPENSANZA FLUSSO`,
              amount: 850.00,
              type: 'income',
              accountId: targetId,
              destinationAccountId: null,
              scope: 'professional',
              category: 'entrate_lavoro',
              subcategory: 'Fattura',
              isAutoMatched: 0,
              ruleId: null,
              isVerified: 1,
              isDemo: false,
              notes: "Allineato via PSD2 (Simulato)",
              customer: "Cliente Importato",
              invoiceId: null
            };

            await fetch('/api/transactions', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(mockTxObj)
            });

            if (existingAcc) {
              const updatedAccountObj = {
                ...existingAcc,
                balance: existingAcc.balance + 850.00,
                notes: `Sincronizzato automatico Sandbox il ${new Date().toLocaleDateString('it-IT')}`
              };
              await fetch(`/api/accounts/${targetId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updatedAccountObj)
              });
            }

            if (onRefreshDbState) {
              await onRefreshDbState();
            }

            setIsConnecting(false);
            setSyncedCountMsg(`Sincronizzazione completata con successo! Aggiornato saldo conto ed importati i nuovi movimenti.`);
            setTimeout(() => setSyncedCountMsg(null), 8500);
            setSyncingAccountId(null);
            return;
          } catch (e) {
            console.error("Synch simulation error:", e);
          }
        }

        // 2. Check if we already have an existing account for this bank in the database
        const dupAccount = accounts.find(a => {
          const nameUpper = a.name.toUpperCase();
          if (selectedBank.name === "Banco BPM" && (nameUpper.includes("BPM") || nameUpper.includes("YOUWEB"))) return true;
          if (selectedBank.name === "UniCredit S.p.A." && nameUpper.includes("UNICREDIT")) return true;
          if (selectedBank.name === "BBVA" && nameUpper.includes("BBVA")) return true;
          if (selectedBank.name === "Intesa Sanpaolo" && nameUpper.includes("INTESA")) return true;
          if (selectedBank.name === "Fineco" && nameUpper.includes("FINECO")) return true;
          if (selectedBank.name === "Revolut" && nameUpper.includes("REVOLUT")) return true;
          return false;
        });

        if (dupAccount) {
          // Open our interactive association modal that prompts the user where to assign this account!
          const simulatedUid = `mock-uid-${Date.now()}`;
          setRetrievedAccounts([
            {
              uid: simulatedUid,
              iban: dupAccount.iban || ('IT60M0542301000' + Math.floor(Math.random() * 1000000000000)),
              balance: 5420.50,
              name: `${selectedBank.name} - Simulato PSD2`,
              candidates: [
                {
                  id: dupAccount.id,
                  name: dupAccount.name,
                  iban: dupAccount.iban,
                  balance: dupAccount.balance
                }
              ]
            }
          ]);

          setAllExistingAccounts(accounts.map(e => ({
            id: e.id,
            name: e.name,
            iban: e.iban,
            balance: e.balance
          })));

          setSessionBankName(selectedBank.name);
          setActiveSessionId(`mock-session-${Date.now()}`);
          setActiveBankId(selectedBank.id);

          const initialAssociations: Record<string, string> = {};
          initialAssociations[simulatedUid] = dupAccount.id;
          setAccountAssociations(initialAssociations);

          setIsConnecting(false);
          setShowAssociationModal(true);
          return;
        }

        // 3. Otherwise proceed with standard creation of a fresh mock account
        try {
          const mockId = `bank-acc-mock-${Date.now()}`;
          const newAccountObj = {
            id: mockId,
            name: `${selectedBank.name} - Simulato PSD2`,
            type: 'checking' as const,
            scope: 'mixed' as const,
            balance: 5420.50,
            limit: null,
            iban: 'IT60M0542301000' + Math.floor(Math.random() * 1000000000000),
            notes: "Sincronizzato automatico sandbox",
            isDemo: false
          };

          const addAccountRes = await fetch('/api/accounts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newAccountObj)
          });

          if (addAccountRes.ok) {
            const mockTxObj = {
              id: `bank-tx-sim-${Date.now()}`,
              date: new Date().toISOString().split('T')[0],
              description: `BONIFICO SEPA CLIENTE INCASSO FATTURA N. 99`,
              amount: 850.00,
              type: 'income',
              accountId: mockId,
              destinationAccountId: null,
              scope: 'professional',
              category: 'entrate_lavoro',
              subcategory: 'Fattura',
              isAutoMatched: 0,
              ruleId: null,
              isVerified: 1,
              isDemo: false,
              notes: "Movimento di test",
              customer: "Cliente Importato",
              invoiceId: null
            };

            await fetch('/api/transactions', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(mockTxObj)
            });

            if (onRefreshDbState) {
              await onRefreshDbState();
            }
          }
        } catch (e) {
          console.error(e);
        }

        const newConn: BankSyncConnection = {
          id: `conn-${Date.now()}`,
          bankName: selectedBank.name,
          logo: selectedBank.logo,
          status: 'connected',
          lastSynced: 'In questo momento'
        };
        setDemoConnections([...demoConnections, newConn]);
      }
      setIsConnecting(false);
      setConsentApproved(true);
      setTimeout(() => setConsentApproved(false), 4000);
    }, 1500);
  };

  const handleCompleteBankSync = async (code: string) => {
    setIsConnecting(true);
    setStatusMsg("Analizzando la sessione con la banca e recuperando la lista dei conti PSD2...");

    // Remove code from the address bar
    window.history.replaceState({}, document.title, window.location.pathname);

    try {
      const response = await fetch('/api/bank/session-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code })
      });

      const resData = await response.json();
      setIsConnecting(false);

      if (response.ok && resData.success) {
        setRetrievedAccounts(resData.retrievedAccounts);
        setAllExistingAccounts(resData.allExistingAccounts);
        setSessionBankName(resData.bankDisplayName);
        setActiveSessionId(resData.sessionId);
        setActiveBankId(resData.bankId);

        // Initialize mapping dropdowns: if there is a strong candidate match, pre-select it!
        // Otherwise default to "new" (meaning create a new account catalog).
        const initialAssociations: Record<string, string> = {};
        for (const bAcc of resData.retrievedAccounts) {
          if (bAcc.candidates && bAcc.candidates.length > 0) {
            initialAssociations[bAcc.uid] = bAcc.candidates[0].id;
          } else {
            initialAssociations[bAcc.uid] = 'new';
          }
        }
        setAccountAssociations(initialAssociations);
        setShowAssociationModal(true);
      } else {
        alert(resData.error || "Impossibile recuperare i conti correnti della banca collegata.");
      }
    } catch (err: any) {
      console.error(err);
      setIsConnecting(false);
      alert("Errore Open Banking: " + err.message);
    }
  };

  const handleConfirmBankSyncAssociation = async () => {
    setIsConnecting(true);
    setStatusMsg("Registrazione o unione dei conti in corso e importazione movimenti correnti...");
    setShowAssociationModal(false);

    if (activeSessionId.startsWith("mock-session-")) {
      try {
        let accountsImported = 0;
        let transactionsImported = 0;

        for (const [simUid, targetAccountIdRaw] of Object.entries(accountAssociations)) {
          const targetAccountIdRawStr = targetAccountIdRaw as string;
          let accountId = `bank-acc-mock-${Date.now()}`;
          let isNew = true;

          if (targetAccountIdRawStr && targetAccountIdRawStr !== "new") {
            accountId = targetAccountIdRawStr;
            isNew = false;
          }

          if (isNew) {
            const newAccountObj = {
              id: accountId,
              name: sessionBankName + " - Simulato PSD2",
              type: 'checking' as const,
              scope: 'mixed' as const,
              balance: 5420.50,
              limit: null,
              iban: 'IT60M0542301000' + Math.floor(Math.random() * 1000000000000),
              notes: "Sincronizzato automatico sandbox",
              isDemo: false
            };
            await fetch('/api/accounts', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(newAccountObj)
            });
            accountsImported++;
          } else {
            const existing = accounts.find(a => a.id === accountId);
            if (existing) {
              const updatedAccountObj = {
                ...existing,
                balance: 5420.50,
                notes: `Allineato ed unito con simulazione Sandbox`
              };
              await fetch(`/api/accounts/${accountId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updatedAccountObj)
              });
              accountsImported++;
            }
          }

          const mockTxObj = {
            id: `bank-tx-sim-${Date.now()}-${accountId}`,
            date: new Date().toISOString().split('T')[0],
            description: `BONIFICO SEPA CLIENTE INCASSO FATTURA N. 99`,
            amount: 850.00,
            type: 'income',
            accountId: accountId,
            destinationAccountId: null,
            scope: 'professional',
            category: 'entrate_lavoro',
            subcategory: 'Fattura',
            isAutoMatched: 0,
            ruleId: null,
            isVerified: 1,
            isDemo: false,
            notes: "Movimento di test simulato",
            customer: "Cliente Importato",
            invoiceId: null
          };

          await fetch('/api/transactions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(mockTxObj)
          });
          transactionsImported++;
        }

        if (onRefreshDbState) {
          await onRefreshDbState();
        }

        setIsConnecting(false);
        setSyncedCountMsg(`Collegamento completato! Sincronizzata banca: ${sessionBankName}. Allineati e importati con successo ${accountsImported} conti correnti con ${transactionsImported} transazioni storiche.`);
        setTimeout(() => setSyncedCountMsg(null), 10000);
      } catch (err: any) {
        console.error(err);
        setIsConnecting(false);
        alert("Errore nell'allineamento dei conti simulati: " + err.message);
      }
      return;
    }

    try {
      const response = await fetch('/api/bank/confirm-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: activeSessionId,
          bankId: activeBankId,
          bankDisplayName: sessionBankName,
          associations: accountAssociations,
          isDemoMode: !isDemoMode // we synchronize with database mode (real or demo depending on toggle)
        })
      });

      const resData = await response.json();
      setIsConnecting(false);

      if (response.ok && resData.success) {
        if (onRefreshDbState) {
          await onRefreshDbState();
        }
        setSyncedCountMsg(`Collegamento completato! Sincronizzata banca: ${resData.bankName}. Allineati e importati con successo ${resData.accountsImported} conti correnti con ${resData.transactionsImported} transazioni storiche filtrate.`);
        setTimeout(() => setSyncedCountMsg(null), 10000);
      } else {
        alert(resData.error || "Impossibile memorizzare i conti selezionati.");
      }
    } catch (err: any) {
      console.error(err);
      setIsConnecting(false);
      alert("Errore nel completamento dell'importazione PSD2: " + err.message);
    }
  };

  const handleTriggerBankSync = async (connId: string) => {
    // If it's a real bank account connected in the SQLite DB, we let them re-auth to get latest transactions easily
    if (connId.startsWith("bank-acc-")) {
      const acc = accounts.find(a => a.id === connId);
      if (acc) {
        let bankId = 'bank-unicredit';
        if (acc.name.includes("BPM") || acc.name.includes("Banco BPM")) bankId = 'bank-bpm';
        else if (acc.name.includes("BBVA")) bankId = 'bank-bbva';
        else if (acc.name.includes("Intesa")) bankId = 'bank-intesa';
        else if (acc.name.includes("Fineco")) bankId = 'bank-fineco';
        else if (acc.name.includes("Revolut")) bankId = 'bank-revolut';

        // Keep track of which account is being synchronised!
        setSyncingAccountId(acc.id);

        await handleInitiateBankConnection(bankId);
      }
      return;
    }

    setIsConnecting(true);
    setStatusMsg("Sincronizzazione saldo e controllo movimenti in corso via API PSD2...");
    
    setTimeout(() => {
      const vendors = [
        { name: 'ESSELUNGA MILANO PORTA NUOVA', amount: -45.50, sub: 'Alimentari', scope: 'personal', cat: 'necessarie' },
        { name: 'FATTURA ENI PLENITUDE GAS & LUCE', amount: -112.40, sub: 'Utenze', scope: 'personal', cat: 'necessarie' },
        { name: 'INCASSO EMISSIONE BONIFICO CLIENTE ESTERO', amount: 1500, sub: 'Fattura', scope: 'professional', cat: 'entrate_lavoro' },
        { name: 'AMAZON WEB SERVICES CLOUD ACCUMULATE', amount: -38.20, sub: 'Software & Cloud', scope: 'professional', cat: 'utili_lavoro' },
        { name: 'CASA MADRE SRL - FATTURA N. 90', amount: 1250, sub: 'Fattura', scope: 'professional', cat: 'entrate_lavoro' }
      ];

      const now = new Date();
      const dateString = now.toISOString().split('T')[0];

      vendors.forEach(async (v, idx) => {
        const newTxObj = {
          id: `sim-sync-${Date.now()}-${idx}`,
          date: dateString,
          description: v.name,
          amount: v.amount,
          type: v.amount >= 0 ? 'income' : 'expense',
          accountId: targetAccountId || accounts[0]?.id || 'acc-1',
          destinationAccountId: null,
          scope: v.scope,
          category: v.cat,
          subcategory: v.sub,
          isAutoMatched: 1,
          ruleId: null,
          isVerified: 1,
          isDemo: false,
          notes: "Allineamento Sandbox",
          customer: v.scope === 'professional' && v.amount >= 0 ? "Cliente Importato" : null,
          invoiceId: null
        };

        try {
          await fetch('/api/transactions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newTxObj)
          });
        } catch (e) {
          console.error(e);
        }
      });

      if (onRefreshDbState) {
        onRefreshDbState();
      }

      setDemoConnections(prev => prev.map(c => c.id === connId ? { ...c, lastSynced: 'In questo momento' } : c));
      setIsConnecting(false);
      
      setSyncedCountMsg(`Sincronizzazione completata con successo! Caricati ${vendors.length} nuovi movimenti bancari nel tuo estratto conto.`);
      setTimeout(() => setSyncedCountMsg(null), 5000);
    }, 1500);
  };

  const handleDisconnectBank = async (connId: string) => {
    if (connId.startsWith("bank-acc-")) {
      if (confirm("Sei sicuro di voler scollegare questo conto corrente reale? Tutti i movimenti bancari associati a questa connessione verranno rimossi.")) {
        try {
          const res = await fetch(`/api/accounts/${connId}`, {
            method: 'DELETE'
          });
          if (res.ok) {
            if (onRefreshDbState) {
              await onRefreshDbState();
            }
          }
        } catch (err: any) {
          alert("Errore durante lo scollegamento: " + err.message);
        }
      }
    } else {
      setDemoConnections(prev => prev.filter(c => c.id !== connId));
    }
  };

  return (
    <div className="space-y-6" id="import-export-tab">
      
      {/* Intro Header */}
      {!wizardActive && (
        <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm">
          <h2 className="text-lg font-bold text-slate-805 flex items-center gap-2">
            <Link2 className="w-5 h-5 text-indigo-600 animate-pulse" />
            Importazione Programmata, Riconoscimento & Esportazione
          </h2>
          <p className="text-xs text-slate-505 mt-1.5 font-sans leading-relaxed">
            Gestisci in modo rapido i tuoi flussi estratti banca. La nuova procedura guidata permette di caricare file 
            <strong> .CSV tradotti</strong>, accoppiare automaticamente i conti bancari, proporre classificazioni intelligenti da regole e storici, 
            e creare all'occorrenza conti o nuove categorie/sottocategorie personalizzate.
          </p>
        </div>
      )}

      {/* Notifications block */}
      {importStatus && (
        <div className="bg-emerald-50 border border-emerald-100 text-emerald-700 p-4 rounded-xl text-xs flex items-center gap-2 font-semibold shadow-sm animate-fade-in">
          <CheckCircle className="w-4 h-4 text-emerald-600" />
          {importStatus}
        </div>
      )}
      {consentApproved && (
        <div className="bg-emerald-50 border border-emerald-100 text-emerald-700 p-4 rounded-xl text-xs flex items-center gap-2 font-semibold shadow-sm animate-fade-in">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          Connessione bancaria protetta Open Banking PSD2 avvenuta con successo!
        </div>
      )}
      {syncedCountMsg && (
        <div className="bg-emerald-50 border border-emerald-150 text-emerald-700 p-4 rounded-xl text-xs flex items-center gap-2 font-semibold shadow-sm animate-fade-in">
          <Zap className="w-4 h-4 text-amber-500 animate-bounce" />
          {syncedCountMsg}
        </div>
      )}

      {/* Synchronizing PSD2 indicator loader */}
      {isConnecting && (
        <div className="bg-slate-50 border border-slate-200 p-6 rounded-2xl flex items-center gap-4 shadow-xs animate-pulse">
          <RefreshCw className="w-5 h-5 text-indigo-600 animate-spin" />
          <span className="text-xs font-bold text-slate-700">{statusMsg}</span>
        </div>
      )}

      {/* ======================= CORES: SMART CSV WIZARD PANEL ======================= */}
      {wizardActive && (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-md animate-fade-in" id="smart-csv-wizard">
          {/* Wizard Header Banner */}
          <div className="p-5 bg-gradient-to-r from-indigo-900 to-slate-900 text-white flex justify-between items-center">
            <div className="space-y-1">
              <div className="inline-flex items-center gap-1.5 bg-indigo-500/20 text-indigo-300 font-bold px-2 py-0.5 rounded text-[10px] uppercase tracking-wider">
                <Sparkles className="w-3.5 h-3.5" /> Importazione Intelligente (Interactive Wizard)
              </div>
              <h3 className="text-md font-bold font-sans">Elaborazione Guidata Estratto Conto</h3>
            </div>
            <button 
              onClick={() => { 
                const showConfirm = (window as any).showCustomConfirm;
                if (showConfirm) {
                  showConfirm({
                    title: "Esci dal wizard",
                    message: "Sei sicuro di voler uscire dal wizard? Perderai i progressi temporanei.",
                    confirmText: "Esci dal Wizard",
                    variant: "warning",
                    onConfirm: () => setWizardActive(false)
                  });
                } else if (confirm("Sei sicuro di voler uscire dal wizard? Perderai i progressi temporanei.")) {
                  setWizardActive(false);
                }
              }}
              className="px-3 py-1.5 text-xs bg-white/10 hover:bg-white/20 text-white rounded-lg transition font-bold"
            >
              Annulla Wizard
            </button>
          </div>

          {/* Stepper progress bar */}
          <div className="border-b border-slate-100 bg-slate-50 py-3.5 px-6 flex items-center justify-between text-xs font-bold text-slate-500 overflow-x-auto">
            <div className="flex items-center gap-2 max-w-full shrink-0">
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${wizardStep === 'accounts' ? 'bg-indigo-600 text-white' : 'bg-emerald-600 text-white'}`}>
                {wizardStep === 'accounts' ? '1' : <Check className="w-3 h-3" />}
              </span>
              <span className={wizardStep === 'accounts' ? 'text-indigo-600 font-extrabold' : 'text-slate-500'}>Andamento Conti bancari</span>
              <ChevronRight className="w-4 h-4 text-slate-350" />
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${
                wizardStep === 'categories' ? 'bg-indigo-600 text-white' : 
                wizardStep === 'preview' ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-400'
              }`}>
                {wizardStep === 'preview' ? <Check className="w-3 h-3" /> : '2'}
              </span>
              <span className={wizardStep === 'categories' ? 'text-indigo-600 font-extrabold' : 'text-slate-500'}>Abbinamento Famiglia / Professional P.IVA</span>
              <ChevronRight className="w-4 h-4 text-slate-350" />
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${wizardStep === 'preview' ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-400'}`}>
                3
              </span>
              <span className={wizardStep === 'preview' ? 'text-indigo-600 font-extrabold' : 'text-slate-400'}>Salvataggio & Controllo Finale ({wizardRows.filter(r => r.selected).length} righe)</span>
            </div>
          </div>

          <div className="p-6">
            
            {/* STEP 1: ACCOUNT CORRELATION & CREATION */}
            {wizardStep === 'accounts' && (
              <div className="space-y-6">
                <div className="bg-slate-50 p-4 border border-slate-200 rounded-xl space-y-1">
                  <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5 font-sans">
                    <Building2 className="w-4 h-4 text-indigo-600" />
                    Fase 1: Associazione Rapporti di Conto Corrente
                  </h4>
                  <p className="text-[11px] text-slate-500 leading-relaxed font-sans">
                    Abbiamo scansionato il tuo foglio ed individuato i seguenti riferimenti bancari. Associali ai conti censiti nel sistema o creane uno nuovo ad hoc per l'estratto.
                  </p>
                </div>

                <div className="space-y-4 font-sans">
                  {detectedRawAccounts.map(rawName => {
                    const mappedVal = accountMappings[rawName] || '';
                    const isAutoMatched = accounts.some(a => a.id === mappedVal);
                    
                    return (
                      <div key={rawName} className="p-4 rounded-xl border border-slate-200 bg-white grid grid-cols-1 md:grid-cols-12 items-center gap-4 hover:border-slate-300">
                        <div className="md:col-span-4">
                          <span className="block text-[10px] text-slate-400 uppercase font-bold tracking-wider">Trovato nel CSV</span>
                          <strong className="text-xs text-slate-800 font-mono">{rawName}</strong>
                        </div>

                        <div className="md:col-span-4 text-xs">
                          <span className="block text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-1">Status Riconoscimento</span>
                          {isAutoMatched ? (
                            <span className="inline-flex items-center gap-1 text-[11px] text-emerald-650 font-bold bg-emerald-50 px-2 py-0.5 rounded">
                              <CheckCircle className="w-3.5 h-3.5" /> Scelta automatica trovata
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] text-amber-650 font-bold bg-amber-50 px-2 py-0.5 rounded">
                              <AlertCircle className="w-3.5 h-3.5" /> Nessun Riscontro esatto
                            </span>
                          )}
                        </div>

                        <div className="md:col-span-4">
                          <label className="block text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-1">Associa a Conto Locale</label>
                          <select
                            value={mappedVal}
                            onChange={(e) => setAccountMappings({...accountMappings, [rawName]: e.target.value})}
                            className="w-full text-xs bg-white border border-slate-200 text-slate-800 rounded px-2.5 py-1.5 outline-none focus:border-indigo-400"
                          >
                            <option value="">-- Seleziona Conto --</option>
                            {accounts.map(acc => (
                              <option key={acc.id} value={acc.id}>{acc.name} (Valore: € {acc.balance.toLocaleString('it')})</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Intelligent Auto-Creation of all detected CSV accounts */}
                <div className="bg-gradient-to-r from-indigo-50/70 to-blue-50/70 p-4 rounded-xl border border-indigo-150 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 animate-fade-in">
                  <div className="space-y-0.5 text-left">
                    <h5 className="text-xs font-bold text-indigo-900 flex items-center gap-1.5 font-sans">
                      <Sparkles className="w-4 h-4 text-indigo-500 shrink-0" />
                      Assistenze Rapide P.IVA: Creazione Automatica Conti
                    </h5>
                    <p className="text-[11px] text-slate-500 font-sans">
                      Evita di digitare i conti uno per uno. L'AI creerà istantaneamente tutti i conti correnti rilevati nel foglio (es. BPM, BBVA, Satispay, Contanti, ecc.) nel tuo database reale.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleAutoCreateMissingAccounts}
                    className="shrink-0 text-xs py-2 px-4 bg-indigo-600 hover:bg-indigo-750 text-white font-extrabold rounded-xl shadow-3xs cursor-pointer hover:shadow-2xs transition-all flex items-center gap-1.5 self-start sm:self-auto"
                  >
                    Crea {detectedRawAccounts.filter(rawName => {
                      const mappedId = accountMappings[rawName];
                      return !mappedId || !accounts.some(a => a.id === mappedId);
                    }).length} conti rilevati ✨
                  </button>
                </div>

                {/* Inline Bank Account Creator Form Trigger */}
                <div className="border-t border-slate-100 pt-5 space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-slate-500 font-semibold leading-relaxed">
                      Se il conto dell'estratto non appartiene a quelli registrati, creane uno all'istante:
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowNewAccountForm(!showNewAccountForm)}
                      className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-850 font-bold py-1 px-3 border border-indigo-200 bg-indigo-505/5 hover:bg-slate-50 transition rounded-lg"
                    >
                      <Plus className="w-4 h-4" />
                      {showNewAccountForm ? "Chiudi Form" : "Non c'è il conto? Crea e Associa"}
                    </button>
                  </div>

                  {showNewAccountForm && (
                    <form onSubmit={handleCreateAccountInline} className="bg-slate-50 border border-slate-200/80 p-5 rounded-2xl grid grid-cols-1 sm:grid-cols-3 gap-4 font-sans text-xs animate-fade-in">
                      <div className="sm:col-span-3">
                        <h5 className="font-bold text-slate-800">Crea Nuovo Conto Corrente o Carta</h5>
                        <p className="text-[10px] text-slate-400">Verra aggiunto istantaneamente alla ditta/famiglia e autocompilato.</p>
                      </div>

                      <div>
                        <label className="block text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1">Nome Rappporto Conto</label>
                        <input
                          type="text"
                          required
                          placeholder="Esempio: Carta Revolut Business"
                          value={newAccName}
                          onChange={(e) => setNewAccName(e.target.value)}
                          className="w-full bg-white border border-slate-200 text-slate-800 rounded px-2.5 py-2.5 outline-none focus:border-indigo-400"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1">Tipologia Conto</label>
                        <select
                          value={newAccType}
                          onChange={(e) => setNewAccType(e.target.value as AccountType)}
                          className="w-full bg-white border border-slate-200 text-slate-800 rounded px-2.5 py-2.5 outline-none focus:border-indigo-400"
                        >
                          <option value="checking">Conto Corrente Bancario (checking)</option>
                          <option value="credit_card">Carta di Credito (credit_card)</option>
                          <option value="cash">Cassa Contanti (cash)</option>
                          <option value="financing">Finanziamento / Prestito (financing)</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1">Ambito di Raccordo</label>
                        <select
                          value={newAccScope}
                          onChange={(e) => setNewAccScope(e.target.value as AccountScope)}
                          className="w-full bg-white border border-slate-200 text-slate-800 rounded px-2.5 py-2.5 outline-none focus:border-indigo-400"
                        >
                          <option value="mixed">Misto (Personale + Lavoro)</option>
                          <option value="personal">Solo Familiare (personale)</option>
                          <option value="professional">Solo P.IVA (professional)</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1">Saldo o Consistenza Attuale (€)</label>
                        <input
                          type="number"
                          step="0.01"
                          required
                          placeholder="0.00"
                          value={newAccBalance}
                          onChange={(e) => setNewAccBalance(e.target.value)}
                          className="w-full bg-white border border-slate-200 text-slate-800 rounded px-2.5 py-2.5 outline-none focus:border-indigo-400"
                        />
                      </div>

                      <div className="sm:col-span-3 flex justify-end pt-2">
                        <button
                          type="submit"
                          className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg cursor-pointer"
                        >
                          Salva e Collega Conto
                        </button>
                      </div>
                    </form>
                  )}
                </div>

                {/* Footer Controls */}
                <div className="flex justify-end pt-5 border-t border-slate-100 font-sans">
                  <button
                    type="button"
                    onClick={handleAdvanceToStep2}
                    className="inline-flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow-xs cursor-pointer"
                  >
                    Prosegui al Match Categorie
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}


            {/* STEP 2: CATEGORY SMART MATCH & CREATION */}
            {wizardStep === 'categories' && (
              <div className="space-y-6">
                <div className="bg-slate-50 p-4 border border-slate-200 rounded-xl space-y-1">
                  <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5 font-sans">
                    <Sparkles className="w-4 h-4 text-indigo-600 animate-spin" />
                    Fase 2: Classificazione Raccordi Famiglia / Professional P.IVA
                  </h4>
                  <p className="text-[11px] text-slate-500 leading-relaxed font-sans">
                    Abbiamo cercato abbinamenti ottimali via regole o storico. Qualora non ci fosse corrispondenza esatta, puoi associare o creare nuove categorie / sottocategorie digitando liberamente nel box sottocategoria!
                  </p>
                </div>

                {/* Rows classification details */}
                <div className="border border-slate-250 rounded-2xl overflow-hidden bg-white shadow-xs font-sans">
                  <div className="overflow-x-auto text-[11px] text-slate-600">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-left uppercase text-[9px] font-bold tracking-wider text-slate-400">
                          <th className="py-3 px-3 text-center w-12">Carica</th>
                          <th className="py-3 px-2 text-center w-14">Stato OK</th>
                          <th className="py-3 px-3">Data & Descrizione Movimento (Modificabile)</th>
                          <th className="py-3 px-3 w-32 text-right">Importo (€)</th>
                          <th className="py-3 px-3 w-28">Ambito</th>
                          <th className="py-3 px-3 w-32">Categoria</th>
                          <th className="py-3 px-3">Sottocategoria & Apprendimento AI</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-150">
                        {wizardRows.map((row, index) => {
                          const existingSubsList = getExistingSubcategoriesMatches(row.category);
                          const isNewSub = row.subcategory && !existingSubsList.includes(row.subcategory);

                          return (
                            <tr key={row.id} className={`hover:bg-indigo-50/10 transition-all ${!row.selected ? 'opacity-35 bg-slate-50/50' : ''}`}>
                              {/* Selection checkbox */}
                              <td className="py-3 px-3 text-center">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const updated = [...wizardRows];
                                    updated[index].selected = !updated[index].selected;
                                    setWizardRows(updated);
                                  }}
                                  className="text-slate-400 hover:text-indigo-600 focus:outline-none"
                                >
                                  {row.selected ? (
                                    <CheckSquare className="w-4 h-4 text-indigo-600 mx-auto" />
                                  ) : (
                                    <Square className="w-4 h-4 text-slate-300 mx-auto" />
                                  )}
                                </button>
                              </td>

                              {/* Approved OK check */}
                              <td className="py-3 px-2 text-center">
                                {row.isApproved ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const updated = [...wizardRows];
                                      updated[index].isApproved = false;
                                      setWizardRows(updated);
                                    }}
                                    className="px-2 py-1 text-[9px] font-bold rounded-md text-emerald-700 bg-emerald-50 border border-emerald-200 flex items-center gap-1 mx-auto cursor-pointer"
                                    title="Tutto confermato! Clicca per revocare"
                                  >
                                    <Check className="w-3 h-3 text-emerald-600" />
                                    Ok
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const updated = [...wizardRows];
                                      updated[index].isApproved = true;
                                      setWizardRows(updated);
                                    }}
                                    className="px-1.5 py-1 text-[9px] font-extrabold rounded-md text-amber-700 bg-amber-50 border border-amber-200 animate-pulse flex items-center gap-1 mx-auto cursor-pointer font-sans"
                                    title="Fai clic se i dati e la categoria ti sembrano corretti"
                                  >
                                    <AlertCircle className="w-3 h-3 text-amber-600" />
                                    Conferma
                                  </button>
                                )}
                              </td>

                              {/* Date & Desc (Modificabile) */}
                              <td className="py-3 px-3">
                                <div className="font-mono text-[9px] text-slate-400 tracking-wider mb-1">{row.date}</div>
                                <input
                                  type="text"
                                  value={row.description}
                                  onChange={(e) => {
                                    const updated = [...wizardRows];
                                    updated[index].description = e.target.value;
                                    // Automatic intelligence: if they customized the item, approve it and save as rule!
                                    updated[index].isApproved = true;
                                    updated[index].saveAsRule = true; 
                                    setWizardRows(updated);
                                  }}
                                  className="w-full text-[11px] font-bold text-slate-800 bg-slate-50 hover:bg-slate-100/80 focus:bg-white border border-slate-200 px-2 py-1 rounded transition-colors focus:outline-none focus:border-indigo-400 font-sans"
                                />
                                
                                {/* Mapping badge indicators */}
                                <div className="mt-1 flex gap-1.5 items-center flex-wrap">
                                  {row.matchType === 'rule' && (
                                    <span className="text-[8px] bg-indigo-50 text-indigo-700 px-1.5 py-0.2 rounded font-semibold border border-indigo-150">
                                      ✨ Regola attiva
                                    </span>
                                  )}
                                  {row.matchType === 'past' && (
                                    <span className="text-[8px] bg-emerald-50 text-emerald-700 px-1.5 py-0.2 rounded font-semibold border border-emerald-150">
                                      ✨ Da Storico
                                    </span>
                                  )}
                                  {row.matchType === 'user' && (
                                    <span className="text-[8px] bg-purple-50 text-purple-700 px-1.5 py-0.2 rounded font-semibold border border-purple-150">
                                      📂 Da File
                                    </span>
                                  )}
                                  {row.matchType === 'default' && (
                                    <span className="text-[8px] bg-amber-50 text-amber-700 px-1.5 py-0.2 rounded font-bold border border-amber-150 animate-pulse">
                                      ⚠️ Da Classificare
                                    </span>
                                  )}
                                  {row.isDuplicate && (
                                    <span className="text-[8px] font-sans bg-rose-50 text-rose-700 font-extrabold px-1.5 py-0.5 rounded border border-rose-250 flex items-center gap-0.5 animate-pulse">
                                      ⚠️ RILEVATO DUPLICATO (Evitato import automatico)
                                    </span>
                                  )}
                                  
                                  <span className="text-[8.5px] text-slate-450 font-semibold font-mono">
                                    conto d'appoggio: {accounts.find(a => a.id === row.matchedAccountId)?.name || row.rawAccountName}
                                    {row.destinationAccountId && ` ➔ ${accounts.find(a => a.id === row.destinationAccountId)?.name || row.rawDestinationAccountName}`}
                                  </span>
                                </div>
                              </td>

                              {/* Amount (Modificabile) */}
                              <td className="py-3 px-3 text-right">
                                <div className="flex items-center justify-end gap-1.5 font-mono">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const updated = [...wizardRows];
                                      const newVal = -row.amount;
                                      updated[index].amount = newVal;
                                      if (row.category === 'trasferimento') {
                                        updated[index].type = 'transfer';
                                      } else {
                                        updated[index].type = newVal >= 0 ? 'income' : 'expense';
                                      }
                                      updated[index].isApproved = true;
                                      setWizardRows(updated);
                                    }}
                                    title="Inverti segno (+/-)"
                                    className="px-1.5 py-1 text-[9px] font-bold rounded border border-slate-200 bg-slate-100/90 hover:bg-slate-200 text-slate-650 hover:text-slate-800 transition-all cursor-pointer whitespace-nowrap active:scale-90 select-none"
                                  >
                                    +/-
                                  </button>
                                  <input
                                    type="number"
                                    step="0.01"
                                    value={row.amount}
                                    onChange={(e) => {
                                      const updated = [...wizardRows];
                                      const val = parseFloat(e.target.value) || 0;
                                      updated[index].amount = val;
                                      if (updated[index].category === 'trasferimento') {
                                        updated[index].type = 'transfer';
                                      } else {
                                        updated[index].type = val >= 0 ? 'income' : 'expense';
                                      }
                                      updated[index].isApproved = true;
                                      setWizardRows(updated);
                                    }}
                                    className="w-20 text-right text-[11px] font-bold text-slate-800 bg-slate-50 hover:bg-slate-100/80 focus:bg-white border border-slate-200 px-1 py-1 rounded transition-colors focus:outline-none focus:border-indigo-400"
                                  />
                                  <span className="text-slate-400 text-[9px] font-sans">€</span>
                                </div>
                              </td>

                              {/* Scope pill picker */}
                              <td className="py-3 px-3">
                                <div className="flex gap-1">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const updated = [...wizardRows];
                                      updated[index].scope = 'personal';
                                      const cat = row.amount >= 0 ? 'entrate' : 'necessarie';
                                      updated[index].category = cat;
                                      const updatedType = cat === 'entrate' ? 'income' : 'expense';
                                      updated[index].type = updatedType;
                                      
                                      // Correct amount sign based on Type
                                      if (updatedType === 'expense' && updated[index].amount > 0) {
                                        updated[index].amount = -updated[index].amount;
                                      } else if (updatedType === 'income' && updated[index].amount < 0) {
                                        updated[index].amount = Math.abs(updated[index].amount);
                                      }

                                      updated[index].isApproved = true;
                                      updated[index].saveAsRule = true; // automatic learn
                                      setWizardRows(updated);
                                    }}
                                    className={`px-2.5 py-1 text-[9px] font-extrabold rounded-md transition-all cursor-pointer ${
                                      row.scope === 'personal'
                                        ? 'bg-sky-100 text-sky-700 border border-sky-300 shadow-2xs'
                                        : 'bg-slate-50 text-slate-400 border border-slate-100 hover:bg-slate-100'
                                    }`}
                                  >
                                    CASA
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const updated = [...wizardRows];
                                      updated[index].scope = 'professional';
                                      const cat = row.amount >= 0 ? 'entrate_lavoro' : 'necessarie_lavoro';
                                      updated[index].category = cat;
                                      const updatedType = cat === 'entrate_lavoro' ? 'income' : 'expense';
                                      updated[index].type = updatedType;
                                      
                                      // Correct amount sign based on Type
                                      if (updatedType === 'expense' && updated[index].amount > 0) {
                                        updated[index].amount = -updated[index].amount;
                                      } else if (updatedType === 'income' && updated[index].amount < 0) {
                                        updated[index].amount = Math.abs(updated[index].amount);
                                      }

                                      updated[index].isApproved = true;
                                      updated[index].saveAsRule = true; // automatic learn
                                      setWizardRows(updated);
                                    }}
                                    className={`px-2.5 py-1 text-[9px] font-extrabold rounded-md transition-all cursor-pointer ${
                                      row.scope === 'professional'
                                        ? 'bg-amber-100 text-amber-700 border border-amber-300 shadow-2xs'
                                        : 'bg-slate-50 text-slate-400 border border-slate-100 hover:bg-slate-100'
                                    }`}
                                  >
                                    P.IVA
                                  </button>
                                </div>
                              </td>

                              {/* Category selector */}
                              <td className="py-3 px-3">
                                <select
                                  value={row.category}
                                  onChange={(e) => {
                                    const updated = [...wizardRows];
                                    const catVal = e.target.value as any;
                                    updated[index].category = catVal;
                                    let updatedType: 'income' | 'expense' | 'transfer' = 'expense';
                                    
                                    if (catVal === 'trasferimento') {
                                      updatedType = 'transfer';
                                    } else if (catVal === 'entrate' || catVal === 'entrate_lavoro') {
                                      updatedType = 'income';
                                    } else {
                                      updatedType = 'expense';
                                    }
                                    updated[index].type = updatedType;

                                    // Correct amount sign based on newly selected Type
                                    if (updatedType === 'expense' && updated[index].amount > 0) {
                                      updated[index].amount = -updated[index].amount;
                                    } else if (updatedType === 'income' && updated[index].amount < 0) {
                                      updated[index].amount = Math.abs(updated[index].amount);
                                    } else if (updatedType === 'transfer') {
                                      const matchedAcc = accounts.find(a => a.id === row.matchedAccountId);
                                      if (matchedAcc && matchedAcc.type === 'financing') {
                                        updated[index].amount = Math.abs(updated[index].amount);
                                      }
                                    }

                                    updated[index].isApproved = true;
                                    updated[index].saveAsRule = true; // automatic learn
                                    setWizardRows(updated);
                                  }}
                                  className="w-full text-[10px] font-sans bg-white border border-slate-200 text-slate-800 rounded px-1.5 py-1.5 outline-none focus:border-indigo-400 font-semibold"
                                >
                                  {row.scope === 'personal' ? (
                                    <>
                                      <option value="necessarie">Necessaria (Casa)</option>
                                      <option value="utili">Utile (Casa)</option>
                                      <option value="tempo_libero">Tempo Libero</option>
                                      <option value="entrate">Entrata (Stipendio etc)</option>
                                      <option value="trasferimento">Trasferimento / Giroconto</option>
                                    </>
                                  ) : (
                                    <>
                                      <option value="necessarie_lavoro">Necessaria Lavoro</option>
                                      <option value="utili_lavoro">Utile Lavoro</option>
                                      <option value="entrate_lavoro">Entrata Lavoro (Fatture/Consulenza)</option>
                                      <option value="trasferimento">Trasferimento / Giroconto</option>
                                    </>
                                  )}
                                </select>
                              </td>

                              {/* Match subcategory input & creator */}
                              <td className="py-3 px-3">
                                <div className="space-y-1.5">
                                  <div className="flex gap-1.5">
                                    {/* Direct input allowing free writing (creates new categories on-the-fly) */}
                                    <div className="relative w-full">
                                      <input
                                        type="text"
                                        placeholder="Sottocategoria..."
                                        value={row.subcategory}
                                        onChange={(e) => {
                                          const updated = [...wizardRows];
                                          updated[index].subcategory = e.target.value;
                                          updated[index].isApproved = true;
                                          updated[index].saveAsRule = true; // automatic learn
                                          setWizardRows(updated);
                                        }}
                                        className="w-full text-[11px] bg-slate-50 focus:bg-white border border-slate-200 text-slate-800 rounded px-1.5 py-1 outline-none font-bold font-sans"
                                      />
                                      {isNewSub && (
                                        <span className="absolute -top-3.5 right-0 block text-[7.5px] bg-amber-50 text-amber-600 font-extrabold px-1 rounded border border-amber-150 animate-pulse">
                                          Nuova sub ➕
                                        </span>
                                      )}
                                    </div>

                                    {/* Frequent options dropdown menu */}
                                    <select
                                      onChange={(e) => {
                                        if (e.target.value) {
                                          const updated = [...wizardRows];
                                          updated[index].subcategory = e.target.value;
                                          updated[index].isApproved = true;
                                          updated[index].saveAsRule = true; // automatic learn
                                          setWizardRows(updated);
                                        }
                                      }}
                                      value={row.subcategory || ''}
                                      className="text-[10px] bg-slate-50 border border-slate-200 text-slate-600 rounded px-1 max-w-[90px] outline-none"
                                    >
                                      <option value="">Cerca fisse...</option>
                                      {existingSubsList.map(opt => (
                                        <option key={opt} value={opt}>{opt}</option>
                                      ))}
                                    </select>
                                  </div>

                                  {/* Learning check: "impara da quello che ti mostro" */}
                                  <label className="flex items-center gap-1.5 cursor-pointer text-[10px] text-slate-500 hover:text-indigo-600 select-none">
                                    <input
                                      type="checkbox"
                                      checked={row.saveAsRule}
                                      onChange={(e) => {
                                        const updated = [...wizardRows];
                                        updated[index].saveAsRule = e.target.checked;
                                        setWizardRows(updated);
                                      }}
                                      className="rounded text-indigo-600 focus:ring-indigo-400 w-3.5 h-3.5"
                                    />
                                    <Sparkles className="w-3 h-3 text-indigo-500 animate-pulse shrink-0" />
                                    <span>Memorizza regola per il futuro</span>
                                  </label>
                                </div>
                              </td>

                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Navigation Buttons for Step 2 */}
                <div className="flex justify-between items-center pt-4 border-t border-slate-100 font-sans">
                  <button
                    type="button"
                    onClick={() => setWizardStep('accounts')}
                    className="px-4 py-2 hover:bg-slate-50 text-slate-500 font-bold text-xs rounded-xl border border-slate-200 transition cursor-pointer"
                  >
                    Indietro
                  </button>
                  
                  <button
                    type="button"
                    onClick={handleReinterpretRows}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-50 hover:bg-indigo-150 text-indigo-700 font-extrabold text-xs rounded-xl border border-indigo-200 shadow-3xs transition cursor-pointer transition-all hover:scale-102 hover:shadow-2xs active:scale-98"
                    title="Rileggi l'intero file CSV riapplicando le nuove regole intelligenti che l'AI ha appreso dalle righe modificate"
                  >
                    <RefreshCw className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                    Rileggi con Nuove Regole 🔄
                  </button>

                  <button
                    type="button"
                    onClick={handleAdvanceToStep3}
                    className="inline-flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow-xs cursor-pointer"
                  >
                    Prosegui a Schermata Riepilogo
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}


            {/* STEP 3: PREVIEW RACK & CONFIRM */}
            {wizardStep === 'preview' && (
              <div className="space-y-6">
                <div className="bg-emerald-50 border border-emerald-150 p-5 rounded-2xl flex gap-3 text-emerald-800 text-xs">
                  <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0" />
                  <div className="space-y-1">
                    <h5 className="font-bold">Dati pronti per il consolidamento</h5>
                    <p className="text-emerald-700 text-[11px] leading-relaxed">
                      Hai verificato con successo i conti correnti e associato o creato nuove categorie e sottocategorie. 
                      Cliccando su <strong>"Salva & Importa"</strong> caricheremo ufficialmente i {wizardRows.filter(r => r.selected).length} movimenti selezionati nel tuo libro giornale finanziario.
                    </p>
                  </div>
                </div>

                {/* Import aggregate stats summaries */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 font-sans">
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-center">
                    <span className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider">Flussi Totali</span>
                    <strong className="text-md text-slate-800 font-mono font-black">{wizardRows.length}</strong>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-center">
                    <span className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider">Selezionati</span>
                    <strong className="text-md text-slate-800 font-mono font-black text-emerald-650">{wizardRows.filter(r => r.selected).length}</strong>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-center">
                    <span className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider">Nuove Sottocategorie</span>
                    <strong className="text-md text-slate-800 font-mono font-black text-indigo-600">
                      {wizardRows
                        .filter(r => r.selected)
                        .map(r => r.subcategory)
                        .filter((sub, idx, self) => {
                          const standardList = [
                            'Alimentari', 'Affitto Casa', 'Bollette Luce/Gas', 'Mutuo / Prestiti', 'Salute', 'Spostamenti',
                            'Abbonamenti', 'Arredamento', 'Manutenzione', 'Tecnologia', 'Vestiario', 'Sport & Wellness', 'Cinema & Libri',
                            'Vacanze', 'Ristorazione', 'Regali', 'Stipendio', 'Rimborso Spese', 'Regalo Ricevuto', 'Rendita Attiva',
                            'Commercialista', 'Tasse Sostitutive', 'Contributi INPS', 'Affitto Studio', 'Fattura Fornitore',
                            'Assicurazione prof.', 'Software & Cloud', 'Formazione', 'Attrezzatura', 'Pubblicità', 'Viaggi Lavoro',
                            'Fattura Cliente', 'Ritenute d\'acconto', 'Royalty', 'Consulenza'
                          ];
                          return sub && !standardList.includes(sub) && self.indexOf(sub) === idx;
                        }).length}
                    </strong>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-center">
                    <span className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider">Conti usati</span>
                    <strong className="text-md text-slate-800 font-mono font-black text-slate-800">
                      {wizardRows
                        .filter(r => r.selected)
                        .map(r => r.matchedAccountId)
                        .filter((id, idx, self) => id && self.indexOf(id) === idx).length}
                    </strong>
                  </div>
                </div>

                {/* Mini Preview Table List */}
                <div className="border border-slate-200 rounded-xl max-h-[220px] overflow-y-auto text-[11px] font-sans">
                  <table className="w-full text-left">
                    <thead className="sticky top-0 bg-slate-100 text-[10px] font-bold text-slate-450 uppercase border-b border-slate-200">
                      <tr>
                        <th className="py-2.5 px-3">Data</th>
                        <th className="py-2.5 px-3">Descrizione</th>
                        <th className="py-2.5 px-3">Conto Ass.</th>
                        <th className="py-2.5 px-3">Ripartizione / Sottocategoria</th>
                        <th className="py-2.5 px-3 text-right">Importo</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-150 bg-white text-slate-600">
                      {wizardRows.filter(r => r.selected).map(row => (
                        <tr key={row.id}>
                          <td className="py-2 px-3 font-mono text-[10px]">{row.date}</td>
                          <td className="py-2 px-3 font-bold text-slate-850 truncate max-w-[180px]" title={row.description}>{row.description}</td>
                          <td className="py-2 px-3 font-semibold text-slate-500">
                            {accounts.find(a => a.id === row.matchedAccountId)?.name || "Default Account"}
                            {row.destinationAccountId && ` ➔ ${accounts.find(a => a.id === row.destinationAccountId)?.name || "Default Dest"}`}
                          </td>
                          <td className="py-2 px-3">
                            <span className={`inline-block text-[8px] font-bold px-1.5 py-0.2 rounded-full mr-1.5 ${row.scope === 'personal' ? 'bg-sky-50 text-sky-700 border border-sky-150' : 'bg-amber-50 text-amber-705 border border-amber-150'}`}>
                              {row.scope === 'personal' ? 'Casa' : 'P.IVA'}
                            </span>
                            <span className="font-extrabold text-slate-800">{row.subcategory}</span>
                          </td>
                          <td className="py-2 px-3 text-right font-mono font-bold text-indigo-950">
                            {row.amount.toLocaleString('it-IT', { minimumFractionDigits: 2 })} €
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Navigation and execution buttons */}
                <div className="flex justify-between pt-4 border-t border-slate-100 font-sans">
                  <button
                    type="button"
                    onClick={() => setWizardStep('categories')}
                    className="px-4 py-2 hover:bg-slate-50 text-slate-500 font-bold text-xs rounded-xl border border-slate-200 transition cursor-pointer"
                  >
                    Indietro
                  </button>
                  <button
                    type="button"
                    onClick={handleFinalWizardSubmit}
                    className="inline-flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-md cursor-pointer"
                  >
                    <CheckCircle className="w-4 h-4" />
                    Salva & Importa {wizardRows.filter(r => r.selected).length} Transazioni
                  </button>
                </div>
              </div>
            )}

          </div>
        </div>
      )}

      {/* ======================= DEFAULT VIEW: STANDARD LAYOUT ======================= */}
      {!wizardActive && (
        <div className="space-y-6">
          
          {/* INVOICE RECONCILIATION WORKSPACE PANEL */}
          {parsedInvoices.length > 0 && (
            <div className="bg-white border border-emerald-200 p-6 rounded-2xl shadow-sm space-y-4 animate-fade-in" id="invoice-matching-workspace">
              <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 border-b border-emerald-100 pb-4">
                <div className="space-y-1">
                  <div className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider">
                    🧾 Riconciliazione Fatture Emesse
                  </div>
                  <h3 className="text-md font-bold text-slate-850">Lavoro di validazione e match dei flussi d'incasso</h3>
                </div>
                
                <div className="flex gap-2.5">
                  <button
                    onClick={() => handleValidateAllMatches(computedInvoiceReconciliationResults)}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-750 text-white text-xs font-bold rounded-xl transition cursor-pointer flex items-center gap-1.5 shadow-sm"
                  >
                    <CheckSquare className="w-4 h-4" />
                    Valida tutti i Match ({computedInvoiceReconciliationResults.filter(r => !r.isValidated && getSelectedTxId(r.invoiceNumber, r.selectedTxId)).length}) pronti
                  </button>
                  
                  <button
                    onClick={() => {
                      setParsedInvoices([]);
                      setManualSelections({});
                    }}
                    className="px-3 py-2 border border-slate-200 hover:bg-slate-50 text-slate-500 hover:text-rose-600 text-xs font-bold rounded-xl transition cursor-pointer"
                  >
                    Resetta Riconciliatore
                  </button>
                </div>
              </div>
              
              <div className="overflow-x-auto pb-2">
                <table className="w-full text-left border-collapse min-w-[800px]">
                  <thead>
                    <tr className="border-b border-slate-100 text-[10px] font-black uppercase tracking-wider text-slate-400 font-sans">
                      <th className="py-3 px-3 w-1/5">Fattura Emessa (CSV)</th>
                      <th className="py-3 px-3 w-1/5">Cliente / Importo</th>
                      <th className="py-3 px-3 w-1/5">Stato Corrispondenza</th>
                      <th className="py-3 px-3 w-2/5 font-sans">Movimento Bancario Selezionato (Riscontro)</th>
                      <th className="py-3 px-3 text-right">Azione</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 font-sans">
                    {computedInvoiceReconciliationResults.map((res, index) => {
                      const selectedTxId = getSelectedTxId(res.invoiceNumber, res.selectedTxId);
                      const selectedMatch = res.matches.find(m => m.tx.id === selectedTxId);
                      
                      return (
                        <tr 
                          key={res.invoiceNumber + '-' + index} 
                          className={`hover:bg-slate-50/50 transition-colors text-xs ${
                            res.isValidated ? 'bg-emerald-50/10' : ''
                          }`}
                        >
                          <td className="py-3.5 px-3">
                            <span className="font-mono font-bold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded text-[11px]">
                              {res.invoiceNumber}
                            </span>
                            <div className="text-[10px] text-slate-400 mt-1 font-semibold">
                              Doc: {res.invoiceDate}
                            </div>
                          </td>
                          
                          <td className="py-3.5 px-3">
                            <div className="font-bold text-slate-800">{res.clientName}</div>
                            <div className="text-emerald-700 font-extrabold font-mono mt-0.5 text-xs">
                              + € {res.invoiceAmount.toLocaleString('it-IT', { minimumFractionDigits: 2 })}
                            </div>
                          </td>
                          
                          <td className="py-3.5 px-3">
                            {res.isValidated ? (
                              <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-850 font-bold px-2 py-0.5 rounded-full text-[9px] uppercase tracking-wider border border-emerald-150">
                                <Check className="w-3 h-3 text-emerald-600" /> Riconciliata & Validata
                              </span>
                            ) : res.matches.length > 0 ? (
                              <span className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-700 border border-indigo-200 font-bold px-2 py-0.5 rounded-full text-[9px] uppercase tracking-wider">
                                {res.matches.length === 1 ? '1 Match Rilevato' : `⚠️ ${res.matches.length} Opzioni Rilevate`}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 bg-rose-50 text-rose-700 border border-rose-150 font-bold px-2 py-0.5 rounded-full text-[9px] uppercase tracking-wider">
                                ⚠️ Nessun Match Trovato
                              </span>
                            )}
                          </td>
                          
                          <td className="py-3.5 px-3">
                            {res.isValidated ? (
                              <div className="space-y-0.5 font-sans">
                                <div className="font-semibold text-slate-800 truncate text-xs">
                                  {res.validatedTx?.description}
                                </div>
                                <div className="text-[10px] text-slate-450 font-mono">
                                  Valuta: {res.validatedTx?.date} • ID: {res.validatedTx?.id.slice(0, 8)}...
                                </div>
                              </div>
                            ) : res.matches.length > 0 ? (
                              <div className="space-y-1">
                                <select
                                  value={selectedTxId}
                                  onChange={(e) => setManualSelections(prev => ({
                                    ...prev,
                                    [res.invoiceNumber]: e.target.value
                                  }))}
                                  className="w-full text-xs bg-white border border-slate-250 text-slate-800 rounded-lg px-2.5 py-1.5 outline-none font-sans font-medium hover:border-slate-350 focus:border-indigo-505 shadow-xs"
                                >
                                  {res.matches.map(m => {
                                    const accName = accounts.find(a => a.id === m.tx.accountId)?.name || 'Conto';
                                    return (
                                      <option key={m.tx.id} value={m.tx.id}>
                                        {m.tx.date} - {m.tx.description.slice(0, 42)}... ({accName})
                                      </option>
                                    );
                                  })}
                                </select>
                              </div>
                            ) : (
                              <span className="text-[11px] text-slate-400 italic bg-amber-50/15 border border-amber-100/30 px-2 py-1 rounded">
                                Sbloccabile registrando un'entrata P.IVA da +€ {res.invoiceAmount.toFixed(2)}
                              </span>
                            )}
                          </td>
                          
                          <td className="py-3.5 px-3 text-right font-sans">
                            {res.isValidated ? (
                              <span className="text-emerald-700 font-extrabold text-xs inline-flex items-center gap-1">
                                <CheckCircle className="w-4 h-4 text-emerald-500" /> Riconciliata
                              </span>
                            ) : (
                              <button
                                disabled={!selectedTxId}
                                onClick={() => handleValidateInvoiceMatch(res.invoiceNumber, res.clientName, selectedTxId)}
                                className={`px-3 py-1.5 rounded-lg text-[11px] font-bold tracking-tight transition cursor-pointer flex items-center gap-1 ml-auto ${
                                  selectedTxId 
                                    ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs' 
                                    : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                }`}
                              >
                                <Check className="w-3.5 h-3.5" />
                                Valida Match
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* LEFT COLUMN: BANK CONNECTION AUTOMATIC PSD2 */}
          <div className="lg:col-span-7 bg-white border border-slate-200 p-6 rounded-2xl shadow-sm space-y-6">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-bold text-slate-850 flex items-center gap-2">
                <Building className="w-4 h-4 text-indigo-600" />
                Sincronizzazione Automatica Open Banking (PSD2 Sandbox)
              </h3>
              <span className="bg-indigo-50 text-indigo-705 text-[9px] uppercase tracking-wider font-bold px-2 py-0.5 rounded border border-indigo-150 shadow-xs">Sincronizzazione Sicura</span>
            </div>

            <p className="text-xs text-slate-505 font-sans leading-relaxed">
              Collega la tua banca reale (Banco BPM, BBVA, UniCredit, Intesa Sanpaolo, Fineco, ecc.) o sperimenta con l'ambiente sandbox simulato. I dati vengono scaricati ed elaborati in tempo reale sul server locale.
            </p>

            {isDemoMode ? (
              <div className="bg-amber-50 border border-amber-200/80 rounded-xl p-3 flex justify-between items-center gap-3">
                <div className="text-[11px] text-amber-900 leading-normal font-sans">
                  <span className="font-bold block text-xs mb-0.5 text-amber-950">Modalità Demo Attiva</span>
                  I conti reali collegati (come Banco BPM) sono momentaneamente nascosti. Per vederli, attiva la modalità <strong>Miei Dati Reali</strong> nell'interruttore in cima alla pagina.
                </div>
                <span className="bg-amber-500 text-slate-900 text-[10px] font-black px-2.5 py-1.5 rounded-lg whitespace-nowrap">
                  Dati Demo
                </span>
              </div>
            ) : (
              <div className="bg-emerald-50 border border-emerald-200/85 rounded-xl p-3 flex justify-between items-center gap-3">
                <div className="text-[11px] text-emerald-900 leading-normal font-sans">
                  <span className="font-bold block text-xs mb-0.5 text-emerald-950">Modalità Dati Reali Attiva ✓</span>
                  Stai visualizzando esclusivamente i tuoi conti e transazioni reali (come Banco BPM) sincronizzati via API. I dati di simulazione sono nascosti.
                </div>
                <span className="bg-emerald-600 text-white text-[10px] font-black px-2.5 py-1.5 rounded-lg whitespace-nowrap">
                  Dati Reali ✓
                </span>
              </div>
            )}

            {/* Expandable Open Banking Configuration Panel */}
            <div className="border border-slate-150 bg-slate-50/50 rounded-xl p-4 space-y-3 shadow-xs">
              <button 
                type="button"
                onClick={() => setShowApiConfig(!showApiConfig)}
                className="w-full text-left flex justify-between items-center text-xs font-bold text-slate-700 hover:text-indigo-650 transition cursor-pointer"
              >
                <span className="flex items-center gap-1.5">
                  <SlidersHorizontal className="w-3.5 h-3.5 text-slate-500 hover:text-indigo-600 transition" />
                  Regolazione Credenziali API (Enable Banking Reale)
                </span>
                <span className={`text-[10px] px-2 py-0.5 rounded font-extrabold transition ${
                  showApiConfig 
                    ? 'bg-slate-200 text-slate-700' 
                    : clientIdInput 
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-100' 
                      : 'bg-indigo-50 text-indigo-750 border border-indigo-100'
                }`}>
                  {showApiConfig ? "Nascondi" : clientIdInput ? "⚙️ Configurato" : "⚙️ Configura"}
                </span>
              </button>

              {showApiConfig && (
                <div className="space-y-3.5 pt-3 border-t border-slate-200/60 font-sans">
                  <p className="text-[10px] text-slate-500 leading-normal">
                    Fornisci le tue credenziali di accesso per <strong>Enable Banking</strong> per sincronizzare i conti reali (BPM, BBVA, UniCredit, ecc.). Se non hai ancora le credenziali, puoi lasciare vuoto e testare i flussi in Sandbox.
                  </p>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[9px] font-extrabold text-slate-500 block uppercase tracking-wider">Application ID / Client ID</label>
                      <input 
                        type="text"
                        value={clientIdInput}
                        onChange={(e) => setClientIdInput(e.target.value)}
                        placeholder="es. f8daae11-8c43-4f51-bcf3-40fa4b1bb9d6"
                        className="w-full p-2 border border-slate-250 rounded bg-white text-xs text-slate-800 outline-none focus:border-indigo-500"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[9px] font-extrabold text-slate-500 block uppercase tracking-wider">Key ID / Key Name (kid)</label>
                      <input 
                        type="text"
                        value={keyIdInput}
                        onChange={(e) => setKeyIdInput(e.target.value)}
                        placeholder="es. key-1"
                        className="w-full p-2 border border-slate-250 rounded bg-white text-xs text-slate-800 outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9px] font-extrabold text-slate-500 block uppercase tracking-wider">RSA Private Key (PEM format)</label>
                    <textarea
                      rows={4}
                      value={privateKeyInput}
                      onChange={(e) => setPrivateKeyInput(e.target.value)}
                      placeholder="-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQD...\n-----END PRIVATE KEY-----"
                      className="w-full p-2 border border-slate-250 rounded bg-white text-xs text-slate-800 font-mono outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div className="flex gap-2 justify-end">
                    <button 
                      type="button"
                      onClick={handleSaveApiConfig}
                      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-bold rounded transition cursor-pointer shadow-xs"
                    >
                      Salva Credenziali
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Connected Banks Listing */}
            {connections.length > 0 && (
              <div className="space-y-3">
                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Conti Connessi Attivi</span>
                {connections.map(conn => (
                  <div key={conn.id} className="bg-slate-50 p-4 rounded-xl border border-slate-150 flex flex-col sm:flex-row justify-between sm:items-center gap-3 transition-all hover:border-slate-350">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{conn.logo}</span>
                      <div>
                        <h4 className="text-xs font-bold text-slate-805">{conn.bankName}</h4>
                        <p className="text-[10px] text-slate-500 flex items-center gap-1 mt-0.5 font-semibold">
                          <Clock className="w-3 animate-spin text-indigo-505" /> Ultimo controllo automatico: {conn.lastSynced}
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex gap-2">
                      <button 
                        onClick={() => handleTriggerBankSync(conn.id)}
                        className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-semibold rounded transition cursor-pointer shadow-xs"
                      >
                        Sincronizza Movimenti
                      </button>
                      <button 
                        onClick={() => handleDisconnectBank(conn.id)}
                        className="px-2.5 py-1.5 border border-slate-200 hover:bg-slate-100/50 text-slate-500 hover:text-rose-600 text-[11px] font-semibold rounded cursor-pointer transition"
                      >
                        Scollega
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* New Bank connection catalogs */}
            <div className="space-y-3.5 pt-4 border-t border-slate-105 font-sans">
              <span className="text-[10px] text-slate-505 font-bold uppercase tracking-wider block">Altri Istituti di Credito supportati</span>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {SUPPORTED_BANKS.filter(b => !connections.some(c => c.bankName.includes(b.name.slice(0, 5)))).map(b => (
                  <button 
                    id={b.id}
                    key={b.id}
                    onClick={() => {
                      setSyncingAccountId(null);
                      handleInitiateBankConnection(b.id);
                    }}
                    className="bg-slate-55 hover:bg-white p-3 rounded-xl border border-slate-150 hover:border-slate-300 hover:shadow-xs text-left transition relative group overflow-hidden cursor-pointer"
                  >
                    <div className="text-xl mb-1">{b.logo}</div>
                    <h4 className="text-[11px] font-bold text-slate-800 group-hover:text-amber-700 transition truncate">{b.name}</h4>
                    <span className="text-[8px] text-slate-500 block mt-0.5 uppercase tracking-wider font-semibold">Collega Conto</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: MANUAL FILE EXPORTER & INTRO WORKSPACE Drag-and-drop */}
          <div className="lg:col-span-5 space-y-6">
            {/* EXPORTER */}
            <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm space-y-4">
              <h3 className="text-sm font-bold text-slate-805 flex items-center gap-2">
                <Download className="w-4 h-4 text-emerald-600" />
                Esporta Transazioni Correnti
              </h3>
              <p className="text-xs text-slate-550 font-sans">
                Esporta il tuo storico integrato in formato CSV universale, leggibile da fogli Excel, Numbers o caricabile su altri gestionali finanziari.
              </p>
              <button 
                id="btn-export-csv"
                onClick={handleTriggerExport}
                className="w-full py-2.5 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
              >
                <Download className="w-3.5 h-3.5 text-slate-500" />
                Scarica CSV Estratto Riordinato
              </button>
            </div>

            {/* IMPORTER DRAG & DROP & TEXTAREA PASTING INTEGRATOR */}
            <div className="bg-white border border-slate-205 p-6 rounded-2xl shadow-sm space-y-4 font-sans">
              
              {/* Segmented control for Sub-Tabs */}
              <div className="flex border-b border-slate-100 pb-1">
                <button
                  type="button"
                  onClick={() => setActiveImportSubTab('bancario')}
                  className={`flex-1 pb-2.5 text-xs font-bold text-center border-b-2 transition-all cursor-pointer ${
                    activeImportSubTab === 'bancario'
                      ? 'border-indigo-600 text-indigo-605'
                      : 'border-transparent text-slate-400 hover:text-slate-600'
                  }`}
                >
                  🏦 Estratto Conto Bancario
                </button>
                <button
                  type="button"
                  onClick={() => setActiveImportSubTab('fatture')}
                  className={`flex-1 pb-2.5 text-xs font-bold text-center border-b-2 transition-all cursor-pointer ${
                    activeImportSubTab === 'fatture'
                      ? 'border-indigo-600 text-indigo-605'
                      : 'border-transparent text-slate-400 hover:text-slate-600'
                  }`}
                >
                  🧾 Riconciliazione Fatture
                </button>
              </div>

              {activeImportSubTab === 'bancario' ? (
                <>
                  <h3 className="text-sm font-bold text-slate-805 flex items-center gap-2 pt-1">
                    <Upload className="w-4 h-4 text-indigo-650" />
                    Carica o Trascina file CSV bancario
                  </h3>

                  {/* Drag over area */}
                  <div 
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
                      isDragging 
                        ? 'border-indigo-600 bg-indigo-50/20' 
                        : 'border-slate-300 hover:border-indigo-400 bg-slate-50 hover:bg-white'
                    }`}
                  >
                    <Upload className="w-8 h-8 mx-auto text-indigo-505 animate-bounce mb-2" />
                    <span className="block text-xs font-bold text-slate-700">Trascina qui il file .CSV della tua banca</span>
                    <span className="block text-[10px] text-slate-400 mt-1">oppure clicca per sfogliare i file locali</span>
                    
                    <input 
                      type="file" 
                      ref={fileInputRef}
                      accept=".csv"
                      className="hidden" 
                      onChange={handleManualUploadClick}
                    />
                  </div>

                  {/* Clipboard Text pastes backup */}
                  <form onSubmit={handleTriggerImport} className="space-y-3 pt-3 border-t border-indigo-100/50">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] text-slate-500 uppercase font-black tracking-wider">Oppure incolla righe CSV in input</span>
                      <span className="text-[9px] text-indigo-605 font-bold cursor-help" title="Data, Descrizione, Importo, Conto. Data in formato AAAA-MM-GG o GG/MM/AAAA.">Aiuto Formato</span>
                    </div>

                    <textarea 
                      rows={3}
                      placeholder="Data,Descrizione,Importo,Conto&#10;2026-05-14,ESSELUNGA BANCONE,-55.30,Unicredit&#10;2026-05-13,OFFICINE MECCANICHE,-120.00,AMEX&#10;2026-05-12,CLIENTE ESTERO INCOMING,1500.00,Unicredit"
                      value={csvText} 
                      onChange={(e) => setCsvText(e.target.value)}
                      className="w-full text-xs bg-white border border-slate-200 text-slate-800 placeholder-slate-400 rounded px-2.5 py-2 outline-none font-mono focus:border-indigo-505"
                    />

                    <button 
                      type="submit" 
                      className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg transition-all cursor-pointer shadow-sm"
                    >
                      Riconosci e Inizia Wizard Guidato
                    </button>
                  </form>
                </>
              ) : (
                <>
                  <h3 className="text-sm font-bold text-slate-805 flex items-center gap-2 pt-1">
                    <Upload className="w-4 h-4 text-emerald-605" />
                    Abbinamento & Riconciliazione Fatture Emesse
                  </h3>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    Carica il file .CSV del tuo gestore di fatture. L'applicazione confronterà gli importi con le tue entrate professionali (Partita IVA / Entrata Lavoro) e identificherà i clienti corrispondenti.
                  </p>

                  {/* Drag over area for invoices */}
                  <div 
                    onDragOver={(e) => { e.preventDefault(); setInvoiceDragging(true); }}
                    onDragLeave={() => setInvoiceDragging(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setInvoiceDragging(false);
                      const file = e.dataTransfer.files[0];
                      if (file && (file.name.endsWith('.csv') || file.type === 'text/csv')) {
                        const reader = new FileReader();
                        reader.onload = (event) => {
                          const text = event.target?.result as string;
                          if (text) {
                            setInvoiceCsvText(text);
                            processInvoiceCSV(text);
                          }
                        };
                        reader.readAsText(file);
                      } else {
                        alert("Formato non valido! Trascina esclusivamente file .CSV");
                      }
                    }}
                    onClick={() => invoiceFileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
                      invoiceDragging 
                        ? 'border-emerald-500 bg-emerald-50/20' 
                        : 'border-slate-305 hover:border-emerald-400 bg-slate-50 hover:bg-white'
                    }`}
                  >
                    <Upload className="w-8 h-8 mx-auto text-emerald-500 animate-bounce mb-2" />
                    <span className="block text-xs font-bold text-slate-755">Trascina qui il file .CSV delle Fatture</span>
                    <span className="block text-[10px] text-slate-400 mt-1">oppure clicca per cercare sul computer</span>
                    
                    <input 
                      type="file" 
                      ref={invoiceFileInputRef}
                      accept=".csv"
                      className="hidden" 
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onload = (event) => {
                            const text = event.target?.result as string;
                            if (text) {
                              setInvoiceCsvText(text);
                              processInvoiceCSV(text);
                            }
                          };
                          reader.readAsText(file);
                        }
                      }}
                    />
                  </div>

                  {/* Manual paste for invoices */}
                  <div className="space-y-3 pt-3 border-t border-slate-100">
                    <span className="text-[10px] text-slate-500 uppercase font-black tracking-wider block">Oppure incolla righe CSV Fatture</span>
                    <textarea 
                      rows={3}
                      placeholder="Numero,Cliente,Netto a pagare,Data documento&#10;FPR 28/26,Eridano Re srl,€ 402.00,11/06/2026&#10;FPR 27/26,ENOTECA ALLEGRI,€ 502.00,11/06/2026"
                      value={invoiceCsvText} 
                      onChange={(e) => setInvoiceCsvText(e.target.value)}
                      className="w-full text-xs bg-white border border-slate-200 text-slate-800 placeholder-slate-400 rounded px-2.5 py-2 outline-none font-mono focus:border-emerald-505"
                    />

                    <button
                      type="button"
                      onClick={() => processInvoiceCSV(invoiceCsvText)}
                      className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition-all cursor-pointer shadow-sm"
                    >
                      Analizza & Riconcilia Fatture
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* DATABASE BACKUP & RESTORE CARD */}
            <div className="bg-gradient-to-br from-slate-900 to-indigo-950 text-white border border-slate-800 p-6 rounded-2xl shadow-lg space-y-4 font-sans">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
                <h3 className="text-sm font-bold">Backup & Protezione Dati</h3>
              </div>
              
              <p className="text-[11px] text-slate-300 leading-relaxed font-sans font-medium">
                Conserva una copia di sicurezza di tutta la tua contabilità. Puoi scaricare l'intero database in formato <strong>JSON portabile</strong> (perfetto per backups temporali) o direttamente il file binario strutturato <strong>SQLite (.db)</strong> di produzione.
              </p>

              {backupStatus && (
                <div className={`p-3 rounded-lg text-xs font-semibold flex items-center gap-2 ${
                  backupStatus.type === 'success' 
                    ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20' 
                    : 'bg-rose-500/10 text-rose-300 border border-rose-500/20'
                }`}>
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{backupStatus.message}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 font-sans">
                <button
                  type="button"
                  onClick={handleBackupExportJson}
                  disabled={isExportingJson}
                  className="py-2.5 px-3 bg-white/10 hover:bg-white/15 text-white border border-white/10 text-[11px] font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isExportingJson ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-slate-300" />
                  ) : (
                    <Download className="w-3.5 h-3.5 text-emerald-400" />
                  )}
                  Esporta backup JSON
                </button>

                <button
                  type="button"
                  onClick={handleDownloadSqlBlob}
                  disabled={isDownloadingSql}
                  className="py-2.5 px-3 bg-white/10 hover:bg-white/15 text-white border border-white/10 text-[11px] font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer text-center disabled:opacity-50"
                >
                  {isDownloadingSql ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-slate-300" />
                  ) : (
                    <Download className="w-3.5 h-3.5 text-indigo-400" />
                  )}
                  Scarica SQLite (.db)
                </button>
              </div>

              <div className="pt-3 border-t border-white/10 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] text-slate-350 uppercase font-black tracking-wider font-mono">Master Backup Pack (`files.zip` + `db.zip`)</span>
                  <span className="bg-gradient-to-r from-emerald-500 to-indigo-500 text-white text-[8px] uppercase tracking-wider font-black px-1.5 py-0.5 rounded shadow-sm border border-emerald-400/30">Auto-Installante</span>
                </div>
                
                <p className="text-[10px] text-slate-300 leading-relaxed font-sans font-medium">
                  Il <strong>Master Backup (.zip)</strong> è il pacchetto supremo per Hostinger: racchiude sia i file di sorgente (<code>files.zip</code>) sia l'intero database (<code>db.zip</code>). Caricalo su <code>installer.php</code> per migrazioni o disaster recovery in un click!
                </p>

                <button
                  type="button"
                  onClick={handleDownloadZipBlob}
                  disabled={isDownloadingZip}
                  className="w-full py-2.5 bg-gradient-to-r from-emerald-600 to-indigo-650 hover:from-emerald-500 hover:to-indigo-550 text-white text-[11px] font-extrabold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer text-center shadow-md border border-emerald-500/30 font-sans disabled:opacity-50"
                >
                  {isDownloadingZip ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-white/70" />
                  ) : (
                    <Download className="w-3.5 h-3.5 text-white animate-bounce" />
                  )}
                  {isDownloadingZip ? 'Generazione in corso...' : 'Scarica Master Backup ZIP Completo (Files + DB)'}
                </button>
              </div>

              <div className="pt-3 border-t border-white/10 flex flex-col gap-2 font-sans">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] text-slate-350 uppercase font-black tracking-wider">Ripristina da un Backup</span>
                  <span className="bg-amber-500/10 text-amber-300 text-[8px] uppercase tracking-wider font-extrabold px-1.5 py-0.5 rounded border border-amber-500/20">Sovrascrive tutto</span>
                </div>

                <input
                  type="file"
                  ref={backupFileInputRef}
                  accept=".json"
                  className="hidden"
                  onChange={handleBackupRestoreJson}
                />

                <input
                  type="file"
                  ref={sqliteFileInputRef}
                  accept=".db"
                  className="hidden"
                  onChange={handleSqliteRestore}
                />

                <div className="flex flex-col sm:flex-row gap-2">
                  <button
                    type="button"
                    onClick={() => backupFileInputRef.current?.click()}
                    disabled={isImportingBackup || isImportingSqlite}
                    className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-sm"
                  >
                    {isImportingBackup ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-200" />
                    ) : (
                      <Upload className="w-3.5 h-3.5 text-emerald-200" />
                    )}
                    Ripristina JSON (.json)
                  </button>

                  <button
                    type="button"
                    onClick={() => sqliteFileInputRef.current?.click()}
                    disabled={isImportingBackup || isImportingSqlite}
                    className="flex-1 py-2.5 bg-indigo-650 hover:bg-indigo-600 text-white text-[11px] font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-sm"
                  >
                    {isImportingSqlite ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-200" />
                    ) : (
                      <Database className="w-3.5 h-3.5 text-indigo-300" />
                    )}
                    Ripristina SQLite (.db)
                  </button>
                </div>
              </div>
            </div>

            {/* HOSTINGER DEPLOYMENT KIT CARD */}
            <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm space-y-4 font-sans text-slate-800">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xl">🚀</span>
                  <h3 className="text-sm font-bold text-slate-900 font-sans">Deploy ed Autoinstallazione Hostinger</h3>
                </div>
                <span className="bg-indigo-50 text-indigo-650 text-[8px] uppercase tracking-wider font-black px-2 py-0.5 rounded border border-indigo-100">Produzione</span>
              </div>
              
              <p className="text-[11px] text-slate-500 leading-relaxed font-sans font-medium">
                Tutto il necessario per pubblicare l'applicazione in produzione su <strong>Hostinger (VPS o Node.js Hosting)</strong> è preconfigurato nella radice del tuo progetto caricato:
              </p>

              <div className="space-y-2 text-[11px] text-slate-650 font-sans">
                <div className="flex items-start gap-2 p-2.5 bg-slate-50 rounded-lg border border-slate-100">
                  <span className="text-xs">🌐</span>
                  <div>
                    <strong className="text-slate-900 text-[10px] uppercase tracking-wider font-extrabold block">Portale Autoinstallatore Web (`installer.php`)</strong>
                    Se caricato su Hostinger, permette di fare diagnosi del server, configurare le variabili d'ambiente `.env`, installare dipendenze, compilare con Vite e trascinare backup fisici SQLite dal browser.
                  </div>
                </div>

                <div className="flex items-start gap-2 p-2.5 bg-slate-50 rounded-lg border border-slate-100">
                  <span className="text-xs">🐚</span>
                  <div>
                    <strong className="text-slate-900 text-[10px] uppercase tracking-wider font-extrabold block">Installazione One-Click da SSH terminal (`install.sh`)</strong>
                    Script Linux Bash che automatizza `npm install`, compila l'applicazione con Vite, configura l'app e lancia il demone PM2.
                  </div>
                </div>

                <div className="flex items-start gap-2 p-2.5 bg-slate-50 rounded-lg border border-slate-100">
                  <span className="text-xs">⚙️</span>
                  <div>
                    <strong className="text-slate-900 text-[10px] uppercase tracking-wider font-extrabold block">Script Demone PM2 (`ecosystem.config.cjs`)</strong>
                    Configura il manager di processo permanente in produzione per autorestart e stabilità di grado enterprise.
                  </div>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100 flex flex-col gap-1.5">
                <div className="text-[9px] text-indigo-650 font-bold uppercase tracking-wider">Istruzioni d'uso rapide:</div>
                <p className="text-[10px] text-slate-500 leading-relaxed">
                  1. Esporta o scarica il database <strong>SQLite (.db)</strong> di Domenico da questa pagina.<br />
                  2. Copia i file di questa cartella sul server di produzione Hostinger.<br />
                  3. Accedi all'indirizzo dell'app con <code>/installer.php</code> e carica il database ed esegui la build in meno di 10 secondi!
                </p>
              </div>
            </div>
          </div>

        </div>
      </div>
    )}

      {/* PSD2 Simulated Auth Consent Modal Popup */}
      {showConnectModal && (
        <div className="fixed inset-0 bg-slate-950/45 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center gap-3">
              <span className="text-3xl">🔑</span>
              <div>
                <h4 className="text-sm font-bold text-slate-805">Consenso e Autorizzazione PSD2</h4>
                <p className="text-xs text-slate-500">Connessione sicura certificata Banca d'Italia</p>
              </div>
            </div>
            
            <p className="text-xs text-slate-600 font-sans leading-relaxed">
              Stai autorizzando il sistema <strong>Gestione Budget P.IVA</strong> a connettersi temporaneamente (Validità: 90 giorni) per fini informativi ed estratto conto in sola lettura. Nessun ordine dispositivo di bonifico può essere creato.
            </p>

            <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200 text-[10px] text-slate-650 space-y-1.5 font-mono">
              <div className="flex justify-between"><span>Certificato:</span><span className="text-emerald-600 font-bold">ATTIVO / EV SSL</span></div>
              <div className="flex justify-between"><span>Sola Lettura:</span><span className="text-indigo-650 font-bold">SI</span></div>
              <div className="flex justify-between"><span>Revocabilità:</span><span>Immediata via app bancaria</span></div>
            </div>

            <div className="flex gap-2 justify-end pt-2">
              <button 
                onClick={() => setShowConnectModal(false)}
                className="px-3.5 py-2 border border-slate-200 hover:bg-slate-50 text-slate-500 text-xs font-bold rounded cursor-pointer transition"
              >
                Declina
              </button>
              <button 
                onClick={handleApproveBankConsent}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded cursor-pointer shadow-xs"
              >
                Autorizza e Connetti
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Interactive Account Association mapping wizard modal */}
      {showAssociationModal && (
        <div className="fixed inset-0 bg-slate-950/45 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-xl font-sans">
            <div className="flex items-center gap-3">
              <span className="text-3xl">🔗</span>
              <div>
                <h4 className="text-sm font-bold text-slate-900">Associazione Conti Correnti Rilevati</h4>
                <p className="text-xs text-slate-500">Abbiamo recuperato i conti da <strong className="text-slate-800 font-semibold">{sessionBankName}</strong></p>
              </div>
            </div>

            <p className="text-xs text-slate-650 font-sans leading-relaxed">
              Prima di registrare, seleziona se vuoi associare ciascun conto corrente rilevato via API ad un 
              conto esistente oppure se preferisci creare una nuova scheda indipendente nel portafoglio.
            </p>

            <div className="space-y-3.5 max-h-72 overflow-y-auto pr-1">
              {retrievedAccounts.map((bAcc) => (
                <div key={bAcc.uid} className="bg-slate-50 border border-slate-205 rounded-xl p-3.5 space-y-2.5">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-xs font-bold text-slate-900 block">{bAcc.name}</span>
                      <span className="text-[10px] text-slate-500 block font-mono">{bAcc.iban || 'Nessun IBAN disponibile'}</span>
                    </div>
                    <span className="text-xs font-black text-slate-900 bg-white border border-slate-200 px-2.5 py-1 rounded-lg">
                      {bAcc.balance.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}
                    </span>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9px] font-extrabold text-slate-450 block uppercase tracking-wider">Azione / Destinazione Conto</label>
                    <select
                      value={accountAssociations[bAcc.uid] || 'new'}
                      onChange={(e) => setAccountAssociations({ ...accountAssociations, [bAcc.uid]: e.target.value })}
                      className="w-full text-xs p-2 border border-slate-200 rounded bg-white text-slate-800 focus:border-indigo-500 outline-none"
                    >
                      <option value="new">🆕 Crea un nuovo conto indipendente per la banca</option>
                      
                      {bAcc.candidates && bAcc.candidates.length > 0 && (
                        <optgroup label="Corrispondenze rilevate">
                          {bAcc.candidates.map((cand: any) => (
                            <option key={cand.id} value={cand.id} className="text-xs font-medium text-emerald-950">
                              ⭐ Associa ed unisci a: {cand.name} (Saldo attuale: {cand.balance} €)
                            </option>
                          ))}
                        </optgroup>
                      )}

                      {allExistingAccounts.length > 0 && (
                        <optgroup label="Tutti i tuoi conti esistenti">
                          {allExistingAccounts.map((exc) => {
                            // avoid duplicating candidates in list if they are already in the optgroup above
                            const isCand = bAcc.candidates && bAcc.candidates.some((c: any) => c.id === exc.id);
                            if (isCand) return null;
                            return (
                              <option key={exc.id} value={exc.id} className="text-xs">
                                {exc.name} (Saldo attuale: {exc.balance} €)
                              </option>
                            );
                          })}
                        </optgroup>
                      )}
                    </select>

                    {bAcc.candidates && bAcc.candidates.length > 0 && accountAssociations[bAcc.uid] === bAcc.candidates[0].id && (
                      <p className="text-[10px] text-emerald-700 font-sans mt-1 flex items-center gap-1 font-semibold">
                        <span>✓</span> Consigliato: Trovato conto corrispondente per questa banca nell'archivio.
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-2 justify-end pt-2">
              <button 
                type="button"
                onClick={() => setShowAssociationModal(false)}
                className="px-3.5 py-2 border border-slate-200 hover:bg-slate-50 text-slate-500 text-xs font-bold rounded-lg cursor-pointer transition"
              >
                Annulla Sincronizzazione
              </button>
              <button 
                type="button"
                onClick={handleConfirmBankSyncAssociation}
                className="px-4 py-2 bg-indigo-650 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg cursor-pointer shadow-xs transition"
              >
                Completa e Unisci Movimenti
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
