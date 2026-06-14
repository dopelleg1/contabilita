/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Account, Transaction, Investment } from '../types';
import { calculateForfettario } from '../utils/financeHelpers';
import { 
  TrendingUp, 
  TrendingDown, 
  Briefcase, 
  User, 
  Users,
  Percent, 
  Scale, 
  PiggyBank, 
  AlertCircle,
  ShieldCheck,
  Building,
  Calendar,
  Car,
  Mountain,
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  ArrowRightLeft,
  Info
} from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from 'recharts';

interface DashboardTabProps {
  accounts: Account[];
  transactions: Transaction[];
  taxpayerName?: string;
  taxpayerCf?: string;
  salaryDayOfMonth: number;
  cycleDurationDays: number;
  investments: Investment[];
  onUpdateSettings: (updates: { taxpayerName?: string; taxpayerCf?: string; salaryDayOfMonth?: number; cycleDurationDays?: number; investments?: Investment[] }) => void;
}

// Function to compute the current period start and end dates based on reference date
function getCurrentPeriodRange(salaryDay: number, cycleDurationDays: number, referenceDate: Date = new Date()) {
  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth(); // 0-indexed
  const day = referenceDate.getDate();

  let startYear = year;
  let startMonth = month;

  if (day < salaryDay) {
    // Started in previous month
    const prevMonthDate = new Date(year, month - 1, 1);
    startYear = prevMonthDate.getFullYear();
    startMonth = prevMonthDate.getMonth();
  }

  // Handle month boundary for start day
  const getSafeDay = (y: number, m: number, targetDay: number) => {
    const lastDayInMonth = new Date(y, m + 1, 0).getDate();
    return Math.min(targetDay, lastDayInMonth);
  };

  const startDayVal = getSafeDay(startYear, startMonth, salaryDay);
  const startDate = new Date(startYear, startMonth, startDayVal);

  // End date is simply startDate + (cycleDurationDays - 1) days
  const endDate = new Date(startDate);
  endDate.setDate(startDate.getDate() + (cycleDurationDays - 1));

  // Convert both to YYYY-MM-DD
  const formatDate = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dayVal = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dayVal}`;
  };

  return { 
    startDateStr: formatDate(startDate), 
    endDateStr: formatDate(endDate) 
  };
}

// Italian date representation helper
const formatMonthNameInItalian = (dateStr: string) => {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length < 3) return dateStr;
  const year = parts[0];
  const monthIdx = parseInt(parts[1]) - 1;
  const day = parseInt(parts[2]);
  const months = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
  return `${day} ${months[monthIdx]} ${year}`;
};

export default function DashboardTab({ 
  accounts, 
  transactions,
  taxpayerName = 'Domenico Pellegrino',
  taxpayerCf = 'PLLDNC60B14A494R',
  salaryDayOfMonth = 23,
  cycleDurationDays = 30,
  investments = [],
  onUpdateSettings
}: DashboardTabProps) {
  const [viewScope, setViewScope] = useState<'all' | 'personal' | 'professional'>('all');
  
  // Custom coefficients for regime forfettario simulation
  const [coefficient, setCoefficient] = useState<number>(0.78);
  const [taxRate, setTaxRate] = useState<number>(0.15); // 15% standard for flat-rate, 5% for startup

  // Local states for investment edit/add interaction
  const [editingInvId, setEditingInvId] = useState<string | null>(null);
  const [editBuyVal, setEditBuyVal] = useState<number>(0);
  const [editCurrentVal, setEditCurrentVal] = useState<number>(0);
  
  // Adding investments form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [addName, setAddName] = useState('');
  const [addDesc, setAddDesc] = useState('');
  const [addType, setAddType] = useState<'investment' | 'asset'>('investment');
  const [addBuyVal, setAddBuyVal] = useState<number>(0);
  const [addCurrentVal, setAddCurrentVal] = useState<number>(0);
  const [householdMembers, setHouseholdMembers] = useState<number>(1);
  const [showIseeDetails, setShowIseeDetails] = useState(false);

  // Helper formats
  const formatEuro = (val: number) => {
    return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(val);
  };

  // Filter out any accounts belonging to his son Alberto or of properties owned by Alberto
  const domenicoAccounts = accounts.filter(a => {
    const nameLower = a.name.toLowerCase();
    if (nameLower.includes('unicredit') || nameLower.includes('alberto') || nameLower.includes('strada') || nameLower.includes('monti')) {
      return false;
    }
    return true;
  });

  // Basic Totals from bank accounts & cash for Domenico:
  // True checking/cash accounts (excluding "Fiat Tipo", "Mutuo Lavoro" which represent financing/loans and are negative)
  const totalAssets = domenicoAccounts
    .filter(a => 
      a.type !== 'financing' && 
      a.type !== 'credit_card' && 
      !a.name.toLowerCase().includes('tipo') && 
      !a.name.toLowerCase().includes('fiat') && 
      !a.name.toLowerCase().includes('lavoro') && 
      !a.name.toLowerCase().includes('mutuo')
    )
    .reduce((sum, a) => sum + a.balance, 0);

  // Domenico's true debts/financings: credit cards, financing, or misclassified accounts representing financing
  const totalDebts = Math.abs(
    domenicoAccounts
      .filter(a => 
        a.type === 'credit_card' || 
        a.type === 'financing' || 
        a.name.toLowerCase().includes('tipo') || 
        a.name.toLowerCase().includes('fiat') || 
        a.name.toLowerCase().includes('lavoro') || 
        a.name.toLowerCase().includes('mutuo')
      )
      .reduce((sum, a) => sum + a.balance, 0)
  );

  // Exclude investments owned by Alberto (Strada Monti / Strada ai Monti)
  const domenicoInvestments = (investments || []).filter(inv => 
    !inv.name.toLowerCase().includes('strada') && 
    !inv.name.toLowerCase().includes('monti') && 
    !inv.name.toLowerCase().includes('alberto')
  );

  // Adjusted Net Worth summing in personal investments / assets currentValue for Domenico
  const totalInvestmentsValue = domenicoInvestments.reduce((sum, inv) => sum + inv.currentValue, 0);
  const adjustedNetWorth = totalAssets + totalInvestmentsValue - totalDebts;

  // Personal Totals
  const personalIncomes = transactions
    .filter(t => t.scope === 'personal' && t.type === 'income')
    .reduce((sum, t) => sum + t.amount, 0);

  let personalNecessary = 0;
  let personalUseful = 0;
  let personalLeisure = 0;

  transactions
    .filter(t => t.scope === 'personal')
    .forEach(t => {
      if (t.type !== 'expense' && t.type !== 'transfer') return;
      const amt = Math.abs(t.amount);
      const desc = (t.description || '').toLowerCase();
      const sub = (t.subcategory || '').toLowerCase();
      const cat = (t.category || '').toLowerCase();

      // Giroconti
      const isGiroconto = t.type === 'transfer' || cat === 'trasferimento' || sub === 'giroconto' || desc.includes('giroconto') || desc.includes('transfer');
      
      // Bollette, luce, gas, affitto, condominio, utenze
      const isBolletteHousing = desc.includes('enel') || 
        desc.includes('eni ') || 
        desc.includes('eni_') || 
        desc.includes('bolletta') || 
        desc.includes('luce') || 
        desc.includes('gas') || 
        desc.includes('affitto') || 
        desc.includes('condominio') || 
        desc.includes('fastweb') || 
        desc.includes('telecom') || 
        desc.includes('windtre') ||
        sub.includes('utenze') ||
        sub.includes('affitto') ||
        sub.includes('condominio') ||
        cat === 'necessarie';

      if (isGiroconto || isBolletteHousing) {
        personalNecessary += amt;
        return;
      }

      // Spese utili
      const isUseful = desc.includes('supermercato') ||
        desc.includes('conad') ||
        desc.includes('coop') ||
        desc.includes('esselunga') ||
        desc.includes('lidl') ||
        desc.includes('alimentari') ||
        desc.includes('spesa') ||
        desc.includes('farmacia') ||
        desc.includes('medicina') ||
        desc.includes('medico') ||
        desc.includes('dottore') ||
        desc.includes('clinica') ||
        desc.includes('assicurazione') ||
        desc.includes('carburante') ||
        desc.includes('benzina') ||
        desc.includes('gasolio') ||
        desc.includes('manutenzione') ||
        desc.includes('officina') ||
        desc.includes('auto') ||
        cat === 'utili' ||
        sub.includes('alimentari') ||
        sub.includes('salute') ||
        sub.includes('farmacia') ||
        sub.includes('carburante') ||
        sub.includes('auto') ||
        sub.includes('assicurazione');

      if (isUseful) {
        personalUseful += amt;
      } else {
        personalLeisure += amt;
      }
    });

  const personalExpenses = personalNecessary + personalUseful + personalLeisure;
  const totalPersonalOut = personalNecessary + personalUseful + personalLeisure;

  // Professional Totals Page
  const pIvaSummary = calculateForfettario(transactions, coefficient, taxRate);

  // --- Dynamic stipend period calculations ---
  const { startDateStr, endDateStr } = getCurrentPeriodRange(salaryDayOfMonth, cycleDurationDays);

  // Filter transactions belonging to current customized monthly period
  const periodTransactions = transactions.filter(t => {
    // Exclude internal transfers to get pure flows
    const isInternal = t.category === 'trasferimento' || t.subcategory === 'Prelievo' || t.subcategory === 'Giroconto';
    if (isInternal) return false;
    return t.date >= startDateStr && t.date <= endDateStr;
  });

  const scopePeriodTransactions = periodTransactions.filter(t => {
    if (viewScope === 'all') return true;
    return t.scope === viewScope;
  });

  const periodIncomes = scopePeriodTransactions
    .filter(t => t.type === 'income')
    .reduce((sum, t) => sum + t.amount, 0);

  let periodNecessaryExpenses = 0;
  let periodOtherExpenses = 0;

  scopePeriodTransactions.forEach(t => {
    if (t.type !== 'expense' && t.type !== 'transfer') return;
    const amt = Math.abs(t.amount);

    if (t.scope === 'professional') {
      if (t.category === 'necessarie_lavoro') {
        periodNecessaryExpenses += amt;
      } else {
        periodOtherExpenses += amt;
      }
      return;
    }

    const desc = (t.description || '').toLowerCase();
    const sub = (t.subcategory || '').toLowerCase();
    const cat = (t.category || '').toLowerCase();

    const isGiroconto = t.type === 'transfer' || cat === 'trasferimento' || sub === 'giroconto' || desc.includes('giroconto') || desc.includes('transfer');
    
    const isBolletteHousing = desc.includes('enel') || 
      desc.includes('eni ') || 
      desc.includes('eni_') || 
      desc.includes('bolletta') || 
      desc.includes('luce') || 
      desc.includes('gas') || 
      desc.includes('affitto') || 
      desc.includes('condominio') || 
      desc.includes('fastweb') || 
      desc.includes('telecom') || 
      desc.includes('windtre') ||
      sub.includes('utenze') ||
      sub.includes('affitto') ||
      sub.includes('condominio') ||
      cat === 'necessarie';

    if (isGiroconto || isBolletteHousing) {
      periodNecessaryExpenses += amt;
    } else {
      periodOtherExpenses += amt;
    }
  });

  const periodTotalExpenses = periodNecessaryExpenses + periodOtherExpenses;
  const periodSavings = periodIncomes - periodTotalExpenses;

  // --- Historical annual / monthly averages computations ---
  const historicalScopeTransactions = transactions.filter(t => {
    const isInternal = t.category === 'trasferimento' || t.subcategory === 'Prelievo' || t.subcategory === 'Giroconto';
    if (isInternal) return false;
    if (viewScope === 'all') return true;
    return t.scope === viewScope;
  });

  const distinctMonths = Array.from(new Set(historicalScopeTransactions.map(t => t.date.slice(0, 7))));
  const numHistoricalMonths = distinctMonths.length || 1;

  const totalHistoryIncomes = historicalScopeTransactions
    .filter(t => t.type === 'income')
    .reduce((sum, t) => sum + t.amount, 0);

  let totalHistoryNecessary = 0;
  let totalHistoryOther = 0;

  historicalScopeTransactions.forEach(t => {
    if (t.type !== 'expense' && t.type !== 'transfer') return;
    const amt = Math.abs(t.amount);

    if (t.scope === 'professional') {
      if (t.category === 'necessarie_lavoro') {
        totalHistoryNecessary += amt;
      } else {
        totalHistoryOther += amt;
      }
      return;
    }

    const desc = (t.description || '').toLowerCase();
    const sub = (t.subcategory || '').toLowerCase();
    const cat = (t.category || '').toLowerCase();

    const isGiroconto = t.type === 'transfer' || cat === 'trasferimento' || sub === 'giroconto' || desc.includes('giroconto') || desc.includes('transfer');
    
    const isBolletteHousing = desc.includes('enel') || 
      desc.includes('eni ') || 
      desc.includes('eni_') || 
      desc.includes('bolletta') || 
      desc.includes('luce') || 
      desc.includes('gas') || 
      desc.includes('affitto') || 
      desc.includes('condominio') || 
      desc.includes('fastweb') || 
      desc.includes('telecom') || 
      desc.includes('windtre') ||
      sub.includes('utenze') ||
      sub.includes('affitto') ||
      sub.includes('condominio') ||
      cat === 'necessarie';

    if (isGiroconto || isBolletteHousing) {
      totalHistoryNecessary += amt;
    } else {
      totalHistoryOther += amt;
    }
  });

  const avgMonthlyIncomes = totalHistoryIncomes / numHistoricalMonths;
  const avgMonthlyNecessary = totalHistoryNecessary / numHistoricalMonths;
  const avgMonthlyOther = totalHistoryOther / numHistoricalMonths;

  // --- 1. Media mensile dell'anno in corso sui mesi trascorsi ---
  const now = new Date();
  const currentYearValue = now.getFullYear();
  const currentMonthIndex = now.getMonth(); // 0 is January, 4 is May...
  
  const currentYearTransactions = historicalScopeTransactions.filter(t => t.date.startsWith(String(currentYearValue)));
  const distinctMonthsCurrentYear = Array.from(new Set(currentYearTransactions.map(t => t.date.slice(0, 7))));
  const elapsedMonthsCurrentYear = Math.max(1, currentMonthIndex + 1);

  const sumIncomesCurrentYear = currentYearTransactions
    .filter(t => t.type === 'income')
    .reduce((sum, t) => sum + t.amount, 0);

  const avgMonthlyIncomesCurrentYear = sumIncomesCurrentYear / elapsedMonthsCurrentYear;

  // --- 2. Media mensile dell'ultimo anno di visibilità ---
  const transactionYears = Array.from(new Set(historicalScopeTransactions.map(t => t.date.slice(0, 4))))
    .map(Number)
    .filter(y => !isNaN(y))
    .sort((a, b) => a - b);
    
  const latestYearValue = transactionYears.length > 0 ? transactionYears[transactionYears.length - 1] : currentYearValue;

  const latestYearTransactions = historicalScopeTransactions.filter(t => t.date.startsWith(String(latestYearValue)));
  const distinctMonthsLatestYear = Array.from(new Set(latestYearTransactions.map(t => t.date.slice(0, 7))));
  
  let elapsedMonthsLatestYear = 12;
  if (latestYearValue === currentYearValue) {
    elapsedMonthsLatestYear = elapsedMonthsCurrentYear;
  } else {
    elapsedMonthsLatestYear = Math.max(1, distinctMonthsLatestYear.length);
  }

  const sumIncomesLatestYear = latestYearTransactions
    .filter(t => t.type === 'income')
    .reduce((sum, t) => sum + t.amount, 0);

  const avgMonthlyIncomesLatestYear = sumIncomesLatestYear / elapsedMonthsLatestYear;

  // --- 3. Stima ISEE dell'anno in corso ---
  // Exclude checking/saving accounts belonging to Alberto Pellegrino (Unicredit) and Strada Monti
  // Also exclude misclassified accounts which are actually assets or financings (Fiat Tipo, Mutuo Lavoro, Strada Monti)
  const iseeAccounts = accounts.filter(a => {
    const nameLower = a.name.toLowerCase();
    if (nameLower.includes('unicredit') || nameLower.includes('alberto') || nameLower.includes('strada') || nameLower.includes('monti')) {
      return false;
    }
    // Also ignore Fiat Tipo or Mutuo Lavoro from being counted as liquid accounts (they are counted as assets or debts)
    if (nameLower.includes('tipo') || nameLower.includes('fiat') || nameLower.includes('lavoro') || nameLower.includes('mutuo')) {
      return false;
    }
    return true;
  });

  const iseeTotalAssets = iseeAccounts
    .filter(a => a.type !== 'financing' && a.type !== 'credit_card')
    .reduce((sum, a) => sum + a.balance, 0);

  // For ISEE debts, we include Domenico's financings and debts (such as Compass, Mutuo Lavoro, Fiat Tipo remaining debt, etc.)
  // but exclude those belonging to Alberto.
  const iseeDebts = accounts.filter(a => {
    const nameLower = a.name.toLowerCase();
    if (nameLower.includes('unicredit') || nameLower.includes('alberto') || nameLower.includes('strada') || nameLower.includes('monti')) {
      return false;
    }
    return a.type === 'credit_card' || a.type === 'financing' || nameLower.includes('tipo') || nameLower.includes('fiat') || nameLower.includes('lavoro') || nameLower.includes('mutuo');
  });

  const iseeTotalDebts = Math.abs(
    iseeDebts.reduce((sum, a) => sum + a.balance, 0)
  );

  // Exclude investments owned by Alberto Pellegrino (Strada ai Monti or matching Strada)
  const iseeTotalInvestmentsValue = (investments || [])
    .filter(inv => !inv.name.toLowerCase().includes('strada') && !inv.name.toLowerCase().includes('monti') && !inv.name.toLowerCase().includes('alberto'))
    .reduce((sum, inv) => sum + inv.currentValue, 0);

  // Exclude Unicredit-based personal income transactions from the ISEE income estimation
  const unicreditAccountIds = accounts
    .filter(a => a.name.toLowerCase().includes('unicredit') || a.name.toLowerCase().includes('alberto'))
    .map(a => a.id);

  // Split personal incomes into Teaching contract (ends on June 30th) and Other personal incomes
  const iseeTeachingTransactions = transactions.filter(t => {
    // 1. Must be personal scope and type income
    if (t.scope !== "personal" || t.type !== "income") return false;
    // 2. Erase any internal transfers (giroconti) to avoid double counting
    if (t.category === "trasferimento") return false;
    // 3. Exclude cash pocket account inflows (which represent cash replenished and are not salary)
    if (t.accountId === "acc-3") return false;
    // 4. Exclude Alberto's Unicredit account and child-centric investments/payments
    if (unicreditAccountIds.includes(t.accountId)) return false;

    const descLower = t.description.toLowerCase();
    return descLower.includes("ministero") || descLower.includes("istruzione");
  });

  const iseeOtherTransactions = transactions.filter(t => {
    // 1. Must be personal scope and type income
    if (t.scope !== "personal" || t.type !== "income") return false;
    // 2. Erase any internal transfers (giroconti) to avoid double counting
    if (t.category === "trasferimento") return false;
    // 3. Exclude cash pocket account inflows (which represent cash replenished and are not salary)
    if (t.accountId === "acc-3") return false;
    // 4. Exclude Alberto's Unicredit account and child-centric investments/payments
    if (unicreditAccountIds.includes(t.accountId)) return false;

    const descLower = t.description.toLowerCase();
    // Exclude teaching
    if (descLower.includes("ministero") || descLower.includes("istruzione")) return false;
    // Exclude Alberto
    if (
      descLower.includes("alberto") || 
      descLower.includes("strada") || 
      descLower.includes("unicredit") || 
      descLower.includes("monti")
    ) {
      return false;
    }
    return true;
  });

  const teachingReceived = iseeTeachingTransactions.reduce((sum, t) => sum + t.amount, 0);
  const otherReceived = iseeOtherTransactions.reduce((sum, t) => sum + t.amount, 0);

  // Projected teaching contract income: ends on June 30th, meaning exactly 6 months of pay in the year (Jan-Jun)
  const avgMonthlyTeaching = elapsedMonthsCurrentYear > 0 ? (teachingReceived / elapsedMonthsCurrentYear) : 0;
  const standardTeachingContractMonths = 6; // Jan to Jun inclusive
  const projectedTeachingIncome = elapsedMonthsCurrentYear <= standardTeachingContractMonths
    ? teachingReceived + (avgMonthlyTeaching * (standardTeachingContractMonths - elapsedMonthsCurrentYear))
    : teachingReceived;

  // Other personal incomes can be annualized fully over 12 months as standard
  const isrIncomesMultiplier = elapsedMonthsCurrentYear > 0 ? (12 / elapsedMonthsCurrentYear) : 12;
  const projectedOtherPersonalIncomes = otherReceived * isrIncomesMultiplier;

  const iseePersonalIncomes = teachingReceived + otherReceived;
  const iseeAnnualizedPersonalIncomes = projectedTeachingIncome + projectedOtherPersonalIncomes;

  // ISR (Income): Net business profit + personal incomes (annualized realistically based on elapsed months)
  const isrIncomes = (pIvaSummary.netEstimatedProfit * isrIncomesMultiplier) + iseeAnnualizedPersonalIncomes;
  const isrDeduction = Math.min(3000, iseeAnnualizedPersonalIncomes * 0.20); // 20% franchise on salary income up to €3000 under Italian ISEE rules
  const finalISR = Math.max(0, isrIncomes - isrDeduction);

  // ISP (Patrimony): Accounts + investments - debts (using excluded totals)
  const iseePatrimonyBalance = Math.max(0, iseeTotalAssets + iseeTotalInvestmentsValue - iseeTotalDebts);
  const ispFranchise = Math.min(10000, 6000 + 2000 * (householdMembers - 1));
  const finalISP = Math.max(0, iseePatrimonyBalance - ispFranchise);

  // ISE = ISR + 20% * ISP
  const estimatedISE = finalISR + (finalISP * 0.20);

  // PSE Equivalence scale
  const getEquivalenceScale = (n: number) => {
    if (n === 1) return 1.00;
    if (n === 2) return 1.57;
    if (n === 3) return 2.04;
    if (n === 4) return 2.46;
    if (n === 5) return 2.85;
    return 2.85 + (n - 5) * 0.35;
  };
  const psScale = getEquivalenceScale(householdMembers);
  const estimatedISEE = estimatedISE / psScale;

  // Chart data: Monthly transactions aggregation (Simple simulation of trailing dates)
  const getChartData = () => {
    const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date));
    const dailyBal: Record<string, { date: string; entrate: number; uscite: number }> = {};
    
    sorted.forEach(t => {
      const dateKey = t.date;
      if (!dailyBal[dateKey]) {
        dailyBal[dateKey] = { date: dateKey, entrate: 0, uscite: 0 };
      }
      
      if (viewScope === 'all' || t.scope === viewScope) {
        if (t.amount > 0 && t.category !== 'trasferimento') {
          dailyBal[dateKey].entrate += t.amount;
        } else if (t.amount < 0 && t.category !== 'trasferimento') {
          dailyBal[dateKey].uscite += Math.abs(t.amount);
        }
      }
    });

    const list = Object.values(dailyBal).sort((a, b) => a.date.localeCompare(b.date));
    return list.slice(-10); // Show last 10 dates with activity
  };

  const chartData = getChartData();

  // Investment Operations callbacks
  const startEditInv = (inv: Investment) => {
    setEditingInvId(inv.id);
    setEditBuyVal(inv.buyValue);
    setEditCurrentVal(inv.currentValue);
  };

  const saveEditInv = (id: string) => {
    const updated = (investments || []).map(inv => {
      if (inv.id === id) {
        return {
          ...inv,
          buyValue: editBuyVal,
          currentValue: editCurrentVal,
          lastUpdated: new Date().toISOString().split('T')[0]
        };
      }
      return inv;
    });
    onUpdateSettings({ investments: updated });
    setEditingInvId(null);
  };

  const deleteInvItem = (id: string) => {
    const updated = (investments || []).filter(inv => inv.id !== id);
    onUpdateSettings({ investments: updated });
  };

  const triggerAddInv = () => {
    if (!addName.trim()) return;
    const newItem: Investment = {
      id: 'inv-' + Date.now(),
      name: addName.trim(),
      description: addDesc.trim(),
      type: addType,
      buyValue: Number(addBuyVal) || 0,
      currentValue: Number(addCurrentVal) || 0,
      lastUpdated: new Date().toISOString().split('T')[0]
    };
    const updated = [...(investments || []), newItem];
    onUpdateSettings({ investments: updated });
    
    // Clear state
    setAddName('');
    setAddDesc('');
    setAddType('investment');
    setAddBuyVal(0);
    setAddCurrentVal(0);
    setShowAddForm(false);
  };

  // Helper calculations for comparisons
  const incomeDiffPercent = avgMonthlyIncomes > 0 
    ? Math.round(((periodIncomes - avgMonthlyIncomes) / avgMonthlyIncomes) * 105) 
    : 0;

  const incomeDiffCurrentYearPercent = avgMonthlyIncomesCurrentYear > 0 
    ? Math.round(((periodIncomes - avgMonthlyIncomesCurrentYear) / avgMonthlyIncomesCurrentYear) * 100) 
    : 0;

  const incomeDiffLatestYearPercent = avgMonthlyIncomesLatestYear > 0 
    ? Math.round(((periodIncomes - avgMonthlyIncomesLatestYear) / avgMonthlyIncomesLatestYear) * 100) 
    : 0;

  const necessaryDiffPercent = avgMonthlyNecessary > 0 
    ? Math.round(((periodNecessaryExpenses - avgMonthlyNecessary) / avgMonthlyNecessary) * 100) 
    : 0;

  const otherDiffPercent = avgMonthlyOther > 0 
    ? Math.round(((periodOtherExpenses - avgMonthlyOther) / avgMonthlyOther) * 100) 
    : 0;

  return (
    <div className="space-y-6" id="dashboard-tab">
      
      {/* Top Profile Banner & Scope Filter */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <div>
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span className="text-[10px] bg-indigo-50 text-indigo-700 font-bold px-2 py-0.5 rounded border border-indigo-100 shadow-xs uppercase tracking-wider">CONTRIBUENTE REGISTRATO</span>
            <span className="text-[10px] bg-slate-50 text-slate-600 font-mono font-bold px-2 py-0.5 rounded border border-slate-200 tracking-wider shadow-xs">{taxpayerCf}</span>
          </div>
          <h1 className="text-xl font-bold tracking-tight text-slate-800">Quadro Generale di {taxpayerName}</h1>
          <p className="text-xs text-slate-500 mt-1 font-sans">
            Analisi integrata del budget personale e ditta P.IVA con ripartizione e prospetto patrimoniale.
          </p>
        </div>
        <div className="flex flex-wrap bg-slate-100 p-1 rounded-lg border border-slate-200 self-start lg:self-auto">
          <button 
            id="scope-all"
            onClick={() => setViewScope('all')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center gap-1 ${
              viewScope === 'all' ? 'bg-white text-slate-850 shadow-sm' : 'text-slate-550 hover:text-slate-850'
            }`}
          >
            <Building className="w-3.5 h-3.5" />
            Entrambe
          </button>
          <button 
            id="scope-personal"
            onClick={() => setViewScope('personal')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center gap-1.5 ${
              viewScope === 'personal' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-550 hover:text-indigo-600'
            }`}
          >
            <User className="w-3.5 h-3.5" />
            Personale
          </button>
          <button 
            id="scope-professional"
            onClick={() => setViewScope('professional')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center gap-1.5 ${
              viewScope === 'professional' ? 'bg-amber-600 text-white shadow-sm' : 'text-slate-550 hover:text-amber-600'
            }`}
          >
            <Briefcase className="w-3.5 h-3.5" />
            Professionale P.IVA
          </button>
        </div>
      </div>

      {/* Main Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Total Assets Card */}
        <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm relative overflow-hidden flex flex-col justify-between min-h-[175px]">
          <div>
            <div className="absolute top-0 right-0 p-8 opacity-5 font-bold text-5xl">€</div>
            <span className="text-slate-400 text-xs font-semibold tracking-wider uppercase">Liquidità nei Conti</span>
            <h3 className="text-2xl font-bold text-slate-805 mt-2 font-mono">{formatEuro(totalAssets)}</h3>
            <p className="text-slate-400 text-[11px] mt-1 font-sans text-slate-500">
              Conti personali di Domenico (BBVA, BPM, Satispay, Cash). Esclude Unicredit (di Alberto Pellegrino).
            </p>
          </div>
          <div className="mt-4 pt-2.5 border-t border-slate-100 flex flex-col">
            <span className="text-[11px] text-slate-500 font-medium font-sans">Stima totale patrimonio (solo liquidità):</span>
            <span className="text-xs font-bold text-slate-750 font-mono">({formatEuro(totalAssets)})</span>
          </div>
        </div>

        {/* Total Indebtedness Card */}
        <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 p-8 opacity-5 font-bold text-5xl text-rose-500">%</div>
          <span className="text-slate-400 text-xs font-semibold tracking-wider uppercase">Debiti & Finanziamenti</span>
          <h3 className="text-2xl font-bold text-rose-600 mt-2 font-mono">-{formatEuro(totalDebts)}</h3>
          <p className="text-slate-500 text-xs mt-1">
            Finanziamenti attivi a tuo carico (Mutuo Lavoro, Fiat Tipo, Compass, AMEX). Esclude Unicredit.
          </p>
        </div>

        {/* Net Worth Card */}
        <div className="bg-white border border-indigo-200 p-6 rounded-2xl shadow-sm relative overflow-hidden ring-4 ring-indigo-550/5 ring-offset-0">
          <div className="absolute top-0 right-0 p-8 opacity-5 font-bold text-5xl text-blue-500">±</div>
          <span className="text-slate-400 text-xs font-semibold tracking-wider uppercase">Patrimonio Netto stimato</span>
          <h3 className={`text-2xl font-bold mt-2 font-mono ${adjustedNetWorth >= 0 ? 'text-indigo-600' : 'text-rose-650'}`}>
            {formatEuro(adjustedNetWorth)}
          </h3>
          <p className="text-slate-500 text-xs mt-1">
            Conti personali Domenico + €{totalInvestmentsValue.toLocaleString('it-IT')} in beni (Fiat Tipo) - Debiti. Esclusa casa Strada ai Monti di Alberto.
          </p>
        </div>
      </div>

      {/* MAIN CENTERPIECE: ANDAMENTO MENSILE CON PARAMETRO GIORNO STIPENDIO */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6">
        
        {/* Header Block with custom stipend controls */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div className="space-y-1">
            <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-indigo-600" />
              Andamento del Periodo Mensile Personalizzato
            </h2>
            <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
              <span>Periodo Corrente:</span>
              <span className="bg-slate-100 text-slate-800 px-2 py-0.5 rounded font-bold font-mono">
                {formatMonthNameInItalian(startDateStr)}
              </span>
              <span>al</span>
              <span className="bg-slate-100 text-slate-800 px-2 py-0.5 rounded font-bold font-mono">
                {formatMonthNameInItalian(endDateStr)}
              </span>
            </div>
          </div>
          
          {/* Stipend selector controls with customizable start day and cycle duration */}
          <div className="flex flex-col xl:flex-row gap-3 w-full md:w-auto">
            {/* Inizio Ciclo */}
            <div className="bg-slate-50 border border-slate-150 p-2 rounded-xl flex items-center justify-between xl:justify-start gap-3">
              <div className="flex flex-col min-w-[70px]">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Inizio Ciclo</span>
                <span className="text-xs font-semibold text-slate-700 font-sans">Giorno {salaryDayOfMonth}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <input 
                  type="number"
                  min="1"
                  max="31"
                  value={salaryDayOfMonth}
                  onChange={(e) => {
                    let val = parseInt(e.target.value);
                    if (isNaN(val)) val = 1;
                    const safeVal = Math.min(31, Math.max(1, val));
                    onUpdateSettings({ salaryDayOfMonth: safeVal });
                  }}
                  className="w-10 bg-white border border-slate-250 text-slate-800 font-mono font-bold text-center text-xs py-1 rounded"
                />
                <input 
                  type="range"
                  min="1"
                  max="31"
                  value={salaryDayOfMonth}
                  onChange={(e) => onUpdateSettings({ salaryDayOfMonth: Number(e.target.value) })}
                  className="w-20 sm:w-24 h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                />
              </div>
            </div>

            {/* Durata Ciclo */}
            <div className="bg-slate-50 border border-slate-150 p-2 rounded-xl flex items-center justify-between xl:justify-start gap-3">
              <div className="flex flex-col min-w-[70px]">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Durata Ciclo</span>
                <span className="text-xs font-semibold text-slate-700 font-sans">{cycleDurationDays} Giorni</span>
              </div>
              <div className="flex items-center gap-1.5">
                <input 
                  type="number"
                  min="1"
                  max="90"
                  value={cycleDurationDays}
                  onChange={(e) => {
                    let val = parseInt(e.target.value);
                    if (isNaN(val)) val = 30;
                    const safeVal = Math.min(90, Math.max(1, val));
                    onUpdateSettings({ cycleDurationDays: safeVal });
                  }}
                  className="w-10 bg-white border border-slate-250 text-slate-800 font-mono font-bold text-center text-xs py-1 rounded"
                />
                <input 
                  type="range"
                  min="1"
                  max="90"
                  value={cycleDurationDays}
                  onChange={(e) => onUpdateSettings({ cycleDurationDays: Number(e.target.value) })}
                  className="w-20 sm:w-24 h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Content grid showing actual vs averages in Italian context */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          
          {/* Entrate Attuali vs Media Card */}
          <div className="bg-slate-50/50 p-5 rounded-2xl border border-slate-100 flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-center mb-1">
                <span className="text-slate-550 text-xs font-semibold tracking-wide uppercase">Entrate Recenti</span>
                <span className="text-[10px] bg-slate-100 text-slate-600 font-mono font-bold px-1.5 py-0.2 rounded uppercase">
                  {viewScope === 'all' ? 'Entrambe' : viewScope === 'personal' ? 'Personale' : 'P.IVA'}
                </span>
              </div>
              <h3 className="text-2xl font-black text-slate-800 font-mono mt-1">{formatEuro(periodIncomes)}</h3>
              <p className="text-slate-400 text-[11px] font-medium mt-1">Intervallo: {formatMonthNameInItalian(startDateStr)} - {formatMonthNameInItalian(endDateStr)}</p>
            </div>
            
            <div className="mt-4 pt-3 border-t border-slate-100 space-y-2.5">
              {/* Media mensile anno in corso sui mesi trascorsi */}
              <div className="flex items-center justify-between text-xs">
                <div>
                  <span className="text-[9px] text-slate-454 block uppercase font-bold leading-tight font-sans">Media Mensile {currentYearValue}</span>
                  <span className="font-bold text-slate-700 font-mono">{formatEuro(avgMonthlyIncomesCurrentYear)}</span>
                  <span className="text-[8px] text-slate-400 block font-sans">({elapsedMonthsCurrentYear} mesi trascorsi)</span>
                </div>
                <div>
                  {incomeDiffCurrentYearPercent >= 0 ? (
                    <span className="text-[9px] bg-emerald-50 text-emerald-700 font-mono font-bold px-1.5 py-0.2 rounded border border-emerald-100">
                      +{incomeDiffCurrentYearPercent}% ▲
                    </span>
                  ) : (
                    <span className="text-[9px] bg-rose-50 text-rose-700 font-mono font-bold px-1.5 py-0.2 rounded border border-rose-100">
                      {incomeDiffCurrentYearPercent}% ▼
                    </span>
                  )}
                </div>
              </div>

              {/* Media mensile ultimo anno di visibilità */}
              <div className="flex items-center justify-between text-xs pt-2 border-t border-dashed border-slate-200">
                <div>
                  <span className="text-[9px] text-slate-454 block uppercase font-bold leading-tight font-sans">Media Mensile {latestYearValue}</span>
                  <span className="font-bold text-slate-700 font-mono">{formatEuro(avgMonthlyIncomesLatestYear)}</span>
                  <span className="text-[8px] text-slate-400 block font-sans">(Ultimo anno disp.)</span>
                </div>
                <div>
                  {incomeDiffLatestYearPercent >= 0 ? (
                    <span className="text-[9px] bg-emerald-50 text-emerald-700 font-mono font-bold px-1.5 py-0.2 rounded border border-emerald-100">
                      +{incomeDiffLatestYearPercent}% ▲
                    </span>
                  ) : (
                    <span className="text-[9px] bg-rose-50 text-rose-700 font-mono font-bold px-1.5 py-0.2 rounded border border-rose-100">
                      {incomeDiffLatestYearPercent}% ▼
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Spese Necessarie */}
          <div className="bg-slate-50/50 p-5 rounded-2xl border border-slate-100">
            <span className="text-slate-550 text-xs font-semibold tracking-wide uppercase block mb-1">Uscite Necessarie</span>
            <h3 className="text-2xl font-black text-rose-600 font-mono mt-1">{formatEuro(periodNecessaryExpenses)}</h3>
            <p className="text-slate-400 text-[10px] font-sans mt-1">Utenze, carrello spesa, mutuo o tasse ditta fisse.</p>
            
            <div className="mt-4 flex flex-col space-y-1">
              <div className="flex justify-between text-[11px] font-semibold text-slate-600">
                <span>Contenimento vs Media</span>
                <span className="font-mono">{formatEuro(avgMonthlyNecessary)}</span>
              </div>
              <div className="w-full bg-slate-150 h-2 rounded-full overflow-hidden">
                <div 
                  className={`h-full rounded-full transition-all duration-501 ${
                    periodNecessaryExpenses > avgMonthlyNecessary ? 'bg-rose-500' : 'bg-emerald-500'
                  }`}
                  style={{ width: `${Math.min(100, avgMonthlyNecessary > 0 ? (periodNecessaryExpenses / avgMonthlyNecessary) * 100 : 0)}%` }}
                />
              </div>
              <div className="flex justify-between items-center text-[10px] text-slate-400 mt-1">
                <span>Saturato</span>
                <span className={periodNecessaryExpenses > avgMonthlyNecessary ? 'text-rose-550 font-bold' : 'text-emerald-600 font-bold'}>
                  {necessaryDiffPercent >= 0 ? `+${necessaryDiffPercent}% sopra` : `${necessaryDiffPercent}% sotto`}
                </span>
              </div>
            </div>
          </div>

          {/* Spese Varie (Non Necessarie) */}
          <div className="bg-slate-50/50 p-5 rounded-2xl border border-slate-100">
            <span className="text-slate-550 text-xs font-semibold tracking-wide uppercase block mb-1">Altre Uscite (Non Nec.)</span>
            <h3 className="text-2xl font-black text-amber-600 font-mono mt-1">{formatEuro(periodOtherExpenses)}</h3>
            <p className="text-slate-400 text-[10px] font-sans mt-1">Svago, tempo libero, upgrade o sfizi personali.</p>
            
            <div className="mt-4 flex flex-col space-y-1">
              <div className="flex justify-between text-[11px] font-semibold text-slate-600">
                <span>Contenimento vs Media</span>
                <span className="font-mono">{formatEuro(avgMonthlyOther)}</span>
              </div>
              <div className="w-full bg-slate-150 h-2 rounded-full overflow-hidden">
                <div 
                  className={`h-full rounded-full transition-all duration-501 ${
                    periodOtherExpenses > avgMonthlyOther ? 'bg-amber-500' : 'bg-emerald-500'
                  }`}
                  style={{ width: `${Math.min(100, avgMonthlyOther > 0 ? (periodOtherExpenses / avgMonthlyOther) * 100 : 0)}%` }}
                />
              </div>
              <div className="flex justify-between items-center text-[10px] text-slate-400 mt-1">
                <span>Saturato</span>
                <span className={periodOtherExpenses > avgMonthlyOther ? 'text-amber-550 font-bold' : 'text-emerald-600 font-bold'}>
                  {otherDiffPercent >= 0 ? `+${otherDiffPercent}% sopra` : `${otherDiffPercent}% sotto`}
                </span>
              </div>
            </div>
          </div>

          {/* Margine Finale Risparmio */}
          <div className="bg-indigo-900 text-white p-5 rounded-2xl border border-indigo-950 flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-center">
                <span className="text-indigo-250 text-xs font-semibold tracking-wide uppercase">Risparmio Accumulato</span>
                <PiggyBank className="w-4 h-4 text-indigo-300" />
              </div>
              <h3 className="text-2xl font-black font-mono mt-2">
                {periodSavings >= 0 ? '+' : ''}{formatEuro(periodSavings)}
              </h3>
              <p className="text-indigo-200 text-[10px] mt-1 leading-relaxed">
                Differenza tra le entrate reali riscosse e gli esborsi eseguiti in questo mese stipendiale.
              </p>
            </div>
            
            <div className="mt-4 p-2 bg-indigo-950 text-[10px] text-indigo-150 font-mono rounded flex justify-between items-center">
              <span>Tasso Risparmio:</span>
              <span className="font-bold">
                {periodIncomes > 0 ? Math.round((periodSavings / periodIncomes) * 100) : 0}%
              </span>
            </div>
          </div>

        </div>

      </div>

      {/* TWO COLUMNS: TAX CALCULATOR INTERACTIVE vs ASSETS & INVESTIMENTI */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* LEFT COLUMN: TAX REGIME FORFETTARIO CALCULATOR (lg:col-span-6) */}
        <div className="lg:col-span-6 space-y-6">
          <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm relative">
            <div className="absolute top-4 right-4 bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider">
              Forfettario Docente/Libero Prof.
            </div>
            
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 mb-2">
              <Briefcase className="w-4 h-4 text-amber-650" />
              Proiezione Fiscale Partita IVA Forfettario
            </h3>
            <p className="text-xs text-slate-500 mb-6 font-sans">
              Calcola gli accantonamenti obbligatori in tempo reale sul fatturato registrato in base alle aliquote fiscali e previdenziali italiane.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100 mb-6">
              {/* Coefficient selector */}
              <div>
                <label className="block text-slate-650 text-xs font-semibold mb-1 flex justify-between">
                  <span>Coefficiente Redditività:</span>
                  <span className="text-amber-700 font-mono font-bold">{(coefficient * 100)}%</span>
                </label>
                <select 
                  className="w-full text-xs bg-white border border-slate-200 text-slate-850 rounded px-2.5 py-1.5 outline-none font-mono focus:border-indigo-500"
                  value={coefficient} 
                  onChange={(e) => setCoefficient(parseFloat(e.target.value))}
                >
                  <option value="0.78">78% (Professionisti, IT, Lezioni Docenti)</option>
                  <option value="0.67">67% (Dettaglio e commercio di beni)</option>
                  <option value="0.40">40% (Servizi ristorazione e ospitalità)</option>
                </select>
              </div>

              {/* Imposta sostitutiva rate selection */}
              <div>
                <label className="block text-slate-650 text-xs font-semibold mb-1 flex justify-between">
                  <span>Imposta Sostitutiva:</span>
                  <span className="text-amber-700 font-mono font-bold">{(taxRate * 100)}%</span>
                </label>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  <button 
                    onClick={() => setTaxRate(0.05)}
                    className={`px-2 py-1 text-[11px] rounded transition-all border font-mono ${
                      taxRate === 0.05 
                        ? 'bg-amber-50 border-amber-300 text-amber-700 font-bold' 
                        : 'bg-white border-slate-200 text-slate-500 hover:text-slate-850'
                    }`}
                  >
                    5% (Nuovo/Start)
                  </button>
                  <button 
                    onClick={() => setTaxRate(0.15)}
                    className={`px-2 py-1 text-[11px] rounded transition-all border font-mono ${
                      taxRate === 0.15 
                        ? 'bg-amber-50 border-amber-300 text-amber-700 font-bold' 
                        : 'bg-white border-slate-200 text-slate-500 hover:text-slate-850'
                    }`}
                  >
                    15% (Ordinario)
                  </button>
                </div>
              </div>
            </div>

            {/* Calculations outputs */}
            <div className="space-y-3.5 divide-y divide-slate-100">
              <div className="flex justify-between items-center pt-2">
                <span className="text-xs text-slate-500 font-medium">Fatturato Lordo Lavoro Riscosso (P.IVA)</span>
                <span className="text-sm font-bold text-slate-900 font-mono">{formatEuro(pIvaSummary.grossProfessionalRevenue)}</span>
              </div>
              
              <div className="flex justify-between items-center pt-3">
                <span className="text-xs text-slate-500 flex items-center gap-1">
                  Base Imponibile Netta <span className="text-[10px] text-slate-400">(Fatturato x {coefficient * 100}%)</span>
                </span>
                <span className="text-sm font-semibold text-slate-755 font-mono">{formatEuro(pIvaSummary.taxableIncome)}</span>
              </div>

              <div className="flex justify-between items-center pt-3 text-rose-600">
                <span className="text-xs flex items-center gap-1.5 font-medium">
                  <Scale className="w-3.5 h-3.5 text-rose-500" />
                  Imposta Sostitutiva Sostanziale ({taxRate * 100}%)
                </span>
                <span className="text-sm font-bold font-mono">-{formatEuro(pIvaSummary.estimatedTax)}</span>
              </div>

              <div className="flex justify-between items-center pt-3 text-orange-600">
                <span className="text-xs flex items-center gap-1.5 font-medium">
                  <Percent className="w-3.5 h-3.5 text-orange-500" />
                  INPS Gestione Separata (26.07%)
                </span>
                <span className="text-sm font-bold font-mono">-{formatEuro(pIvaSummary.estimatedInps)}</span>
              </div>

              <div className="flex justify-between items-center pt-3 bg-amber-50 p-3 rounded-xl border border-amber-100 mt-2">
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-amber-700 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-600" />
                    Utile Professionale Pulito
                  </span>
                  <span className="text-[10px] text-slate-500 mt-0.5">Fatturato lordo sottratti gli accantonamenti fiscali e previdenziali</span>
                </div>
                <span className="text-base font-extrabold text-amber-800 font-mono">{formatEuro(pIvaSummary.netEstimatedProfit)}</span>
              </div>
            </div>
            
            <div className="mt-4 flex gap-2 p-3 bg-amber-50/50 rounded-xl border border-amber-100 text-[10px] text-amber-850 whitespace-pre-line leading-relaxed">
              <AlertCircle className="w-4 h-4 flex-shrink-0 text-amber-600" />
              <span>Nel regime forfettario italiano, le spese lavorative reali registrate non riducono la base imponibile. La deduzione avviene automaticamente applicando il coefficiente di redditività precompilato.</span>
            </div>
          </div>

          {/* Stima ISEE Indicativa */}
          <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm relative" id="isee-stimator-card">
            <div className="absolute top-4 right-4 bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider font-sans">
              Simulatore ISEE {currentYearValue}
            </div>
            
            <h3 className="text-sm font-bold text-slate-805 flex items-center gap-2 mb-2 font-sans">
              <Users className="w-4 h-4 text-emerald-600" />
              Stima ISEE dell'Anno in Corso
            </h3>
            
            <p className="text-xs text-slate-500 mb-3 font-sans leading-relaxed">
              Calcolo simulato del valore ISEE indicativo del nucleo familiare, integrando i redditi netti complessivi di {taxpayerName} ditta + personali e saldi patrimoniali attivi dedotti dei debiti registrati.
            </p>

            <div className="bg-amber-50/70 border border-amber-200/70 p-3 rounded-xl mb-4 text-xs font-sans text-slate-700 leading-normal flex flex-col gap-1.5">
              <div className="font-semibold text-amber-900 flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 text-amber-700 flex-shrink-0" />
                <span>Asset del Figlio Esclusi (Fuori Nucleo)</span>
              </div>
              <p className="text-[11px] text-slate-600">
                In base alle tue indicazioni, i seguenti elementi di tuo figlio <strong>Alberto Pellegrino</strong> (fuori dal nucleo familiare) sono stati <strong>esclusi</strong> dal conteggio del tuo ISEE per evitare sovrastime:
              </p>
              <ul className="list-disc pl-4 text-[10px] text-slate-650 space-y-0.5 font-mono">
                <li>Conto Corrente Unicredit (Intestato ad Alberto)</li>
                <li>Immobile Strada ai Monti (Di proprietà di Alberto)</li>
              </ul>
              <p className="text-[10px] text-slate-500 italic mt-0.5">
                La simulazione include esclusivamente i tuoi conti personali correnti (BBVA, BPM, Cassa contanti), i tuoi finanziamenti/debiti e i tuoi beni personali.
              </p>
            </div>

            {/* Household members controller */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex flex-col">
                <span className="text-xs font-semibold text-slate-700 font-sans">Membri del Nucleo Familiare:</span>
                <span className="text-[10px] text-slate-400 font-sans">Scala equivalenza: {psScale.toFixed(2)} | Franchigia mobiliari: {formatEuro(ispFranchise)}</span>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setHouseholdMembers(prev => Math.max(1, prev - 1))}
                  className="w-8 h-8 rounded-full border border-slate-300 flex items-center justify-center font-bold text-slate-600 hover:bg-slate-200 transition-all font-mono"
                >
                  -
                </button>
                <span className="w-6 text-center text-sm font-black text-slate-800 font-mono">{householdMembers}</span>
                <button 
                  onClick={() => setHouseholdMembers(prev => Math.min(10, prev + 1))}
                  className="w-8 h-8 rounded-full border border-slate-300 flex items-center justify-center font-bold text-slate-600 hover:bg-slate-200 transition-all font-mono"
                >
                  +
                </button>
              </div>
            </div>

            <div className="space-y-3.5 divide-y divide-slate-100">
              {/* Components Breakdown */}
              <div className="flex flex-col pt-1.5 font-sans">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500 font-medium">
                    Reddito Familiare Netto Proiettato (ISR)
                  </span>
                  <span className="font-semibold text-slate-800 font-mono text-sm">{formatEuro(finalISR)}</span>
                </div>
                <p className="text-[10px] text-slate-450 leading-relaxed mt-0.5">
                  Ditta Individuale (Forfettario Netto) + Stipendi puri di Domenico proiettati su 12 mesi, con detrazioni.
                </p>
              </div>
              
              <div className="flex flex-col pt-2.5 font-sans">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500 font-medium font-sans">
                    Patrimonio Netto Dedotto (ISP)
                  </span>
                  <span className="font-semibold text-slate-800 font-mono text-sm">{formatEuro(finalISP)}</span>
                </div>
                <p className="text-[10px] text-slate-450 leading-relaxed mt-0.5">
                  Liquidi conti personali Domenico + Beni personali (Fiat Tipo) - Debiti, scontati della franchigia.
                </p>
              </div>

              <div className="flex justify-between items-center text-xs pt-2.5 font-sans">
                <span className="text-slate-500">
                  Parametro della Scala di Equivalenza (PSE)
                </span>
                <span className="font-bold text-slate-750 font-mono">{psScale.toFixed(2)}</span>
              </div>

              {/* COLLAPSIBLE CALCULATION BREAKDOWN BUTTON */}
              <div className="pt-2">
                <button 
                  onClick={() => setShowIseeDetails(!showIseeDetails)}
                  className="w-full py-2 bg-slate-50 border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-bold font-sans flex items-center justify-center gap-1.5 transition-all outline-none"
                >
                  <AlertCircle className="w-3.5 h-3.5 text-indigo-500" />
                  {showIseeDetails ? "Nascondi Formule e Dettaglio Calcolo" : "Mostra Formule e Dettaglio Calcolo (Come è calcolato?)"}
                </button>
              </div>

              {/* EXPANDABLE MATHEMATICAL EXPLANATION PANEL */}
              {showIseeDetails && (
                <div className="pt-3 font-sans space-y-4">
                  {/* ISR DETAILED BREAKDOWN CARD */}
                  <div className="bg-indigo-50/40 p-4 rounded-xl border border-indigo-100">
                    <span className="text-indigo-900 text-xs font-bold block mb-2.5 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-indigo-600"></span>
                      1. Calcolo del Reddito di Domenico (ISR)
                    </span>
                    <div className="space-y-2 text-[11px] text-slate-650">
                      <div className="flex justify-between items-center bg-slate-50/50 p-1.5 rounded border border-slate-200/60 mb-1">
                        <span className="font-bold text-indigo-955 text-[10.5px]">A. Contratto Insegnamento (Scade 30 Giugno, max 6 mesi):</span>
                      </div>
                      <div className="pl-3 space-y-1.5 mb-3.5">
                        <div className="flex justify-between items-center text-[10px]">
                          <span>Stipendio Insegnamento Ricevuto ({elapsedMonthsCurrentYear} mesi):</span>
                          <span className="font-mono font-semibold text-slate-800">{formatEuro(teachingReceived)}</span>
                        </div>
                        <div className="flex justify-between items-center text-[10px]">
                          <span>Media Mensile stimata:</span>
                          <span className="font-mono text-slate-600">{formatEuro(avgMonthlyTeaching)} / mese</span>
                        </div>
                        <div className="flex justify-between items-center text-[10px] text-indigo-700">
                          <span>Proiezione Giugno (1 mese):</span>
                          <span className="font-mono font-bold">+{formatEuro(projectedTeachingIncome - teachingReceived)}</span>
                        </div>
                        <div className="flex justify-between items-center text-[10.5px] border-t border-slate-200/50 pt-1 font-bold text-slate-800">
                          <span>Totale Insegnamento Annuo Stimato:</span>
                          <span className="font-mono text-indigo-950">{formatEuro(projectedTeachingIncome)}</span>
                        </div>
                      </div>

                      <div className="flex justify-between items-center bg-slate-50/50 p-1.5 rounded border border-slate-200/60 mb-1">
                        <span className="font-bold text-slate-750 text-[10.5px]">B. Altri Redditi Personali (Annualizzati a 12 mesi):</span>
                      </div>
                      <div className="pl-3 space-y-1.5 mb-3.5">
                        <div className="flex justify-between items-center text-[10px]">
                          <span>Ricevuto in {elapsedMonthsCurrentYear} mesi (Stipendio S.p.A. + Interessi):</span>
                          <span className="font-mono font-semibold text-slate-800">{formatEuro(otherReceived)}</span>
                        </div>
                        <div className="flex justify-between items-center text-[10px]">
                          <span>Moltiplicatore Proiezione (12/{elapsedMonthsCurrentYear}):</span>
                          <span className="font-mono text-slate-650">x {isrIncomesMultiplier.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between items-center text-[10.5px] border-t border-slate-200/50 pt-1 font-bold text-slate-800">
                          <span>Totale Altri Redditi Annui Proiettati:</span>
                          <span className="font-mono text-slate-900">{formatEuro(projectedOtherPersonalIncomes)}</span>
                        </div>
                      </div>

                      <div className="flex justify-between items-center border-t border-slate-200/60 pt-2.5 font-bold text-slate-900">
                        <span>A + B: Reddito Personale Annuo Proiettato:</span>
                        <span className="font-mono">{formatEuro(iseeAnnualizedPersonalIncomes)}</span>
                      </div>
                      
                      <div className="flex justify-between items-center">
                        <span>B. Utile Netto P.IVA Forfettario Annuo Proiettato:</span>
                        <span className="font-mono font-semibold text-slate-800">{formatEuro(pIvaSummary.netEstimatedProfit * isrIncomesMultiplier)}</span>
                      </div>
                      <p className="text-[9px] text-slate-450 leading-relaxed pl-3 -mt-1">
                        • Calcolato applicando il coefficiente del {coefficient * 100}% sul fatturato di ditta ({formatEuro(pIvaSummary.grossProfessionalRevenue)}) dedotte Tasse ed INPS proiettati.
                      </p>
                      
                      <div className="flex justify-between items-center border-t border-slate-200/50 pt-2 mt-1.5 text-slate-800 font-bold">
                        <span>Somma Redditi Complessivi (Base ISR):</span>
                        <span className="font-mono">{formatEuro(isrIncomes)}</span>
                      </div>
                      
                      <div className="flex justify-between items-center text-rose-650 font-medium">
                        <span>Abbattimento Reddito Lavoro Dipendente (20%):</span>
                        <span className="font-mono">-{formatEuro(isrDeduction)}</span>
                      </div>
                      <p className="text-[9px] text-[10px] text-slate-450 leading-relaxed pl-3 -mt-1">
                        • Franchigia ministeriale italiana sul lavoro dipendente (massimo {formatEuro(3000)}).
                      </p>
                      
                      <div className="flex justify-between items-center border-t border-indigo-200 pt-2 mt-1.5 text-indigo-900 font-extrabold text-[12px]">
                        <span>ISR Finale (Situazione Reddituale):</span>
                        <span className="font-mono">{formatEuro(finalISR)}</span>
                      </div>
                    </div>
                  </div>

                  {/* ISP DETAILED BREAKDOWN CARD */}
                  <div className="bg-emerald-50/30 p-4 rounded-xl border border-emerald-100">
                    <span className="text-emerald-950 text-xs font-bold block mb-2.5 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-600"></span>
                      2. Calcolo del Patrimonio di Domenico (ISP)
                    </span>
                    <div className="space-y-2 text-[11px] text-slate-650">
                      <div className="flex justify-between items-center">
                        <span>Liquidi Correnti (BBVA, BPM, Satispay, Cash):</span>
                        <span className="font-mono font-semibold text-slate-800">{formatEuro(iseeTotalAssets)}</span>
                      </div>
                      <p className="text-[9px] text-slate-450 leading-relaxed pl-3 -mt-1 font-sans">
                        • Senza il conto Unicredit di tuo figlio Alberto Pellegrino.
                      </p>
                      
                      <div className="flex justify-between items-center">
                        <span>Auto e Altri Beni Personali di Domenico (Fiat Tipo):</span>
                        <span className="font-mono font-semibold text-slate-800">{formatEuro(iseeTotalInvestmentsValue)}</span>
                      </div>
                      <p className="text-[9px] text-slate-450 leading-relaxed pl-3 -mt-1">
                        • Senza l&apos;immobile Strada ai Monti di proprietà di Alberto.
                      </p>
                      
                      <div className="flex justify-between items-center text-rose-650">
                        <span>Debiti e Finanziamenti Personali Domenico:</span>
                        <span className="font-mono font-semibold">-{formatEuro(iseeTotalDebts)}</span>
                      </div>
                      <p className="text-[9px] text-slate-455 leading-relaxed pl-3 -mt-1 font-sans">
                        • Plafond AMEX, Finanziamento Compass, debito residuo Mutuo Lavoro.
                      </p>
                      
                      <div className="flex justify-between items-center border-t border-slate-200/50 pt-2 mt-1.5 text-slate-800 font-bold">
                        <span>Patrimonio Netto Mobiliare/Immobiliare:</span>
                        <span className="font-mono">{formatEuro(iseePatrimonyBalance)}</span>
                      </div>
                      
                      <div className="flex justify-between items-center text-emerald-700 font-medium">
                        <span>Franchigia di Abbattimento Mobiliare ({householdMembers} Memb.):</span>
                        <span className="font-mono">-{formatEuro(ispFranchise)}</span>
                      </div>
                      <p className="text-[9px] text-slate-450 leading-relaxed pl-3 -mt-1">
                        • Franchigia base italiana di {formatEuro(6000)} + {formatEuro(2000)} per ogni componente aggiuntivo oltre il primo.
                      </p>
                      
                      <div className="flex justify-between items-center border-t border-emerald-200 pt-2 mt-1.5 text-emerald-800 font-extrabold text-[12px]">
                        <span>ISP Finale (Situazione Patrimoniale):</span>
                        <span className="font-mono">{formatEuro(finalISP)}</span>
                      </div>
                    </div>
                  </div>

                  {/* FORMULA CARD */}
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-[10.5px] leading-relaxed text-slate-600">
                    <span className="font-bold text-slate-800 block mb-1">Formula ISEE Ufficiale Italiana applicata:</span>
                    <div className="font-mono bg-white p-2 rounded border border-slate-150 text-center text-indigo-900 font-bold my-1 text-xs">
                      ISEE = [ISR + (ISP x 20%)] / PSE (Parametro Scala Eq.)
                    </div>
                    <p className="text-[9.5px] text-slate-500">
                      Inserendo i tuoi parametri: <br />
                      <strong>ISE (Indicatore Situazione Economica)</strong> = {formatEuro(finalISR)} + (20% x {formatEuro(finalISP)}) = {formatEuro(estimatedISE)} <br />
                      <strong>Divisore PSE</strong> = {psScale.toFixed(2)} membri <br />
                      quindi, {formatEuro(estimatedISE)} / {psScale.toFixed(2)} = <strong>{formatEuro(estimatedISEE)}</strong>
                    </p>
                  </div>
                </div>
              )}

              <div className="flex justify-between items-center pt-3.5 bg-emerald-50/50 p-3 rounded-xl border border-emerald-100 mt-2">
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-emerald-800 flex items-center gap-1.5 font-sans">
                    <ShieldCheck className="w-4 h-4 text-emerald-600" />
                    Valore ISEE Stimato {currentYearValue}
                  </span>
                  <span className="text-[10px] text-slate-500 mt-0.5 font-sans">Indicatore sintetico (ISE / scala equivalenza)</span>
                </div>
                <span className="text-lg font-extrabold text-emerald-800 font-mono">{formatEuro(estimatedISEE)}</span>
              </div>
            </div>

            <div className="mt-3.5 flex gap-1.5 p-2.5 bg-slate-50 rounded-xl border border-slate-150 text-[9px] text-slate-500 leading-normal font-sans">
              <AlertCircle className="w-3.5 h-3.5 text-slate-400 flex-shrink-0 mt-0.5" />
              <span>Nota: Questo calcolo è una simulazione puramente indicativa basata sui flussi d'esercizio censiti e sul saldo dei conti in tempo reale. L'ISEE ufficiale si ottiene compilando la DSU tramite CAF o portale unico INPS.</span>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: RELEVANT PERSONAL INVESTMENTS & ASSETS PANEL (lg:col-span-6) */}
        <div className="lg:col-span-6 space-y-6">
          <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm relative">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-sm font-bold text-slate-805 flex items-center gap-2">
                <PiggyBank className="w-4 h-4 text-indigo-500" />
                Investimenti e Beni Personali
              </h3>
              <button 
                onClick={() => setShowAddForm(!showAddForm)}
                className="text-xs bg-indigo-50 text-indigo-600 border border-indigo-150 px-2 py-1 rounded flex items-center gap-1 hover:bg-indigo-100 transition-all font-semibold"
              >
                {showAddForm ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                Nuovo Bene
              </button>
            </div>

            <p className="text-xs text-slate-500 mb-4 font-sans">
              Situazione del portafoglio dei beni personali e degli investimenti d'acquisto (es: Strada Monti e Fiat Tipo). Influisce direttamente sulla stima del Patrimonio Netto.
            </p>

            {/* Quick Add Asset Form */}
            {showAddForm && (
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3 mb-4 text-xs">
                <h4 className="font-bold text-slate-700">Registra un Nuovo Asset Familiare</h4>
                
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] text-slate-500 font-bold uppercase mb-1">Nome Asset</label>
                    <input 
                      type="text" 
                      placeholder="Es: Terreno Strada Monti, Fiat Tipo..."
                      value={addName}
                      onChange={(e) => setAddName(e.target.value)}
                      className="w-full bg-white border border-slate-250 p-1.5 rounded outline-none focus:border-indigo-500 text-xs text-slate-800"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-500 font-bold uppercase mb-1">Categoria</label>
                    <select
                      value={addType}
                      onChange={(e) => setAddType(e.target.value as 'investment' | 'asset')}
                      className="w-full bg-white border border-slate-250 p-1.5 rounded outline-none text-xs text-slate-800"
                    >
                      <option value="investment">Investimento Finanziario</option>
                      <option value="asset">Asset Immobiliare o Mobile (Es: Auto)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] text-slate-500 font-bold uppercase mb-1">Descrizione Breve</label>
                  <input 
                    type="text" 
                    placeholder="Dettagli identificativi, scadenze, note..."
                    value={addDesc}
                    onChange={(e) => setAddDesc(e.target.value)}
                    className="w-full bg-white border border-slate-250 p-1.5 rounded outline-none focus:border-indigo-500 text-xs text-slate-800"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] text-slate-500 font-bold uppercase mb-1">Valore Acquisto (€)</label>
                    <input 
                      type="number" 
                      value={addBuyVal}
                      onChange={(e) => setAddBuyVal(Number(e.target.value))}
                      className="w-full bg-white border border-slate-250 p-1.5 rounded outline-none focus:border-indigo-500 text-xs font-mono text-slate-800"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-500 font-bold uppercase mb-1">Valore Attuale Stima (€)</label>
                    <input 
                      type="number" 
                      value={addCurrentVal}
                      onChange={(e) => setAddCurrentVal(Number(e.target.value))}
                      className="w-full bg-white border border-slate-250 p-1.5 rounded outline-none focus:border-indigo-500 text-xs font-mono text-slate-800"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-1 border-t border-slate-150">
                  <button 
                    onClick={() => setShowAddForm(false)}
                    className="px-2.5 py-1 border border-slate-250 rounded text-slate-500 hover:text-slate-800 font-medium"
                  >
                    Annulla
                  </button>
                  <button 
                    onClick={triggerAddInv}
                    className="px-3 py-1 bg-indigo-600 text-white rounded font-bold"
                  >
                    Salva Asset
                  </button>
                </div>
              </div>
            )}

            {/* List of Investments and Assets */}
            <div className="space-y-3">
              {(!investments || investments.length === 0) ? (
                <div className="text-center py-6 text-slate-400 text-xs font-sans">
                  Nessun investimento registrato. Aggiungine uno sopra!
                </div>
              ) : (
                investments.map((inv) => {
                  const performance = inv.currentValue - inv.buyValue;
                  const returnOfInv = inv.buyValue > 0 ? (performance / inv.buyValue) * 100 : 0;
                  const isPositive = performance >= 0;
                  
                  return (
                    <div key={inv.id} className="border border-slate-150 p-4 rounded-xl flex flex-col gap-3 hover:border-slate-300 transition-all bg-slate-50/50">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className={`p-2 rounded-lg ${
                            inv.name.toUpperCase().includes('TIPO') 
                              ? 'bg-rose-50 text-rose-600' 
                              : inv.name.toUpperCase().includes('STRADA') || inv.name.toUpperCase().includes('MONTI')
                              ? 'bg-emerald-50 text-emerald-600'
                              : 'bg-indigo-50 text-indigo-600'
                          }`}>
                            {inv.name.toUpperCase().includes('TIPO') ? (
                              <Car className="w-4 h-4" />
                            ) : inv.name.toUpperCase().includes('STRADA') || inv.name.toUpperCase().includes('MONTI') ? (
                              <Mountain className="w-4 h-4" />
                            ) : (
                              <TrendingUp className="w-4 h-4" />
                            )}
                          </div>
                          <div>
                            <h4 className="text-xs font-bold text-slate-800 flex flex-wrap items-center gap-1.5">
                              {inv.name}
                              <span className="text-[10px] font-normal text-slate-400 capitalize">({inv.type})</span>
                              {(inv.name.toLowerCase().includes('strada') || inv.name.toLowerCase().includes('monti') || inv.name.toLowerCase().includes('alberto')) && (
                                <span className="text-[9px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded leading-none">
                                  Di Alberto (Fuori ISEE / Escluso dal Patrimonio Domenico)
                                </span>
                              )}
                            </h4>
                            <p className="text-[11px] text-slate-500 font-sans">{inv.description}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button 
                            onClick={() => startEditInv(inv)}
                            className="p-1 hover:bg-slate-200 text-slate-400 hover:text-slate-700 rounded transition-all"
                            title="Modifica stima valore attuale"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button 
                            onClick={() => deleteInvItem(inv.id)}
                            className="p-1 hover:bg-rose-100 text-rose-350 hover:text-rose-650 rounded transition-all"
                            title="Rimuovi"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Display or Edit fields */}
                      {editingInvId === inv.id ? (
                        <div className="bg-white p-3 border border-slate-200 rounded-lg space-y-3 text-xs">
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-[10px] font-bold text-slate-400">Valore Acquisto (€)</label>
                              <input 
                                type="number"
                                value={editBuyVal}
                                onChange={(e) => setEditBuyVal(Number(e.target.value))}
                                className="w-full border border-slate-250 p-1 rounded font-mono text-xs focus:border-indigo-500 outline-none text-slate-800 bg-slate-50"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-bold text-slate-400">Valore Attuale (€)</label>
                              <input 
                                type="number"
                                value={editCurrentVal}
                                onChange={(e) => setEditCurrentVal(Number(e.target.value))}
                                className="w-full border border-slate-250 p-1 rounded font-mono text-xs focus:border-indigo-500 outline-none text-slate-800 bg-slate-50"
                              />
                            </div>
                          </div>
                          <div className="flex justify-end gap-1.5 pt-1.5 border-t border-slate-100">
                            <button 
                              onClick={() => setEditingInvId(null)}
                              className="px-2 py-0.5 border border-slate-200 rounded text-slate-500 hover:text-slate-800"
                            >
                              Annulla
                            </button>
                            <button 
                              onClick={() => saveEditInv(inv.id)}
                              className="px-3 py-0.5 bg-indigo-600 text-white rounded font-bold"
                            >
                              Salva
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-3 gap-2 bg-white px-3 py-2 rounded-lg border border-slate-150">
                          <div>
                            <span className="text-[10px] text-slate-400 block font-sans">Prezzo d'acquisto</span>
                            <span className="text-xs font-bold text-slate-700 font-mono">{formatEuro(inv.buyValue)}</span>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-400 block font-sans">Valore di stima</span>
                            <span className="text-xs font-bold text-slate-800 font-mono">{formatEuro(inv.currentValue)}</span>
                          </div>
                          <div className="text-right">
                            <span className="text-[10px] text-slate-400 block font-sans">Performance</span>
                            <span className={`text-xs font-bold font-mono inline-flex items-center gap-0.5 ${
                              isPositive ? 'text-emerald-600' : 'text-rose-600'
                            }`}>
                              {isPositive ? '+' : ''}{formatEuro(performance)} ({Math.round(returnOfInv)}%)
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Global Portfolio Value */}
            {investments && investments.length > 0 && (
              <div className="mt-4 pt-3.5 border-t border-slate-100 flex justify-between items-center bg-indigo-50/50 p-3 rounded-lg text-xs font-sans">
                <span className="text-indigo-850 font-bold uppercase tracking-wider text-[10px]">Valore di Stima Totale Asset</span>
                <span className="text-sm font-black text-indigo-700 font-mono">{formatEuro(totalInvestmentsValue)}</span>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* LINE CHART INTEGRATED RESIZING (Area Graph of recent flows) */}
      <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm">
        <h2 className="text-sm font-bold text-slate-850 flex items-center gap-2 mb-4">
          <TrendingUp className="w-4 h-4 text-emerald-600" />
          Volume Flussi di Cassa Recenti <span className="text-xs font-normal text-slate-500">(Allineati alla Pasticca di Ambito Filtrata)</span>
        </h2>
        <div className="h-64 mt-4">
          {chartData.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 text-xs">
              <AlertCircle className="w-8 h-8 mb-2 text-slate-400" />
              Nessuna movimentazione bancaria disponibile per redigere il grafico.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorIn" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.25}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorOut" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.25}/>
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" stroke="#94a3b8" fontSize={10} tickLine={false} />
                <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.05)' }}
                  labelStyle={{ color: '#475569', fontSize: '11px', fontWeight: 'bold' }}
                  itemStyle={{ fontSize: '12px', color: '#1e293b' }}
                />
                <Area type="monotone" dataKey="entrate" name="Entrate" stroke="#10b981" fillOpacity={1} fill="url(#colorIn)" strokeWidth={2} />
                <Area type="monotone" dataKey="uscite" name="Uscite" stroke="#ef4444" fillOpacity={1} fill="url(#colorOut)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* FOOTER ADVICE ON SHARED / MIXED ACCOUNTS */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 flex items-center gap-4 shadow-sm">
        <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
          <Building className="w-5 h-5" />
        </div>
        <div>
          <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Unione Intelligente dei Budget Misti</h4>
          <p className="text-xs text-slate-500 mt-1 leading-relaxed">
            I conti correnti contrassegnati come <strong>"Misti" (Mixed)</strong> vengono ripartiti all'istante ed in modo automatico. ContoSmart traccia ogni singolo movimento verso l'ambito d'afferenza reale (Personale o P.IVA), lasciandoti libero di usare una sola carta fisica senza confusioni fiscali.
          </p>
        </div>
      </div>
    </div>
  );
}
