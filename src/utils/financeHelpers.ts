/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Account, Transaction, AutoRule } from '../types';

// Default mock accounts
export const INITIAL_ACCOUNTS: Account[] = [
  { id: 'acc-1', name: 'Conto Corrente Unicredit', type: 'checking', scope: 'mixed', balance: 0, iban: 'IT76C0200805000000123456789' },
  { id: 'acc-2', name: 'Carta di Credito AMEX Oro', type: 'credit_card', scope: 'mixed', balance: 0, limit: 3000 },
  { id: 'acc-3', name: 'Cassa Contanti (Cash)', type: 'cash', scope: 'personal', balance: 0 },
  { id: 'acc-4', name: 'Finanziamento Auto (Compass)', type: 'financing', scope: 'personal', balance: 0, limit: 12000, notes: 'Rata mensile di 250 € - Tasso 4.5%' }
];

// Initial mock transactions for realistic Italian scenario
export const INITIAL_TRANSACTIONS: Transaction[] = [];

// Initial mock rules
export const INITIAL_RULES: AutoRule[] = [
  {
    id: 'rule-1',
    name: 'Spesa Conad',
    keyword: 'CONAD',
    scope: 'personal',
    category: 'utili',
    subcategory: 'Alimentari'
  },
  {
    id: 'rule-2',
    name: 'Bolletta Enel Studio',
    keyword: 'ENEL ENERGIA',
    scope: 'professional',
    category: 'necessarie_lavoro',
    subcategory: 'Utenze'
  },
  {
    id: 'rule-3',
    name: 'Rata Compass',
    keyword: 'COMPASS',
    scope: 'personal',
    category: 'necessarie',
    subcategory: 'Finanziamento'
  },
  {
    id: 'rule-4',
    name: 'Licenze Software Professionali',
    keyword: 'JETBRAINS',
    scope: 'professional',
    category: 'utili_lavoro',
    subcategory: 'Software & Cloud'
  }
];

// Flat-rate Tax details (Regime Forfettario 2026)
export interface ForfettarioSummary {
  grossProfessionalRevenue: number;
  profitabilityCoefficient: number; // e.g., 0.78 for ateco consulting, 0.67 commerce
  taxableIncome: number; // Gross * Coefficient
  estimatedTaxRate: number; // Standard 15%, or 5% startup
  estimatedTax: number; // TaxableIncome * TaxRate
  estimatedInpsRate: number; // e.g., 26.07% Gestione Separata
  estimatedInps: number; // TaxableIncome * InpsRate
  totalExpensesAccrued: number; // Sum of professional expenses recorded
  netEstimatedProfit: number; // Gross - Estimated Tax - Estimated INPS
}

export function calculateForfettario(
  transactions: Transaction[],
  coefficient: number = 0.78,
  taxRate: number = 0.15,
  inpsRate: number = 0.2607
): ForfettarioSummary {
  // Filter professional income (entrate_lavoro)
  const professionalIncomes = transactions.filter(
    t => t.scope === 'professional' && t.type === 'income' && t.category === 'entrate_lavoro'
  );
  
  const grossProfessionalRevenue = professionalIncomes.reduce((sum, t) => sum + t.amount, 0);
  const taxableIncome = grossProfessionalRevenue * coefficient;
  const estimatedTax = taxableIncome * taxRate;
  const estimatedInps = taxableIncome * inpsRate;

  // Filter professional expenses
  const professionalExpenses = transactions.filter(
    t => t.scope === 'professional' && t.type === 'expense'
  );
  const totalExpensesAccrued = Math.abs(professionalExpenses.reduce((sum, t) => sum + t.amount, 0));
  const netEstimatedProfit = grossProfessionalRevenue - estimatedTax - estimatedInps;

  return {
    grossProfessionalRevenue,
    profitabilityCoefficient: coefficient,
    taxableIncome,
    estimatedTaxRate: taxRate,
    estimatedTax,
    estimatedInpsRate: inpsRate,
    estimatedInps,
    totalExpensesAccrued,
    netEstimatedProfit
  };
}

