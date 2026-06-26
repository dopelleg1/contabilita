/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Account, Transaction, AutoRule, Investment } from './types';
import { 
  INITIAL_ACCOUNTS, 
  INITIAL_TRANSACTIONS, 
  INITIAL_RULES, 
  applyLocalRules 
} from './utils/financeHelpers';

import DashboardTab from './components/DashboardTab';
import AccountsTab from './components/AccountsTab';
import TransactionsTab from './components/TransactionsTab';
import RulesTab from './components/RulesTab';
import ImportExportTab from './components/ImportExportTab';
import AiAdvisorTab from './components/AiAdvisorTab';

import { 
  LayoutDashboard, 
  CreditCard, 
  ArrowRightLeft, 
  Sparkles, 
  Link2,
  Lock,
  Menu,
  X,
  RefreshCw,
  Coins,
  Receipt,
  User,
  Settings,
  Brain,
  AlertTriangle,
  Database,
  ShieldCheck,
  Trash2
} from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'accounts' | 'transactions' | 'rules' | 'import-export' | 'ai-advisor'>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [taxpayerName, setTaxpayerName] = useState<string>('Domenico Pellegrino');
  const [taxpayerCf, setTaxpayerCf] = useState<string>('PLLDNC60B14A494R');
  const [salaryDayOfMonth, setSalaryDayOfMonth] = useState<number>(23);
  const [cycleDurationDays, setCycleDurationDays] = useState<number>(30);
  const [investments, setInvestments] = useState<Investment[]>([]);

  const [showProfileModal, setShowProfileModal] = useState(false);
  const [profileNameInput, setProfileNameInput] = useState(taxpayerName);
  const [profileCfInput, setProfileCfInput] = useState(taxpayerCf);

  // Custom non-blocking interactive confirmation dialog
  const [customConfirm, setCustomConfirm] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
    confirmText?: string;
    cancelText?: string;
    variant?: 'danger' | 'warning' | 'info';
  } | null>(null);

  useEffect(() => {
    (window as any).showCustomConfirm = (options: {
      title: string;
      message: string;
      onConfirm: () => void;
      confirmText?: string;
      cancelText?: string;
      variant?: 'danger' | 'warning' | 'info';
    }) => {
      setCustomConfirm(options);
    };
    return () => {
      delete (window as any).showCustomConfirm;
    };
  }, []);

  // Core visual data states initialized from SQLite and LocalStorage fallback
  const [accounts, setAccounts] = useState<Account[]>(INITIAL_ACCOUNTS);
  const [transactions, setTransactions] = useState<Transaction[]>(INITIAL_TRANSACTIONS);
  const [rules, setRules] = useState<AutoRule[]>(INITIAL_RULES);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isAutoRecovered, setIsAutoRecovered] = useState(false);

  // Active Sandbox / Production Datasets toggler
  const [isDemoMode, setIsDemoMode] = useState<boolean>(() => {
    const saved = localStorage.getItem('contosmart_is_demo_mode');
    return saved !== null ? saved === 'true' : true; // default to demo mode
  });

  useEffect(() => {
    localStorage.setItem('contosmart_is_demo_mode', String(isDemoMode));
  }, [isDemoMode]);

  // Derived datasets filtered strictly by environment mode
  const filteredAccounts = accounts.filter(a => isDemoMode ? a.isDemo === true : !a.isDemo);
  const filteredTransactions = transactions.filter(t => isDemoMode ? t.isDemo === true : !t.isDemo);
  const filteredRules = rules.filter(r => isDemoMode ? r.isDemo === true : !r.isDemo);

  // Refresh data helper with dynamic SQLite auto-restoration
  const refreshDbState = async () => {
    try {
      const res = await fetch('/api/db-state');
      const data = await res.json();
      
      const serverHasRealAccounts = data.accounts && data.accounts.some((a: any) => !a.isDemo);
      const serverHasRealTransactions = data.transactions && data.transactions.some((t: any) => !t.isDemo);
      
      const backupStr = localStorage.getItem('contosmart_durable_backup_v2');
      if (!serverHasRealAccounts && !serverHasRealTransactions && backupStr) {
        try {
          const backup = JSON.parse(backupStr);
          const backupHasRealAccounts = backup.accounts && backup.accounts.some((a: any) => !a.isDemo);
          const backupHasRealTransactions = backup.transactions && backup.transactions.some((t: any) => !t.isDemo);
          
          if (backupHasRealAccounts || backupHasRealTransactions) {
            console.log("Empty SQLite database detected, restoring from durable browser backup...");
            
            // Post backup directly to SQLite api to restore database
            const importRes = await fetch('/api/backup/import', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                accounts: backup.accounts || [],
                transactions: backup.transactions || [],
                rules: backup.rules || [],
                settings: [
                  { key: 'taxpayer_name', value: backup.taxpayerName || 'Domenico Pellegrino' },
                  { key: 'taxpayer_cf', value: backup.taxpayerCf || 'PLLDNC60B14A494R' }
                ]
              })
            });
            
            if (importRes.ok) {
              const importData = await importRes.json();
              if (importData.accounts) setAccounts(importData.accounts);
              if (importData.transactions) setTransactions(importData.transactions);
              if (importData.rules) setRules(importData.rules);
              setTaxpayerName(backup.taxpayerName || 'Domenico Pellegrino');
              setProfileNameInput(backup.taxpayerName || 'Domenico Pellegrino');
              setTaxpayerCf(backup.taxpayerCf || 'PLLDNC60B14A494R');
              setProfileCfInput(backup.taxpayerCf || 'PLLDNC60B14A494R');
              setIsAutoRecovered(true);
              setIsLoaded(true);
              return;
            }
          }
        } catch (backupErr) {
          console.error("Failed to restore from browser backup:", backupErr);
        }
      }

      if (data.accounts) setAccounts(data.accounts);
      if (data.transactions) setTransactions(data.transactions);
      if (data.rules) setRules(data.rules);
      if (data.taxpayerName) {
        setTaxpayerName(data.taxpayerName);
        setProfileNameInput(data.taxpayerName);
      }
      if (data.taxpayerCf) {
        setTaxpayerCf(data.taxpayerCf);
        setProfileCfInput(data.taxpayerCf);
      }
      if (data.salaryDayOfMonth !== undefined) {
        setSalaryDayOfMonth(data.salaryDayOfMonth);
      }
      if (data.cycleDurationDays !== undefined) {
        setCycleDurationDays(data.cycleDurationDays);
      }
      if (data.investments !== undefined) {
        setInvestments(data.investments);
      }
      setIsLoaded(true);
      return data;
    } catch (err) {
      console.error("Error refreshing SQLite state, trying local storage:", err);
      const savedName = localStorage.getItem('contosmart_taxpayer_name');
      if (savedName) setTaxpayerName(savedName);
      const savedCf = localStorage.getItem('contosmart_taxpayer_cf');
      if (savedCf) setTaxpayerCf(savedCf);
      const savedSalaryDay = localStorage.getItem('contosmart_salary_day');
      if (savedSalaryDay) setSalaryDayOfMonth(Number(savedSalaryDay));
      const savedCycleDuration = localStorage.getItem('contosmart_cycle_duration_days');
      if (savedCycleDuration) setCycleDurationDays(Number(savedCycleDuration));
      const savedInvestments = localStorage.getItem('contosmart_investments');
      if (savedInvestments) setInvestments(JSON.parse(savedInvestments));
      
      const savedAccs = localStorage.getItem('contosmart_accounts');
      if (savedAccs) setAccounts(JSON.parse(savedAccs));
      const savedTxs = localStorage.getItem('contosmart_transactions');
      if (savedTxs) setTransactions(JSON.parse(savedTxs));
      const savedRules = localStorage.getItem('contosmart_rules');
      if (savedRules) setRules(JSON.parse(savedRules));
      
      setIsLoaded(true);
    }
  };

  // Load from SQLite database on component mount
  useEffect(() => {
    refreshDbState();
  }, []);

  // Sync to LocalStorage as a local fallback
  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem('contosmart_taxpayer_name', taxpayerName);
    }
  }, [taxpayerName, isLoaded]);

  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem('contosmart_taxpayer_cf', taxpayerCf);
    }
  }, [taxpayerCf, isLoaded]);

  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem('contosmart_salary_day', String(salaryDayOfMonth));
    }
  }, [salaryDayOfMonth, isLoaded]);

  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem('contosmart_cycle_duration_days', String(cycleDurationDays));
    }
  }, [cycleDurationDays, isLoaded]);

  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem('contosmart_investments', JSON.stringify(investments));
    }
  }, [investments, isLoaded]);

  const handleUpdateSettings = async (updates: { taxpayerName?: string; taxpayerCf?: string; salaryDayOfMonth?: number; cycleDurationDays?: number; investments?: Investment[] }) => {
    try {
      const body: any = {};
      if (updates.taxpayerName !== undefined) {
        body.taxpayerName = updates.taxpayerName;
        setTaxpayerName(updates.taxpayerName);
      }
      if (updates.taxpayerCf !== undefined) {
        body.taxpayerCf = updates.taxpayerCf;
        setTaxpayerCf(updates.taxpayerCf);
      }
      if (updates.salaryDayOfMonth !== undefined) {
        body.salaryDayOfMonth = updates.salaryDayOfMonth;
        setSalaryDayOfMonth(updates.salaryDayOfMonth);
      }
      if (updates.cycleDurationDays !== undefined) {
        body.cycleDurationDays = updates.cycleDurationDays;
        setCycleDurationDays(updates.cycleDurationDays);
      }
      if (updates.investments !== undefined) {
        body.investments = updates.investments;
        setInvestments(updates.investments);
      }

      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
    } catch (err) {
      console.error("Error saving settings:", err);
    }
  };

  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem('contosmart_accounts', JSON.stringify(accounts));
    }
  }, [accounts, isLoaded]);

  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem('contosmart_transactions', JSON.stringify(transactions));
    }
  }, [transactions, isLoaded]);

  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem('contosmart_rules', JSON.stringify(rules));
    }
  }, [rules, isLoaded]);

  // COMBINED EFFECT: Durable double-copy backup to protect real financial accounts from transient container lifecycle
  useEffect(() => {
    if (isLoaded) {
      const hasRealData = accounts.some(a => !a.isDemo) || transactions.some(t => !t.isDemo);
      if (hasRealData) {
        const backupObj = {
          accounts,
          transactions,
          rules,
          taxpayerName,
          taxpayerCf,
          timestamp: new Date().toISOString()
        };
        localStorage.setItem('contosmart_durable_backup_v2', JSON.stringify(backupObj));
      }
    }
  }, [accounts, transactions, rules, taxpayerName, taxpayerCf, isLoaded]);

  // Core Actions synchronized with the SQLite database
  const handleAddAccount = (newAcc: Account) => {
    const accWithMode = { ...newAcc, isDemo: isDemoMode };
    setAccounts(prev => [...prev, accWithMode]);
    fetch('/api/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(accWithMode)
    }).catch(e => console.error("Error writing account to SQLite:", e));
  };

  const handleDeleteAccount = (id: string) => {
    setAccounts(prev => prev.filter(a => a.id !== id));
    fetch(`/api/accounts/${id}`, {
      method: 'DELETE'
    }).catch(e => console.error("Error deleting account from SQLite:", e));
  };

  const handleUpdateAccount = (id: string, updates: Partial<Account>) => {
    setAccounts(prev => prev.map(acc => {
      if (acc.id === id) {
        const updated = { ...acc, ...updates };
        fetch(`/api/accounts/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updated)
        }).catch(e => console.error("Error updating account in SQLite:", e));
        return updated;
      }
      return acc;
    }));
  };

  // Add individual transaction (updates account balance in state and SQLite)
  const handleAddTransaction = (newTx: Transaction) => {
    const isTransfer = newTx.type === 'transfer' && newTx.destinationAccountId;

    if (isTransfer) {
      const transferVal = Math.abs(newTx.amount);
      const destAccId = newTx.destinationAccountId;

      const candidate = transactions.find(t => 
        t.accountId === destAccId &&
        t.date === newTx.date &&
        Math.abs(t.amount) === transferVal &&
        !t.linkedTransactionId &&
        t.amount > 0
      );

      if (candidate) {
        setCustomConfirm({
          title: "Transazione di accredito esistente rilevata",
          message: `Nel conto di destinazione "${accounts.find(a => a.id === destAccId)?.name || 'Conto di Destinazione'}" in data ${newTx.date} esiste già una transazione di ${transferVal.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })} "${candidate.description}". Vuoi agganciarla a questo giroconto? Se la rifiuti, ne creeremo una nuova indipendente per l'accredito.`,
          confirmText: "Sì, aggancia transazione esistente",
          cancelText: "No, crea una nuova di arrivo",
          variant: "warning",
          onConfirm: () => {
            const txWithMode = { ...newTx, linkedTransactionId: candidate.id, isDemo: isDemoMode };
            const updatedCandidate = { ...candidate, linkedTransactionId: txWithMode.id };

            let updatedAccount: Account | null = null;
            setAccounts(prev => prev.map(acc => {
              if (acc.id === txWithMode.accountId) {
                const updated = { ...acc, balance: acc.balance + txWithMode.amount };
                updatedAccount = updated;
                return updated;
              }
              return acc;
            }));

            setTransactions(prev => [txWithMode, ...prev.map(t => t.id === candidate.id ? updatedCandidate : t)]);

            fetch('/api/transactions', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(txWithMode)
            }).then(() => {
              fetch(`/api/transactions/${candidate.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updatedCandidate)
              });
              if (updatedAccount) {
                fetch(`/api/accounts/${(updatedAccount as Account).id}`, {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(updatedAccount)
                });
              }
            }).catch(e => console.error("Error saving linked transaction:", e));
          },
          onCancel: () => {
            const newArrivalId = `tx-${Date.now()}-${Math.floor(Math.random() * 10000000)}-arrival`;
            const newArrivalTx: Transaction = {
              id: newArrivalId,
              date: newTx.date,
              description: `Ricezione Giroconto da ${accounts.find(a => a.id === newTx.accountId)?.name || 'Conto di Origine'} (Rifiutato aggancio)`,
              amount: transferVal,
              type: 'income',
              accountId: destAccId!,
              scope: newTx.scope,
              category: 'trasferimento' as any,
              subcategory: 'Giroconto',
              linkedTransactionId: newTx.id,
              isDemo: isDemoMode
            };

            const txWithMode = { ...newTx, linkedTransactionId: newArrivalId, isDemo: isDemoMode };

            let updatedAccount: Account | null = null;
            let updatedDestAccount: Account | null = null;
            setAccounts(prev => prev.map(acc => {
              if (acc.id === txWithMode.accountId) {
                const updated = { ...acc, balance: acc.balance + txWithMode.amount };
                updatedAccount = updated;
                return updated;
              }
              if (acc.id === newArrivalTx.accountId) {
                const updated = { ...acc, balance: acc.balance + newArrivalTx.amount };
                updatedDestAccount = updated;
                return updated;
              }
              return acc;
            }));

            setTransactions(prev => [txWithMode, newArrivalTx, ...prev]);

            fetch('/api/transactions', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(txWithMode)
            }).then(() => {
              fetch('/api/transactions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newArrivalTx)
              });
              if (updatedAccount) {
                fetch(`/api/accounts/${(updatedAccount as Account).id}`, {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(updatedAccount)
                });
              }
              if (updatedDestAccount) {
                fetch(`/api/accounts/${(updatedDestAccount as Account).id}`, {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(updatedDestAccount)
                });
              }
            }).catch(e => console.error("Error saving dual transactions:", e));
          }
        } as any);
      } else {
        const newArrivalId = `tx-${Date.now()}-${Math.floor(Math.random() * 10000000)}-arrival`;
        const newArrivalTx: Transaction = {
          id: newArrivalId,
          date: newTx.date,
          description: `Ricezione Giroconto da ${accounts.find(a => a.id === newTx.accountId)?.name || 'Conto di Origine'}`,
          amount: transferVal,
          type: 'income',
          accountId: destAccId!,
          scope: newTx.scope,
          category: 'trasferimento' as any,
          subcategory: 'Giroconto',
          linkedTransactionId: newTx.id,
          isDemo: isDemoMode
        };

        const txWithMode = { ...newTx, linkedTransactionId: newArrivalId, isDemo: isDemoMode };

        let updatedAccount: Account | null = null;
        let updatedDestAccount: Account | null = null;
        setAccounts(prev => prev.map(acc => {
          if (acc.id === txWithMode.accountId) {
            const updated = { ...acc, balance: acc.balance + txWithMode.amount };
            updatedAccount = updated;
            return updated;
          }
          if (acc.id === newArrivalTx.accountId) {
            const updated = { ...acc, balance: acc.balance + newArrivalTx.amount };
            updatedDestAccount = updated;
            return updated;
          }
          return acc;
        }));

        setTransactions(prev => [txWithMode, newArrivalTx, ...prev]);

        fetch('/api/transactions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(txWithMode)
        }).then(() => {
          fetch('/api/transactions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newArrivalTx)
          });
          if (updatedAccount) {
            fetch(`/api/accounts/${(updatedAccount as Account).id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(updatedAccount)
            });
          }
          if (updatedDestAccount) {
            fetch(`/api/accounts/${(updatedDestAccount as Account).id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(updatedDestAccount)
            });
          }
        }).catch(e => console.error("Error automatically saving dual transactions:", e));
      }
    } else {
      let updatedAccount: Account | null = null;
      const txWithMode = { ...newTx, isDemo: isDemoMode };

      setAccounts(prev => prev.map(acc => {
        if (acc.id === txWithMode.accountId) {
          const updated = { ...acc, balance: acc.balance + txWithMode.amount };
          updatedAccount = updated;
          return updated;
        }
        return acc;
      }));
      setTransactions(prev => [txWithMode, ...prev]);

      fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(txWithMode)
      }).then(() => {
        if (updatedAccount) {
          fetch(`/api/accounts/${(updatedAccount as Account).id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updatedAccount)
          });
        }
      }).catch(e => console.error("Error saving transaction to SQLite:", e));
    }
  };

  // Delete transaction (reverts account balance in state and SQLite)
  const handleDeleteTransaction = (id: string) => {
    const tx = transactions.find(t => t.id === id);
    if (tx) {
      let otherLinkedTx: Transaction | null = null;
      if (tx.linkedTransactionId) {
        otherLinkedTx = transactions.find(t => t.id === tx.linkedTransactionId) || null;
      }

      setAccounts(prev => {
        const nextAccs = prev.map(acc => {
          let balance = acc.balance;
          if (acc.id === tx.accountId) {
            balance = balance - tx.amount;
          }
          if (otherLinkedTx && acc.id === otherLinkedTx.accountId) {
            balance = balance - otherLinkedTx.amount;
          }
          if (!otherLinkedTx && tx.type === 'transfer' && tx.destinationAccountId && acc.id === tx.destinationAccountId) {
            balance = balance + tx.amount;
          }
          return { ...acc, balance };
        });

        // Update account balances on backend
        nextAccs.forEach(acc => {
          if (
            acc.id === tx.accountId || 
            (otherLinkedTx && acc.id === otherLinkedTx.accountId) || 
            (!otherLinkedTx && tx.type === 'transfer' && tx.destinationAccountId && acc.id === tx.destinationAccountId)
          ) {
            fetch(`/api/accounts/${acc.id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(acc)
            });
          }
        });

        return nextAccs;
      });

      // Send backend deletes
      fetch(`/api/transactions/${id}`, {
        method: 'DELETE'
      }).then(() => {
        if (otherLinkedTx) {
          fetch(`/api/transactions/${otherLinkedTx.id}`, {
            method: 'DELETE'
          });
        }
      }).catch(e => console.error("Error deleting transaction from SQLite:", e));

      setTransactions(prev => prev.filter(t => t.id !== id && (!otherLinkedTx || t.id !== otherLinkedTx.id)));
    }
  };

  // Update transaction (recalculates balances if values change and persists in SQLite)
  const handleUpdateTransaction = (id: string, updates: Partial<Transaction>) => {
    const oldTx = transactions.find(t => t.id === id);
    if (!oldTx) return;

    const isNowTransfer = (updates.type !== undefined ? updates.type === 'transfer' : oldTx.type === 'transfer') &&
                          (updates.destinationAccountId !== undefined ? updates.destinationAccountId : oldTx.destinationAccountId);

    const wasTransferAndLinked = oldTx.linkedTransactionId !== undefined;

    // Helper to apply updates with optional secondary transaction
    const applyPairUpdate = (
      primaryTx: Transaction, 
      secondaryTxToSave?: Transaction | null, 
      idToDelete?: string | null
    ) => {
      let nextAccs = [...accounts];
      
      // 1. Revert old transaction effect
      nextAccs = nextAccs.map(acc => {
        let balance = acc.balance;
        if (acc.id === oldTx.accountId) {
          balance -= oldTx.amount;
        }
        if (oldTx.linkedTransactionId) {
          const prevOther = transactions.find(t => t.id === oldTx.linkedTransactionId);
          if (prevOther && acc.id === prevOther.accountId) {
            balance -= prevOther.amount;
          }
        } else if (oldTx.type === 'transfer' && oldTx.destinationAccountId && acc.id === oldTx.destinationAccountId) {
          // legacy unlinked flow
          balance += oldTx.amount;
        }
        return { ...acc, balance };
      });

      // 2. Apply new transaction effect(s)
      nextAccs = nextAccs.map(acc => {
        let balance = acc.balance;
        if (acc.id === primaryTx.accountId) {
          balance += primaryTx.amount;
        }
        if (secondaryTxToSave && acc.id === secondaryTxToSave.accountId) {
          balance += secondaryTxToSave.amount;
        }
        if (!secondaryTxToSave && primaryTx.type === 'transfer' && primaryTx.destinationAccountId && acc.id === primaryTx.destinationAccountId) {
          // fallback unlinked flow
          balance -= primaryTx.amount;
        }
        return { ...acc, balance };
      });

      // Update state
      setAccounts(nextAccs);
      
      setTransactions(prev => {
        let list = prev.map(t => t.id === id ? primaryTx : t);
        if (secondaryTxToSave) {
          const exists = prev.some(t => t.id === secondaryTxToSave.id);
          if (exists) {
            list = list.map(t => t.id === secondaryTxToSave.id ? secondaryTxToSave : t);
          } else {
            list = [secondaryTxToSave, ...list];
          }
        }
        if (idToDelete) {
          list = list.filter(t => t.id !== idToDelete);
        }
        return list;
      });

      // Persist to SQLite
      fetch(`/api/transactions/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(primaryTx)
      }).then(() => {
        if (secondaryTxToSave) {
          const isExisting = transactions.some(t => t.id === secondaryTxToSave.id);
          fetch(`/api/transactions/${secondaryTxToSave.id}`, {
            method: secondaryTxToSave.id.startsWith('tx-') && isExisting ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(secondaryTxToSave)
          });
        }
        if (idToDelete) {
          fetch(`/api/transactions/${idToDelete}`, {
            method: 'DELETE'
          });
        }
        
        // Sync modified balances to SQLite
        nextAccs.forEach(acc => {
          fetch(`/api/accounts/${acc.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(acc)
          });
        });
      }).catch(e => console.error("Error keeping SQLite updated with transaction edits:", e));
    };

    if (isNowTransfer) {
      const transferVal = Math.abs(updates.amount !== undefined ? updates.amount : oldTx.amount);
      const destAccId = updates.destinationAccountId !== undefined ? updates.destinationAccountId : oldTx.destinationAccountId;
      const targetDate = updates.date !== undefined ? updates.date : oldTx.date;
      
      if (wasTransferAndLinked) {
        // Already linked, update BOTH in pair!
        const existingOther = transactions.find(t => t.id === oldTx.linkedTransactionId);
        if (existingOther) {
          const newPrimary = { ...oldTx, ...updates, isDemo: isDemoMode };
          const newOther = {
            ...existingOther,
            date: targetDate,
            amount: transferVal,
            scope: updates.scope !== undefined ? updates.scope : oldTx.scope,
            isVerified: updates.isVerified !== undefined ? updates.isVerified : oldTx.isVerified,
            accountId: destAccId!,
            category: 'trasferimento' as any,
            subcategory: 'Giroconto',
            description: `Ricezione Giroconto da ${accounts.find(a => a.id === (updates.accountId || oldTx.accountId))?.name || 'Conto di Origine'}`
          };
          applyPairUpdate(newPrimary, newOther);
        } else {
          // fallback if other went missing
          const newPrimary = { ...oldTx, ...updates, isDemo: isDemoMode };
          applyPairUpdate(newPrimary);
        }
      } else {
        // Not linked before, check candidate at target dest account!
        const candidate = transactions.find(t => 
          t.accountId === destAccId &&
          t.date === targetDate &&
          Math.abs(t.amount) === transferVal &&
          !t.linkedTransactionId &&
          t.amount > 0 &&
          t.id !== id
        );

        if (candidate) {
          setCustomConfirm({
            title: "Transazione di accredito esistente rilevata",
            message: `Nel conto di destinazione "${accounts.find(a => a.id === destAccId)?.name || 'Conto di Destinazione'}" in data ${targetDate} esiste già una transazione di ${transferVal.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })} "${candidate.description}". Vuoi agganciarla a questo giroconto? Se la rifiuti, ne creeremo una nuova indipendente per l'accredito.`,
            confirmText: "Sì, aggancia transazione esistente",
            cancelText: "No, crea una nuova di arrivo",
            variant: "warning",
            onConfirm: () => {
              const newPrimary = { ...oldTx, ...updates, linkedTransactionId: candidate.id, isDemo: isDemoMode };
              const newOther = { ...candidate, linkedTransactionId: newPrimary.id };
              applyPairUpdate(newPrimary, newOther);
            },
            onCancel: () => {
              const newArrivalId = `tx-${Date.now()}-${Math.floor(Math.random() * 10000000)}-arrival`;
              const newOther: Transaction = {
                id: newArrivalId,
                date: targetDate,
                description: `Ricezione Giroconto da ${accounts.find(a => a.id === (updates.accountId || oldTx.accountId))?.name || 'Conto di Origine'}`,
                amount: transferVal,
                type: 'income',
                accountId: destAccId!,
                scope: updates.scope !== undefined ? updates.scope : oldTx.scope,
                category: 'trasferimento' as any,
                subcategory: 'Giroconto',
                linkedTransactionId: id,
                isDemo: isDemoMode
              };
              const newPrimary = { ...oldTx, ...updates, linkedTransactionId: newArrivalId, isDemo: isDemoMode };
              applyPairUpdate(newPrimary, newOther);
            }
          } as any);
        } else {
          // No candidate, auto create arrival item!
          const newArrivalId = `tx-${Date.now()}-${Math.floor(Math.random() * 10000000)}-arrival`;
          const newOther: Transaction = {
            id: newArrivalId,
            date: targetDate,
            description: `Ricezione Giroconto da ${accounts.find(a => a.id === (updates.accountId || oldTx.accountId))?.name || 'Conto di Origine'}`,
            amount: transferVal,
            type: 'income',
            accountId: destAccId!,
            scope: updates.scope !== undefined ? updates.scope : oldTx.scope,
            category: 'trasferimento' as any,
            subcategory: 'Giroconto',
            linkedTransactionId: id,
            isDemo: isDemoMode
          };
          const newPrimary = { ...oldTx, ...updates, linkedTransactionId: newArrivalId, isDemo: isDemoMode };
          applyPairUpdate(newPrimary, newOther);
        }
      }
    } else {
      // Not a transfer now. If it was linked before, we unlink (or delete if it was an auto-arrival)
      let otherIdToDelete: string | null = null;
      let otherToUnlink: Transaction | null = null;
      
      if (wasTransferAndLinked) {
        const otherTx = transactions.find(t => t.id === oldTx.linkedTransactionId);
        if (otherTx) {
          if (otherTx.id.endsWith('-arrival')) {
            otherIdToDelete = otherTx.id;
          } else {
            otherToUnlink = { ...otherTx, linkedTransactionId: undefined };
          }
        }
      }

      const newPrimary = { ...oldTx, ...updates, linkedTransactionId: undefined, isDemo: isDemoMode };
      applyPairUpdate(newPrimary, otherToUnlink, otherIdToDelete);
    }
  };

  // Direct Transfers logic: Registers out/in transactions and updates accounts
  const handleExecuteTransfer = (fromId: string, toId: string, amount: number, description: string) => {
    const dateStr = new Date().toISOString().split('T')[0];
    const fromName = accounts.find(a => a.id === fromId)?.name || 'Conto Sconosciuto';
    const toName = accounts.find(a => a.id === toId)?.name || 'Conto Sconosciuto';

    const outTx: Transaction = {
      id: `tx-transfer-out-${Date.now()}`,
      date: dateStr,
      description: `${description} -> A: ${toName}`,
      amount: -amount,
      type: 'expense',
      accountId: fromId,
      destinationAccountId: toId,
      scope: 'personal',
      category: 'trasferimento',
      subcategory: 'Giroconto'
    };

    const inTx: Transaction = {
      id: `tx-transfer-in-${Date.now() + 1}`,
      date: dateStr,
      description: `${description} -> Da: ${fromName}`,
      amount: amount,
      type: 'income',
      accountId: toId,
      scope: 'personal',
      category: 'trasferimento',
      subcategory: 'Giroconto'
    };

    let updatedFromAcc: Account | null = null;
    let updatedToAcc: Account | null = null;

    setAccounts(prev => prev.map(acc => {
      if (acc.id === fromId) {
        const updated = { ...acc, balance: acc.balance - amount };
        updatedFromAcc = updated;
        return updated;
      }
      if (acc.id === toId) {
        const updated = { ...acc, balance: acc.balance + amount };
        updatedToAcc = updated;
        return updated;
      }
      return acc;
    }));

    setTransactions(prev => [outTx, inTx, ...prev]);

    // Save both transfer pathways to SQLite and update balances
    Promise.all([
      fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(outTx)
      }),
      fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(inTx)
      })
    ]).then(() => {
      if (updatedFromAcc) {
        fetch(`/api/accounts/${(updatedFromAcc as Account).id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updatedFromAcc)
        });
      }
      if (updatedToAcc) {
        fetch(`/api/accounts/${(updatedToAcc as Account).id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updatedToAcc)
        });
      }
    }).catch(e => console.error("Error creating transfer in database:", e));
  };

  const handleAddRule = (newRule: AutoRule, applyToTxIds?: string[]) => {
    const ruleWithMode = { ...newRule, isDemo: isDemoMode };
    setRules(prev => [...prev, ruleWithMode]);
    fetch('/api/rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ruleWithMode)
    }).catch(e => console.error("Error writing new rule to SQLite:", e));

    if (applyToTxIds && applyToTxIds.length > 0) {
      setTransactions(prev => {
        return prev.map(tx => {
          if (applyToTxIds.includes(tx.id)) {
            const isTransfer = newRule.category === 'trasferimento' && newRule.accountId && newRule.destinationAccountId;
            const updated = {
              ...tx,
              scope: newRule.scope,
              category: newRule.category as any,
              subcategory: newRule.subcategory,
              isAutoMatched: true,
              ...(isTransfer ? {
                type: 'transfer' as const,
                accountId: newRule.accountId!,
                destinationAccountId: newRule.destinationAccountId!
              } : {})
            };
            
            // Save inside database
            fetch(`/api/transactions/${tx.id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(updated)
            }).catch(err => console.error("Error saving updated transaction from rule application:", err));

            return updated;
          }
          return tx;
        });
      });
    }
  };

  const handleDeleteRule = (id: string) => {
    setRules(prev => prev.filter(r => r.id !== id));
    fetch(`/api/rules/${id}`, {
      method: 'DELETE'
    }).catch(e => console.error("Error removing rule from SQLite:", e));
  };

  // Run local regex rules match and update modified entities
  const handleRunRulesOnTransactions = () => {
    let matchCount = 0;
    const changedTxs: Transaction[] = [];

    const updatedTxs = transactions.map(tx => {
      if (tx.category === 'necessarie' && tx.subcategory === 'Altro') {
        const match = applyLocalRules(tx.description, rules);
        if (match) {
          matchCount++;
          const isTransfer = match.category === 'trasferimento' && match.accountId && match.destinationAccountId;
          const updated = {
            ...tx,
            scope: match.scope,
            category: match.category as any,
            subcategory: match.subcategory,
            isAutoMatched: true,
            ...(isTransfer ? {
              type: 'transfer' as const,
              accountId: match.accountId!,
              destinationAccountId: match.destinationAccountId!
            } : {})
          };
          changedTxs.push(updated);
          return updated;
        }
      }
      return tx;
    });

    if (matchCount > 0) {
      setTransactions(updatedTxs);
      changedTxs.forEach(tx => {
        fetch(`/api/transactions/${tx.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(tx)
        });
      });
    }
    return matchCount;
  };

  // Restores auto matched records back to unclassified
  const handleResetAutoCategorized = () => {
    const changedTxs: Transaction[] = [];
    const updatedTxs = transactions.map(t => {
      if (t.isAutoMatched) {
        const updated = {
          ...t,
          scope: 'personal' as const,
          category: 'necessarie' as const,
          subcategory: 'Altro',
          isAutoMatched: false
        };
        changedTxs.push(updated);
        return updated;
      }
      return t;
    });

    setTransactions(updatedTxs);
    changedTxs.forEach(tx => {
      fetch(`/api/transactions/${tx.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tx)
      });
    });
  };

  // Bulk classify from Gemini API response
  const handleApplyAiCategorization = (aiTxList: any[], aiSuggestedRules: any[]) => {
    const changedTxs: Transaction[] = [];

    setTransactions(prev => prev.map(tx => {
      const match = aiTxList.find(aiTx => aiTx.id === tx.id);
      if (match) {
        const updated = {
          ...tx,
          scope: match.scope,
          category: match.category,
          subcategory: match.subcategory,
          description: match.cleanTitle || tx.description,
          isAutoMatched: true
        };
        changedTxs.push(updated);
        return updated;
      }
      return tx;
    }));

    changedTxs.forEach(tx => {
      fetch(`/api/transactions/${tx.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tx)
      });
    });

    aiSuggestedRules.forEach(sRule => {
      if (!rules.some(r => r.keyword.toLowerCase() === sRule.keyword.toLowerCase())) {
        const newRule: AutoRule = {
          id: `rule-ai-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          name: sRule.name,
          keyword: sRule.keyword,
          scope: sRule.scope,
          category: sRule.category,
          subcategory: sRule.subcategory
        };
        setRules(prev => [...prev, newRule]);
        
        fetch('/api/rules', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newRule)
        });
      }
    });
  };

  // Import batch transactions and record them
  const handleImportTransactions = (importedList: Partial<Transaction>[]) => {
    importedList.forEach(tx => {
      const finalTx: Transaction = {
        id: tx.id || `tx-${Date.now()}-${Math.random()}`,
        date: tx.date || new Date().toISOString().split('T')[0],
        description: tx.description || 'Imported Transaction',
        amount: tx.amount || 0,
        type: tx.type || 'expense',
        accountId: tx.accountId || filteredAccounts[0]?.id || 'acc-1',
        scope: 'personal',
        category: 'necessarie',
        subcategory: 'Altro',
        isDemo: isDemoMode
      };
      handleAddTransaction(finalTx);
    });
  };

  // Erases tables and resets default values in SQLite database
  const handleResetDataToDefaults = () => {
    setCustomConfirm({
      title: "Ripristina database completo",
      message: "Sei sicuro di voler resettare tutti i dati ed eliminare le modifiche correnti ripristinando il database SQLite originario coi dati demo?",
      confirmText: "Ripristina Dati",
      variant: "danger",
      onConfirm: () => {
        fetch('/api/reset', { method: 'POST' })
          .then(res => res.json())
          .then(data => {
            if (data.accounts) setAccounts(data.accounts);
            if (data.transactions) setTransactions(data.transactions);
            if (data.rules) setRules(data.rules);
            if (data.taxpayerName) setTaxpayerName(data.taxpayerName);
            if (data.taxpayerCf) setTaxpayerCf(data.taxpayerCf);
            localStorage.clear();
            setActiveTab('dashboard');
          })
          .catch(err => {
            console.error("Error during reset execution:", err);
          });
      }
    });
  };

  // Clears out only transactions and updates accounts to starting balance is zero in SQLite
  const handleClearAllTransactions = () => {
    setCustomConfirm({
      title: "Svuota solo transazioni",
      message: "Sei sicuro di voler svuotare TUTTE le transazioni (Entrate, Uscite e Trasferimenti) ed azzerare i saldi dei conti correnti per caricarli da zero? Questa azione non può essere annullata.",
      confirmText: "Svuota Tutto",
      variant: "warning",
      onConfirm: () => {
        fetch('/api/transactions/clear-all', { method: 'POST' })
          .then(res => res.json())
          .then(data => {
            if (data.accounts) setAccounts(data.accounts);
            if (data.transactions) setTransactions(data.transactions);
            localStorage.removeItem('selectedRawAccount'); // clear state cached import values
            setActiveTab('import-export'); // navigate straight to import tab for convenience
          })
          .catch(err => {
            console.error("Error clearing transactions:", err);
          });
      }
    });
  };

  // Copy all Demo data into the Real Database Archive
  const handleCopyDemoToReal = () => {
    setCustomConfirm({
      title: "Copia Dati Demo su Reale",
      message: "Sei sicuro di voler duplicare tutti i dati dimostrativi (conti, scontrini, transazioni storiche e regole - sia Personali che Professionali P.IVA) nel tuo Archivio Reale? Se conti o transazioni equivalenti sono già presenti, verranno esclusi in automatico i duplicati per sicurezza.",
      confirmText: "Copia nei Miei Dati ⭐",
      variant: "info",
      onConfirm: () => {
        fetch('/api/copy-demo-to-real', { method: 'POST' })
          .then(res => res.json())
          .then(async data => {
            if (data.success) {
              await refreshDbState();
              setIsDemoMode(false); // Switch to Real view
              setCustomConfirm({
                title: "Dati Copiati con Successo!",
                message: "Tutti i conti, movimenti storici e regole di categorizzazione personali e professionali sono stati importati nel tuo archivio reale. Ora stai operando sui 'Miei Dati Reali'. Buon lavoro!",
                confirmText: "Ottimo",
                onConfirm: () => {}
              });
            } else {
              alert("Errore durante la copia dei dati demo: " + (data.error || "Riprova."));
            }
          })
          .catch(err => {
            console.error("Error copy-demo-to-real:", err);
            alert("Errore di rete durante il processo.");
          });
      }
    });
  };

  // Delete all Demo transactions
  const handleDeleteDemoTransactions = () => {
    setCustomConfirm({
      title: "Elimina Transazioni Demo",
      message: "Sei sicuro di voler eliminare DEFINITIVAMENTE tutte le transazioni di prova (demo)? Questa operazione svuoterà l'archivio dimostrativo e azzererà i relativi saldi fittizi per darti una sandbox totalmente pulita.",
      confirmText: "Sì, cancella transazioni demo 🗑️",
      variant: "danger",
      onConfirm: () => {
        fetch('/api/delete-demo-transactions', { method: 'POST' })
          .then(res => res.json())
          .then(async data => {
            if (data.success) {
              await refreshDbState();
              setCustomConfirm({
                title: "Transazioni Demo Eliminate!",
                message: "Tutte le transazioni demo sono state rimosse con successo, e i saldi dei conti dimostrativi sono stati portati a zero.",
                confirmText: "Ottimo, grazie",
                onConfirm: () => {}
              });
            } else {
              alert("Errore durante l'eliminazione dei dati demo: " + (data.error || "Riprova."));
            }
          })
          .catch(err => {
            console.error("Error delete-demo-transactions:", err);
            alert("Errore di rete.");
          });
      }
    });
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans" id="app-root">
      
      {/* Top Mobile Navbar */}
      <header className="lg:hidden bg-white border-b border-slate-200 px-4 py-3.5 flex justify-between items-center sticky top-0 z-40">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-indigo-600 rounded-lg text-white">
            <Coins className="w-5 h-5" />
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-sm tracking-tight text-slate-800 leading-tight">ContoSmart Budget P.IVA</span>
            <span className="text-[10px] text-slate-500 font-medium mt-0.5">Release 1.0.0</span>
          </div>
        </div>
        <button 
          id="btn-mobile-menu"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="p-1.5 text-slate-500 hover:text-slate-900"
        >
          {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </header>

      {/* Main Grid: Sidebar + Center Workspace */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 relative">
        
        {/* SIDE BAR NAVIGATION PANEL */}
        <nav className={`lg:col-span-3 xl:col-span-2.5 bg-slate-900 border-r border-slate-800 flex flex-col justify-between p-5 lg:sticky lg:top-0 lg:h-screen z-30 transition-transform ${
          mobileMenuOpen ? 'translate-x-0 fixed inset-y-0 left-0 w-64' : 'hidden lg:flex'
        }`}>
          <div className="space-y-6">
            {/* Desktop Brand */}
            <div className="hidden lg:flex items-center gap-2.5 px-2 pb-4 border-b border-slate-800">
              <div className="p-2 bg-indigo-600 rounded-xl text-white shadow-xl">
                <Coins className="w-5 h-5" />
              </div>
              <div className="flex flex-col">
                <span className="font-bold text-xs tracking-wider uppercase text-white leading-tight">ContoSmart</span>
                <span className="text-[10px] text-indigo-400 font-semibold tracking-wider">Gestione Budget & P.IVA</span>
                <span className="text-[9px] text-slate-500 font-medium tracking-wide mt-1">Release 1.0.0</span>
              </div>
            </div>

            {/* Nav menu links */}
            <div className="space-y-1">
              <button 
                id="nav-dashboard"
                onClick={() => { setActiveTab('dashboard'); setMobileMenuOpen(false); }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 text-xs font-semibold rounded-lg transition-all ${
                  activeTab === 'dashboard' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                }`}
              >
                <LayoutDashboard className="w-4 h-4" />
                Andamento & Budget
              </button>

              <button 
                id="nav-ai-advisor"
                onClick={() => { setActiveTab('ai-advisor'); setMobileMenuOpen(false); }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 text-xs font-semibold rounded-lg transition-all ${
                  activeTab === 'ai-advisor' ? 'bg-indigo-600 text-white shadow-sm font-bold border-l-4 border-indigo-400' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                }`}
              >
                <Brain className="w-4 h-4 text-indigo-400" />
                Consulente AI & Strategia
              </button>

              <button 
                id="nav-accounts"
                onClick={() => { setActiveTab('accounts'); setMobileMenuOpen(false); }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 text-xs font-semibold rounded-lg transition-all ${
                  activeTab === 'accounts' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                }`}
              >
                <CreditCard className="w-4 h-4" />
                Conti & Finanziamenti
              </button>

              <button 
                id="nav-transactions"
                onClick={() => { setActiveTab('transactions'); setMobileMenuOpen(false); }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 text-xs font-semibold rounded-lg transition-all ${
                  activeTab === 'transactions' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                }`}
              >
                <Receipt className="w-4 h-4" />
                Libro Transazioni
              </button>

              <button 
                id="nav-rules"
                onClick={() => { setActiveTab('rules'); setMobileMenuOpen(false); }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 text-xs font-semibold rounded-lg transition-all ${
                  activeTab === 'rules' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                }`}
              >
                <Sparkles className="w-4 h-4" />
                Regole di Gestione & AI
              </button>

              <button 
                id="nav-import-export"
                onClick={() => { setActiveTab('import-export'); setMobileMenuOpen(false); }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 text-xs font-semibold rounded-lg transition-all ${
                  activeTab === 'import-export' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                }`}
              >
                <Link2 className="w-4 h-4" />
                Banca & Import/Export
              </button>
            </div>
          </div>

          {/* Bottom Security / Reset links */}
          <div className="pt-4 border-t border-slate-800 space-y-4">
            <div className="flex items-center justify-between py-1 group/profile">
              <button 
                onClick={() => {
                  setProfileNameInput(taxpayerName);
                  setProfileCfInput(taxpayerCf);
                  setShowProfileModal(true);
                }}
                className="flex items-center gap-3 text-left w-full hover:bg-slate-800/40 p-1.5 rounded-xl transition-all border border-transparent hover:border-slate-800/80 cursor-pointer"
                title="Modifica profil ditta / contribuente"
              >
                <div className="w-9 h-9 bg-indigo-600 rounded-full border-2 border-slate-700 flex items-center justify-center font-bold text-white text-xs font-sans">
                  {taxpayerName.trim() ? taxpayerName.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2) : 'CF'}
                </div>
                <div className="text-left flex-1 min-w-0">
                  <p className="text-xs font-semibold text-white truncate max-w-[120px]" title={taxpayerName}>
                    {taxpayerName}
                  </p>
                  <p className="text-[10px] text-slate-500 font-mono truncate max-w-[125px]" title={taxpayerCf}>
                    {taxpayerCf}
                  </p>
                </div>
                <Settings className="w-3.5 h-3.5 text-slate-500 group-hover/profile:text-indigo-400 transition-colors mr-1" />
              </button>
            </div>

            <div className="flex items-center gap-2 px-2.5 py-1.5 bg-slate-950 rounded-xl border border-slate-850">
              <Lock className="w-3.5 h-3.5 text-indigo-400" />
              <span className="text-[10px] font-semibold text-slate-400 font-sans">Database crittografato locale</span>
            </div>
            
            <button 
              id="btn-clear-transactions"
              onClick={handleClearAllTransactions}
              className="w-full text-left text-[10px] text-slate-500 hover:text-amber-400 font-semibold px-2 mb-1"
            >
              Svuota solo transazioni
            </button>
            <button 
              id="btn-revert-defaults"
              onClick={handleResetDataToDefaults}
              className="w-full text-left text-[10px] text-slate-500 hover:text-rose-400 font-semibold px-2"
            >
              Ripristina dati iniziali
            </button>
          </div>
        </nav>

        {/* WORKSPACE AREA CONTAINER */}
        <main className="lg:col-span-9 xl:col-span-9.5 p-6 lg:p-8 space-y-6 overflow-y-auto max-h-screen">
          
          {/* AUTO-RECOVERY NOTIFICATION FOR EPHEMERAL DOCKER / CLOUD RUN CONTAINERS */}
          {isAutoRecovered && (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-850 p-4 rounded-2xl flex items-start gap-3 shadow-3xs animate-fade-in text-left">
              <span className="text-xl">✨</span>
              <div className="space-y-1">
                <h4 className="text-xs font-bold font-sans text-emerald-900">Sincronizzazione Automatica & Ripristino Attivo</h4>
                <p className="text-[11px] text-emerald-750 font-sans leading-relaxed">
                  Il server Cloud Run temporaneo di sviluppo è stato riavviato (comportamento standard per i container serverless di test). ContoSmart ha rilevato l’azzzeramento e ha **riprisitinato e ri-allineato automaticamente** il database SQLite con l'ultimo stato salvato nel tuo browser! Tutti i conti e movimenti reali del contribuente sono perfettamente integri.
                </p>
              </div>
              <button 
                type="button" 
                onClick={() => setIsAutoRecovered(false)}
                className="text-[10px] text-emerald-700 hover:text-emerald-900 font-extrabold ml-auto bg-emerald-100/60 hover:bg-emerald-200/60 active:scale-95 rounded px-2.5 py-1 font-sans cursor-pointer transition-all"
              >
                Chiudi
              </button>
            </div>
          )}

          {/* DATABASE STATE SEPARATOR - ENVIRONMENT TOGGLER PANEL */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-3xs animate-fade-in">
            <div className="flex items-center gap-3">
              <div className={`p-3 rounded-2xl border shrink-0 ${
                isDemoMode 
                  ? 'bg-amber-50 text-amber-600 border-amber-100' 
                  : 'bg-emerald-50 text-emerald-600 border-emerald-100'
              }`}>
                {isDemoMode ? <Database className="w-5 h-5" /> : <ShieldCheck className="w-5 h-5 text-emerald-600" />}
              </div>
              <div className="space-y-0.5 text-left">
                <h3 className="text-xs font-bold text-slate-800 font-sans flex flex-wrap items-center gap-2">
                  Archivio Database Attivo: {isDemoMode ? 'DIMOSTRATIVO (DEMO)' : 'IL MIO CONTO REALE (P.IVA)'}
                  <span className={`text-[9.5px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wide inline-block ${
                    isDemoMode ? 'bg-amber-100 text-amber-850' : 'bg-emerald-100 text-emerald-850'
                  }`}>
                    {isDemoMode ? 'Sandbox di test' : 'Data Live locale'}
                  </span>
                </h3>
                <p className="text-[11px] text-slate-500 font-sans leading-relaxed">
                  {isDemoMode 
                    ? 'Stai esplorando il software tramite conti e transazioni fittizie. Perfetto per prendere confidenza con l’AI.'
                    : 'I dati inseriti o importati qui appartengono alla tua ditta e sono salvati al sicuro nel database SQLite locale.'}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap sm:flex-nowrap items-center gap-3 shrink-0 self-stretch sm:self-auto">
              <div className="flex gap-1 p-1 bg-slate-100 border border-slate-200/60 rounded-xl w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setIsDemoMode(true)}
                  className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-lg cursor-pointer transition-all ${
                    isDemoMode 
                      ? 'bg-white text-slate-800 shadow-2xs border border-slate-200/10' 
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Database className="w-3.5 h-3.5" />
                  Dati Demo
                </button>
                <button
                  type="button"
                  onClick={() => setIsDemoMode(false)}
                  className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-lg cursor-pointer transition-all ${
                    !isDemoMode 
                      ? 'bg-white text-emerald-700 shadow-2xs border border-slate-200/10 font-black' 
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  Miei Dati Reali
                </button>
              </div>

              {isDemoMode && (
                <div className="flex gap-2 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={handleCopyDemoToReal}
                    className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-extrabold bg-amber-500 hover:bg-amber-600 active:scale-95 text-slate-900 rounded-xl shadow-3xs hover:shadow-2xs transition-all cursor-pointer border border-amber-400"
                    title="Duplica tutti i conti correnti e movimenti nell'archivio reale"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-950 animate-pulse" />
                    Copia su Reale ⭐
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteDemoTransactions}
                    className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-extrabold bg-red-50 hover:bg-red-100 text-red-600 active:scale-95 rounded-xl shadow-3xs hover:shadow-2xs transition-all cursor-pointer border border-red-200"
                    title="Elimina tutte le transazioni demo"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Svuota Dati Demo
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Active Worksite viewport */}
          {activeTab === 'dashboard' && (
            <DashboardTab 
              accounts={filteredAccounts} 
              transactions={filteredTransactions} 
              taxpayerName={taxpayerName}
              taxpayerCf={taxpayerCf}
              salaryDayOfMonth={salaryDayOfMonth}
              cycleDurationDays={cycleDurationDays}
              investments={investments}
              onUpdateSettings={handleUpdateSettings}
            />
          )}

          {activeTab === 'accounts' && (
            <AccountsTab 
              accounts={filteredAccounts} 
              onAddAccount={handleAddAccount}
              onDeleteAccount={handleDeleteAccount}
              onExecuteTransfer={handleExecuteTransfer}
              onAddTransaction={handleAddTransaction}
              onUpdateAccount={handleUpdateAccount}
            />
          )}

          {activeTab === 'transactions' && (
            <TransactionsTab 
              transactions={filteredTransactions}
              accounts={filteredAccounts}
              onAddTransaction={handleAddTransaction}
              onUpdateTransaction={handleUpdateTransaction}
              onDeleteTransaction={handleDeleteTransaction}
            />
          )}

          {activeTab === 'rules' && (
            <RulesTab
              rules={filteredRules}
              transactions={filteredTransactions}
              accounts={accounts}
              onAddRule={handleAddRule}
              onDeleteRule={handleDeleteRule}
              onRunRulesOnTransactions={handleRunRulesOnTransactions}
              onResetAutoCategorized={handleResetAutoCategorized}
              onApplyAiCategorization={handleApplyAiCategorization}
            />
          )}

          {activeTab === 'import-export' && (
            <ImportExportTab 
              accounts={filteredAccounts}
              transactions={filteredTransactions}
              rules={filteredRules}
              onImportTransactions={handleImportTransactions}
              onAddTransaction={handleAddTransaction}
              onAddAccount={handleAddAccount}
              onAddRule={handleAddRule}
              onRefreshDbState={refreshDbState}
              onUpdateTransaction={handleUpdateTransaction}
              isDemoMode={isDemoMode}
            />
          )}

          {activeTab === 'ai-advisor' && (
            <AiAdvisorTab 
              accounts={filteredAccounts}
              transactions={filteredTransactions}
              taxpayerName={taxpayerName}
            />
          )}

        </main>

      </div>

      {/* Dynamic Taxpayer Profile Editor Modal */}
      {showProfileModal && (
        <div className="fixed inset-0 bg-slate-950/45 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-sm w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl border border-indigo-150">
                <User className="w-5 h-5 text-indigo-600" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-800">Profilo Contribuente</h4>
                <p className="text-xs text-slate-500">Imposta la tua anagrafica fiscale</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-slate-600 text-xs mb-1.5 font-bold">Nome e Cognome</label>
                <input 
                  type="text" 
                  value={profileNameInput}
                  onChange={(e) => setProfileNameInput(e.target.value)}
                  className="w-full text-xs bg-white border border-slate-200 text-slate-800 rounded px-3 py-2 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  placeholder="es. Domenico Pellegrino"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-600 text-xs mb-1.5 font-bold font-sans">Codice Fiscale (16 car.)</label>
                <input 
                  type="text" 
                  value={profileCfInput}
                  onChange={(e) => setProfileCfInput(e.target.value.toUpperCase())}
                  className="w-full text-xs bg-white border border-slate-200 text-slate-800 font-mono rounded px-3 py-2 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 uppercase"
                  placeholder="es. PLLDNC60B14A494R"
                  maxLength={16}
                  required
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button 
                onClick={() => {
                  setProfileNameInput(taxpayerName);
                  setProfileCfInput(taxpayerCf);
                  setShowProfileModal(false);
                }}
                className="px-3.5 py-2 border border-slate-200 hover:bg-slate-50 text-slate-500 text-xs font-bold rounded cursor-pointer transition"
              >
                Annulla
              </button>
              <button 
                onClick={() => {
                  const newName = profileNameInput.trim() || 'Domenico Pellegrino';
                  const newCf = profileCfInput.trim().toUpperCase() || 'PLLDNC60B14A494R';
                  setTaxpayerName(newName);
                  setTaxpayerCf(newCf);
                  setShowProfileModal(false);
                  
                  // Sync setting edits to SQLite database
                  fetch('/api/settings', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ taxpayerName: newName, taxpayerCf: newCf })
                  }).catch(e => console.error("Error writing settings edit to SQLite:", e));
                }}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded cursor-pointer shadow-xs transition"
              >
                Salva Profilo
              </button>
            </div>
          </div>
        </div>
      )}

      {customConfirm && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in" id="custom-confirm-modal">
          <div className="bg-white border border-slate-100 rounded-2xl p-6 max-w-md w-full shadow-2xl relative animate-scale-in">
            <div className="flex items-start gap-4">
              <div className={`p-3 rounded-xl shrink-0 ${
                customConfirm.variant === 'info' ? 'bg-indigo-50 text-indigo-600' :
                customConfirm.variant === 'warning' ? 'bg-amber-50 text-amber-600' : 'bg-rose-50 text-rose-600'
              }`}>
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div className="space-y-1.5 flex-1">
                <h4 className="text-sm font-extrabold text-slate-900 font-sans">{customConfirm.title}</h4>
                <p className="text-xs text-slate-500 leading-relaxed font-sans">{customConfirm.message}</p>
              </div>
            </div>

            <div className="flex justify-end gap-2.5 mt-6 pt-3 border-t border-slate-50">
              <button 
                onClick={() => {
                  if ((customConfirm as any).onCancel) {
                    (customConfirm as any).onCancel();
                  }
                  setCustomConfirm(null);
                }}
                className="px-4 py-2 border border-slate-200 text-slate-600 text-xs font-bold rounded-xl cursor-pointer hover:bg-slate-50 transition"
                id="btn-confirm-cancel"
              >
                {customConfirm.cancelText || 'Annulla'}
              </button>
              <button 
                onClick={() => {
                  customConfirm.onConfirm();
                  setCustomConfirm(null);
                }}
                className={`px-4.5 py-2 text-white text-xs font-bold rounded-xl cursor-pointer shadow-md transition ${
                  customConfirm.variant === 'info' ? 'bg-indigo-600 hover:bg-indigo-700' :
                  customConfirm.variant === 'warning' ? 'bg-amber-500 hover:bg-amber-600' : 'bg-rose-600 hover:bg-rose-700'
                }`}
                id="btn-confirm-execute"
              >
                {customConfirm.confirmText || 'Procedi'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
