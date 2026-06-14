/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import crypto from "crypto";

/**
 * Clean and format pasted Private Key to standard RSA PEM format
 */
export function formatPrivateKeyToPEM(key: string): string {
  let cleanKey = key.trim();
  if (!cleanKey) return "";

  // If already standard PEM multiline, return directly
  if (cleanKey.includes("-----BEGIN PRIVATE KEY-----") || cleanKey.includes("-----BEGIN RSA PRIVATE KEY-----")) {
    return cleanKey;
  }

  // If it contains escaped newlines \\n, replace them
  cleanKey = cleanKey.replace(/\\n/g, "\n");
  if (cleanKey.includes("-----BEGIN")) {
    return cleanKey;
  }

  // If it's a raw base64 string, clean whitespaces and format to standard 64-character lines
  const rawBase64 = cleanKey.replace(/\s+/g, "");
  const lines: string[] = [];
  for (let i = 0; i < rawBase64.length; i += 64) {
    lines.push(rawBase64.slice(i, i + 64));
  }

  return `-----BEGIN PRIVATE KEY-----\n${lines.join("\n")}\n-----END PRIVATE KEY-----`;
}

/**
 * Generate RS256 JWT for Enable Banking Client Authentication
 */
export function generateEnableBankingJWT(clientId: string, privateKeyPEM: string, keyId?: string): string {
  const pemKey = formatPrivateKeyToPEM(privateKeyPEM);
  
  const header = {
    alg: "RS256",
    typ: "JWT",
    kid: keyId || clientId
  };

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: clientId,
    aud: "https://api.enablebanking.com/",
    iat: now,
    exp: now + 3600 // Valid for 1 hour
  };

  const base64UrlEncode = (str: string) => {
    return Buffer.from(str)
      .toString("base64")
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
  };

  const headerEncoded = base64UrlEncode(JSON.stringify(header));
  const payloadEncoded = base64UrlEncode(JSON.stringify(payload));
  const input = `${headerEncoded}.${payloadEncoded}`;

  const sign = crypto.createSign("RSA-SHA256");
  sign.update(input);
  const signature = sign.sign(pemKey, "base64");
  const signatureEncoded = signature
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  return `${input}.${signatureEncoded}`;
}

export interface BankAccountData {
  uid: string;
  name: string;
  iban: string;
  balance: number;
}

export interface BankTransactionData {
  id: string;
  date: string;
  description: string;
  amount: number;
}

/**
 * Interact with the Enable Banking REST API
 */
export const EnableBankingService = {
  /**
   * Start authorization flow by creating a session redirection URL
   */
  async createSession(config: { clientId: string; privateKey: string; keyId?: string }, aspsp: string, redirectUrl: string, state: string) {
    const token = generateEnableBankingJWT(config.clientId, config.privateKey, config.keyId);
    
    // Default valid until 90 days from now
    const validUntilDate = new Date();
    validUntilDate.setDate(validUntilDate.getDate() + 90);
    const validUntil = validUntilDate.toISOString().split(".")[0] + "Z"; // YYYY-MM-DDTHH:MM:SSZ

    const response = await fetch("https://api.enablebanking.com/v1/sessions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        aspsp,
        redirect_url: redirectUrl,
        state: state || `state-${Date.now()}`,
        access: {
          valid_until: validUntil,
          balances: {},
          transactions: {}
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to create banking session: ${response.status} - ${errorText}`);
    }

    return await response.json(); // e.g., { session_id: "...", url: "..." }
  },

  /**
   * Finalize session authorization using callback code
   */
  async exchangeCodeForSession(config: { clientId: string; privateKey: string; keyId?: string }, code: string) {
    const token = generateEnableBankingJWT(config.clientId, config.privateKey, config.keyId);

    const response = await fetch("https://api.enablebanking.com/v1/sessions/enable", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ code })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to enable banking authorization: ${response.status} - ${errorText}`);
    }

    return await response.json(); // e.g. { session_id: "...", aspsp: "..." }
  },

  /**
   * Get all active accounts in a session
   */
  async getAccounts(config: { clientId: string; privateKey: string; keyId?: string }, sessionId: string): Promise<BankAccountData[]> {
    const token = generateEnableBankingJWT(config.clientId, config.privateKey, config.keyId);

    const response = await fetch("https://api.enablebanking.com/v1/accounts", {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${token}`,
        "X-Session-ID": sessionId // Ensure Enable Banking links the query to the active session
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to fetch bank accounts: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const accounts = data.accounts || [];

    return accounts.map((acc: any) => {
      // Extract balance magnitude safely
      let balanceAmt = 0;
      if (acc.balances && acc.balances.booked && acc.balances.booked.amount) {
        balanceAmt = parseFloat(String(acc.balances.booked.amount.amount || acc.balances.booked.amount));
      } else if (acc.balances && acc.balances.interimBooked && acc.balances.interimBooked.amount) {
        balanceAmt = parseFloat(String(acc.balances.interimBooked.amount.amount || acc.balances.interimBooked.amount));
      }

      return {
        uid: acc.uid || acc.id || `acc-${Date.now()}`,
        name: acc.name || `Conto Corrente (${acc.iban || acc.uid || "OpenBanking"})`,
        iban: acc.iban || (acc.account_id ? acc.account_id.iban : "") || "",
        balance: isNaN(balanceAmt) ? 0 : balanceAmt
      };
    });
  },

  /**
   * Get transactions for a specific account UID
   */
  async getTransactions(config: { clientId: string; privateKey: string; keyId?: string }, sessionId: string, accountUid: string): Promise<BankTransactionData[]> {
    const token = generateEnableBankingJWT(config.clientId, config.privateKey, config.keyId);

    // Calculate dynamic range: 60 days of transaction history
    const dateTo = new Date();
    const dateFrom = new Date();
    dateFrom.setDate(dateFrom.getDate() - 60);

    const dateToFormatted = dateTo.toISOString().split("T")[0];
    const dateFromFormatted = dateFrom.toISOString().split("T")[0];

    const url = `https://api.enablebanking.com/v1/accounts/${accountUid}/transactions?date_from=${dateFromFormatted}&date_to=${dateToFormatted}`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${token}`,
        "X-Session-ID": sessionId
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to fetch bank transactions for account ${accountUid}: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const txList = data.transactions || [];

    return txList.map((tx: any, index: number) => {
      // Decode amount safely
      let amt = 0;
      if (tx.transaction_amount && tx.transaction_amount.amount) {
        amt = parseFloat(String(tx.transaction_amount.amount));
      } else if (tx.amount) {
        amt = parseFloat(String(tx.amount));
      }

      // Convert date
      const dateVal = tx.booking_date || tx.entry_date || tx.value_date || new Date().toISOString().split("T")[0];

      return {
        id: tx.uid || tx.id || `tx-sync-${accountUid}-${index}-${Date.now()}`,
        date: dateVal,
        description: tx.description || tx.remittance_information_unstructured || "Movimento Bancario",
        amount: isNaN(amt) ? 0 : amt
      };
    });
  }
};
