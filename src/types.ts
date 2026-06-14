/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type AccountType = 'checking' | 'credit_card' | 'cash' | 'financing';
export type AccountScope = 'personal' | 'professional' | 'mixed';

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  scope: AccountScope;
  balance: number; // Current balance
  limit?: number; // For credit cards (plafond) or financing (original loan)
  iban?: string;
  notes?: string;
  isDemo?: boolean;
}

export type TransactionScope = 'personal' | 'professional';

export type PersonalCategory = 'necessarie' | 'utili' | 'tempo_libero' | 'entrate' | 'trasferimento';
export type ProfessionalCategory = 'necessarie_lavoro' | 'utili_lavoro' | 'entrate_lavoro' | 'trasferimento';

export interface Transaction {
  id: string;
  date: string; // YYYY-MM-DD
  description: string;
  amount: number; // Positive for income, negative for expense, positive/negative relative to view
  type: 'income' | 'expense' | 'transfer';
  accountId: string; // The account with which the transaction is associated (Source for transfers)
  destinationAccountId?: string; // Only for transfer transactions
  scope: TransactionScope;
  category: PersonalCategory | ProfessionalCategory;
  subcategory: string; // e.g., "Alimentari", "Affitto", "Software", "Consulenza", etc.
  isAutoMatched?: boolean;
  ruleId?: string;
  isVerified?: boolean;
  isDemo?: boolean;
  linkedTransactionId?: string;
  notes?: string;
  customer?: string;
  invoiceId?: string;
}

export interface AutoRule {
  id: string;
  name: string;
  keyword: string; // Checked against transaction description
  scope: TransactionScope;
  category: PersonalCategory | ProfessionalCategory;
  subcategory: string;
  isDemo?: boolean;
}

export interface BankSyncConnection {
  id: string;
  bankName: string;
  logo: string;
  status: 'connected' | 'expired' | 'disconnected';
  lastSynced: string;
}

export interface Investment {
  id: string;
  name: string;
  description: string;
  type: 'investment' | 'asset';
  buyValue: number;
  currentValue: number;
  lastUpdated?: string;
}

