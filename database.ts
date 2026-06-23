/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// Define DB path in the project root
const dbPath = path.resolve(process.cwd(), 'database.db');
export let db = new Database(dbPath);

// Enable Foreign Key support
db.pragma('foreign_keys = ON');

// Initialize schema
export function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      scope TEXT NOT NULL,
      balance REAL NOT NULL,
      "limit" REAL,
      iban TEXT,
      notes TEXT,
      isDemo INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      type TEXT NOT NULL,
      accountId TEXT NOT NULL,
      destinationAccountId TEXT,
      scope TEXT NOT NULL,
      category TEXT NOT NULL,
      subcategory TEXT NOT NULL,
      isAutoMatched INTEGER DEFAULT 0,
      ruleId TEXT,
      isVerified INTEGER DEFAULT 0,
      isDemo INTEGER DEFAULT 0,
      linkedTransactionId TEXT,
      notes TEXT,
      customer TEXT,
      invoiceId TEXT,
      FOREIGN KEY(accountId) REFERENCES accounts(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS rules (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      keyword TEXT NOT NULL,
      scope TEXT NOT NULL,
      category TEXT NOT NULL,
      subcategory TEXT NOT NULL,
      accountId TEXT,
      destinationAccountId TEXT,
      isDemo INTEGER DEFAULT 0
    );
  `);

  // Safe migrations to support isDemo column for older schemas
  try {
    db.exec("ALTER TABLE accounts ADD COLUMN isDemo INTEGER DEFAULT 0");
  } catch (e) {}
  try {
    db.exec("ALTER TABLE transactions ADD COLUMN isDemo INTEGER DEFAULT 0");
  } catch (e) {}
  try {
    db.exec("ALTER TABLE transactions ADD COLUMN linkedTransactionId TEXT");
  } catch (e) {}
  try {
    db.exec("ALTER TABLE transactions ADD COLUMN notes TEXT");
  } catch (e) {}
  try {
    db.exec("ALTER TABLE transactions ADD COLUMN customer TEXT");
  } catch (e) {}
  try {
    db.exec("ALTER TABLE transactions ADD COLUMN invoiceId TEXT");
  } catch (e) {}
  try {
    db.exec("ALTER TABLE rules ADD COLUMN isDemo INTEGER DEFAULT 0");
  } catch (e) {}
  try {
    db.exec("ALTER TABLE rules ADD COLUMN accountId TEXT");
  } catch (e) {}
  try {
    db.exec("ALTER TABLE rules ADD COLUMN destinationAccountId TEXT");
  } catch (e) {}

  // Update existing default records to be marked as Demo if they were initialized previously
  try {
    db.exec(`
      UPDATE accounts SET isDemo = 1 WHERE id IN ('acc-1', 'acc-2', 'acc-3', 'acc-4');
      UPDATE transactions SET isDemo = 1 WHERE id IN ('tx-1', 'tx-2', 'tx-3', 'tx-4', 'tx-5', 'tx-6', 'tx-7', 'tx-8', 'tx-9');
      UPDATE rules SET isDemo = 1 WHERE id IN ('rule-1', 'rule-2', 'rule-3', 'rule-4');
    `);
  } catch (e) {}

  // Seed default settings if empty
  const hasSettings = db.prepare('SELECT count(*) as count FROM settings').get() as { count: number };
  if (hasSettings.count === 0) {
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('taxpayer_name', 'Domenico Pellegrino');
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('taxpayer_cf', 'PLLDNC60B14A494R');
  }

  // Seed default accounts if empty
  const hasAccounts = db.prepare('SELECT count(*) as count FROM accounts').get() as { count: number };
  if (hasAccounts.count === 0) {
    const insertAcc = db.prepare(`
      INSERT INTO accounts (id, name, type, scope, balance, "limit", iban, notes, isDemo)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
    `);
    
    const initialAccounts = [
      { id: 'acc-1', name: 'Conto Corrente Unicredit', type: 'checking', scope: 'mixed', balance: 14500, iban: 'IT76C0200805000000123456789', notes: '' },
      { id: 'acc-2', name: 'Carta di Credito AMEX Oro', type: 'credit_card', scope: 'mixed', balance: -850, limit: 3000, iban: '', notes: '' },
      { id: 'acc-3', name: 'Cassa Contanti (Cash)', type: 'cash', scope: 'personal', balance: 340, limit: null, iban: '', notes: '' },
      { id: 'acc-4', name: 'Finanziamento Auto (Compass)', type: 'financing', scope: 'personal', balance: -7200, limit: 12000, notes: 'Rata mensile di 250 € - Tasso 4.5%' }
    ];

    for (const a of initialAccounts) {
      insertAcc.run(a.id, a.name, a.type, a.scope, a.balance, a.limit !== undefined && a.limit !== null ? a.limit : null, a.iban || '', a.notes || '');
    }
  }

  // Seed default transactions if empty
  const isCleared = db.prepare("SELECT value FROM settings WHERE key = 'transactions_cleared'").get() as { value: string } | undefined;
  const isDemoDeleted = db.prepare("SELECT value FROM settings WHERE key = 'demo_transactions_deleted'").get() as { value: string } | undefined;
  const hasTransactions = db.prepare('SELECT count(*) as count FROM transactions').get() as { count: number };
  if (hasTransactions.count === 0 && (!isCleared || isCleared.value !== 'true') && (!isDemoDeleted || isDemoDeleted.value !== 'true')) {
    const insertTx = db.prepare(`
      INSERT INTO transactions (id, date, description, amount, type, accountId, destinationAccountId, scope, category, subcategory, isAutoMatched, ruleId, isVerified, isDemo)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `);

    const initialTransactions = [
      { id: 'tx-1', date: '2026-05-18', description: 'BONIFICO SEPA DA CLIENTE INCOMING ACME CORPORATION SRL FATTURA 14', amount: 3200, type: 'income', accountId: 'acc-1', destinationAccountId: null, scope: 'professional', category: 'entrate_lavoro', subcategory: 'Consulenza', isAutoMatched: 0, ruleId: null, isVerified: 0 },
      { id: 'tx-2', date: '2026-05-17', description: 'ADDEBITO DIRETTO ENEL ENERGIA SPA - UTENZE STUDIO', amount: -185.40, type: 'expense', accountId: 'acc-1', destinationAccountId: null, scope: 'professional', category: 'necessarie_lavoro', subcategory: 'Utenze', isAutoMatched: 0, ruleId: null, isVerified: 0 },
      { id: 'tx-3', date: '2026-05-16', description: 'CONAD SUPERMERCATO BOLOGNA SPESA SETTIMANALE', amount: -65.20, type: 'expense', accountId: 'acc-1', destinationAccountId: null, scope: 'personal', category: 'necessarie', subcategory: 'Alimentari', isAutoMatched: 0, ruleId: null, isVerified: 0 },
      { id: 'tx-4', date: '2026-05-15', description: 'RATA MENSILE FINANZIAMENTO COMPASS AUTO', amount: -250.00, type: 'expense', accountId: 'acc-1', destinationAccountId: null, scope: 'personal', category: 'necessarie', subcategory: 'Finanziamento', isAutoMatched: 0, ruleId: null, isVerified: 0 },
      { id: 'tx-5', date: '2026-05-14', description: 'FATTURA N. 9 DEL COMMERCIALISTA STUDIO ROSSI & ASSOCIAZIONI', amount: -350.00, type: 'expense', accountId: 'acc-1', destinationAccountId: null, scope: 'professional', category: 'necessarie_lavoro', subcategory: 'Commercialista', isAutoMatched: 0, ruleId: null, isVerified: 0 },
      { id: 'tx-6', date: '2026-05-12', description: 'CENA RISTORANTE CARLO CRACCO MILANO', amount: -180.00, type: 'expense', accountId: 'acc-2', destinationAccountId: null, scope: 'personal', category: 'tempo_libero', subcategory: 'Ristoranti', isAutoMatched: 0, ruleId: null, isVerified: 0 },
      { id: 'tx-7', date: '2026-05-10', description: 'ACQUISTO LICENZA INTEGRALE JETBRAINS RIDER & WEBSTORM', amount: -150.00, type: 'expense', accountId: 'acc-2', destinationAccountId: null, scope: 'professional', category: 'utili_lavoro', subcategory: 'Software & Cloud', isAutoMatched: 0, ruleId: null, isVerified: 0 },
      { id: 'tx-8', date: '2026-05-09', description: 'PRELIEVO CONTANTE BANCOMAT MILANO DUOMO', amount: -100.00, type: 'expense', accountId: 'acc-1', destinationAccountId: null, scope: 'personal', category: 'trasferimento', subcategory: 'Prelievo', isAutoMatched: 0, ruleId: null, isVerified: 0 },
      { id: 'tx-9', date: '2026-05-09', description: 'DEPOSITO PRELIEVO CONTANTE BANCOMAT MILANO DUOMO', amount: 100.00, type: 'income', accountId: 'acc-3', destinationAccountId: null, scope: 'personal', category: 'trasferimento', subcategory: 'Prelievo', isAutoMatched: 0, ruleId: null, isVerified: 0 }
    ];

    for (const t of initialTransactions) {
      insertTx.run(t.id, t.date, t.description, t.amount, t.type, t.accountId, t.destinationAccountId, t.scope, t.category, t.subcategory, t.isAutoMatched, t.ruleId, t.isVerified);
    }
  }

  // Seed default rules if empty
  const hasRules = db.prepare('SELECT count(*) as count FROM rules').get() as { count: number };
  if (hasRules.count === 0) {
    const insertRule = db.prepare(`
      INSERT INTO rules (id, name, keyword, scope, category, subcategory, isDemo)
      VALUES (?, ?, ?, ?, ?, ?, 1)
    `);

    const initialRules = [
      { id: 'rule-1', name: 'Spesa Conad', keyword: 'CONAD', scope: 'personal', category: 'necessarie', subcategory: 'Alimentari' },
      { id: 'rule-2', name: 'Bolletta Enel Studio', keyword: 'ENEL ENERGIA', scope: 'professional', category: 'necessarie_lavoro', subcategory: 'Utenze' },
      { id: 'rule-3', name: 'Rata Compass', keyword: 'COMPASS', scope: 'personal', category: 'necessarie', subcategory: 'Finanziamento' },
      { id: 'rule-4', name: 'Licenze Software Professionali', keyword: 'JETBRAINS', scope: 'professional', category: 'utili_lavoro', subcategory: 'Software & Cloud' }
    ];

    for (const r of initialRules) {
      insertRule.run(r.id, r.name, r.keyword, r.scope, r.category, r.subcategory);
    }
  }
}

// Convert SQLite integers (0/1) to real booleans (false/true)
function mapSqlRowToModel(row: any) {
  if (!row) return row;
  return {
    ...row,
    isDemo: row.isDemo === 1,
    isAutoMatched: row.isAutoMatched === 1,
    isVerified: row.isVerified === 1
  };
}

export const dbOps = {
  // Settings
  getSetting: (key: string): string | null => {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
    return row ? row.value : null;
  },
  setSetting: (key: string, value: string) => {
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
  },

  // Accounts
  getAccounts: () => {
    const rows = db.prepare('SELECT * FROM accounts').all();
    return rows.map(mapSqlRowToModel);
  },
  addAccount: (acc: any) => {
    db.prepare(`
      INSERT INTO accounts (id, name, type, scope, balance, "limit", iban, notes, isDemo)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      acc.id, 
      acc.name, 
      acc.type, 
      acc.scope, 
      acc.balance, 
      acc.limit !== undefined && acc.limit !== null ? acc.limit : null, 
      acc.iban || '', 
      acc.notes || '',
      acc.isDemo ? 1 : 0
    );
  },
  updateAccount: (id: string, acc: any) => {
    db.prepare(`
      UPDATE accounts 
      SET name = ?, type = ?, scope = ?, balance = ?, "limit" = ?, iban = ?, notes = ?, isDemo = ?
      WHERE id = ?
    `).run(
      acc.name, 
      acc.type, 
      acc.scope, 
      acc.balance, 
      acc.limit !== undefined && acc.limit !== null ? acc.limit : null, 
      acc.iban || '', 
      acc.notes || '', 
      acc.isDemo ? 1 : 0,
      id
    );
  },
  deleteAccount: (id: string) => {
    db.prepare('DELETE FROM accounts WHERE id = ?').run(id);
  },

  // Transactions
  getTransactions: () => {
    const rows = db.prepare('SELECT * FROM transactions ORDER BY date DESC, id DESC').all();
    return rows.map(mapSqlRowToModel);
  },
  addTransaction: (tx: any) => {
    db.prepare(`
      INSERT INTO transactions (id, date, description, amount, type, accountId, destinationAccountId, scope, category, subcategory, isAutoMatched, ruleId, isVerified, isDemo, linkedTransactionId, notes, customer, invoiceId)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      tx.id, 
      tx.date, 
      tx.description, 
      tx.amount, 
      tx.type, 
      tx.accountId, 
      tx.destinationAccountId !== undefined && tx.destinationAccountId !== null ? tx.destinationAccountId : null, 
      tx.scope, 
      tx.category, 
      tx.subcategory, 
      tx.isAutoMatched ? 1 : 0, 
      tx.ruleId !== undefined && tx.ruleId !== null ? tx.ruleId : null, 
      tx.isVerified ? 1 : 0,
      tx.isDemo ? 1 : 0,
      tx.linkedTransactionId !== undefined && tx.linkedTransactionId !== null ? tx.linkedTransactionId : null,
      tx.notes !== undefined && tx.notes !== null ? tx.notes : null,
      tx.customer !== undefined && tx.customer !== null ? tx.customer : null,
      tx.invoiceId !== undefined && tx.invoiceId !== null ? tx.invoiceId : null
    );
  },
  updateTransaction: (id: string, tx: any) => {
    db.prepare(`
      UPDATE transactions 
      SET date = ?, description = ?, amount = ?, type = ?, accountId = ?, destinationAccountId = ?, scope = ?, category = ?, subcategory = ?, isAutoMatched = ?, ruleId = ?, isVerified = ?, isDemo = ?, linkedTransactionId = ?, notes = ?, customer = ?, invoiceId = ?
      WHERE id = ?
    `).run(
      tx.date, 
      tx.description, 
      tx.amount, 
      tx.type, 
      tx.accountId, 
      tx.destinationAccountId !== undefined && tx.destinationAccountId !== null ? tx.destinationAccountId : null, 
      tx.scope, 
      tx.category, 
      tx.subcategory, 
      tx.isAutoMatched ? 1 : 0, 
      tx.ruleId !== undefined && tx.ruleId !== null ? tx.ruleId : null, 
      tx.isVerified ? 1 : 0,
      tx.isDemo ? 1 : 0,
      tx.linkedTransactionId !== undefined && tx.linkedTransactionId !== null ? tx.linkedTransactionId : null,
      tx.notes !== undefined && tx.notes !== null ? tx.notes : null,
      tx.customer !== undefined && tx.customer !== null ? tx.customer : null,
      tx.invoiceId !== undefined && tx.invoiceId !== null ? tx.invoiceId : null,
      id
    );
  },
  deleteTransaction: (id: string) => {
    db.prepare('DELETE FROM transactions WHERE id = ?').run(id);
  },

  // Rules
  getRules: () => {
    const rows = db.prepare('SELECT * FROM rules').all();
    return rows.map(mapSqlRowToModel);
  },
  addRule: (rule: any) => {
    db.prepare(`
      INSERT INTO rules (id, name, keyword, scope, category, subcategory, accountId, destinationAccountId, isDemo)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      rule.id,
      rule.name,
      rule.keyword,
      rule.scope,
      rule.category,
      rule.subcategory,
      rule.accountId || null,
      rule.destinationAccountId || null,
      rule.isDemo ? 1 : 0
    );
  },
  updateRule: (id: string, rule: any) => {
    db.prepare(`
      UPDATE rules
      SET name = ?, keyword = ?, scope = ?, category = ?, subcategory = ?, accountId = ?, destinationAccountId = ?, isDemo = ?
      WHERE id = ?
    `).run(
      rule.name,
      rule.keyword,
      rule.scope,
      rule.category,
      rule.subcategory,
      rule.accountId || null,
      rule.destinationAccountId || null,
      rule.isDemo ? 1 : 0,
      id
    );
  },
  deleteRule: (id: string) => {
    db.prepare('DELETE FROM rules WHERE id = ?').run(id);
  },

  // Reset helper
  clearAllTransactions: () => {
    db.prepare('DELETE FROM transactions WHERE isDemo = 0').run();
    db.prepare('UPDATE accounts SET balance = 0 WHERE isDemo = 0').run();
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('transactions_cleared', 'true')").run();
  },

  resetAllDb: () => {
    db.prepare('DELETE FROM transactions').run();
    db.prepare('DELETE FROM accounts').run();
    db.prepare('DELETE FROM rules').run();
    db.prepare('DELETE FROM settings').run();
  },

  getAllSettings: () => {
    return db.prepare('SELECT * FROM settings').all();
  },

  importAllData: (data: { accounts: any[]; transactions: any[]; rules: any[]; settings?: { key: string; value: string }[] }) => {
    const transaction = db.transaction(() => {
      // Clear all
      db.prepare('DELETE FROM transactions').run();
      db.prepare('DELETE FROM accounts').run();
      db.prepare('DELETE FROM rules').run();
      db.prepare('DELETE FROM settings').run();

      // Insert Settings
      if (data.settings && Array.isArray(data.settings)) {
        const insertSetting = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)');
        for (const s of data.settings) {
          insertSetting.run(s.key, s.value);
        }
      }

      // Insert Accounts
      if (data.accounts && Array.isArray(data.accounts)) {
        const insertAcc = db.prepare(`
          INSERT INTO accounts (id, name, type, scope, balance, "limit", iban, notes, isDemo)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const a of data.accounts) {
          insertAcc.run(a.id, a.name, a.type, a.scope, a.balance, a.limit !== undefined && a.limit !== null ? a.limit : null, a.iban || '', a.notes || '', a.isDemo ? 1 : 0);
        }
      }

      // Insert Rules
      if (data.rules && Array.isArray(data.rules)) {
        const insertRule = db.prepare(`
          INSERT INTO rules (id, name, keyword, scope, category, subcategory, isDemo)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        for (const r of data.rules) {
          insertRule.run(r.id, r.name, r.keyword, r.scope, r.category, r.subcategory, r.isDemo ? 1 : 0);
        }
      }

      // Insert Transactions
      if (data.transactions && Array.isArray(data.transactions)) {
        const insertTx = db.prepare(`
          INSERT INTO transactions (id, date, description, amount, type, accountId, destinationAccountId, scope, category, subcategory, isAutoMatched, ruleId, isVerified, isDemo, notes, customer, invoiceId)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const t of data.transactions) {
          insertTx.run(
            t.id, 
            t.date, 
            t.description, 
            t.amount, 
            t.type, 
            t.accountId, 
            t.destinationAccountId !== undefined && t.destinationAccountId !== null ? t.destinationAccountId : null, 
            t.scope, 
            t.category, 
            t.subcategory, 
            t.isAutoMatched ? 1 : 0, 
            t.ruleId !== undefined && t.ruleId !== null ? t.ruleId : null, 
            t.isVerified ? 1 : 0,
            t.isDemo ? 1 : 0,
            t.notes || null,
            t.customer || null,
            t.invoiceId || null
          );
        }
      }
    });
    transaction();
  },

  copyDemoToReal: () => {
    const transaction = db.transaction(() => {
      // 1. Get all demo accounts
      const demoAccounts = db.prepare('SELECT * FROM accounts WHERE isDemo = 1').all() as any[];
      const accountIdMap: Record<string, string> = {};
      
      const insertAcc = db.prepare(`
        INSERT INTO accounts (id, name, type, scope, balance, "limit", iban, notes, isDemo)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
      `);
      
      for (const a of demoAccounts) {
        const realId = `real-${a.id}`;
        accountIdMap[a.id] = realId;
        
        const exists = db.prepare('SELECT 1 FROM accounts WHERE id = ?').get(realId);
        if (!exists) {
          insertAcc.run(
            realId,
            a.name,
            a.type,
            a.scope,
            a.balance,
            a.limit !== undefined && a.limit !== null ? a.limit : null,
            a.iban || '',
            a.notes || ''
          );
        }
      }

      // 2. Clear then copy rules
      const demoRules = db.prepare('SELECT * FROM rules WHERE isDemo = 1').all() as any[];
      const insertRule = db.prepare(`
        INSERT INTO rules (id, name, keyword, scope, category, subcategory, isDemo)
        VALUES (?, ?, ?, ?, ?, ?, 0)
      `);
      for (const r of demoRules) {
        const realRuleId = `real-${r.id}`;
        const exists = db.prepare('SELECT 1 FROM rules WHERE id = ?').get(realRuleId);
        if (!exists) {
          insertRule.run(
            realRuleId,
            r.name,
            r.keyword,
            r.scope,
            r.category,
            r.subcategory
          );
        }
      }

      // 3. Copy transactions
      const demoTxs = db.prepare('SELECT * FROM transactions WHERE isDemo = 1').all() as any[];
      const insertTx = db.prepare(`
        INSERT INTO transactions (id, date, description, amount, type, accountId, destinationAccountId, scope, category, subcategory, isAutoMatched, ruleId, isVerified, isDemo, notes, customer, invoiceId)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
      `);
      
      for (const t of demoTxs) {
        const realTxId = `real-${t.id}`;
        const exists = db.prepare('SELECT 1 FROM transactions WHERE id = ?').get(realTxId);
        if (!exists) {
          const mappedAccountId = accountIdMap[t.accountId] || t.accountId;
          const mappedDestAccountId = t.destinationAccountId ? (accountIdMap[t.destinationAccountId] || t.destinationAccountId) : null;
          const mappedRuleId = t.ruleId ? `real-${t.ruleId}` : null;
          
          insertTx.run(
            realTxId,
            t.date,
            t.description,
            t.amount,
            t.type,
            mappedAccountId,
            mappedDestAccountId,
            t.scope,
            t.category,
            t.subcategory,
            t.isAutoMatched ? 1 : 0,
            mappedRuleId,
            t.isVerified ? 1 : 0,
            t.notes || null,
            t.customer || null,
            t.invoiceId || null
          );
        }
      }
    });
    transaction();
  },

  deleteDemoTransactions: () => {
    const transaction = db.transaction(() => {
      db.prepare('DELETE FROM transactions WHERE isDemo = 1').run();
      db.prepare('UPDATE accounts SET balance = 0 WHERE isDemo = 1').run();
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('demo_transactions_deleted', 'true')").run();
    });
    transaction();
  },

  replaceDatabaseFile: (tempFilePath: string) => {
    db.close();
    fs.copyFileSync(tempFilePath, dbPath);
    db = new Database(dbPath);
    db.pragma('foreign_keys = ON');
    console.log("Database file replaced and re-initialized successfully.");
  }
};
