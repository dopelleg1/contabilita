/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

// Define database paths (SQLite fallbacks preserved only for backups)
const dbPath = path.resolve(process.cwd(), 'database.db');

export const prisma = new PrismaClient();

// Convert SQLite integers (0/1) to real booleans (false/true)
// Not strictly needed for Prisma queries as they map to real booleans,
// but preserved as a safe utility to maintain absolute compatibility with other service layers.
function mapRowBooleans(row: any) {
  if (!row) return row;
  return {
    ...row,
    isDemo: row.isDemo === true || row.isDemo === 1,
    isAutoMatched: row.isAutoMatched === true || row.isAutoMatched === 1,
    isVerified: row.isVerified === true || row.isVerified === 1
  };
}

// Initialize schema seeding
export async function initDb() {
  try {
    // 1. Seed default settings if empty
    const settingsCount = await prisma.setting.count();
    if (settingsCount === 0) {
      await prisma.setting.createMany({
        data: [
          { key: 'taxpayer_name', value: 'Domenico Pellegrino' },
          { key: 'taxpayer_cf', value: 'PLLDNC60B14A494R' }
        ]
      });
    }

    // 2. Seed default accounts if empty
    const accountsCount = await prisma.account.count();
    if (accountsCount === 0) {
      const initialAccounts = [
        { id: 'acc-1', name: 'Conto Corrente Unicredit', type: 'checking', scope: 'mixed', balance: 14500, iban: 'IT76C0200805000000123456789', notes: '', isDemo: true },
        { id: 'acc-2', name: 'Carta di Credito AMEX Oro', type: 'credit_card', scope: 'mixed', balance: -850, limit: 3000, iban: '', notes: '', isDemo: true },
        { id: 'acc-3', name: 'Cassa Contanti (Cash)', type: 'cash', scope: 'personal', balance: 340, limit: null, iban: '', notes: '', isDemo: true },
        { id: 'acc-4', name: 'Finanziamento Auto (Compass)', type: 'financing', scope: 'personal', balance: -7200, limit: 12000, notes: 'Rata mensile di 250 € - Tasso 4.5%', isDemo: true }
      ];
      await prisma.account.createMany({ data: initialAccounts });
    }

    // 3. Seed default transactions if empty
    const isCleared = await prisma.setting.findUnique({ where: { key: 'transactions_cleared' } });
    const isDemoDeleted = await prisma.setting.findUnique({ where: { key: 'demo_transactions_deleted' } });
    const transactionsCount = await prisma.transaction.count();
    if (transactionsCount === 0 && (!isCleared || isCleared.value !== 'true') && (!isDemoDeleted || isDemoDeleted.value !== 'true')) {
      const initialTransactions = [
        { id: 'tx-1', date: '2026-05-18', description: 'BONIFICO SEPA DA CLIENTE INCOMING ACME CORPORATION SRL FATTURA 14', amount: 3200, type: 'income', accountId: 'acc-1', destinationAccountId: null, scope: 'professional', category: 'entrate_lavoro', subcategory: 'Consulenza', isAutoMatched: false, ruleId: null, isVerified: false, isDemo: true },
        { id: 'tx-2', date: '2026-05-17', description: 'ADDEBITO DIRETTO ENEL ENERGIA SPA - UTENZE STUDIO', amount: -185.40, type: 'expense', accountId: 'acc-1', destinationAccountId: null, scope: 'professional', category: 'necessarie_lavoro', subcategory: 'Utenze', isAutoMatched: false, ruleId: null, isVerified: false, isDemo: true },
        { id: 'tx-3', date: '2026-05-16', description: 'CONAD SUPERMERCATO BOLOGNA SPESA SETTIMANALE', amount: -65.20, type: 'expense', accountId: 'acc-1', destinationAccountId: null, scope: 'personal', category: 'necessarie', subcategory: 'Alimentari', isAutoMatched: false, ruleId: null, isVerified: false, isDemo: true },
        { id: 'tx-4', date: '2026-05-15', description: 'RATA MENSILE FINANZIAMENTO COMPASS AUTO', amount: -250.00, type: 'expense', accountId: 'acc-1', destinationAccountId: null, scope: 'personal', category: 'necessarie', subcategory: 'Finanziamento', isAutoMatched: false, ruleId: null, isVerified: false, isDemo: true },
        { id: 'tx-5', date: '2026-05-14', description: 'FATTURA N. 9 DEL COMMERCIALISTA STUDIO ROSSI & ASSOCIAZIONI', amount: -350.00, type: 'expense', accountId: 'acc-1', destinationAccountId: null, scope: 'professional', category: 'necessarie_lavoro', subcategory: 'Commercialista', isAutoMatched: false, ruleId: null, isVerified: false, isDemo: true },
        { id: 'tx-6', date: '2026-05-12', description: 'CENA RISTORANTE CARLO CRACCO MILANO', amount: -180.00, type: 'expense', accountId: 'acc-2', destinationAccountId: null, scope: 'personal', category: 'tempo_libero', subcategory: 'Ristoranti', isAutoMatched: false, ruleId: null, isVerified: false, isDemo: true },
        { id: 'tx-7', date: '2026-05-10', description: 'ACQUISTO LICENZA INTEGRALE JETBRAINS RIDER & WEBSTORM', amount: -150.00, type: 'expense', accountId: 'acc-2', destinationAccountId: null, scope: 'professional', category: 'utili_lavoro', subcategory: 'Software & Cloud', isAutoMatched: false, ruleId: null, isVerified: false, isDemo: true },
        { id: 'tx-8', date: '2026-05-09', description: 'PRELIEVO CONTANTE BANCOMAT MILANO DUOMO', amount: -100.00, type: 'expense', accountId: 'acc-1', destinationAccountId: null, scope: 'personal', category: 'trasferimento', subcategory: 'Prelievo', isAutoMatched: false, ruleId: null, isVerified: false, isDemo: true },
        { id: 'tx-9', date: '2026-05-09', description: 'DEPOSITO PRELIEVO CONTANTE BANCOMAT MILANO DUOMO', amount: 100.00, type: 'income', accountId: 'acc-3', destinationAccountId: null, scope: 'personal', category: 'trasferimento', subcategory: 'Prelievo', isAutoMatched: false, ruleId: null, isVerified: false, isDemo: true }
      ];
      await prisma.transaction.createMany({ data: initialTransactions });
    }

    // 4. Seed default rules if empty
    const rulesCount = await prisma.rule.count();
    if (rulesCount === 0) {
      const initialRules = [
        { id: 'rule-1', name: 'Spesa Conad', keyword: 'CONAD', scope: 'personal', category: 'necessarie', subcategory: 'Alimentari', isDemo: true },
        { id: 'rule-2', name: 'Bolletta Enel Studio', keyword: 'ENEL ENERGIA', scope: 'professional', category: 'necessarie_lavoro', subcategory: 'Utenze', isDemo: true },
        { id: 'rule-3', name: 'Rata Compass', keyword: 'COMPASS', scope: 'personal', category: 'necessarie', subcategory: 'Finanziamento', isDemo: true },
        { id: 'rule-4', name: 'Licenze Software Professionali', keyword: 'JETBRAINS', scope: 'professional', category: 'utili_lavoro', subcategory: 'Software & Cloud', isDemo: true }
      ];
      await prisma.rule.createMany({ data: initialRules });
    }
  } catch (error) {
    console.error("Errore durante l'inizializzazione del database:", error);
  }
}