// Check local regex matching for transactions
export function applyLocalRules(description: string, rules: AutoRule[]): { scope: 'personal' | 'professional', category: string, subcategory: string, accountId?: string, destinationAccountId?: string } | null {
  const upperDesc = description.toUpperCase();
  for (const rule of rules) {
    if (upperDesc.includes(rule.keyword.toUpperCase())) {
      return {
        scope: rule.scope,
        category: rule.category,
        subcategory: rule.subcategory,
        accountId: rule.accountId,
        destinationAccountId: rule.destinationAccountId
      };
    }
  }

  // Broad fallbacks
  // Check Unipol Tech / Telepass first so it doesn't match broder "UNIPOL" insurance
  if (upperDesc.includes('UNIPOL TECH') || upperDesc.includes('UNIPOLTECH') || upperDesc.includes('TELEPASS') || upperDesc.includes('UNIPOL MOVE') || upperDesc.includes('UNIPOLMOVE')) {
    return { scope: 'personal', category: 'utili', subcategory: 'Autostrada & Pedaggi' };
  }

  // Check Agos Ducato financing
  if (upperDesc.includes('AGOS') || upperDesc.includes('DUCATO')) {
    return { scope: 'personal', category: 'necessarie', subcategory: 'Finanziamento' };
  }

  // Check Carburante / Distributore / Tamoil / petrol stations
  if (upperDesc.includes('CARBURANTE') || upperDesc.includes('BENZINA') || upperDesc.includes('GASOLIO') || upperDesc.includes('DISTRIBUTORE') || upperDesc.includes('TAMOIL') || upperDesc.includes('Q8') || upperDesc.includes('ENI STATION') || upperDesc.includes('IP ') || upperDesc.includes(' IP') || upperDesc.includes('ESSO') || upperDesc.includes('SHELL') || upperDesc.includes('TOTAL') || upperDesc.includes('REPSOL') || upperDesc.includes('STAZIONE SERVIZIO')) {
    return { scope: 'personal', category: 'utili', subcategory: 'Carburante' };
  }

  if (upperDesc.includes('BANCO BPM') || upperDesc.includes('BPM') || upperDesc.includes('FIAT TIPO') || upperDesc.includes('STRADA MONTI') || upperDesc.includes('STRADA AI MONTI') || upperDesc.includes('GIROCONTO') || upperDesc.includes('TRASFERIMENTO') || upperDesc.includes('TRANSFER')) {
    return { scope: 'personal', category: 'necessarie', subcategory: 'Giroconto' };
  }
  if (upperDesc.includes('PRELIEVO') || upperDesc.includes('PREL.BANCOMAT') || upperDesc.includes('ATM')) {
    return { scope: 'personal', category: 'necessarie', subcategory: 'Prelevamento Contanti' };
  }
  if (upperDesc.includes('FASTWEB') || upperDesc.includes('ENEL') || upperDesc.includes('ENI ') || upperDesc.includes('ENI_') || upperDesc.includes('UTENZE') || upperDesc.includes('BOLLETTA') || upperDesc.includes('TELECOM') || upperDesc.includes('WINDTRE') || upperDesc.includes('AFFITTO') || upperDesc.includes('CONDOMINIO')) {
    return { scope: 'personal', category: 'necessarie', subcategory: 'Utenze & Affitti' };
  }
  if (upperDesc.includes('REST') || upperDesc.includes('RISTORANTE') || upperDesc.includes('CAFFE') || upperDesc.includes('BAR') || upperDesc.includes('CINEMA') || upperDesc.includes('GIFT')) {
    return { scope: 'personal', category: 'tempo_libero', subcategory: 'Intrattenimento' };
  }
  if (upperDesc.includes('SUPERMERCATO') || upperDesc.includes('COOP') || upperDesc.includes('CONAD') || upperDesc.includes('ESSELUNGA') || upperDesc.includes('LIDL') || upperDesc.includes('ALIMENTARI') || upperDesc.includes('SPESA')) {
    return { scope: 'personal', category: 'utili', subcategory: 'Alimentari' };
  }
  if (upperDesc.includes('FARMACIA') || upperDesc.includes('MEDICINA') || upperDesc.includes('MEDICO') || upperDesc.includes('DOTTORE') || upperDesc.includes('CLINICA') || upperDesc.includes('DENTISTA') || upperDesc.includes('ANALISI') || upperDesc.includes('AULSS') || upperDesc.includes('ASL')) {
    return { scope: 'personal', category: 'utili', subcategory: 'Spese Mediche & Farmacia' };
  }
  if (upperDesc.includes('ASSICURAZIONE') || upperDesc.includes('POLIZZA') || upperDesc.includes('RSA') || upperDesc.includes('UNIPOL') || upperDesc.includes('GENERALI') || upperDesc.includes('ALLIANZ')) {
    return { scope: 'personal', category: 'utili', subcategory: 'Assicurazioni' };
  }
  if (upperDesc.includes('MANUTENZIONE') || upperDesc.includes('OFFICINA') || upperDesc.includes('MECCANICO') || upperDesc.includes('TAGLIANDO') || upperDesc.includes('GOMMISTA') || upperDesc.includes('CARROZZIERE') || upperDesc.includes('AUTO')) {
    return { scope: 'personal', category: 'utili', subcategory: 'Manutenzione Auto' };
  }
  if (upperDesc.includes('AWS') || upperDesc.includes('DESIGNS') || upperDesc.includes('GITHUB') || upperDesc.includes('CLOUD') || upperDesc.includes('HOSTING') || upperDesc.includes('SOFTWARE') || upperDesc.includes('HOSTINGER') || upperDesc.includes('SUPABASE')) {
    return { scope: 'professional', category: 'utili_lavoro', subcategory: 'Software & Cloud' };
  }
  if (upperDesc.includes('FATTURA') || upperDesc.includes('COMPETENZE') || upperDesc.includes('INCASSO') || upperDesc.includes('ONORARIO') || upperDesc.includes('BON.DA') || upperDesc.includes('CLIENTE') || upperDesc.includes('PELLEGRINO')) {
    return { scope: 'professional', category: 'entrate_lavoro', subcategory: 'Fattura Cliente' };
  }

  return null;
}

