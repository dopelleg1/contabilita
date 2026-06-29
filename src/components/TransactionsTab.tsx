/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { Transaction, Account, TransactionScope, PersonalCategory, ProfessionalCategory } from '../types';
import { Invoice, invoices2026 } from '../data/invoices2026';
import { 
  Plus, 
  Search, 
  SlidersHorizontal, 
  Trash2, 
  Briefcase, 
  User, 
  ArrowRightLeft,
  ChevronDown,
  Calendar,
  Layers,
  Sparkles,
  HelpCircle,
  TrendingDown,
  TrendingUp,
  Bookmark,
  Camera,
  UploadCloud,
  Image,
  X,
  CheckCircle2,
  Pencil,
  Check,
  FileText,
  FileCheck,
  FileSpreadsheet,
  AlertTriangle,
  RefreshCw
} from 'lucide-react';

interface TransactionsTabProps {
  transactions: Transaction[];
  accounts: Account[];
  onAddTransaction: (tx: Transaction) => void;
  onUpdateTransaction: (id: string, updates: Partial<Transaction>) => void;
  onDeleteTransaction: (id: string) => void;
}

export default function TransactionsTab({ 
  transactions, 
  accounts, 
  onAddTransaction, 
  onUpdateTransaction, 
  onDeleteTransaction 
}: TransactionsTabProps) {
  
  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>(['all']);
  const [filterScope, setFilterScope] = useState<'all' | 'personal' | 'professional'>('all');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterSubcategory, setFilterSubcategory] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [activePeriodPreset, setActivePeriodPreset] = useState<'all' | 'month' | 'quarter' | 'year' | 'custom'>('all');
  const [sortBy, setSortBy] = useState<'date-desc' | 'date-asc' | 'amount-desc' | 'amount-asc'>('date-desc');
  const [excludeFinancing, setExcludeFinancing] = useState(false);

  // Helper to format date cleanly as DD/MM/YYYY (no hours)
  const formatDateOnly = (dateStr: string) => {
    if (!dateStr) return '';
    // Strip time portion if present (splits on T or space)
    const cleanDate = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr.split(' ')[0];
    const parts = cleanDate.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
  };

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;

  // Reset pagination to first page whenever filter parameters alter
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedAccounts, filterScope, filterCategory, filterSubcategory, dateFrom, dateTo, sortBy, excludeFinancing]);

  // Helper to manage account button toggle selections ("tutti, alcuni o solo uno")
  const handleToggleAccountFilter = (accId: string) => {
    if (accId === 'all') {
      setSelectedAccounts(['all']);
    } else {
      if (selectedAccounts.includes('all')) {
        setSelectedAccounts([accId]);
      } else {
        const updated = selectedAccounts.includes(accId)
          ? selectedAccounts.filter(id => id !== accId)
          : [...selectedAccounts, accId];
        
        if (updated.length === 0 || updated.length === accounts.length) {
          setSelectedAccounts(['all']);
        } else {
          setSelectedAccounts(updated);
        }
      }
    }
  };

  // Helper to apply preset date periods dynamically
  const applyPeriodPreset = (preset: 'all' | 'month' | 'quarter' | 'year') => {
    setActivePeriodPreset(preset);
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth(); // 0-indexed (0=Jan, 4=May)
    
    if (preset === 'all') {
      setDateFrom('');
      setDateTo('');
    } else if (preset === 'month') {
      const lastDay = new Date(year, month + 1, 0).getDate();
      const fStr = `${year}-${String(month + 1).padStart(2, '0')}-01`;
      const lStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
      setDateFrom(fStr);
      setDateTo(lStr);
    } else if (preset === 'quarter') {
      const quarterIndex = Math.floor(month / 3);
      const startMonth = quarterIndex * 3 + 1;
      const endMonth = quarterIndex * 3 + 3;
      const lastDay = new Date(year, endMonth, 0).getDate();
      
      const fStr = `${year}-${String(startMonth).padStart(2, '0')}-01`;
      const lStr = `${year}-${String(endMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
      setDateFrom(fStr);
      setDateTo(lStr);
    } else if (preset === 'year') {
      setDateFrom(`${year}-01-01`);
      setDateTo(`${year}-12-31`);
    }
  };

  // New Transaction form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [direction, setDirection] = useState<'expense' | 'income' | 'transfer'>('expense');
  const [accountId, setAccountId] = useState(accounts[0]?.id || '');
  const [destinationAccountId, setDestinationAccountId] = useState(accounts[1]?.id || accounts[0]?.id || '');
  const [scope, setScope] = useState<TransactionScope>('personal');
  const [category, setCategory] = useState<string>('necessarie');
  const [subcategory, setSubcategory] = useState('');
  
  // AI Receipts and Camera states
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [dragActive, setDragActive] = useState(false);

  // Success toast representation
  const [successMsg, setSuccessMsg] = useState('');

  // Invoice matching states
  const [showInvoicePanel, setShowInvoicePanel] = useState(false);
  const [invoiceSearchQuery, setInvoiceSearchQuery] = useState('');
  const [invoiceFilterStatus, setInvoiceFilterStatus] = useState<'all' | 'matched' | 'unmatched' | 'compensated'>('all');
  const [compensatedInvoiceNums, setCompensatedInvoiceNums] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('compensated_invoices_2026');
      return saved ? JSON.parse(saved) : [];
    } catch (_) {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('compensated_invoices_2026', JSON.stringify(compensatedInvoiceNums));
    } catch (_) {}
  }, [compensatedInvoiceNums]);

  // Specific transaction field states
  const [notes, setNotes] = useState('');
  const [customer, setCustomer] = useState('');

  // Transfer automatic analyzer state
  const [showAnalysisPanel, setShowAnalysisPanel] = useState(false);

  // Duplicate transaction analyzer state
  const [showDuplicatePanel, setShowDuplicatePanel] = useState(false);
  const [ignoredDuplicateIds, setIgnoredDuplicateIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('ignored_duplicate_tx_ids');
      return saved ? JSON.parse(saved) : [];
    } catch (_) {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('ignored_duplicate_tx_ids', JSON.stringify(ignoredDuplicateIds));
    } catch (_) {}
  }, [ignoredDuplicateIds]);
  const [time, setTime] = useState('');
  const [editTime, setEditTime] = useState('');

  // Edit Transaction state
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [editDate, setEditDate] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editDirection, setEditDirection] = useState<'expense' | 'income' | 'transfer'>('expense');
  const [editAccountId, setEditAccountId] = useState('');
  const [editDestinationAccountId, setEditDestinationAccountId] = useState('');
  const [editScope, setEditScope] = useState<TransactionScope>('personal');
  const [editCategory, setEditCategory] = useState('');
  const [editSubcategory, setEditSubcategory] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editCustomer, setEditCustomer] = useState('');
  const [editInvoiceId, setEditInvoiceId] = useState('');

  // Clean stream when unmounting
  useEffect(() => {
    return () => {
      if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [cameraStream]);

  // Handle setting correct default category when scope varies
  const handleScopeChange = (newScope: TransactionScope) => {
    setScope(newScope);
    if (newScope === 'personal') {
      setCategory('necessarie');
    } else {
      setCategory('necessarie_lavoro');
    }
  };

  // Submit hander
  const handleAddTxSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (direction !== 'transfer' && !description.trim()) {
      alert('Inserire una descrizione valida.');
      return;
    }
    if (isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      alert('Inserire un importo maggiore di zero.');
      return;
    }

    if (direction === 'transfer' && accountId === destinationAccountId) {
      alert('Il conto di origine e di destinazione devono essere diversi.');
      return;
    }

    const value = Math.abs(parseFloat(amount));
    
    // For transfer, the transaction acts as a negative outflow from source accountId. 
    // The balance changes for destinationAccountId will be automated in App.tsx!
    const finalAmount = (direction === 'expense' || direction === 'transfer') ? -value : value;

    const sourceName = accounts.find(a => a.id === accountId)?.name || 'Conto Sorgente';
    const destName = accounts.find(a => a.id === destinationAccountId)?.name || 'Conto Destinatario';

    const cleanDescription = direction === 'transfer'
      ? `Giroconto: ${description.trim() || 'Trasferimento fondi'} (${sourceName} ➔ ${destName})`
      : description.trim();

    const newTx: Transaction = {
      id: `tx-${Date.now()}`,
      date: time ? `${date}T${time}` : date,
      description: cleanDescription,
      amount: finalAmount,
      type: direction,
      accountId,
      destinationAccountId: direction === 'transfer' ? destinationAccountId : undefined,
      scope,
      category: direction === 'transfer' ? 'trasferimento' as any : category as any,
      subcategory: direction === 'transfer' ? 'Giroconto' : (subcategory.trim() || 'Altro')
    };

    onAddTransaction(newTx);
    
    // Clear and Toast
    setDescription('');
    setAmount('');
    setTime('');
    setSubcategory('');
    setShowAddForm(false);
    
    setSuccessMsg(direction === 'transfer' ? 'Giroconto registrato correttamente!' : 'Movimento inserito!');
    setTimeout(() => setSuccessMsg(''), 3000);
  };

  // AI Camera and file processes
  const handleStartCamera = async () => {
    try {
      setIsCameraOpen(true);
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      setCameraStream(stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
    } catch (err) {
      console.error("Camera access error:", err);
      alert("Impossibile accedere alla fotocamera. Verifica i permessi o prova a caricare un file immagine in alternativa.");
      setIsCameraOpen(false);
    }
  };

  const handleCapturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg');
        const base64Data = dataUrl.split(',')[1];
        analyzeReceiptImage(base64Data, 'image/jpeg');
      }
      handleStopCamera();
    }
  };

  const handleStopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      setCameraStream(null);
    }
    setIsCameraOpen(false);
  };

  const analyzeReceiptImage = async (base64Data: string, mimeType: string) => {
    setIsAnalyzing(true);
    try {
      const response = await fetch('/api/analyze-receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64Data, mimeType })
      });
      const data = await response.json();
      if (data.error) {
        alert(data.error);
      } else if (data.fallback) {
        alert(data.message);
      } else {
        if (data.date) setDate(data.date);
        if (data.description) setDescription(data.description);
        if (data.amount) setAmount(Math.abs(data.amount).toString());
        if (data.scope) handleScopeChange(data.scope);
         if (data.category) setCategory(data.category);
        if (data.subcategory) setSubcategory(data.subcategory);
        setDirection('expense'); // Receipts are usually spent funds
        
        setSuccessMsg(`Scanner completato! Rilevato: ${data.description} (${data.amount} €)`);
        setTimeout(() => setSuccessMsg(''), 4050);
      }
    } catch (error) {
      console.error("Receipt analysis network error:", error);
      alert("Errore durante la connessione per l'analisi dello scontrino.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processFile(file);
  };

  const processFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      alert("Carica solo file di tipo immagine (PNG / JPEG)");
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      const base64Data = dataUrl.split(',')[1];
      analyzeReceiptImage(base64Data, file.type);
    };
    reader.readAsDataURL(file);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  // Get common subcategories for convenience
  const getSubcategoryList = () => {
    if (scope === 'personal') {
      if (category === 'necessarie') return ['Alimentari', 'Affitto Casa', 'Bollette Luce/Gas', 'Mutuo / Prestiti', 'Salute', 'Spostamenti'];
      if (category === 'utili') return ['Auto & Tagliandi', 'Abbonamento Treno', 'Corsi & Istruzione', 'Palestra', 'Associazioni'];
      if (category === 'tempo_libero') return ['Ristoranti & Caffè', 'Cinema & Concerti', 'Vacanze & Hotel', 'Shopping & Moda', 'Hobby'];
      return ['Entrata Generica', 'Regalo', 'Stipendio'];
    } else {
      if (category === 'necessarie_lavoro') return ['Commercialista', 'Tasse Sostitutive', 'Contributi INPS', 'Affitto Studio', 'Fattura Fornitore', 'Assicurazione prof.'];
      if (category === 'utili_lavoro') return ['Software & SaaS', 'Dispositivi & Hardware', 'Cancellazione & Cancelleria', 'Corsi prof.', 'Marketing & Ads', 'Carburante studio'];
      return ['Fattura Cliente', 'Consulenza', 'Rivalsa INPS', 'Acconto ricevuto'];
    }
  };

  // Quick Inline Category toggles
  const handleToggleScope = (tx: Transaction) => {
    const nextScope: TransactionScope = tx.scope === 'personal' ? 'professional' : 'personal';
    const nextCategory = nextScope === 'personal' ? 'necessarie' : 'necessarie_lavoro';
    const nextSub = nextScope === 'personal' ? 'Altro' : 'Spesa Lavoro';
    onUpdateTransaction(tx.id, { 
      scope: nextScope, 
      category: nextCategory as any, 
      subcategory: nextSub 
    });
  };

  const handleEditScopeChange = (newScope: TransactionScope) => {
    setEditScope(newScope);
    if (newScope === 'personal') {
      setEditCategory('necessarie');
    } else {
      setEditCategory('necessarie_lavoro');
    }
  };

  const getEditSubcategoryList = () => {
    if (editScope === 'personal') {
      if (editCategory === 'necessarie') return ['Alimentari', 'Affitto Casa', 'Bollette Luce/Gas', 'Mutuo / Prestiti', 'Salute', 'Spostamenti'];
      if (editCategory === 'utili') return ['Auto & Tagliandi', 'Abbonamento Treno', 'Corsi & Istruzione', 'Palestra', 'Associazioni'];
      if (editCategory === 'tempo_libero') return ['Ristoranti & Caffè', 'Cinema & Concerti', 'Vacanze & Hotel', 'Shopping & Moda', 'Hobby'];
      return ['Entrata Generica', 'Regalo', 'Stipendio'];
    } else {
      if (editCategory === 'necessarie_lavoro') return ['Commercialista', 'Tasse Sostitutive', 'Contributi INPS', 'Affitto Studio', 'Fattura Fornitore', 'Assicurazione prof.'];
      if (editCategory === 'utili_lavoro') return ['Software & SaaS', 'Dispositivi & Hardware', 'Cancellazione & Cancelleria', 'Corsi prof.', 'Marketing & Ads', 'Carburante studio'];
      return ['Fattura Cliente', 'Consulenza', 'Rivalsa INPS', 'Acconto ricevuto'];
    }
  };

  const startEditingTransaction = (tx: Transaction) => {
    const editAction = () => {
      setEditingTx(tx);
      if (tx.date.includes('T')) {
        const [d, t] = tx.date.split('T');
        setEditDate(d);
        setEditTime(t);
      } else if (tx.date.includes(' ')) {
        const [d, t] = tx.date.split(' ');
        setEditDate(d);
        setEditTime(t);
      } else {
        setEditDate(tx.date);
        setEditTime('');
      }
      let displayDesc = tx.description;
      if (tx.type === 'transfer' && tx.description.startsWith('Giroconto:')) {
        const match = tx.description.match(/^Giroconto:\s*(.*?)\s*\(/);
        if (match && match[1]) {
          displayDesc = match[1];
          if (displayDesc === 'Trasferimento fondi') displayDesc = '';
        }
      }
      setEditDescription(displayDesc);
      setEditAmount(Math.abs(tx.amount).toString());
      setEditDirection(tx.type);
      setEditAccountId(tx.accountId);
      setEditDestinationAccountId(tx.destinationAccountId || accounts[1]?.id || accounts[0]?.id || '');
      setEditScope(tx.scope);
      setEditCategory(tx.category);
      setEditSubcategory(tx.subcategory);
      setEditNotes(tx.notes || '');
      setEditCustomer(tx.customer || '');
      setEditInvoiceId(tx.invoiceId || '');
    };

    if (tx.isVerified) {
      const showConfirm = (window as any).showCustomConfirm;
      if (showConfirm) {
        showConfirm({
          title: "Modifica Transazione Verificata",
          message: "Attenzione: questa transazione è stata contrassegnata come VERIFICATA/SPUNTATA con l'estratto conto. Se la modifichi, la quadratura dei conti potrebbe variare. Vuoi procedere comunque con la modifica?",
          confirmText: "Procedi",
          variant: "warning",
          onConfirm: editAction
        });
      } else {
        const confirmEdit = window.confirm("Attenzione: questa transazione è stata contrassegnata come VERIFICATA/SPUNTATA con l'estratto conto. Se la modifichi, la quadratura dei conti potrebbe variare.\n\nVuoi procedere comunque con la modifica?");
        if (confirmEdit) editAction();
      }
    } else {
      editAction();
    }
  };

  const handleEditTxSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTx) return;

    if (editDirection !== 'transfer' && !editDescription.trim()) {
      alert('Inserire una descrizione valida.');
      return;
    }
    if (isNaN(parseFloat(editAmount)) || parseFloat(editAmount) <= 0) {
      alert('Inserire un importo maggiore di zero.');
      return;
    }

    if (editDirection === 'transfer' && editAccountId === editDestinationAccountId) {
      alert('Il conto di origine e di destinazione devono essere diversi.');
      return;
    }

    const value = Math.abs(parseFloat(editAmount));
    const finalAmount = (editDirection === 'expense' || editDirection === 'transfer') ? -value : value;

    let cleanDescription = editDescription.trim();
    if (editDirection === 'transfer') {
      const sourceName = accounts.find(a => a.id === editAccountId)?.name || 'Conto Sorgente';
      const destName = accounts.find(a => a.id === editDestinationAccountId)?.name || 'Conto Destinatario';
      
      if (!cleanDescription || cleanDescription.startsWith('Giroconto:')) {
        cleanDescription = `Giroconto: Trasferimento fondi (${sourceName} ➔ ${destName})`;
      } else {
        cleanDescription = `Giroconto: ${cleanDescription} (${sourceName} ➔ ${destName})`;
      }
    }

    onUpdateTransaction(editingTx.id, {
      date: editTime ? `${editDate}T${editTime}` : editDate,
      description: cleanDescription,
      amount: finalAmount,
      type: editDirection,
      accountId: editAccountId,
      destinationAccountId: editDirection === 'transfer' ? editDestinationAccountId : undefined,
      scope: editScope,
      category: editDirection === 'transfer' ? 'trasferimento' as any : editCategory as any,
      subcategory: editDirection === 'transfer' ? 'Giroconto' : (editSubcategory.trim() || 'Altro'),
      notes: editNotes || undefined,
      customer: editScope === 'professional' ? (editCustomer || undefined) : undefined,
      invoiceId: editScope === 'professional' ? (editInvoiceId || undefined) : undefined
    });

    setEditingTx(null);
    setEditTime('');
    setSuccessMsg('Movimento modificato con successo!');
    setTimeout(() => setSuccessMsg(''), 3000);
  };

  // Helper to parse date/time info
  const getTxDateTimeInfo = (dateStr: string) => {
    if (!dateStr) return { datePart: '', timePart: '' };
    if (dateStr.includes('T')) {
      const parts = dateStr.split('T');
      return { datePart: parts[0], timePart: parts[1] || '' };
    }
    if (dateStr.includes(' ')) {
      const parts = dateStr.split(' ');
      return { datePart: parts[0], timePart: parts[1] || '' };
    }
    return { datePart: dateStr, timePart: '' };
  };

  // Memoized potentials calculation
  const potentials = React.useMemo(() => {
    const candidates = transactions.filter(t => !t.linkedTransactionId && (t.type !== 'transfer' || !t.destinationAccountId));
    const expenses = candidates.filter(t => t.amount < 0);
    const incomes = candidates.filter(t => t.amount > 0);

    const matches: Array<{
      expense: Transaction;
      income: Transaction;
      isExact: boolean;
      reason: string;
    }> = [];

    const matchedSet = new Set<string>();

    expenses.forEach(exp => {
      if (matchedSet.has(exp.id)) return;
      const expInfo = getTxDateTimeInfo(exp.date);

      // Find an unmatched income with exact same absolute amount, within 3 days tolerance, on different account
      const foundIdx = incomes.findIndex(inc => {
        if (matchedSet.has(inc.id)) return false;
        if (inc.accountId === exp.accountId) return false;
        if (Math.abs(exp.amount) !== inc.amount) return false;

        const incInfo = getTxDateTimeInfo(inc.date);
        
        // Calculate date difference in days
        const dExp = new Date(expInfo.datePart);
        const dInc = new Date(incInfo.datePart);
        if (isNaN(dExp.getTime()) || isNaN(dInc.getTime())) return false;
        const diffDays = Math.abs(dInc.getTime() - dExp.getTime()) / (1000 * 60 * 60 * 24);
        return diffDays <= 3;
      });

      if (foundIdx !== -1) {
        const inc = incomes[foundIdx];
        const expInfo = getTxDateTimeInfo(exp.date);
        const incInfo = getTxDateTimeInfo(inc.date);

        const expTimeClean = expInfo.timePart ? expInfo.timePart.substring(0, 5) : '';
        const incTimeClean = incInfo.timePart ? incInfo.timePart.substring(0, 5) : '';

        const sameDate = expInfo.datePart === incInfo.datePart;
        const sameTime = expTimeClean === incTimeClean;
        const isExact = sameDate && sameTime; // True if both have no time or same time on the exact same date

        let reason = "";
        if (sameDate) {
          reason = isExact 
            ? "Stessa data e orario coincidente" 
            : `Stessa data (${expInfo.datePart}) ma orario differente (Uscita: ${expTimeClean || 'Non specificato'}, Entrata: ${incTimeClean || 'Non specificato'})`;
        } else {
          reason = `Date diverse (Uscita: ${formatDateOnly(exp.date)}, Entrata: ${formatDateOnly(inc.date)})`;
        }

        matches.push({
          expense: exp,
          income: inc,
          isExact,
          reason
        });

        matchedSet.add(exp.id);
        matchedSet.add(inc.id);
      }
    });

    return matches;
  }, [transactions]);

  // Handle linking two existing transactions as a giroconto
  const handleLinkGiroconti = (exp: Transaction, inc: Transaction) => {
    const expAccName = accounts.find(a => a.id === exp.accountId)?.name || 'Origine';
    const incAccName = accounts.find(a => a.id === inc.accountId)?.name || 'Arrivo';

    const updatedExp: Partial<Transaction> = {
      type: 'transfer',
      linkedTransactionId: inc.id,
      destinationAccountId: inc.accountId,
      category: 'trasferimento' as any,
      subcategory: 'Giroconto',
      description: `Giroconto: Trasferimento fondi (${expAccName} ➔ ${incAccName})`
    };

    const updatedInc: Partial<Transaction> = {
      linkedTransactionId: exp.id,
      category: 'trasferimento' as any,
      subcategory: 'Giroconto',
      description: `Ricezione Giroconto da ${expAccName}`
    };

    onUpdateTransaction(exp.id, updatedExp);
    setTimeout(() => {
      onUpdateTransaction(inc.id, updatedInc);
    }, 150);

    setSuccessMsg("Giroconto accoppiato e conti allineati!");
    setTimeout(() => setSuccessMsg(""), 3000);
  };

  // Auto handle apply for all exact matches
  const handleApplyAllExactMatches = () => {
    const exactMatches = potentials.filter(p => p.isExact);
    if (exactMatches.length === 0) return;

    exactMatches.forEach((pair, index) => {
      setTimeout(() => {
        handleLinkGiroconti(pair.expense, pair.income);
      }, index * 300);
    });

    setSuccessMsg(`Collegate automaticamente ${exactMatches.length} transazioni di giroconto!`);
    setTimeout(() => setSuccessMsg(''), 3000);
  };

  // Get unique subcategories existing in the transactions database for filtering dropdown
  const uniqueSubcategories = Array.from(
    new Set(transactions.map(tx => tx.subcategory).filter(Boolean))
  ).sort();

  // Filter transactions
  const filteredTransactions = transactions.filter(tx => {
    // 1. Text Search query
    const term = searchQuery.toLowerCase();
    const matchSearch = tx.description.toLowerCase().includes(term) || tx.subcategory.toLowerCase().includes(term);
    
    // 2. Account toggle filter ("tutti, alcuni o solo uno")
    const matchAccount = selectedAccounts.includes('all') || selectedAccounts.includes(tx.accountId);
    
    // 2b. Exclude Financing / loan accounts if toggle is active
    if (excludeFinancing) {
      const isFinancingAcc = accounts.find(a => a.id === tx.accountId)?.type === 'financing';
      if (isFinancingAcc) return false;
    }
    
    // 3. Fiscal scope filter ("personal", "professional", "all")
    const matchScope = filterScope === 'all' || tx.scope === filterScope;
    
    // 4. Category filter
    let matchCat = true;
    if (filterCategory !== 'all') {
      matchCat = tx.category === filterCategory;
    }

    // 5. Subcategory filter
    let matchSubcat = true;
    if (filterSubcategory !== 'all') {
      matchSubcat = tx.subcategory === filterSubcategory;
    }

    // 6. Custom date range filter
    let matchDateFrom = true;
    if (dateFrom) {
      matchDateFrom = tx.date >= dateFrom;
    }
    let matchDateTo = true;
    if (dateTo) {
      matchDateTo = tx.date <= dateTo;
    }

    // Exclude the receiving (positive) leg of transfers/giroconti so each transfer shows as ONE consolidated entry
    const isReceivingTransferLeg = tx.amount > 0 && tx.linkedTransactionId && (() => {
      const other = transactions.find(t => t.id === tx.linkedTransactionId);
      return other && other.amount < 0 && (other.type === 'transfer' || other.destinationAccountId !== undefined);
    })();
    if (isReceivingTransferLeg) return false;

    return matchSearch && matchAccount && matchScope && matchCat && matchSubcat && matchDateFrom && matchDateTo;
  });

  // Sort by date or amount
  const sortedTransactions = [...filteredTransactions].sort((a, b) => {
    if (sortBy === 'date-desc') return b.date.localeCompare(a.date); // most recent first
    if (sortBy === 'date-asc') return a.date.localeCompare(b.date); // oldest first
    if (sortBy === 'amount-desc') return b.amount - a.amount;
    if (sortBy === 'amount-asc') return a.amount - b.amount;
    return 0;
  });

  // Calculate totals over the filtered selection for display under Amount column
  const totalFilteredCount = sortedTransactions.length;
  const totalFilteredAmount = sortedTransactions.reduce((acc, tx) => acc + tx.amount, 0);
  const totalFilteredIncome = sortedTransactions.filter(tx => tx.amount > 0).reduce((acc, tx) => acc + tx.amount, 0);
  const totalFilteredExpense = sortedTransactions.filter(tx => tx.amount < 0).reduce((acc, tx) => acc + tx.amount, 0);

  // Pagination bounds and slices (50 at a time)
  const totalPages = Math.ceil(totalFilteredCount / itemsPerPage) || 1;
  const validatedPage = Math.min(currentPage, totalPages);
  const startIndex = (validatedPage - 1) * itemsPerPage;
  const paginatedTransactions = sortedTransactions.slice(startIndex, startIndex + itemsPerPage);

  interface DuplicateGroup {
    id: string;
    type: 'certain' | 'possible' | 'transfer';
    percentage: number;
    reason: string;
    transactions: Transaction[];
  }

  const getDuplicateGroups = (): DuplicateGroup[] => {
    const activeTxs = transactions.filter(t => !ignoredDuplicateIds.includes(t.id));
    const groups: DuplicateGroup[] = [];
    const processedIds = new Set<string>();

    // 1. Detect Giroconto duplicates (Transfer vs. Individual Expense + Income)
    const transfers = activeTxs.filter(t => t.type === 'transfer' && t.destinationAccountId);
    for (const t of transfers) {
      if (processedIds.has(t.id)) continue;
      const absAmt = Math.abs(t.amount);
      const tTime = new Date(t.date).getTime();

      // Find matching Expense (E) in source account
      const expense = activeTxs.find(e => 
        e.id !== t.id &&
        e.accountId === t.accountId &&
        Math.abs(e.amount) === absAmt &&
        e.amount < 0 &&
        e.type === 'expense' &&
        Math.abs(new Date(e.date).getTime() - tTime) <= (1000 * 60 * 60 * 24)
      );

      // Find matching Income (I) in destination account
      const income = activeTxs.find(i => 
        i.id !== t.id &&
        i.accountId === t.destinationAccountId &&
        Math.abs(i.amount) === absAmt &&
        i.amount > 0 &&
        i.type === 'income' &&
        Math.abs(new Date(i.date).getTime() - tTime) <= (1000 * 60 * 60 * 24)
      );

      if (expense && income) {
        processedIds.add(t.id);
        processedIds.add(expense.id);
        processedIds.add(income.id);
        groups.push({
          id: `dup-transfer-${t.id}`,
          type: 'transfer',
          percentage: 75,
          reason: `Il giroconto (€${absAmt.toFixed(2)}) è duplicato da una spesa singola su ${accounts.find(a => a.id === t.accountId)?.name || 'Conto A'} e un'entrata singola su ${accounts.find(a => a.id === t.destinationAccountId)?.name || 'Conto B'}`,
          transactions: [t, expense, income]
        });
      }
    }

    // 2. Detect Standard Duplicates (Same account, same amount, same date or ±1 day)
    const bucket: { [key: string]: Transaction[] } = {};
    for (const tx of activeTxs) {
      if (processedIds.has(tx.id)) continue;
      const key = `${tx.accountId}_${Math.abs(tx.amount).toFixed(2)}`;
      if (!bucket[key]) bucket[key] = [];
      bucket[key].push(tx);
    }

    for (const key in bucket) {
      const list = bucket[key];
      if (list.length < 2) continue;

      const sublist = [...list];
      while (sublist.length > 1) {
        const pivot = sublist.shift()!;
        if (processedIds.has(pivot.id)) continue;

        const pivotTime = new Date(pivot.date).getTime();
        const matches: Transaction[] = [];
        let type: 'certain' | 'possible' = 'possible';
        let percentage = 50;
        let reason = '';

        for (let i = 0; i < sublist.length; i++) {
          const candidate = sublist[i];
          if (processedIds.has(candidate.id)) continue;

          const candTime = new Date(candidate.date).getTime();
          const diffDays = Math.abs(pivotTime - candTime) / (1000 * 60 * 60 * 24);

          if (diffDays === 0) {
            matches.push(candidate);
            type = 'certain';
            percentage = 90;
            reason = `Transazioni identiche rilevate nello stesso giorno sullo stesso conto`;
          } else if (diffDays === 1) {
            matches.push(candidate);
            reason = `Transazioni identiche rilevate a distanza di 1 giorno sullo stesso conto`;
          }
        }

        if (matches.length > 0) {
          const groupTxs = [pivot, ...matches];
          groupTxs.forEach(t => processedIds.add(t.id));
          groups.push({
            id: `dup-std-${pivot.id}`,
            type,
            percentage,
            reason: `${reason} (€${Math.abs(pivot.amount).toFixed(2)})`,
            transactions: groupTxs
          });
        }
      }
    }

    return groups;
  };

  const formatEuro = (val: number) => {
    return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(val);
  };
  return (
    <div className="space-y-6" id="transactions-tab">
      
      {/* Action Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white border border-slate-200 p-6 rounded-2xl shadow-sm">
        <div>
          <h2 className="text-lg font-bold text-slate-800">Libro Giornale delle Transazioni</h2>
          <p className="text-xs text-slate-505 mt-1">
            Ricerca, raggruppa ed edita i movimenti. Clicca sul badge "Ambito" per spostare al volo una transazione da Personale a Partita IVA.
          </p>
        </div>
        
        <div className="flex flex-wrap items-center gap-2">
          <button
            id="btn-open-invoices"
            onClick={() => {
              setShowInvoicePanel(!showInvoicePanel);
              if (!showInvoicePanel) {
                setShowAnalysisPanel(false);
                setShowAddForm(false);
                setShowDuplicatePanel(false);
              }
            }}
            className={`relative flex items-center gap-1.5 px-3.5 py-2.5 rounded-lg text-xs font-bold transition-all border shadow-sm cursor-pointer ${
              showInvoicePanel
                ? "bg-amber-50 border-amber-300 text-amber-900 hover:bg-amber-100/50"
                : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
            }`}
          >
            <FileSpreadsheet className="w-4 h-4 text-amber-500" />
            Riconciliazione Fatture 2026
            {invoices2026.filter(inv => {
              const isMatched = transactions.some(t => t.invoiceId === inv.number);
              const isCompensated = compensatedInvoiceNums.includes(inv.number);
              return !isMatched && !isCompensated;
            }).length > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-amber-600 border border-white text-white text-[9px] font-extrabold w-4 h-4 rounded-full flex items-center justify-center animate-pulse">
                {invoices2026.filter(inv => {
                  const isMatched = transactions.some(t => t.invoiceId === inv.number);
                  const isCompensated = compensatedInvoiceNums.includes(inv.number);
                  return !isMatched && !isCompensated;
                }).length}
              </span>
            )}
          </button>

          <button
            id="btn-open-analysis"
            onClick={() => {
              setShowAnalysisPanel(!showAnalysisPanel);
              if (!showAnalysisPanel) {
                setShowInvoicePanel(false);
                setShowAddForm(false);
                setShowDuplicatePanel(false);
              }
            }}
            className={`relative flex items-center gap-1.5 px-3.5 py-2.5 rounded-lg text-xs font-bold transition-all border shadow-sm cursor-pointer ${
              showAnalysisPanel
                ? "bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100"
                : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
            }`}
          >
            <ArrowRightLeft className="w-4 h-4 text-blue-600" />
            Analizza Giroconti
            {potentials.length > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-blue-600 border border-white text-white text-[9px] font-extrabold w-4 h-4 rounded-full flex items-center justify-center animate-pulse">
                {potentials.length}
              </span>
            )}
          </button>

          <button
            id="btn-open-duplicates"
            onClick={() => {
              setShowDuplicatePanel(!showDuplicatePanel);
              if (!showDuplicatePanel) {
                setShowAnalysisPanel(false);
                setShowInvoicePanel(false);
                setShowAddForm(false);
              }
            }}
            className={`relative flex items-center gap-1.5 px-3.5 py-2.5 rounded-lg text-xs font-bold transition-all border shadow-sm cursor-pointer ${
              showDuplicatePanel
                ? "bg-amber-50 border-amber-300 text-amber-900 hover:bg-amber-100/50"
                : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
            }`}
          >
            <Layers className="w-4 h-4 text-amber-500" />
            Pulisci Duplicati
            {getDuplicateGroups().length > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-amber-600 border border-white text-white text-[9px] font-extrabold w-4 h-4 rounded-full flex items-center justify-center animate-pulse">
                {getDuplicateGroups().length}
              </span>
            )}
          </button>

          <button 
            id="btn-open-add-transaction"
            onClick={() => {
              setShowAddForm(!showAddForm);
              if (!showAddForm) {
                setShowAnalysisPanel(false);
                setShowInvoicePanel(false);
                setShowDuplicatePanel(false);
              }
            }}
            className="flex items-center gap-1.5 px-3.5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition-all shadow-sm cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Registra Transazione Reale
          </button>
        </div>
      </div>

      {successMsg && (
        <div className="bg-emerald-50 border border-emerald-100 text-emerald-700 p-4 rounded-xl text-xs flex items-center gap-2 shadow-sm animate-pulse">
          <Bookmark className="w-4 h-4" />
          {successMsg}
        </div>
      )}

      {/* Giroconti Analysis Collapsible Panel */}
      {showAnalysisPanel && (
        <div className="bg-gradient-to-br from-slate-50 to-blue-50/20 border border-blue-100 p-6 rounded-2xl shadow-sm space-y-4 animate-fade-in" id="giroconti-analysis-panel">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-blue-50 pb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <ArrowRightLeft className="w-4 h-4 text-blue-600" />
                Analizzatore Giroconti Automatico & Assistito
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Il sistema scansiona le transazioni isolate (uscite ed entrate dello stesso importo in diversi conti dello stesso giorno) e ti propone di accorparle come Giroconto per tenere i bilanci perfettamente sincronizzati.
              </p>
            </div>
            {potentials.filter(p => p.isExact).length > 0 && (
              <button
                type="button"
                onClick={handleApplyAllExactMatches}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold rounded-lg shadow-2xs transition-all cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Applica automatici ({potentials.filter(p => p.isExact).length})
              </button>
            )}
          </div>

          {potentials.length === 0 ? (
            <div className="py-8 text-center bg-white border border-slate-100 rounded-xl">
              <span className="text-2xl">🎉</span>
              <h4 className="text-xs font-bold text-slate-700 mt-2">Nessun giroconto scollegato rilevato</h4>
              <p className="text-[10px] text-slate-400 mt-0.5 max-w-md mx-auto">
                Tutte le transazioni con lo stesso importo e data appaiono già correttamente collegate o non presentano conflitti.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* EXACT MATCHES */}
              {potentials.filter(p => p.isExact).length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                    Giroconti Coincidenti (Incorpora Automaticamente)
                  </h4>
                  <div className="grid grid-cols-1 gap-2.5">
                    {potentials.filter(p => p.isExact).map((pair, idx) => {
                      const expAcc = accounts.find(a => a.id === pair.expense.accountId);
                      const incAcc = accounts.find(a => a.id === pair.income.accountId);
                      return (
                        <div key={idx} className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between border border-emerald-100 bg-emerald-50/30 p-3.5 rounded-xl gap-3 hover:bg-emerald-50/50 transition-all">
                          <div className="flex flex-1 items-center gap-3 text-xs w-full">
                            <div className="font-mono text-slate-500 font-bold bg-white px-2 py-0.5 rounded border border-slate-150 whitespace-nowrap">
                              {formatDateOnly(pair.expense.date)}
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="bg-slate-50 text-slate-600 border border-slate-200 rounded px-2 py-0.5 text-[10px] font-bold whitespace-nowrap">
                                {expAcc ? expAcc.name : 'Ignorato'}
                              </span>
                              <span className="text-slate-400 font-extrabold">➔</span>
                              <span className="bg-blue-50 text-blue-700 border border-blue-100 rounded px-2 py-0.5 text-[10px] font-bold whitespace-nowrap">
                                {incAcc ? incAcc.name : 'Ignorato'}
                              </span>
                            </div>
                            <div className="font-semibold text-rose-600 font-mono whitespace-nowrap ml-auto sm:ml-0">
                              -{formatEuro(Math.abs(pair.expense.amount))}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 justify-end">
                            <span className="text-[10px] text-emerald-700 font-semibold bg-white border border-emerald-150 rounded-md px-2 py-1 whitespace-nowrap">
                              Stessa ora ({getTxDateTimeInfo(pair.expense.date).timePart ? getTxDateTimeInfo(pair.expense.date).timePart.substring(0, 5) : 'Nessuna'})
                            </span>
                            <button
                              type="button"
                              onClick={() => handleLinkGiroconti(pair.expense, pair.income)}
                              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold rounded-md transition-all cursor-pointer whitespace-nowrap"
                            >
                              Sincronizza
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* TO VERIFY MATCHES (DIFFERENT TIMES / DATES) */}
              {potentials.filter(p => !p.isExact).length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-[11px] font-bold text-amber-800 uppercase tracking-wider flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                    Differenze Orarie o Date (Da Verificare / Approvare)
                  </h4>
                  <div className="grid grid-cols-1 gap-2.5">
                    {potentials.filter(p => !p.isExact).map((pair, idx) => {
                      const expAcc = accounts.find(a => a.id === pair.expense.accountId);
                      const incAcc = accounts.find(a => a.id === pair.income.accountId);
                      const expTime = getTxDateTimeInfo(pair.expense.date).timePart || '--:--';
                      const incTime = getTxDateTimeInfo(pair.income.date).timePart || '--:--';
                      return (
                        <div key={idx} className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between border border-amber-150 bg-amber-50/15 p-3.5 rounded-xl gap-3 hover:bg-amber-50/25 transition-all">
                           <div className="flex flex-1 items-center gap-3 text-xs w-full">
                            <div className="font-mono text-slate-500 font-bold bg-white px-2 py-0.5 rounded border border-slate-150 whitespace-nowrap">
                              {formatDateOnly(pair.expense.date)}
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="bg-slate-50 text-slate-600 border border-slate-200 rounded px-2 py-0.5 text-[10px] font-bold whitespace-nowrap">
                                {expAcc ? expAcc.name : 'Ignorato'} <span className="text-[9px] text-slate-400 font-mono">({expTime.substring(0, 5)})</span>
                              </span>
                              <span className="text-slate-400 font-extrabold">➔</span>
                              <span className="bg-blue-50 text-blue-700 border border-blue-100 rounded px-2 py-0.5 text-[10px] font-bold whitespace-nowrap">
                                {incAcc ? incAcc.name : 'Ignorato'} <span className="text-[9px] text-blue-400 font-mono">({incTime.substring(0, 5)})</span>
                              </span>
                            </div>
                            <div className="font-semibold text-rose-600 font-mono whitespace-nowrap ml-auto sm:ml-0">
                              -{formatEuro(Math.abs(pair.expense.amount))}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 justify-end">
                            <span className="text-[9.5px] text-amber-800 font-semibold bg-white border border-amber-200 rounded px-2.5 py-1 flex items-center gap-1.5 max-w-xs sm:max-w-none truncate sm:whitespace-nowrap font-sans">
                              ⚠️ {pair.reason}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleLinkGiroconti(pair.expense, pair.income)}
                              className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white text-[10px] font-bold rounded-md transition-all cursor-pointer whitespace-nowrap"
                            >
                              Collega e Certifica
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
      {showDuplicatePanel && (
        <div className="bg-gradient-to-br from-slate-50 to-amber-50/20 border border-amber-100 p-6 rounded-2xl shadow-sm space-y-4 animate-fade-in" id="duplicate-analysis-panel">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-amber-100 pb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <Layers className="w-4 h-4 text-amber-600" />
                Rilevamento Transazioni Duplicate / Triplicate
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5 font-medium">
                Il sistema analizza lo storico per individuare movimenti con lo stesso conto e importo (90% se lo stesso giorno, 50% se ±1 giorno, e giroconti duplicati da coppie di transazioni singole).
              </p>
            </div>
            <button
              onClick={() => setShowDuplicatePanel(false)}
              className="text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-100 rounded-lg transition-all self-end sm:self-auto cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {getDuplicateGroups().length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center space-y-2">
              <CheckCircle2 className="w-10 h-10 text-emerald-500 font-extrabold" />
              <h4 className="text-sm font-bold text-slate-800">Nessun duplicato sospetto</h4>
              <p className="text-xs text-slate-500 max-w-sm">
                Tutte le transazioni nel database sono pulite. Non sono stati rilevati conflitti di data, importo o giroconti duplicati.
              </p>
            </div>
          ) : (
            <div className="space-y-4 max-h-[500px] overflow-y-auto pr-1">
              {getDuplicateGroups().map(group => (
                <div key={group.id} className="bg-white border border-slate-100 rounded-xl p-4 shadow-sm space-y-3">
                  <div className="flex justify-between items-start gap-2">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full ${
                          group.type === 'certain' 
                            ? 'bg-red-50 text-red-700 border border-red-100'
                            : group.type === 'transfer'
                            ? 'bg-indigo-50 text-indigo-700 border border-indigo-100'
                            : 'bg-amber-50 text-amber-700 border border-amber-100'
                        }`}>
                          {group.type === 'certain' ? 'Duplicato Certo 90%' : group.type === 'transfer' ? 'Duplicato Giroconto' : 'Duplicato Possibile 50%'}
                        </span>
                        <span className="text-[11px] font-semibold text-slate-700">{group.reason}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        const ids = group.transactions.map(t => t.id);
                        setIgnoredDuplicateIds(prev => [...prev, ...ids]);
                        setSuccessMsg("Gruppo di duplicati ignorato con successo.");
                        setTimeout(() => setSuccessMsg(''), 3000);
                      }}
                      className="text-[10px] text-slate-500 hover:text-slate-800 bg-slate-50 hover:bg-slate-100 px-2.5 py-1 rounded font-bold border border-slate-200/60 transition-all cursor-pointer whitespace-nowrap"
                    >
                      Ignora / Accetta tutti
                    </button>
                  </div>

                  <div className="overflow-x-auto border border-slate-100 rounded-lg">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-100">
                          <th className="p-2.5">Data</th>
                          <th className="p-2.5">Conto</th>
                          <th className="p-2.5">Descrizione</th>
                          <th className="p-2.5 text-right font-semibold">Importo</th>
                          <th className="p-2.5 text-center font-semibold">Azioni</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-slate-700">
                        {group.transactions.map(tx => (
                          <tr key={tx.id} className="hover:bg-slate-50/50">
                            <td className="p-2.5 font-mono whitespace-nowrap">{formatDateOnly(tx.date)}</td>
                            <td className="p-2.5 font-semibold text-slate-800">
                              {accounts.find(a => a.id === tx.accountId)?.name || 'Conto Sconosciuto'}
                              {tx.destinationAccountId && (
                                <span className="text-slate-400 text-[10px] block sm:inline"> ➔ {accounts.find(a => a.id === tx.destinationAccountId)?.name}</span>
                              )}
                            </td>
                            <td className="p-2.5 truncate max-w-[200px]">{tx.description}</td>
                            <td className={`p-2.5 text-right font-bold font-mono ${tx.amount > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                              {formatEuro(tx.amount)}
                            </td>
                            <td className="p-2.5 text-center">
                              <button
                                onClick={() => {
                                  if (confirm("Sei sicuro di voler eliminare questa specifica transazione duplicata? I saldi dei conti si aggiorneranno di conseguenza.")) {
                                    onDeleteTransaction(tx.id);
                                    setSuccessMsg("Transazione duplicata eliminata con successo.");
                                    setTimeout(() => setSuccessMsg(''), 3000);
                                  }
                                }}
                                className="text-rose-650 hover:text-white hover:bg-rose-600 p-1.5 rounded-lg border border-rose-100 hover:border-rose-600 transition-all cursor-pointer"
                                title="Elimina questa transazione"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Riconciliazione Fatture 2026 Panel */}
      {showInvoicePanel && (
        <div className="bg-gradient-to-br from-slate-50 to-amber-50/10 border border-amber-200 p-6 rounded-2xl shadow-sm space-y-5 animate-fade-in" id="invoices-reconciliation-panel">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-amber-100 pb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-amber-500" />
                Riconciliazione Fatture Elettroniche Emesse (2026)
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5 font-medium">
                Confronta le fatture emesse nel 2026 con i movimenti di cassa contrassegnati con l'Ambito <strong>Partita IVA / Ambito Lavoro</strong>. Seleziona i suggerimenti o cerca manualmente i movimenti per sincronizzarli.
              </p>
            </div>
            <div className="flex gap-2">
              <span className="text-[10px] bg-slate-100 text-slate-600 font-extrabold px-2 py-1 rounded">
                Scollegate: {invoices2026.filter(inv => !transactions.some(t => t.invoiceId === inv.number) && !compensatedInvoiceNums.includes(inv.number)).length}
              </span>
              <span className="text-[10px] bg-emerald-100 text-emerald-850 font-extrabold px-2 py-1 rounded">
                Riconciliate: {invoices2026.filter(inv => transactions.some(t => t.invoiceId === inv.number)).length}
              </span>
              <span className="text-[10px] bg-sky-100 text-sky-850 font-extrabold px-2 py-1 rounded">
                Compensate: {compensatedInvoiceNums.length}
              </span>
            </div>
          </div>

          {/* Filters Row */}
          <div className="flex flex-col sm:flex-row gap-3 items-center bg-white p-3.5 rounded-xl border border-amber-100/50">
            <div className="relative flex-1 w-full">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
              <input
                type="text"
                placeholder="Cerca per numero fattura, cliente o importo..."
                value={invoiceSearchQuery}
                onChange={(e) => setInvoiceSearchQuery(e.target.value)}
                className="w-full text-xs pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-amber-400 font-medium"
              />
            </div>
            <div className="flex gap-1.5 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
              <button
                type="button"
                onClick={() => setInvoiceFilterStatus('all')}
                className={`px-3 py-1.5 rounded-md text-[11px] font-bold transition-all whitespace-nowrap cursor-pointer ${
                  invoiceFilterStatus === 'all'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Tutte ({invoices2026.length})
              </button>
              <button
                type="button"
                onClick={() => setInvoiceFilterStatus('unmatched')}
                className={`px-3 py-1.5 rounded-md text-[11px] font-bold transition-all whitespace-nowrap cursor-pointer ${
                  invoiceFilterStatus === 'unmatched'
                    ? 'bg-red-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Scollegate ({invoices2026.filter(inv => !transactions.some(t => t.invoiceId === inv.number) && !compensatedInvoiceNums.includes(inv.number)).length})
              </button>
              <button
                type="button"
                onClick={() => setInvoiceFilterStatus('matched')}
                className={`px-3 py-1.5 rounded-md text-[11px] font-bold transition-all whitespace-nowrap cursor-pointer ${
                  invoiceFilterStatus === 'matched'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Riconciliate ({invoices2026.filter(inv => transactions.some(t => t.invoiceId === inv.number)).length})
              </button>
              <button
                type="button"
                onClick={() => setInvoiceFilterStatus('compensated')}
                className={`px-3 py-1.5 rounded-md text-[11px] font-bold transition-all whitespace-nowrap cursor-pointer ${
                  invoiceFilterStatus === 'compensated'
                    ? 'bg-sky-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Compensate ({compensatedInvoiceNums.length})
              </button>
            </div>
          </div>

          {/* List layout */}
          <div className="grid grid-cols-1 gap-4 max-h-[500px] overflow-y-auto pr-1">
            {invoices2026
              .filter(inv => {
                const isMatched = transactions.some(t => t.invoiceId === inv.number);
                const isCompensated = compensatedInvoiceNums.includes(inv.number);
                
                // Status Filter
                if (invoiceFilterStatus === 'matched' && !isMatched) return false;
                if (invoiceFilterStatus === 'compensated' && !isCompensated) return false;
                if (invoiceFilterStatus === 'unmatched' && (isMatched || isCompensated)) return false;

                // Search query
                if (invoiceSearchQuery.trim()) {
                  const query = invoiceSearchQuery.toLowerCase();
                  const matchNum = inv.number.toLowerCase().includes(query);
                  const matchClient = inv.customer.toLowerCase().includes(query);
                  const matchAmount = inv.netToPay.toString().includes(query);
                  return matchNum || matchClient || matchAmount;
                }
                return true;
              })
              .map((inv, idx) => {
                const matchedTx = transactions.find(t => t.invoiceId === inv.number);
                const isCompensated = compensatedInvoiceNums.includes(inv.number);

                // Let's parse invoice date to find year & month
                const parts = inv.docDate.split('/');
                const invDay = parts[0];
                const invMonth = parts[1];
                const invYear = parts[2];
                const invMonthYearKey = `${invYear}-${invMonth}`; // e.g. "2026-05"

                // Find candidate professional/tax transactions with matching amount
                // Net value matching (absolute match to prevent credit notes vs standard invoice sign mistakes)
                const isCreditNote = inv.docType.toLowerCase().includes('nota di credito') || inv.docType.toLowerCase().includes('nota variazione') || inv.netToPay < 0;
                
                // Find potential target payments: we search in Professional scope where invoiceId is not set
                const candidateTxs = transactions.filter(t => t.scope === 'professional' && !t.invoiceId);
                
                const sameMonthCandidates = candidateTxs.filter(t => {
                  const amtMatch = Math.abs(Math.abs(t.amount) - Math.abs(inv.netToPay)) < 0.1;
                  const dateMatch = t.date.substring(0, 7) === invMonthYearKey;
                  return amtMatch && dateMatch;
                });

                const otherMonthCandidates = candidateTxs.filter(t => {
                  const amtMatch = Math.abs(Math.abs(t.amount) - Math.abs(inv.netToPay)) < 0.1;
                  const dateMatch = t.date.substring(0, 7) !== invMonthYearKey;
                  const yearMatch = t.date.startsWith('2026');
                  return amtMatch && dateMatch && yearMatch;
                });

                // Manual dropdown list of professional transactions from 2026 that have no invoiceId attached
                const allManualTargetCandidates = candidateTxs.filter(t => t.date.startsWith('2026'));

                return (
                  <div key={idx} className={`border p-4 rounded-xl flex flex-col md:flex-row gap-4 justify-between items-start md:items-stretch bg-white transition-all hover:shadow-xs ${
                    matchedTx ? 'border-emerald-250 bg-emerald-50/5' : isCompensated ? 'border-sky-250 bg-sky-50/5' : 'border-slate-150'
                  }`}>
                    {/* Invoice Left Metadata */}
                    <div className="flex-1 flex flex-col gap-1 text-xs">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-mono text-[11px] font-bold bg-slate-100 border border-slate-200 text-slate-700 px-1.5 rounded">
                          {inv.number}
                        </span>
                        <span className="text-[10px] text-slate-400 font-bold">
                          {inv.docDate}
                        </span>
                        <span className={`px-1.5 py-0.5 rounded text-[9.5px] font-extrabold uppercase ${
                          isCreditNote
                            ? 'bg-rose-100 text-rose-800 border border-rose-200'
                            : 'bg-indigo-100 text-indigo-800 border border-indigo-200'
                        }`}>
                          {inv.docType}
                        </span>
                      </div>
                      
                      <div className="font-bold text-slate-800 text-sm mt-1">
                        {inv.customer}
                      </div>

                      {/* Info on items / description */}
                      <span className="text-slate-500 text-[10.5px]">
                        P.IVA/Cod.Fiscale: <strong className="font-sans font-extrabold text-slate-650">{inv.pIva || inv.fiscalCode || 'N/A'}</strong> | File SDI: <span className="font-mono text-[10px] font-semibold">{inv.fileName}</span>
                      </span>

                      {/* Display matched transaction if present */}
                      {matchedTx && (
                        <div className="mt-3 p-2 rounded-lg bg-emerald-50 border border-emerald-150 flex items-center justify-between text-[11px] animate-fade-in">
                          <div className="text-emerald-950 font-medium">
                            <span className="font-extrabold text-emerald-800">Abbinata:</span> {matchedTx.description} 
                            <span className="font-mono ml-1 font-extrabold text-slate-500">[{formatDateOnly(matchedTx.date)}]</span>
                            <span className="font-bold ml-1.5 text-emerald-700 font-mono">({formatEuro(matchedTx.amount)})</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              onUpdateTransaction(matchedTx.id, {
                                invoiceId: undefined,
                                customer: undefined,
                                notes: undefined
                              });
                              setSuccessMsg(`Fattura ${inv.number} scollegata!`);
                              setTimeout(() => setSuccessMsg(''), 2500);
                            }}
                            className="text-[10px] text-zinc-500 hover:text-red-750 hover:underline font-bold ml-2 cursor-pointer"
                          >
                            Annulla Match
                          </button>
                        </div>
                      )}

                      {/* Display compensated notice if present */}
                      {isCompensated && (
                        <div className="mt-3 p-2 rounded-lg bg-sky-50 border border-sky-150 flex items-center justify-between text-[11px] animate-fade-in">
                          <div className="text-sky-950 flex items-center gap-1 font-medium">
                            <span className="font-extrabold text-sky-800">Compensazione:</span> Segnata come compensata senza flusso di cassa.
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setCompensatedInvoiceNums(prev => prev.filter(num => num !== inv.number));
                              setSuccessMsg(`Stato compensazione rimosso per fattura ${inv.number}!`);
                              setTimeout(() => setSuccessMsg(''), 2500);
                            }}
                            className="text-[10px] text-zinc-505 hover:text-red-750 hover:underline font-bold ml-2 cursor-pointer"
                          >
                            Rimuovi Compensazione
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Invoice Right Action Center & Matching Proposals */}
                    <div className="w-full md:w-[360px] flex flex-col justify-between items-end border-t md:border-t-0 md:border-l border-slate-100 pt-3 md:pt-0 md:pl-4">
                      {/* Price header */}
                      <div className="text-right w-full flex justify-between md:block items-center mb-2">
                        <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider md:block">Netto a Pagare</span>
                        <div className="font-mono text-base font-bold text-amber-700">
                          {formatEuro(inv.netToPay)}
                        </div>
                      </div>

                      {/* Match & actions logic */}
                      {!matchedTx && !isCompensated && (
                        <div className="w-full space-y-3">
                          {/* SAME MONTH SUGGESTIONS */}
                          {sameMonthCandidates.length > 0 && (
                            <div className="space-y-1">
                              <span className="text-[9.5px] uppercase font-extrabold text-emerald-700 tracking-wider flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                Suggerito (Stesso Mese {invMonth}/{invYear})
                              </span>
                              <div className="space-y-1">
                                {sameMonthCandidates.map(tx => (
                                  <button
                                    key={tx.id}
                                    type="button"
                                    onClick={() => {
                                      // Validate/match
                                      onUpdateTransaction(tx.id, {
                                        invoiceId: inv.number,
                                        customer: inv.customer,
                                        notes: `FPR ${inv.number.replace('FPR ', '')} - ${inv.customer}`
                                      });
                                      setSuccessMsg(`Fattura ${inv.number} abbinata con successo!`);
                                      setTimeout(() => setSuccessMsg(''), 2500);
                                    }}
                                    className="w-full text-left p-2 rounded bg-emerald-50/50 hover:bg-emerald-100 border border-emerald-200 text-[10px] text-emerald-950 flex justify-between items-center transition-all cursor-pointer shadow-3xs"
                                    title="Clicca per associare questa transazione"
                                  >
                                    <span className="truncate max-w-[200px] font-medium">
                                      [{formatDateOnly(tx.date)}] <strong>{tx.description}</strong>
                                    </span>
                                    <span className="font-mono font-bold text-emerald-800 ml-1 whitespace-nowrap">
                                      {formatEuro(tx.amount)} ➔
                                    </span>
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* OTHER MONTH SUGGESTIONS */}
                          {sameMonthCandidates.length === 0 && otherMonthCandidates.length > 0 && (
                            <div className="space-y-1">
                              <span className="text-[9.5px] uppercase font-extrabold text-indigo-700 tracking-wider flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse"></span>
                                Suggerito (Altro Mese del {invYear})
                              </span>
                              <div className="space-y-1">
                                {otherMonthCandidates.map(tx => (
                                  <button
                                    key={tx.id}
                                    type="button"
                                    onClick={() => {
                                      onUpdateTransaction(tx.id, {
                                        invoiceId: inv.number,
                                        customer: inv.customer,
                                        notes: `FPR ${inv.number.replace('FPR ', '')} - ${inv.customer}`
                                      });
                                      setSuccessMsg(`Fattura ${inv.number} abbinata con successo!`);
                                      setTimeout(() => setSuccessMsg(''), 2500);
                                    }}
                                    className="w-full text-left p-2 rounded bg-indigo-50/50 hover:bg-indigo-100 border border-indigo-200 text-[10px] text-indigo-950 flex justify-between items-center transition-all cursor-pointer shadow-3xs"
                                    title="Clicca per associare (pagamento differito)"
                                  >
                                    <span className="truncate max-w-[200px] font-medium">
                                      [{formatDateOnly(tx.date)}] <strong>{tx.description}</strong>
                                    </span>
                                    <span className="font-mono font-bold text-indigo-800 ml-1 whitespace-nowrap">
                                      {formatEuro(tx.amount)} ➔
                                    </span>
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* MANUAL FORCE MATCH DROPDOWN */}
                          <div className="pt-2 border-t border-dashed border-amber-200">
                            <label className="block text-[9px] uppercase font-bold text-slate-400 mb-1">
                              Associa transazione P.IVA manualmente
                            </label>
                            <select
                              defaultValue=""
                              onChange={(e) => {
                                const txId = e.target.value;
                                if (!txId) return;
                                onUpdateTransaction(txId, {
                                  invoiceId: inv.number,
                                  customer: inv.customer,
                                  notes: `FPR ${inv.number.replace('FPR ', '')} - ${inv.customer}`
                                });
                                setSuccessMsg(`Associazione manuale completata con successo!`);
                                setTimeout(() => setSuccessMsg(''), 2500);
                              }}
                              className="w-full text-[10px] bg-slate-50 border border-slate-205 rounded py-1 px-1.5 outline-none focus:border-amber-400 font-medium"
                            >
                              <option value="">Seleziona transazione Partita IVA...</option>
                              {allManualTargetCandidates.map(tx => (
                                <option key={tx.id} value={tx.id}>
                                  [{formatDateOnly(tx.date)}] {tx.description.substring(0, 18)}... ({formatEuro(tx.amount)})
                                </option>
                              ))}
                            </select>
                          </div>

                          {/* COMPENSATE / CREDIT NOTE SPECIAL OPTION */}
                          <div>
                            <button
                              type="button"
                              onClick={() => {
                                setCompensatedInvoiceNums(prev => [...prev, inv.number]);
                                setSuccessMsg(`Registrato in compensazione: ${inv.number}`);
                                setTimeout(() => setSuccessMsg(''), 2500);
                              }}
                              className="w-full py-1.5 border border-dashed border-sky-305 hover:bg-sky-50 text-sky-850 hover:text-sky-955 text-[10.5px] font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                            >
                              <AlertTriangle className="w-3.5 h-3.5 text-sky-500" />
                              Compensa (Senza Cassa)
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Completed / matched indicators */}
                      {matchedTx && (
                        <div className="w-full text-right text-[11px] font-extrabold text-emerald-600 flex items-center justify-end gap-1.5 animate-fade-in">
                          <CheckCircle2 className="w-4 h-4" />
                          Riconciliata Correttamente
                        </div>
                      )}

                      {isCompensated && (
                        <div className="w-full text-right text-[11px] font-extrabold text-sky-600 flex items-center justify-end gap-1.5 animate-fade-in">
                          <FileCheck className="w-4 h-4" />
                          Compensata ed Estinta
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

            {invoices2026.filter(inv => {
              const isMatched = transactions.some(t => t.invoiceId === inv.number);
              const isCompensated = compensatedInvoiceNums.includes(inv.number);
              
              if (invoiceFilterStatus === 'matched' && !isMatched) return false;
              if (invoiceFilterStatus === 'compensated' && !isCompensated) return false;
              if (invoiceFilterStatus === 'unmatched' && (isMatched || isCompensated)) return false;

              if (invoiceSearchQuery.trim()) {
                const query = invoiceSearchQuery.toLowerCase();
                const matchNum = inv.number.toLowerCase().includes(query);
                const matchClient = inv.customer.toLowerCase().includes(query);
                const matchAmount = inv.netToPay.toString().includes(query);
                return matchNum || matchClient || matchAmount;
              }
              return true;
            }).length === 0 && (
              <div className="py-12 text-center bg-white border border-slate-100 rounded-xl text-slate-400 text-xs font-semibold">
                Nessuna fattura corrisponde ai filtri selezionati.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Register Transaction Expandable Form */}
      {showAddForm && (
        <form onSubmit={handleAddTxSubmit} className="bg-white border border-slate-200 p-6 rounded-2xl shadow-md space-y-5 animate-fade-in">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <Plus className="w-4 h-4 text-emerald-600 animate-bounce" />
                Registrazione Nuovo Movimento Finanziario
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Crea entrate, spese o giroconti manualmente, oppure scatta una foto a uno scontrino/fattura per la compilazione AI automatica.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* COLUMN 1: AI SMART SCANNER & CAMERA */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col justify-between space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700 uppercase tracking-wide flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-indigo-600 animate-pulse" />
                    AI Smart Scan
                  </span>
                  {isAnalyzing && (
                    <span className="text-[10px] bg-indigo-50 text-indigo-700 font-bold px-1.5 py-0.5 rounded border border-indigo-150 animate-pulse">
                      Analisi in corso...
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-slate-505 leading-relaxed">
                  Compila i dati all'istante! Carica un'immagine della fattura o scontrino commerciale, oppure inquadra il documento con la fotocamera del tuo dispositivo.
                </p>
              </div>

              {/* Viewfinder or Upload Area */}
              <div className="relative min-h-[190px] bg-slate-100 border-2 border-dashed border-slate-300 rounded-xl flex flex-col items-center justify-center p-3 text-center transition-all overflow-hidden"
                   onDragEnter={handleDrag}
                   onDragOver={handleDrag}
                   onDragLeave={handleDrag}
                   onDrop={handleDrop}
                   style={{ borderColor: dragActive ? '#6366f1' : '#cbd5e1' }}>
                
                {isAnalyzing ? (
                  <div className="absolute inset-0 bg-slate-900/10 backdrop-blur-xs flex flex-col items-center justify-center p-4">
                    <div className="w-12 h-12 bg-indigo-50/90 text-indigo-600 rounded-full border border-indigo-200 flex items-center justify-center animate-spin mb-3">
                      <Sparkles className="w-6 h-6 animate-pulse text-indigo-600" />
                    </div>
                    <div className="text-xs font-bold text-indigo-800">Analisi Visiva Gemini AI...</div>
                    <div className="text-[9px] text-indigo-600/60 mt-0.5 font-mono">OCR & Riconoscimento Fiscale</div>
                    {/* Glowing scanning laser lines */}
                    <div className="absolute left-0 right-0 h-1 bg-indigo-400 shadow-[0_0_12px_#6366f1] animate-[bounce_2s_infinite]"></div>
                  </div>
                ) : isCameraOpen ? (
                  <div className="absolute inset-0 bg-black flex flex-col items-center justify-center">
                    <video ref={videoRef} playsInline className="w-full h-full object-cover" />
                    <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-2 px-3">
                      <button 
                        type="button"
                        onClick={handleCapturePhoto}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] rounded transition shadow-sm cursor-pointer"
                      >
                        Scatta Foto
                      </button>
                      <button 
                        type="button"
                        onClick={handleStopCamera}
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-bold rounded transition cursor-pointer"
                      >
                        Chiudi
                      </button>
                    </div>
                  </div>
                ) : (
                  <label className="cursor-pointer w-full h-full flex flex-col items-center justify-center py-4">
                    <UploadCloud className="w-8 h-8 text-slate-400 mb-2 hover:text-indigo-500 transition-colors" />
                    <span className="text-[11px] font-bold text-slate-700">Trascina qui lo scontrino</span>
                    <span className="text-[9px] text-slate-450 mt-0.5">o clicca per sfogliare i file</span>
                    <input 
                      type="file" 
                      accept="image/*" 
                      onChange={handleFileChange}
                      className="hidden" 
                    />
                  </label>
                )}
              </div>

              {/* Live camera toggle */}
              {!isCameraOpen && !isAnalyzing && (
                <button
                  type="button"
                  onClick={handleStartCamera}
                  className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold rounded-lg transition shadow-xs cursor-pointer"
                >
                  <Camera className="w-3.5 h-3.5" />
                  Usa Fotocamera Retro
                </button>
              )}

              {/* Hidden canvas for snapshotting */}
              <canvas ref={canvasRef} className="hidden" />
            </div>

            {/* COLUMN 2 & 3: FORM DETAILS */}
            <div className="lg:col-span-2 space-y-4">
              
              {/* Flusso Direction Switch: 3 options */}
              <div>
                <label className="block text-slate-600 text-[10px] mb-1.5 font-bold uppercase tracking-wider">Tipologia di Flusso</label>
                <div className="grid grid-cols-3 gap-2">
                  <button 
                    type="button"
                    onClick={() => setDirection('expense')}
                    className={`py-2 text-xs font-bold rounded-lg border transition-all cursor-pointer ${
                      direction === 'expense' 
                        ? 'bg-rose-50 border-rose-300 text-rose-700 ring-2 ring-rose-500/10' 
                        : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                    }`}
                  >
                    Spesa / Uscita
                  </button>
                  <button 
                    type="button"
                    onClick={() => setDirection('income')}
                    className={`py-2 text-xs font-bold rounded-lg border transition-all cursor-pointer ${
                      direction === 'income' 
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-700 ring-2 ring-emerald-500/10' 
                        : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                    }`}
                  >
                    Entrata
                  </button>
                  <button 
                    type="button"
                    onClick={() => setDirection('transfer')}
                    className={`py-2 text-xs font-bold rounded-lg border transition-all cursor-pointer ${
                      direction === 'transfer' 
                        ? 'bg-blue-50 border-blue-300 text-blue-700 ring-2 ring-blue-500/10' 
                        : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                    }`}
                  >
                    Trasferimento / Giroconto
                  </button>
                </div>
              </div>

              {/* Shared inputs */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-slate-600 text-[10px] mb-1 font-bold uppercase tracking-wider">Data Operazione</label>
                  <input 
                    type="date" 
                    value={date} 
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full text-xs bg-white border border-slate-200 text-slate-800 rounded px-2.5 py-2 outline-none focus:border-indigo-505 focus:ring-1 focus:ring-indigo-550/20"
                    required
                  />
                </div>

                <div>
                  <label className="block text-slate-600 text-[10px] mb-1 font-bold uppercase tracking-wider">Ora (Opzionale)</label>
                  <input 
                    type="time" 
                    value={time} 
                    onChange={(e) => setTime(e.target.value)}
                    className="w-full text-xs bg-white border border-slate-200 text-slate-800 rounded px-2.5 py-2 outline-none focus:border-indigo-555 focus:ring-1 focus:ring-indigo-550/20"
                  />
                </div>

                <div>
                  <label className="block text-slate-600 text-[10px] mb-1 font-bold uppercase tracking-wider">Importo in Euro (€)</label>
                  <input 
                    type="number" 
                    step="0.01" 
                    placeholder="es: 12.50"
                    value={amount} 
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full text-xs bg-white border border-slate-200 text-slate-800 placeholder-slate-400 rounded px-2.5 py-2 font-mono outline-none focus:border-indigo-505 focus:ring-1 focus:ring-indigo-550/20"
                    required
                  />
                </div>
              </div>

              {/* Dynamic input sections */}
              {direction === 'transfer' ? (
                // IF TRANSFER MODE
                <div className="space-y-4 bg-blue-50/55 hover:bg-blue-50/80 transition-all border border-blue-100 rounded-xl p-4">
                  <div className="flex items-center gap-1.5 text-blue-800 text-xs font-bold uppercase tracking-wide">
                    <ArrowRightLeft className="w-3.5 h-3.5 text-blue-600 animate-pulse" />
                    Configurazione Giroconto Interno
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-slate-600 text-[10px] mb-1 font-bold uppercase tracking-wider">Conto di addebito (Uscita)</label>
                      <select 
                        value={accountId} 
                        onChange={(e) => setAccountId(e.target.value)}
                        className="w-full text-xs bg-white border border-slate-200 text-slate-850 rounded px-2.5 py-2 outline-none focus:border-indigo-505"
                      >
                        {accounts.map(a => (
                          <option key={a.id} value={a.id}>{a.name} (Saldo: {formatEuro(a.balance)})</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-slate-600 text-[10px] mb-1 font-bold uppercase tracking-wider">Conto di accredito (Entrata)</label>
                      <select 
                        value={destinationAccountId} 
                        onChange={(e) => setDestinationAccountId(e.target.value)}
                        className="w-full text-xs bg-white border border-slate-200 text-slate-850 rounded px-2.5 py-2 outline-none focus:border-indigo-505"
                      >
                        {accounts.map(a => (
                          <option key={a.id} value={a.id}>{a.name} (Saldo: {formatEuro(a.balance)})</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-slate-600 text-[10px] mb-1 font-bold uppercase tracking-wider">Causale Trasferimento (Opzionale)</label>
                    <input 
                      type="text" 
                      placeholder="es: Giroconto di alimentazione scontrini, Spostamento fondi, etc."
                      value={description} 
                      onChange={(e) => setDescription(e.target.value)}
                      className="w-full text-xs bg-white border border-slate-200 text-slate-800 placeholder-slate-400 rounded px-2.5 py-2 outline-none focus:border-indigo-505"
                    />
                  </div>
                </div>
              ) : (
                // IF INCOME OR EXPENSE MODE
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-slate-600 text-[10px] mb-1 font-bold uppercase tracking-wider">Descrizione / Causale bancaria</label>
                      <input 
                        type="text" 
                        placeholder="es: Caffe bar, Rinnovo hosting Aruba, Spesa settimanale, etc."
                        value={description} 
                        onChange={(e) => setDescription(e.target.value)}
                        className="w-full text-xs bg-white border border-slate-200 text-slate-800 placeholder-slate-400 rounded px-2.5 py-2 outline-none focus:border-indigo-505"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-slate-600 text-[10px] mb-1 font-bold uppercase tracking-wider">Conto Corrente o Cassa d'appoggio</label>
                      <select 
                        value={accountId} 
                        onChange={(e) => setAccountId(e.target.value)}
                        className="w-full text-xs bg-white border border-slate-200 text-slate-805 rounded px-2.5 py-2 outline-none focus:border-indigo-505"
                      >
                        {accounts.map(a => (
                          <option key={a.id} value={a.id}>{a.name} (Saldo: {formatEuro(a.balance)})</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-t border-slate-100 pt-3">
                    <div>
                      <label className="block text-slate-600 text-[10px] mb-1.5 font-bold uppercase tracking-wider">Ambito Fiscale</label>
                      <div className="grid grid-cols-2 gap-2">
                        <button 
                          type="button"
                          onClick={() => handleScopeChange('personal')}
                          className={`px-2 py-2 text-xs font-bold rounded-lg border flex items-center justify-center gap-1 transition-all cursor-pointer ${
                            scope === 'personal' 
                              ? 'bg-indigo-50 border-indigo-200 text-indigo-700 font-bold shadow-xs' 
                              : 'bg-white border-slate-200 text-slate-400 hover:bg-slate-50'
                          }`}
                        >
                          <User className="w-3.5 h-3.5" /> Pers.
                        </button>
                        <button 
                          type="button"
                          onClick={() => handleScopeChange('professional')}
                          className={`px-2 py-2 text-xs font-bold rounded-lg border flex items-center justify-center gap-1 transition-all cursor-pointer ${
                            scope === 'professional' 
                              ? 'bg-amber-50 border-amber-200 text-amber-800 font-bold shadow-xs' 
                              : 'bg-white border-slate-200 text-slate-400 hover:bg-slate-50'
                          }`}
                        >
                          <Briefcase className="w-3.5 h-3.5" /> P.IVA
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-slate-600 text-[10px] mb-1.5 font-bold uppercase tracking-wider">Macro Categoria</label>
                      <select 
                        value={category} 
                        onChange={(e) => setCategory(e.target.value)}
                        className="w-full text-xs bg-white border border-slate-200 text-slate-850 rounded px-2.5 py-2 outline-none focus:border-indigo-505"
                      >
                        {scope === 'personal' ? (
                          <>
                            <option value="necessarie">Necessaria (Cibo, Bollette, Salute)</option>
                            <option value="utili">Utile (Corsi, Istruzione, Trasporti)</option>
                            <option value="tempo_libero">Tempo Libero (Hobby, Ristorante, Svago)</option>
                            <option value="entrate">Entrata Personale (Liquidità, Stipendio)</option>
                          </>
                        ) : (
                          <>
                            <option value="necessarie_lavoro">Necessaria Lavoro (Commercialista, INPS, Tasse)</option>
                            <option value="utili_lavoro">Utile Lavoro (Software, Device, Corsi Prof.)</option>
                            <option value="entrate_lavoro">Entrata Lavoro (Spettanze e Fatture Clienti)</option>
                          </>
                        )}
                      </select>
                    </div>

                    <div>
                      <label className="block text-slate-600 text-[10px] mb-1 font-bold uppercase tracking-wider">Sottocategoria Specifica</label>
                      <div className="flex gap-2">
                        <input 
                          type="text" 
                          placeholder="Digita o..."
                          value={subcategory} 
                          onChange={(e) => setSubcategory(e.target.value)}
                          className="w-full text-xs bg-white border border-slate-200 text-slate-800 placeholder-slate-400 rounded px-2 py-1.5 outline-none focus:border-indigo-505"
                        />
                        <select 
                          onChange={(e) => setSubcategory(e.target.value)}
                          className="bg-slate-50 border border-slate-200 text-xs text-slate-600 rounded px-1 max-w-[100px]"
                        >
                          <option value="">Preimpostati...</option>
                          {getSubcategoryList().map(opt => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Action buttons */}
              <div className="flex gap-2 justify-end pt-3 border-t border-slate-100">
                <button 
                  type="button" 
                  onClick={() => setShowAddForm(false)}
                  className="px-4 py-2 hover:bg-slate-100 text-slate-500 text-xs font-bold rounded-xl cursor-pointer transition border border-transparent"
                >
                  Annulla
                </button>
                <button 
                  type="submit" 
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl cursor-pointer shadow-sm transition"
                >
                  {direction === 'transfer' ? 'Registra Giroconto' : 'Registra Movimento Reale'}
                </button>
              </div>

            </div>
          </div>
        </form>
      )}

      {/* Advanced Filters Panel */}
      <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm space-y-5" id="advanced-filters">
        
        {/* ROW 1: CONTINOUS SELECTION FOR ACCOUNTS (TUTTI, ALCUNI, SOLO UNO) */}
        <div className="space-y-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <label className="block text-slate-700 font-extrabold text-[10px] uppercase tracking-wider">
              Conto o Carta d'appoggio (Tutti, alcuni o solo uno)
            </label>
            <label className="inline-flex items-center gap-2 text-xs text-slate-500 font-semibold cursor-pointer py-1 px-2.5 bg-slate-50 hover:bg-slate-100 rounded-lg border border-slate-200 transition-all select-none">
              <input
                type="checkbox"
                checked={excludeFinancing}
                onChange={(e) => setExcludeFinancing(e.target.checked)}
                className="rounded text-indigo-600 focus:ring-indigo-500/15 w-3.5 h-3.5 cursor-pointer"
              />
              <span className="text-[11px]">Nascondi Conti Finanziamento 🙈</span>
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              id="filter-acc-all"
              onClick={() => handleToggleAccountFilter('all')}
              className={`px-3 py-1.5 text-xs font-bold rounded-xl border transition-all cursor-pointer ${
                selectedAccounts.includes('all')
                  ? 'bg-emerald-600 border-emerald-650 text-white shadow-sm ring-2 ring-emerald-500/10'
                  : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
              }`}
            >
              Tutti i conti
            </button>
            {accounts.map(a => {
              const isActive = selectedAccounts.includes(a.id);
              return (
                <button
                  key={a.id}
                  type="button"
                  id={`filter-acc-${a.id}`}
                  onClick={() => handleToggleAccountFilter(a.id)}
                  className={`px-3 py-1.5 text-xs font-bold rounded-xl border flex items-center gap-1.5 transition-all cursor-pointer ${
                    isActive
                      ? 'bg-indigo-600 border-indigo-700 text-white shadow-sm ring-2 ring-indigo-500/10'
                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-white animate-pulse' : 'bg-slate-400'}`}></span>
                  {a.name}
                </button>
              );
            })}
          </div>
        </div>

        {/* ROW 2: TEMPORAL FILTER (MONTH, QUARTER, YEAR, RANGE) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 pt-3 border-t border-slate-100">
          
          {/* Presets */}
          <div className="lg:col-span-5 space-y-2">
            <label className="block text-slate-700 font-extrabold text-[10px] uppercase tracking-wider">
              Periodo Temporale Rapido
            </label>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => applyPeriodPreset('all')}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-all cursor-pointer ${
                  activePeriodPreset === 'all'
                    ? 'bg-slate-800 border-slate-900 text-white shadow-xs'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                Qualsiasi data
              </button>
              <button
                type="button"
                onClick={() => applyPeriodPreset('month')}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-all cursor-pointer ${
                  activePeriodPreset === 'month'
                    ? 'bg-indigo-650 border-indigo-700 text-white shadow-xs'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                Questo Mese
              </button>
              <button
                type="button"
                onClick={() => applyPeriodPreset('quarter')}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-all cursor-pointer ${
                  activePeriodPreset === 'quarter'
                    ? 'bg-indigo-650 border-indigo-700 text-white shadow-xs'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                Questo Trimestre
              </button>
              <button
                type="button"
                onClick={() => applyPeriodPreset('year')}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-all cursor-pointer ${
                  activePeriodPreset === 'year'
                    ? 'bg-indigo-650 border-indigo-700 text-white shadow-xs'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                Quest'Anno
              </button>
            </div>
          </div>

          {/* Date range inputs */}
          <div className="lg:col-span-7 space-y-2">
            <label className="block text-slate-700 font-extrabold text-[10px] uppercase tracking-wider flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-slate-500" />
              Intervallo Date Libero (Da / A)
            </label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <span className="absolute left-2.5 top-2.5 text-[10px] text-slate-400 font-bold uppercase pointer-events-none">Da</span>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => {
                    setDateFrom(e.target.value);
                    setActivePeriodPreset('custom');
                  }}
                  className="w-full text-xs bg-slate-50 text-slate-800 border border-slate-200 rounded-xl pl-8 pr-2 py-2 outline-none focus:border-indigo-500"
                />
              </div>
              <div className="text-slate-400 font-bold">➔</div>
              <div className="relative flex-1">
                <span className="absolute left-2.5 top-2.5 text-[10px] text-slate-400 font-bold uppercase pointer-events-none">A</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => {
                    setDateTo(e.target.value);
                    setActivePeriodPreset('custom');
                  }}
                  className="w-full text-xs bg-slate-50 text-slate-800 border border-slate-200 rounded-xl pl-8 pr-2 py-2 outline-none focus:border-indigo-500"
                />
              </div>
              {(dateFrom || dateTo) && (
                <button
                  type="button"
                  onClick={() => {
                    setDateFrom('');
                    setDateTo('');
                    setActivePeriodPreset('all');
                  }}
                  className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-rose-600 rounded-xl transition cursor-pointer"
                  title="Azzera date"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

        </div>

        {/* ROW 3: REFINED TARGETED FILTERS (AMBITO BUTTONS, CATEGORIES, SUBCATEGORIES) */}
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4 pt-3 border-t border-slate-100">
          
          {/* Scope selection with elegant buttons */}
          <div className="space-y-1.5 flex flex-col justify-between">
            <label className="block text-slate-700 font-extrabold text-[10px] uppercase tracking-wider">
              Filtro Ambito Fiscale (Famiglia / Lavoro)
            </label>
            <div className="grid grid-cols-3 gap-1">
              <button
                type="button"
                onClick={() => setFilterScope('all')}
                className={`py-2 text-[11px] font-bold rounded-lg border transition-all cursor-pointer ${
                  filterScope === 'all'
                    ? 'bg-slate-800 border-slate-900 text-white shadow-xs'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                Tutti
              </button>
              <button
                type="button"
                onClick={() => setFilterScope('personal')}
                className={`py-2 text-[11px] font-bold rounded-lg border flex items-center justify-center gap-1 transition-all cursor-pointer ${
                  filterScope === 'personal'
                    ? 'bg-indigo-50 border-indigo-250 text-indigo-700 ring-1 ring-indigo-500/10 shadow-xs font-extrabold'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                <User className="w-3.5 h-3.5" /> Famiglia
              </button>
              <button
                type="button"
                onClick={() => setFilterScope('professional')}
                className={`py-2 text-[11px] font-bold rounded-lg border flex items-center justify-center gap-1 transition-all cursor-pointer ${
                  filterScope === 'professional'
                    ? 'bg-amber-50 border-amber-250 text-amber-800 ring-1 ring-amber-500/10 shadow-xs font-extrabold'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Briefcase className="w-3.5 h-3.5" /> Lavoro
              </button>
            </div>
          </div>

          {/* Category Dropdown */}
          <div className="space-y-1.5">
            <label className="block text-slate-700 font-extrabold text-[10px] uppercase tracking-wider">
              Macro-Categoria
            </label>
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="w-full text-xs bg-slate-50 border border-slate-200 text-slate-700 rounded-lg px-3 py-2.5 outline-none focus:border-indigo-500"
            >
              <option value="all">Tutte le macro-categorie</option>
              <option value="necessarie">Necessaria (Personale)</option>
              <option value="utili">Utile (Personale)</option>
              <option value="tempo_libero">Tempo Libero (Personale)</option>
              <option value="entrate">Entrata (Personale)</option>
              <option value="necessarie_lavoro">Necessaria Lavoro (P.IVA)</option>
              <option value="utili_lavoro">Utile Lavoro (P.IVA)</option>
              <option value="entrate_lavoro">Entrata Lavoro (P.IVA)</option>
              <option value="trasferimento">Giroconto / Trasferimento</option>
            </select>
          </div>

          {/* Subcategory Dropdown */}
          <div className="space-y-1.5">
            <label className="block text-slate-700 font-extrabold text-[10px] uppercase tracking-wider">
              Sottocategoria Specifica
            </label>
            <select
              value={filterSubcategory}
              onChange={(e) => setFilterSubcategory(e.target.value)}
              className="w-full text-xs bg-slate-50 border border-slate-200 text-slate-700 rounded-lg px-3 py-2.5 outline-none focus:border-indigo-500"
            >
              <option value="all">Tutte le sottocategorie ({uniqueSubcategories.length})</option>
              {uniqueSubcategories.map(sub => (
                <option key={sub} value={sub}>{sub}</option>
              ))}
            </select>
          </div>

          {/* Sort selection combo */}
          <div className="space-y-1.5">
            <label className="block text-slate-700 font-extrabold text-[10px] uppercase tracking-wider">
              Ordinamento Tabella
            </label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="w-full text-xs bg-slate-50 border border-slate-205 text-slate-850 rounded-lg px-3 py-2.5 outline-none focus:border-indigo-500 font-bold"
            >
              <option value="date-desc">Data: Dal più recente in poi 🠗</option>
              <option value="date-asc">Data: Dal più vecchio in poi 🠕</option>
              <option value="amount-desc">Importo: Più alti 🠗</option>
              <option value="amount-asc">Importo: Più bassi 🠕</option>
            </select>
          </div>

        </div>

        {/* ROW 4: INTERACTIVE SEARCH STRING BAR */}
        <div className="relative pt-3 border-t border-slate-150">
          <Search className="w-4 h-4 text-slate-405 absolute left-3 top-6.5" />
          <input
            type="text"
            placeholder="Filtro causale / beneficiario... (Scrivi qui per un risultato istantaneo)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full text-xs bg-slate-50 text-slate-800 placeholder-slate-400 border border-slate-200 rounded-xl pl-9 pr-4 py-3 outline-none focus:border-slate-350 focus:ring-1 focus:ring-slate-100"
          />
        </div>

      </div>

      {/* Main Transactions Log Table */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto font-sans">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-550">
                <th className="py-3.5 px-3 text-center font-semibold text-slate-605 w-12" title="Spunta di verifica con estratto conto">Spunta</th>
                <th className="py-3.5 px-4 font-semibold text-slate-605">Data</th>
                <th className="py-3.5 px-4 font-semibold text-slate-605">Descrizione estratto</th>
                <th className="py-3.5 px-4 font-semibold text-slate-605">Ambito <span className="text-[10px] font-normal text-slate-400">(Scambia)</span></th>
                <th className="py-3.5 px-4 font-semibold text-slate-605">Macro-Categoria</th>
                <th className="py-3.5 px-4 font-semibold text-slate-605">Sottocategoria</th>
                <th className="py-3.5 px-2 text-right font-semibold text-slate-605">Importo</th>
                <th className="py-3.5 px-4 text-center font-semibold text-slate-605 animate-fade-in">Azioni</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs text-slate-650 font-sans">
              {paginatedTransactions.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400 font-sans">
                    <Layers className="w-8 h-8 mx-auto text-slate-300 mb-2 animate-pulse" />
                    Nessun movimento trovato corrispondente ai filtri specificati.
                  </td>
                </tr>
              ) : (
                paginatedTransactions.map((tx) => {
                  const correlatedAccount = accounts.find(a => a.id === tx.accountId);
                  const isPersonal = tx.scope === 'personal';
                  const isPositive = tx.amount >= 0;

                  // Resolve source and destination accounts for transfers/giroconti
                  let sourceAcc = correlatedAccount;
                  let destAcc = tx.destinationAccountId ? accounts.find(a => a.id === tx.destinationAccountId) : null;

                  if (!destAcc && tx.linkedTransactionId) {
                    const linkedTx = transactions.find(t => t.id === tx.linkedTransactionId);
                    if (linkedTx) {
                      if (tx.amount > 0) {
                        // Current transaction is the credit/arrival/income transaction
                        sourceAcc = accounts.find(a => a.id === linkedTx.accountId) || null;
                        destAcc = correlatedAccount || null;
                      } else {
                        // Current transaction is the debit/departure/expense or transfer transaction
                        sourceAcc = correlatedAccount || null;
                        destAcc = accounts.find(a => a.id === linkedTx.accountId) || null;
                      }
                    }
                  }

                  return (
                    <tr 
                      id={`tx-row-${tx.id}`}
                      key={tx.id} 
                      className={`hover:bg-slate-50/50 transition-colors border-b border-slate-100 ${tx.isVerified ? 'bg-emerald-50/10' : ''}`}
                    >
                      {/* Spunta (Verification status toggler) */}
                      <td className="py-3.5 px-3 text-center whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => onUpdateTransaction(tx.id, { isVerified: !tx.isVerified })}
                          className={`p-1 rounded-full border transition-all cursor-pointer ${
                            tx.isVerified 
                              ? 'bg-emerald-100 border-emerald-350 text-emerald-700 shadow-xs scale-105' 
                              : 'bg-slate-150 border-slate-200 text-slate-350 hover:bg-slate-200 hover:text-slate-500'
                          }`}
                          title={tx.isVerified ? "Verificata con successo. Clicca per rimuovere la spunta." : "Clicca per spuntare ed evidenziare come verificata con estratto conto"}
                        >
                          {tx.isVerified ? (
                            <Check className="w-3 h-3 stroke-[3]" />
                          ) : (
                            <Check className="w-3 h-3 opacity-25 group-hover:opacity-100" />
                          )}
                        </button>
                      </td>

                      {/* Date */}
                      <td className="py-3.5 px-4 font-mono text-slate-500 whitespace-nowrap text-left">
                        <div>{formatDateOnly(tx.date)}</div>
                        {tx.date.includes('T') && (
                          <div className="text-[10.5px] text-indigo-650 font-sans font-extrabold mt-0.5 flex items-center gap-0.5" title="Orario operazione">
                            🕒 {tx.date.split('T')[1].substring(0, 5)}
                          </div>
                        )}
                        {tx.date.includes(' ') && tx.date.split(' ')[1] && (
                          <div className="text-[10.5px] text-indigo-650 font-sans font-extrabold mt-0.5 flex items-center gap-0.5" title="Orario operazione">
                            🕒 {tx.date.split(' ')[1].substring(0, 5)}
                          </div>
                        )}
                      </td>

                      {/* Description */}
                      <td className="py-3.5 px-4">
                        <div className="flex flex-col gap-1 max-w-sm">
                          <span className={`font-semibold text-slate-800 truncate animate-fade-in ${tx.isVerified ? 'text-emerald-950 font-bold' : ''}`} title={tx.description}>
                            {tx.description}
                          </span>
                          
                          {/* Super high-visibility Client / Invoice metadata banner */}
                          {(tx.customer || tx.invoiceId) && (
                            <div className="mt-1 flex flex-wrap items-center gap-1 animate-fade-in font-sans">
                              {tx.customer && (
                                <span className="inline-flex items-center gap-1 text-[10px] bg-amber-50 text-amber-900 border border-amber-200 font-extrabold px-1.5 py-0.5 rounded shadow-3xs" title="Cliente associato">
                                  👤 {tx.customer}
                                </span>
                              )}
                              {tx.invoiceId && (
                                <span className="inline-flex items-center gap-1 text-[10px] bg-emerald-50 text-emerald-900 border border-emerald-250 font-extrabold px-1.5 py-0.5 rounded shadow-3xs animate-pulse" title="Fattura collegata">
                                  🧾 {tx.invoiceId}
                                </span>
                              )}
                            </div>
                          )}

                          <div className="flex items-center gap-1.5 flex-wrap">
                            {tx.isVerified && (
                              <span className="inline-flex items-center gap-0.5 text-[9px] bg-emerald-100 text-emerald-800 font-sans font-extrabold px-1 py-0.5 rounded border border-emerald-200 uppercase tracking-widest leading-none">
                                <CheckCircle2 className="w-2.5 h-2.5" /> Verificata
                              </span>
                            )}
                            
                            <span className="inline-flex items-center gap-1 text-[9.5px] bg-slate-100 text-slate-700 border border-slate-200 font-bold px-1.5 py-0.5 rounded shadow-3xs animate-fade-in" title="Conto d'appoggio">
                              🏦 {correlatedAccount ? correlatedAccount.name : 'Ignorato'}
                            </span>

                            {destAcc && (
                              <span className="inline-flex items-center gap-1 text-[9.5px] bg-indigo-50 text-indigo-750 border border-indigo-205 font-bold px-1.5 py-0.5 rounded shadow-3xs animate-fade-in" title="Conto di accredito di destinazione">
                                ➔ {destAcc.name}
                              </span>
                            )}
                            
                            {tx.notes && (
                              <span className="inline-flex items-center gap-1 text-[9.5px] bg-slate-50 text-slate-800 border border-slate-200 font-medium px-1.5 py-0.5 rounded shadow-3xs animate-fade-in truncate max-w-[170px]" title={tx.notes}>
                                📝 {tx.notes}
                              </span>
                            )}

                            {tx.isAutoMatched && (
                              <span className="inline-flex items-center gap-1 text-[9px] text-amber-605 font-sans font-bold">
                                <Sparkles className="w-2.5 h-2.5 text-amber-500 animate-[pulse_1.5s_infinite]" /> Auto-Categorizzato
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Scope Toggle Button */}
                      <td className="py-3.5 px-4">
                        <button
                          id={`toggle-scope-${tx.id}`}
                          onClick={() => handleToggleScope(tx)}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full font-semibold transition-all border ${
                            isPersonal 
                              ? 'bg-indigo-50 text-indigo-650 border-indigo-100 hover:bg-indigo-100/50' 
                              : 'bg-amber-50 text-amber-700 border-amber-100/75 hover:bg-amber-100/50'
                          }`}
                          title="Clicca per invertire l'andamento"
                        >
                          {isPersonal ? <User className="w-3 h-3 text-indigo-550" /> : <Briefcase className="w-3 h-3 text-amber-600" />}
                          {isPersonal ? 'Personale' : 'Partita IVA'}
                        </button>
                      </td>

                      {/* Category Selector dropdown */}
                      <td className="py-3.5 px-2">
                        <select 
                          value={tx.category}
                          onChange={(e) => onUpdateTransaction(tx.id, { category: e.target.value as any })}
                          className="bg-transparent hover:bg-slate-100 border-0 rounded cursor-pointer py-1 px-1.5 text-xs outline-none font-semibold text-slate-705"
                        >
                          {isPersonal ? (
                            <>
                              <option value="necessarie">Necessaria</option>
                              <option value="utili">Utile</option>
                              <option value="tempo_libero">Tempo Libero</option>
                              <option value="entrate">Entrata</option>
                              <option value="trasferimento">Giroconto</option>
                            </>
                          ) : (
                            <>
                              <option value="necessarie_lavoro">Necessaria Lavoro</option>
                              <option value="utili_lavoro">Utile Lavoro</option>
                              <option value="entrate_lavoro">Entrata Lavoro</option>
                              <option value="trasferimento">Giroconto</option>
                            </>
                          )}
                        </select>
                      </td>

                      {/* Subcategory */}
                      <td className="py-3.5 px-4 font-sans font-medium text-slate-600">
                        <input 
                          type="text" 
                          value={tx.subcategory}
                          onChange={(e) => onUpdateTransaction(tx.id, { subcategory: e.target.value })}
                          className="bg-transparent hover:bg-slate-50 border border-transparent hover:border-slate-200 rounded px-1.5 py-0.5 text-xs text-slate-650 w-28 placeholder-slate-400 outline-none focus:bg-white focus:border-slate-300"
                        />
                      </td>

                      {/* Amount */}
                      <td className={`py-3.5 px-4 text-right font-mono font-bold ${isPositive ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {isPositive ? '+' : ''}{formatEuro(tx.amount)}
                      </td>

                      {/* Controls with explicit edit */}
                      <td className="py-3.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button 
                            type="button"
                            onClick={() => startEditingTransaction(tx)}
                            className="p-1 hover:bg-slate-105 text-slate-400 hover:text-indigo-600 rounded transition-colors cursor-pointer"
                            title="Modifica Transazione completa"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button 
                            type="button"
                            onClick={() => onDeleteTransaction(tx.id)}
                            className="p-1 hover:bg-slate-105 text-slate-400 hover:text-rose-600 rounded transition-colors cursor-pointer"
                            title="Rimuovi Transazione"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>

            {/* Table Footer with Financial Summary totals calcuated per active selection */}
            {sortedTransactions.length > 0 && (
              <tfoot className="bg-slate-50/80 border-t-2 border-slate-200 text-slate-700">
                {/* Outflow / Expense Total */}
                <tr className="border-b border-slate-100">
                  <td colSpan={7} className="py-2 px-4 text-right text-slate-500 font-sans font-bold text-[10px] uppercase tracking-wider">
                    Totale Spese Filtrate per Selezione:
                  </td>
                  <td className="py-2 px-4 text-right text-rose-600 font-mono font-extrabold text-xs">
                    {formatEuro(totalFilteredExpense)}
                  </td>
                  <td></td>
                </tr>
                {/* Inflow / Income Total */}
                <tr className="border-b border-slate-100">
                  <td colSpan={7} className="py-2 px-4 text-right text-slate-500 font-sans font-bold text-[10px] uppercase tracking-wider">
                    Totale Entrate Filtrate per Selezione:
                  </td>
                  <td className="py-2 px-4 text-right text-emerald-600 font-mono font-extrabold text-xs">
                    +{formatEuro(totalFilteredIncome)}
                  </td>
                  <td></td>
                </tr>
                {/* Net Balance Total */}
                <tr className="bg-slate-100/50">
                  <td colSpan={7} className="py-2.5 px-4 text-right text-slate-800 font-sans font-extrabold text-[10px] uppercase tracking-wider">
                    Saldo Netto Selezione:
                  </td>
                  <td className={`py-2.5 px-4 text-right font-mono font-black text-xs ${totalFilteredAmount >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {totalFilteredAmount >= 0 ? '+' : ''}{formatEuro(totalFilteredAmount)}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Pagination ControlsBar */}
      {totalPages > 1 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white border border-slate-200 px-6 py-4 rounded-2xl shadow-sm" id="pagination-panel">
          <div className="text-xs text-slate-500 font-sans">
            Mostrate transazioni <span className="font-bold text-slate-700">{startIndex + 1}</span> - <span className="font-bold text-slate-700">{Math.min(startIndex + itemsPerPage, totalFilteredCount)}</span> di <span className="font-bold text-slate-700">{totalFilteredCount}</span> filtrate
          </div>

          <div className="flex items-center gap-1 font-sans">
            <button
              type="button"
              disabled={validatedPage === 1}
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              className={`px-3 py-1.5 text-xs font-bold rounded-xl border transition ${
                validatedPage === 1
                  ? 'bg-slate-50 border-slate-100 text-slate-300 cursor-not-allowed'
                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-950 cursor-pointer'
              }`}
            >
              Precedente
            </button>

            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter(p => p === 1 || p === totalPages || Math.abs(p - validatedPage) <= 2)
              .map((page, idx, arr) => {
                const isPageActive = page === validatedPage;
                const prevPage = arr[idx - 1];
                const showEllipsis = prevPage && page - prevPage > 1;

                return (
                  <React.Fragment key={page}>
                    {showEllipsis && <span className="text-slate-400 px-1 font-sans font-bold text-xs">...</span>}
                    <button
                      type="button"
                      onClick={() => setCurrentPage(page)}
                      className={`w-8 h-8 flex items-center justify-center text-xs font-bold rounded-xl transition cursor-pointer ${
                        isPageActive
                          ? 'bg-indigo-600 text-white shadow-xs ring-2 ring-indigo-500/10'
                          : 'hover:bg-slate-100 text-slate-600'
                      }`}
                    >
                      {page}
                    </button>
                  </React.Fragment>
                );
              })}

            <button
              type="button"
              disabled={validatedPage === totalPages}
              onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
              className={`px-3 py-1.5 text-xs font-bold rounded-xl border transition ${
                validatedPage === totalPages
                  ? 'bg-slate-50 border-slate-100 text-slate-300 cursor-not-allowed'
                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-950 cursor-pointer'
              }`}
            >
              Successiva
            </button>
          </div>
        </div>
      )}

      {/* Edit Transaction Modal dialog overlay */}
      {editingTx && (
        <div id="edit-tx-modal" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto animate-fade-in animate-in">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[90vh]">
            
            {/* Header */}
            <div className="p-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-indigo-50 text-indigo-605 rounded-lg">
                  <Pencil className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-800 font-sans">Modifica Movimento</h3>
                  <p className="text-[10px] text-slate-400 font-sans font-medium">Elemento: {editingTx.description}</p>
                </div>
              </div>
              <button 
                type="button"
                onClick={() => setEditingTx(null)}
                className="p-1.5 hover:bg-slate-200 text-slate-400 hover:text-slate-600 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleEditTxSubmit} className="flex-1 overflow-y-auto p-5 space-y-4 font-sans text-xs">
              
              {/* Type toggle buttons */}
              <div>
                <label className="block text-slate-605 text-[10px] font-bold uppercase tracking-wider mb-2">Tipo Movimento</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEditDirection('expense');
                      if (editScope === 'personal') {
                        setEditCategory('necessarie');
                      } else {
                        setEditCategory('necessarie_lavoro');
                      }
                    }}
                    className={`py-2 rounded px-3 border font-semibold text-center transition cursor-pointer capitalize text-xs ${
                      editDirection === 'expense'
                        ? 'bg-rose-50 border-rose-300 text-rose-700 shadow-xs font-bold'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    Uscita
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditDirection('income');
                      if (editScope === 'personal') {
                        setEditCategory('entrate');
                      } else {
                        setEditCategory('entrate_lavoro');
                      }
                    }}
                    className={`py-2 rounded px-3 border font-semibold text-center transition cursor-pointer capitalize text-xs ${
                      editDirection === 'income'
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-700 shadow-xs font-bold'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    Entrata
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditDirection('transfer')}
                    className={`py-2 rounded px-3 border font-semibold text-center transition cursor-pointer capitalize text-xs ${
                      editDirection === 'transfer'
                        ? 'bg-indigo-50 border-indigo-300 text-indigo-700 shadow-xs font-bold'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    Giroconto
                  </button>
                </div>
              </div>

              {/* Scope (Personale / Professional) buttons */}
              {editDirection !== 'transfer' && (
                <div>
                  <label className="block text-slate-605 text-[10px] font-bold uppercase tracking-wider mb-2">Ambito</label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleEditScopeChange('personal')}
                      className={`flex-1 py-1.5 border rounded-lg font-semibold text-center transition cursor-pointer text-xs ${
                        editScope === 'personal'
                          ? 'bg-indigo-50 border-indigo-250 text-indigo-655 font-bold shadow-xs'
                          : 'bg-slate-50 border-slate-200 text-slate-600'
                      }`}
                    >
                      Personale
                    </button>
                    <button
                      type="button"
                      onClick={() => handleEditScopeChange('professional')}
                      className={`flex-1 py-1.5 border rounded-lg font-semibold text-center transition cursor-pointer text-xs ${
                        editScope === 'professional'
                          ? 'bg-amber-50 border-amber-250 text-amber-705 font-bold shadow-xs'
                          : 'bg-slate-50 border-slate-200 text-slate-605'
                      }`}
                    >
                      Partita IVA
                    </button>
                  </div>
                </div>
              )}

              {/* Date & Amount */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-655 text-[10px] font-bold uppercase tracking-wider mb-1.5">Data</label>
                  <input
                    type="date"
                    required
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    className="w-full text-xs font-mono bg-white border border-slate-200 text-slate-800 rounded px-2.5 py-2.5 outline-none focus:border-indigo-400"
                  />
                </div>
                <div>
                  <label className="block text-slate-655 text-[10px] font-bold uppercase tracking-wider mb-1.5">Ora (Opzionale)</label>
                  <input
                    type="time"
                    value={editTime}
                    onChange={(e) => setEditTime(e.target.value)}
                    className="w-full text-xs font-mono bg-white border border-slate-200 text-slate-800 rounded px-2.5 py-2.5 outline-none focus:border-indigo-400"
                  />
                </div>
                <div>
                  <label className="block text-slate-655 text-[10px] font-bold uppercase tracking-wider mb-1.5">Importo (€)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="0.00"
                    value={editAmount}
                    onChange={(e) => setEditAmount(e.target.value)}
                    className="w-full text-xs font-mono bg-white border border-slate-200 text-slate-800 rounded px-2.5 py-2.5 outline-none focus:border-indigo-400"
                  />
                </div>
              </div>

              {/* Descrizione (Always visible for clarity and editing) */}
              <div>
                <label className="block text-slate-605 text-[10px] font-bold uppercase tracking-wider mb-1.5">
                  {editDirection === 'transfer' ? 'Descrizione Giroconto / Causale (Opzionale)' : 'Descrizione'}
                </label>
                <input
                  type="text"
                  required={editDirection !== 'transfer'}
                  placeholder={editDirection === 'transfer' ? "es: Trasferimento fondi, alimentazione, ecc." : "Esempio: Spesa settimanale, Licenza Software"}
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  className="w-full text-xs bg-white border border-slate-200 text-slate-800 placeholder-slate-400 rounded-lg py-2.5 px-3 outline-none focus:border-indigo-400"
                />
              </div>

              {/* Accounts mapping */}
              <div className={editDirection === 'transfer' ? "grid grid-cols-2 gap-3" : "block"}>
                <div>
                  <label className="block text-slate-600 text-[10px] uppercase font-bold tracking-wider mb-1.5">
                    {editDirection === 'transfer' ? 'Conto di addebito (Uscita)' : "Conto d'appoggio"}
                  </label>
                  <select
                    value={editAccountId}
                    onChange={(e) => setEditAccountId(e.target.value)}
                    className="w-full text-xs bg-white border border-slate-200 text-slate-800 rounded-lg p-2.5 outline-none focus:border-indigo-400"
                  >
                    {accounts.map(acc => (
                      <option key={acc.id} value={acc.id}>{acc.name} ({formatEuro(acc.balance)})</option>
                    ))}
                  </select>
                </div>

                {editDirection === 'transfer' && (
                  <div>
                    <label className="block text-slate-600 text-[10px] uppercase font-bold tracking-wider mb-1.5">Conto di accredito (Entrata)</label>
                    <select
                      value={editDestinationAccountId}
                      onChange={(e) => setEditDestinationAccountId(e.target.value)}
                      className="w-full text-xs bg-white border border-slate-200 text-slate-800 rounded-lg p-2.5 outline-none focus:border-indigo-400"
                    >
                      {accounts.map(acc => (
                        <option key={acc.id} value={acc.id}>{acc.name} ({formatEuro(acc.balance)})</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Categories & precompiled subcategories dropdown (not shown on transfers) */}
              {editDirection !== 'transfer' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-600 text-[10px] uppercase font-bold tracking-wider mb-1.5">Categoria</label>
                    <select
                      value={editCategory}
                      onChange={(e) => setEditCategory(e.target.value)}
                      className="w-full text-xs bg-white border border-slate-200 text-slate-800 rounded-lg p-2.5 outline-none focus:border-indigo-400"
                    >
                      {editScope === 'personal' ? (
                        <>
                          <option value="necessarie">Necessaria</option>
                          <option value="utili">Utile</option>
                          <option value="tempo_libero">Tempo Libero</option>
                          <option value="entrate">Entrata</option>
                        </>
                      ) : (
                        <>
                          <option value="necessarie_lavoro">Necessaria Lavoro</option>
                          <option value="utili_lavoro">Utile Lavoro</option>
                          <option value="entrate_lavoro">Entrata Lavoro</option>
                        </>
                      )}
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-605 text-[10px] font-bold uppercase tracking-wider mb-1.5">Sottocategoria</label>
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        placeholder="Digita..."
                        required
                        value={editSubcategory}
                        onChange={(e) => setEditSubcategory(e.target.value)}
                        className="w-full text-xs bg-white border border-slate-200 text-slate-800 rounded-lg py-2.5 px-3 outline-none focus:border-indigo-400"
                      />
                      <select
                        onChange={(e) => setEditSubcategory(e.target.value)}
                        value=""
                        className="bg-slate-50 border border-slate-200 text-xs text-slate-600 rounded-lg px-2 max-w-[100px]"
                      >
                        <option value="">Frequenti...</option>
                        {getEditSubcategoryList().map(opt => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* Extra Professional Fields: Note, Cliente & Fattura */}
              {editDirection !== 'transfer' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2.5 border-t border-slate-150">
                  <div>
                    <label className="block text-slate-605 text-[10px] font-bold uppercase tracking-wider mb-1.5 flex items-center gap-1">
                      <span>📝 Note / Dettaglio</span>
                    </label>
                    <textarea
                      placeholder="es: Causale aggiuntiva, riferimento bonifico, ecc."
                      value={editNotes}
                      onChange={(e) => setEditNotes(e.target.value)}
                      className="w-full text-xs bg-white border border-slate-200 text-slate-800 rounded-lg py-2 px-3 h-[116px] resize-none outline-none focus:border-indigo-400"
                    />
                  </div>

                  {editScope === 'professional' ? (
                    <div className="space-y-3">
                      <div>
                        <label className="block text-amber-705 text-[10px] uppercase font-extrabold tracking-wider mb-1 flex items-center gap-1">
                          <span>👤 Cliente / Committente</span>
                          <span className="text-[9px] bg-amber-100 text-amber-855 px-1 rounded-sm uppercase tracking-tight font-extrabold">P. IVA</span>
                        </label>
                        <input
                          type="text"
                          placeholder="Nome del cliente o azienda..."
                          value={editCustomer}
                          onChange={(e) => setEditCustomer(e.target.value)}
                          className="w-full text-xs bg-white border border-slate-200 text-slate-800 rounded-lg py-2 px-3 h-10 outline-none focus:border-indigo-400"
                        />
                      </div>
                      <div>
                        <label className="block text-emerald-800 text-[10px] uppercase font-extrabold tracking-wider mb-1 flex items-center gap-1">
                          <span>🧾 Fattura Elettronica Collegata</span>
                          <span className="text-[9px] bg-emerald-100 text-emerald-855 px-1 rounded-sm uppercase tracking-tight font-extrabold">SDI</span>
                        </label>
                        <div className="flex gap-1.5">
                          <input
                            type="text"
                            placeholder="es: FPR 14/2026 (o lascia vuoto)"
                            value={editInvoiceId}
                            onChange={(e) => setEditInvoiceId(e.target.value)}
                            className="w-full text-xs bg-white border border-slate-200 placeholder-slate-400 text-slate-805 rounded-lg py-2 px-3 h-10 outline-none focus:border-emerald-400 font-medium"
                          />
                          {editInvoiceId && (
                            <button
                              type="button"
                              onClick={() => {
                                setEditInvoiceId('');
                                setEditNotes(prev => prev ? prev + ' (Fattura scollegata)' : 'Fattura scollegata');
                              }}
                              className="px-2 bg-rose-50 border border-rose-250 hover:bg-rose-100 text-rose-750 hover:text-rose-800 rounded-lg text-[10px] font-bold transition-colors cursor-pointer"
                              title="Scollega questa fattura da questo movimento"
                            >
                              Scollega
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="opacity-60 bg-slate-50 border border-slate-150 rounded-lg p-3 flex flex-col justify-center text-slate-400 text-[10px] h-[116px]">
                      <span className="font-bold text-slate-500">Campi Professionali Disattivati</span>
                      Imposta l'ambito su <strong className="text-indigo-650">Partita IVA</strong> per collegare il cliente e associare la fattura elettronica 2026.
                    </div>
                  )}
                </div>
              )}

              {/* Form buttons */}
              <div className="flex gap-2 justify-end pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingTx(null)}
                  className="px-4 py-2 hover:bg-slate-100 text-slate-500 text-xs font-bold rounded-xl cursor-pointer transition border border-slate-200"
                >
                  Annulla
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl cursor-pointer transition shadow-xs"
                >
                  Salva Modifiche
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