export const dbOps = {
  // Settings
  getSetting: async (key: string): Promise<string | null> => {
    const row = await prisma.setting.findUnique({ where: { key } });
    return row ? row.value : null;
  },
  setSetting: async (key: string, value: string): Promise<void> => {
    await prisma.setting.upsert({
      where: { key },
      update: { value },
      create: { key, value }
    });
  },

  // Accounts
  getAccounts: async () => {
    const rows = await prisma.account.findMany();
    return rows.map(mapRowBooleans);
  },
  addAccount: async (acc: any) => {
    await prisma.account.create({
      data: {
        id: acc.id,
        name: acc.name,
        type: acc.type,
        scope: acc.scope,
        balance: acc.balance,
        limit: acc.limit !== undefined && acc.limit !== null ? acc.limit : null,
        iban: acc.iban || '',
        notes: acc.notes || '',
        isDemo: acc.isDemo === true || acc.isDemo === 1
      }
    });
  },
  updateAccount: async (id: string, acc: any) => {
    await prisma.account.update({
      where: { id },
      data: {
        name: acc.name,
        type: acc.type,
        scope: acc.scope,
        balance: acc.balance,
        limit: acc.limit !== undefined && acc.limit !== null ? acc.limit : null,
        iban: acc.iban || '',
        notes: acc.notes || '',
        isDemo: acc.isDemo === true || acc.isDemo === 1
      }
    });
  },
  deleteAccount: async (id: string) => {
    await prisma.account.delete({ where: { id } });
  },

  // Transactions
  getTransactions: async () => {
    const rows = await prisma.transaction.findMany({
      orderBy: [
        { date: 'desc' },
        { id: 'desc' }
      ]
    });
    return rows.map(mapRowBooleans);
  },
  addTransaction: async (tx: any) => {
    await prisma.transaction.create({
      data: {
        id: tx.id,
        date: tx.date,
        description: tx.description,
        amount: tx.amount,
        type: tx.type,
        accountId: tx.accountId,
        destinationAccountId: tx.destinationAccountId !== undefined && tx.destinationAccountId !== null ? tx.destinationAccountId : null,
        scope: tx.scope,
        category: tx.category,
        subcategory: tx.subcategory,
        isAutoMatched: tx.isAutoMatched === true || tx.isAutoMatched === 1,
        ruleId: tx.ruleId !== undefined && tx.ruleId !== null ? tx.ruleId : null,
        isVerified: tx.isVerified === true || tx.isVerified === 1,
        isDemo: tx.isDemo === true || tx.isDemo === 1,
        linkedTransactionId: tx.linkedTransactionId !== undefined && tx.linkedTransactionId !== null ? tx.linkedTransactionId : null,
        notes: tx.notes !== undefined && tx.notes !== null ? tx.notes : null,
        customer: tx.customer !== undefined && tx.customer !== null ? tx.customer : null,
        invoiceId: tx.invoiceId !== undefined && tx.invoiceId !== null ? tx.invoiceId : null
      }
    });
  },
  updateTransaction: async (id: string, tx: any) => {
    await prisma.transaction.update({
      where: { id },
      data: {
        date: tx.date,
        description: tx.description,
        amount: tx.amount,
        type: tx.type,
        accountId: tx.accountId,
        destinationAccountId: tx.destinationAccountId !== undefined && tx.destinationAccountId !== null ? tx.destinationAccountId : null,
        scope: tx.scope,
        category: tx.category,
        subcategory: tx.subcategory,
        isAutoMatched: tx.isAutoMatched === true || tx.isAutoMatched === 1,
        ruleId: tx.ruleId !== undefined && tx.ruleId !== null ? tx.ruleId : null,
        isVerified: tx.isVerified === true || tx.isVerified === 1,
        isDemo: tx.isDemo === true || tx.isDemo === 1,
        linkedTransactionId: tx.linkedTransactionId !== undefined && tx.linkedTransactionId !== null ? tx.linkedTransactionId : null,
        notes: tx.notes !== undefined && tx.notes !== null ? tx.notes : null,
        customer: tx.customer !== undefined && tx.customer !== null ? tx.customer : null,
        invoiceId: tx.invoiceId !== undefined && tx.invoiceId !== null ? tx.invoiceId : null
      }
    });
  },
  deleteTransaction: async (id: string) => {
    await prisma.transaction.delete({ where: { id } });
  },

  // Rules
  getRules: async () => {
    const rows = await prisma.rule.findMany();
    return rows.map(mapRowBooleans);
  },
  addRule: async (rule: any) => {
    await prisma.rule.create({
      data: {
        id: rule.id,
        name: rule.name,
        keyword: rule.keyword,
        scope: rule.scope,
        category: rule.category,
        subcategory: rule.subcategory,
        accountId: rule.accountId || null,
        destinationAccountId: rule.destinationAccountId || null,
        isDemo: rule.isDemo === true || rule.isDemo === 1
      }
    });
  },
  updateRule: async (id: string, rule: any) => {
    await prisma.rule.update({
      where: { id },
      data: {
        name: rule.name,
        keyword: rule.keyword,
        scope: rule.scope,
        category: rule.category,
        subcategory: rule.subcategory,
        accountId: rule.accountId || null,
        destinationAccountId: rule.destinationAccountId || null,
        isDemo: rule.isDemo === true || rule.isDemo === 1
      }
    });
  },
  deleteRule: async (id: string) => {
    await prisma.rule.delete({ where: { id } });
  },

  // Reset helpers
  clearAllTransactions: async () => {
    await prisma.transaction.deleteMany({ where: { isDemo: false } });
    await prisma.account.updateMany({
      where: { isDemo: false },
      data: { balance: 0 }
    });
    await prisma.setting.upsert({
      where: { key: 'transactions_cleared' },
      update: { value: 'true' },
      create: { key: 'transactions_cleared', value: 'true' }
    });
  },

  resetAllDb: async () => {
    await prisma.transaction.deleteMany();
    await prisma.account.deleteMany();
    await prisma.rule.deleteMany();
    await prisma.setting.deleteMany();
  },

  getAllSettings: async () => {
    return await prisma.setting.findMany();
  },

  importAllData: async (data: { accounts: any[]; transactions: any[]; rules: any[]; settings?: { key: string; value: string }[] }) => {
    await prisma.$transaction(async (tx) => {
      await tx.transaction.deleteMany();
      await tx.account.deleteMany();
      await tx.rule.deleteMany();
      await tx.setting.deleteMany();

      if (data.settings && Array.isArray(data.settings)) {
        await tx.setting.createMany({ data: data.settings });
      }

      if (data.accounts && Array.isArray(data.accounts)) {
        await tx.account.createMany({
          data: data.accounts.map(a => ({
            id: a.id,
            name: a.name,
            type: a.type,
            scope: a.scope,
            balance: a.balance,
            limit: a.limit !== undefined && a.limit !== null ? a.limit : null,
            iban: a.iban || '',
            notes: a.notes || '',
            isDemo: a.isDemo === true || a.isDemo === 1
          }))
        });
      }

      if (data.rules && Array.isArray(data.rules)) {
        await tx.rule.createMany({
          data: data.rules.map(r => ({
            id: r.id,
            name: r.name,
            keyword: r.keyword,
            scope: r.scope,
            category: r.category,
            subcategory: r.subcategory,
            accountId: r.accountId || null,
            destinationAccountId: r.destinationAccountId || null,
            isDemo: r.isDemo === true || r.isDemo === 1
          }))
        });
      }

      if (data.transactions && Array.isArray(data.transactions)) {
        await tx.transaction.createMany({
          data: data.transactions.map(t => ({
            id: t.id,
            date: t.date,
            description: t.description,
            amount: t.amount,
            type: t.type,
            accountId: t.accountId,
            destinationAccountId: t.destinationAccountId !== undefined && t.destinationAccountId !== null ? t.destinationAccountId : null,
            scope: t.scope,
            category: t.category,
            subcategory: t.subcategory,
            isAutoMatched: t.isAutoMatched === true || t.isAutoMatched === 1,
            ruleId: t.ruleId !== undefined && t.ruleId !== null ? t.ruleId : null,
            isVerified: t.isVerified === true || t.isVerified === 1,
            isDemo: t.isDemo === true || t.isDemo === 1,
            notes: t.notes || null,
            customer: t.customer || null,
            invoiceId: t.invoiceId || null
          }))
        });
      }
    });
  },

  copyDemoToReal: async () => {
    await prisma.$transaction(async (tx) => {
      // 1. Get all demo accounts
      const demoAccounts = await tx.account.findMany({ where: { isDemo: true } });
      const accountIdMap: Record<string, string> = {};

      for (const a of demoAccounts) {
        const realId = `real-${a.id}`;
        accountIdMap[a.id] = realId;

        const exists = await tx.account.findUnique({ where: { id: realId } });
        if (!exists) {
          await tx.account.create({
            data: {
              id: realId,
              name: a.name,
              type: a.type,
              scope: a.scope,
              balance: a.balance,
              limit: a.limit !== undefined && a.limit !== null ? a.limit : null,
              iban: a.iban || '',
              notes: a.notes || '',
              isDemo: false
            }
          });
        }
      }

      // 2. Copy rules
      const demoRules = await tx.rule.findMany({ where: { isDemo: true } });
      for (const r of demoRules) {
        const realRuleId = `real-${r.id}`;
        const exists = await tx.rule.findUnique({ where: { id: realRuleId } });
        if (!exists) {
          await tx.rule.create({
            data: {
              id: realRuleId,
              name: r.name,
              keyword: r.keyword,
              scope: r.scope,
              category: r.category,
              subcategory: r.subcategory,
              accountId: r.accountId ? (accountIdMap[r.accountId] || r.accountId) : null,
              destinationAccountId: r.destinationAccountId ? (accountIdMap[r.destinationAccountId] || r.destinationAccountId) : null,
              isDemo: false
            }
          });
        }
      }

      // 3. Copy transactions
      const demoTxs = await tx.transaction.findMany({ where: { isDemo: true } });
      for (const t of demoTxs) {
        const realTxId = `real-${t.id}`;
        const exists = await tx.transaction.findUnique({ where: { id: realTxId } });
        if (!exists) {
          const mappedAccountId = accountIdMap[t.accountId] || t.accountId;
          const mappedDestAccountId = t.destinationAccountId ? (accountIdMap[t.destinationAccountId] || t.destinationAccountId) : null;
          const mappedRuleId = t.ruleId ? `real-${t.ruleId}` : null;

          await tx.transaction.create({
            data: {
              id: realTxId,
              date: t.date,
              description: t.description,
              amount: t.amount,
              type: t.type,
              accountId: mappedAccountId,
              destinationAccountId: mappedDestAccountId,
              scope: t.scope,
              category: t.category,
              subcategory: t.subcategory,
              isAutoMatched: t.isAutoMatched,
              ruleId: mappedRuleId,
              isVerified: t.isVerified,
              isDemo: false,
              notes: t.notes || null,
              customer: t.customer || null,
              invoiceId: t.invoiceId || null
            }
          });
        }
      }
    });
  },

  deleteDemoTransactions: async () => {
    await prisma.$transaction(async (tx) => {
      await tx.transaction.deleteMany({ where: { isDemo: true } });
      await tx.account.updateMany({
        where: { isDemo: true },
        data: { balance: 0 }
      });
      await tx.setting.upsert({
        where: { key: 'demo_transactions_deleted' },
        update: { value: 'true' },
        create: { key: 'demo_transactions_deleted', value: 'true' }
      });
    });
  },

  replaceDatabaseFile: async (tempFilePath: string) => {
    // @ts-ignore
    const Database = (await import('better-sqlite3')).default;
    const tempDb = new Database(tempFilePath);

    try {
      const settings = tempDb.prepare('SELECT * FROM settings').all() as any[];
      const accounts = tempDb.prepare('SELECT * FROM accounts').all() as any[];
      const transactions = tempDb.prepare('SELECT * FROM transactions').all() as any[];
      const rules = tempDb.prepare('SELECT * FROM rules').all() as any[];

      tempDb.close();

      await prisma.$transaction(async (tx) => {
        await tx.transaction.deleteMany();
        await tx.account.deleteMany();
        await tx.rule.deleteMany();
        await tx.setting.deleteMany();

        if (settings.length > 0) {
          await tx.setting.createMany({ data: settings });
        }

        if (accounts.length > 0) {
          await tx.account.createMany({
            data: accounts.map(a => ({
              id: a.id,
              name: a.name,
              type: a.type,
              scope: a.scope,
              balance: a.balance,
              limit: a.limit !== undefined && a.limit !== null ? a.limit : null,
              iban: a.iban || '',
              notes: a.notes || '',
              isDemo: a.isDemo === 1
            }))
          });
        }

        if (rules.length > 0) {
          await tx.rule.createMany({
            data: rules.map(r => ({
              id: r.id,
              name: r.name,
              keyword: r.keyword,
              scope: r.scope,
              category: r.category,
              subcategory: r.subcategory,
              accountId: r.accountId || null,
              destinationAccountId: r.destinationAccountId || null,
              isDemo: r.isDemo === 1
            }))
          });
        }

        if (transactions.length > 0) {
          await tx.transaction.createMany({
            data: transactions.map(t => ({
              id: t.id,
              date: t.date,
              description: t.description,
              amount: t.amount,
              type: t.type,
              accountId: t.accountId,
              destinationAccountId: t.destinationAccountId !== undefined && t.destinationAccountId !== null ? t.destinationAccountId : null,
              scope: t.scope,
              category: t.category,
              subcategory: t.subcategory,
              isAutoMatched: t.isAutoMatched === 1,
              ruleId: t.ruleId !== undefined && t.ruleId !== null ? t.ruleId : null,
              isVerified: t.isVerified === 1,
              isDemo: t.isDemo === 1,
              notes: t.notes || null,
              customer: t.customer || null,
              invoiceId: t.invoiceId || null
            }))
          });
        }
      });
      console.log("Database SQLite backup successfully imported into remote MySQL database!");
    } catch (err) {
      try {
        tempDb.close();
      } catch (_) {}
      throw err;
    }
  }
};