// Convert data to CSV content
export function exportToCSV(transactions: Transaction[], accounts: Account[]): string {
  const headers = ['Data', 'Descrizione', 'Importo', 'Tipo', 'Conto', 'Ambito (Personale/Professionale)', 'Categoria', 'Sottocategoria'];
  const rows = transactions.map(t => {
    const accountName = accounts.find(a => a.id === t.accountId)?.name || 'Sconosciuto';
    return [
      t.date,
      `"${t.description.replace(/"/g, '""')}"`,
      t.amount,
      t.type,
      `"${accountName.replace(/"/g, '""')}"`,
      t.scope === 'personal' ? 'Personale' : 'Professionale',
      t.category,
      t.subcategory
    ];
  });

  return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
}

// Parse custom pasted or uploaded CSV data
export function parseCSVTransactions(csvText: string, currentAccountId: string): Partial<Transaction>[] {
  const lines = csvText.split('\n');
  const items: Partial<Transaction>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const parts = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/); // regex split by comma outer quotes
    if (parts.length >= 3) {
      const date = parts[0]?.replace(/"/g, '').trim() || new Date().toISOString().split('T')[0];
      const desc = parts[1]?.replace(/"/g, '').trim() || 'Imported Transaction';
      const amount = parseFloat(parts[2]?.replace(/"/g, '').trim()) || 0;
      
      const type = amount >= 0 ? 'income' : 'expense';
      
      items.push({
        id: `imported-${Date.now()}-${i}`,
        date,
        description: desc,
        amount,
        type,
        accountId: currentAccountId
      });
    }
  }
  return items;
}
