/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import { initDb, dbOps } from "./database";
import { EnableBankingService } from "./bankService";
import AdmZip from "adm-zip";

dotenv.config();

// Initialize MySQL database (async)
initDb().then(() => {
  console.log("Database initialized successfully!");
}).catch(err => {
  console.error("Database initialization failed:", err);
});

const app = express();
app.use(express.json({ limit: '10mb' }));

const PORT = 3000;

// Initialize Gemini SDK with telemetry header
function getGeminiClient(): GoogleGenAI | null {
  try {
    // Dynamic config reload to pick up changes made by web installer.php on production domains
    dotenv.config({ override: true });
    
    const key = process.env.GEMINI_API_KEY;
    if (!key || key.trim() === "" || key === "MY_GEMINI_API_KEY" || key === "YOUR_GEMINI_API_KEY") {
      return null;
    }
    
    return new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  } catch (err) {
    console.error("Error creating Gemini client dynamically:", err);
    return null;
  }
}

// API endpoint for AI Auto-Categorization and rule suggestions using Gemini
app.post("/api/categorize", async (req, res) => {
  const { transactions } = req.body;

  if (!transactions || !Array.isArray(transactions)) {
    return res.status(400).json({ error: "Dati delle transazioni mancanti o non validi." });
  }

  const aiClient = getGeminiClient();
  if (!aiClient) {
    return res.status(200).json({
      fallback: true,
      message: "Chiave API Gemini non trovata. Verrà utilizzato il motore di regole regex locale."
    });
  }

  try {
    const prompt = `Sei un consulente finanziario esperto per l'Italia, specializzato sia in budget personale che in contabilità per professionisti in Regime Forfettario con Partita IVA.
Analizza la seguente lista di transazioni bancarie (con data, descrizione originale e importo in euro. Un importo negativo indica una spesa, positivo un'entrata).
Per ciascuna transazione, determina:
1. Lo scopo (scope): 'personal' o 'professional'.
2. La categoria (category):
   - Per 'personal': 'necessarie' (es. affitto casa, bollette private, spesa alimentare di base), 'utili' (es. trasporti privati, abbonamenti utili), o 'tempo_libero' (es. ristoranti, cinema, regali, sport). Se è un'entrata personale, usa 'entrate'.
   - Per 'professional': 'necessarie_lavoro' (es. tasse, contributi previdenziali, software di lavoro indispensabili, commercialista, affitto ufficio) o 'utili_lavoro' (es. dispositivi, libri, corsi, promozioni, abbonamenti internet studio). Se è un'entrata di lavoro, usa 'entrate_lavoro'.
3. Una sottocategoria appropriata (es. 'Alimentari', 'Bollette', 'Fristorazione', 'Tasse', 'Fattura Cliente', 'Trasporti').
4. Un titolo pulito e leggibile (cleanTitle) per rimpiazzare la descrizione farraginosa della banca.
5. Se trovi pattern ricorrenti (es. CONAD, ENEL, INPS, CLIENTE XYZ), suggerisci una regola automatica riutilizzabile contenente la parola chiave identificata, lo scopo, la categoria e la sottocategoria consigliata.

Fornisci la risposta strettamente in formato JSON, con la struttura definita nel seguente schema.

Transazioni da analizzare:
${JSON.stringify(transactions, null, 2)}
`;

    const response = await aiClient.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          required: ["categorizedTransactions"],
          properties: {
            categorizedTransactions: {
              type: Type.ARRAY,
              description: "Elenco delle transazioni categorizzate",
              items: {
                type: Type.OBJECT,
                required: ["id", "scope", "category", "subcategory", "cleanTitle"],
                properties: {
                  id: { type: Type.STRING, description: "ID originale della transazione inviata" },
                  scope: { type: Type.STRING, description: "Valore 'personal' o 'professional'" },
                  category: { type: Type.STRING, description: "Valore tra: necessarie, utili, tempo_libero, entrate, necessarie_lavoro, utili_lavoro, entrate_lavoro" },
                  subcategory: { type: Type.STRING, description: "Sottocategoria descrittiva, es. Alimentari, Software, Abbonamenti, etc." },
                  cleanTitle: { type: Type.STRING, description: "Titolo utente pulito per la transazione" }
                }
              }
            },
            suggestedRules: {
              type: Type.ARRAY,
              description: "Regole automatiche suggerite basate sui pattern ricorrenti trovati",
              items: {
                type: Type.OBJECT,
                required: ["name", "keyword", "scope", "category", "subcategory"],
                properties: {
                  name: { type: Type.STRING, description: "Nome della regola, es: Spesa settimanale Conad" },
                  keyword: { type: Type.STRING, description: "Parola chiave da abbinare nella descrizione banca, es: CONAD" },
                  scope: { type: Type.STRING, description: "Valore 'personal' o 'professional'" },
                  category: { type: Type.STRING, description: "Categoria di destinazione" },
                  subcategory: { type: Type.STRING, description: "Sottocategoria di destinazione" }
                }
              }
            }
          }
        }
      }
    });

    const resultText = response.text || "{}";
    res.json(JSON.parse(resultText));
  } catch (error: any) {
    console.error("Gemini API Error:", error);
    res.status(500).json({ error: "Errore durante la categorizzazione tramite Intelligenza Artificiale." });
  }
});

// API endpoint for AI financial advisor and strategic planning
app.post("/api/daily-strategy", async (req, res) => {
  const { transactions, accounts, taxpayerName } = req.body;

  const aiClient = getGeminiClient();
  if (!aiClient) {
    return res.status(200).json({
      fallback: true,
      message: "Chiave API Gemini non trovata. Verrà utilizzata l'analisi geopolitica ed euristica pianificata in locale."
    });
  }

  try {
    const totalBalance = (accounts || []).reduce((acc: number, curr: any) => acc + curr.balance, 0);
    const personalTxs = (transactions || []).filter((t: any) => t.scope === 'personal');
    const professionalTxs = (transactions || []).filter((t: any) => t.scope === 'professional');

    const personalExpenses = personalTxs.filter((t: any) => t.type === 'expense').reduce((acc: number, t: any) => acc + Math.abs(t.amount), 0);
    const personalIncomes = personalTxs.filter((t: any) => t.type === 'income').reduce((acc: number, t: any) => acc + t.amount, 0);

    const professionalExpenses = professionalTxs.filter((t: any) => t.type === 'expense').reduce((acc: number, t: any) => acc + Math.abs(t.amount), 0);
    const professionalIncomes = professionalTxs.filter((t: any) => t.type === 'income').reduce((acc: number, t: any) => acc + t.amount, 0);

    const unverifiedCount = (transactions || []).filter((t: any) => !t.isVerified).length;

    const dataSnapshot = {
      taxpayerName: taxpayerName || "Domenico Pellegrino",
      totalBankAccountsValue: totalBalance,
      accounts: accounts || [],
      personalStats: {
        totalExpenses: personalExpenses,
        totalIncomes: personalIncomes,
        netBalance: personalIncomes - personalExpenses,
        transactionCount: personalTxs.length
      },
      professionalStats: {
        totalExpenses: professionalExpenses,
        totalIncomes: professionalIncomes,
        netBalance: professionalIncomes - professionalExpenses,
        transactionCount: professionalTxs.length
      },
      unverifiedTransactionsCount: unverifiedCount,
      recentTransactions: (transactions || []).slice(0, 15) // send recent transactions for context
    };

    const prompt = `Sei l'Assistente virtuale e Advisor Strategico di ContoSmart, esperto in saggia gestione economica familiare (ambito personale) e regime ditta individuale/professionisti con P.IVA (ambito professionale) in Italia.
Analizza accuratamente la seguente istantanea dei dati finanziari di ${dataSnapshot.taxpayerName}:

Consistenza Conti: ${JSON.stringify(dataSnapshot.accounts, null, 2)}
Lette ${dataSnapshot.personalStats.transactionCount} transazioni personali (Entrate Totali: €${dataSnapshot.personalStats.totalIncomes}, Spese Totali: €${dataSnapshot.personalStats.totalExpenses})
Lette ${dataSnapshot.professionalStats.transactionCount} transazioni ditta/P.IVA (Entrate Totali: €${dataSnapshot.professionalStats.totalIncomes}, Spese Totali: €${dataSnapshot.professionalStats.totalExpenses})
Ci sono ben ${dataSnapshot.unverifiedTransactionsCount} transazioni sprovviste di conferma spunta di verifica con l'estratto conto della banca.

recenti transazioni per contesto:
${JSON.stringify(dataSnapshot.recentTransactions, null, 2)}

Genera un report giornaliero personalizzato e motivante, diviso in blocchi visivi chiari.
Suddividi la risposta esattamente con le seguenti sezioni in italiano, usando titoli markdown chiari ('### Title'):

### 📊 1. ANDAMENTO DEL GIORNO & SALUTE FINANZIARIA (Festa o Lavoro)
- Analizza la liquidità complessiva (€${totalBalance}) e il bilancio netto della famiglia vs professionale.
- Offri un giudizio rapido, motivante e utile sullo stato attuale di salute dei conti dell'utente.

### 🏡 2. STRATEGIA GESTIONE FAMILIARE ('personal')
- Esamina le classi di spesa: necessarie vs utili vs tempo libero.
- Fornisci linee guida pratiche per contenere eventuali esborsi superflui del tempo libero nel breve termine, oppure per ottimizzare le spese fisse (es: utenze, assicurazione, carrello spesa).

### 💼 3. STRATEGIA PARTITA IVA & FISCO ('professional')
- Analizza le entrate lavorative (fatturato P.IVA) e i costi correlati.
- Fornisci raccomandazioni per gli accantonamenti futuri (es. tasse sostitutive al 5% o 15% del regime forfettario e contributi INPS Gestione Separata o Cassa Professionale).
- Suggerisci investimenti utili e deducibili/inerenti (formazione, upgrade di attrezzature, abbonamenti strategici) per ottimizzare l'attività.

### 🔍 4. QUADRATURA DEI CONTI (Spunta di Verifica)
- Rimprovera bonariamente o incentiva l'utente specificatamente in merito alle sue ${unverifiedCount} transazioni non verificate. Spiega perché la "Spunta di Verifica" quotidiana è lo scudo fondamentale contro dimenticanze, truffe ed errori di addebito della banca.

Sii estremamente originale, evita formulazioni generiche sul budget. Parla di scadenze reali (es: acconti INPS, acconto tasse di Novembre o saldo di Giugno), consiglia buone pratiche italiane e mantieni un tono coinvolgente.`;

    const response = await aiClient.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        systemInstruction: "Sei un consulente finanziario professionista specializzato in ditte individuali e budget familiare italiano.",
        temperature: 0.75,
      }
    });

    res.json({
      text: response.text || "Non è stato possibile ottenere una risposta corretta dal modello.",
      fallback: false
    });
  } catch (error: any) {
    console.error("Advisor error:", error);
    res.status(500).json({ error: "Errore interno durante il reperimento dell'advisor finanziario." });
  }
});

// New AI Chat Endpoint for conversational advisor with Domenico Pellegrino (retiring Sept 2027)
app.post("/api/ai-chat", async (req, res) => {
  const { message, history, transactions, accounts } = req.body;

  if (!message) {
    return res.status(400).json({ error: "Messaggio utente mancante." });
  }

  const aiClient = getGeminiClient();
  if (!aiClient) {
    return res.status(200).json({
      text: "La chiave API Gemini non è stata configurata in 'Impostazioni > Segreti'. Contatta l'amministratore per attivare la chat in tempo reale.",
      fallback: true
    });
  }

  try {
    // 1. Calculate financial snapshot for precise context
    const totalBalance = (accounts || []).reduce((sum: number, a: any) => sum + a.balance, 0);
    const personalTxs = (transactions || []).filter((t: any) => t.scope === 'personal');
    const professionalTxs = (transactions || []).filter((t: any) => t.scope === 'professional');

    let necessaryExpenses = 0;
    let usefulExpenses = 0;
    let extraExpenses = 0;

    for (const t of personalTxs) {
      if (t.type !== 'expense' && t.type !== 'transfer') continue;
      const amt = Math.abs(t.amount);
      const desc = (t.description || '').toLowerCase();
      const sub = (t.subcategory || '').toLowerCase();
      const cat = (t.category || '').toLowerCase();

      // Giroconti (Transfers or subcategory 'Giroconto' or containing giroconto)
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
        sub.includes('condominio');

      if (isGiroconto || isBolletteHousing) {
        necessaryExpenses += amt;
        continue;
      }

      // Spese utili: supermercati, alimenti, farmacia/medicine, medico, assicurazioni, carburante, manutenzione
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
        usefulExpenses += amt;
      } else {
        extraExpenses += amt;
      }
    }

    const professionalNecessary = professionalTxs.filter((t: any) => t.type === 'expense' && t.category === 'necessarie_lavoro')
      .reduce((sum: number, t: any) => sum + Math.abs(t.amount), 0);
    const professionalUseful = professionalTxs.filter((t: any) => t.type === 'expense' && t.category === 'utili_lavoro')
      .reduce((sum: number, t: any) => sum + Math.abs(t.amount), 0);
    const totalWorkingExpenses = professionalNecessary + professionalUseful;

    const teachingIncomes = personalTxs.filter((t: any) => {
      if (t.type !== 'income' || t.category === 'trasferimento' || t.accountId === 'acc-3') return false;
      const descLower = t.description.toLowerCase();
      return descLower.includes("ministero") || descLower.includes("istruzione");
    }).reduce((sum: number, t: any) => sum + t.amount, 0);

    const otherPersonalIncomes = personalTxs.filter((t: any) => {
      if (t.type !== 'income' || t.category === 'trasferimento' || t.accountId === 'acc-3') return false;
      const descLower = t.description.toLowerCase();
      if (descLower.includes("ministero") || descLower.includes("istruzione")) return false;
      return true;
    }).reduce((sum: number, t: any) => sum + t.amount, 0);

    const professionalRevenues = professionalTxs.filter((t: any) => t.type === 'income').reduce((sum: number, t: any) => sum + t.amount, 0);

    // Active Debts: lines with negative accounts balances sum up
    const activeDebtsList = (accounts || []).filter((a: any) => a.balance < 0);
    const totalOutstandingDebt = Math.abs(activeDebtsList.reduce((sum: number, a: any) => sum + a.balance, 0));

    const financialProfileStr = `
PROFILO FINANZIARIO CORRENTE:
- Denominazione Utente: Domenico Pellegrino, 66 anni.
- Orizzonte Pensionamento: Settembre 2027 (Pensione tra poco più di 1 anno).
- Attività Personale Principale: Docente d'Insegnamento Scuola (Contratto scade il 30 Giugno 2026, necessita di NASPI per Luglio-Agosto, prima della pensione finale).
- Attività Professionale Partita IVA: Ditta Individuale in Regime Forfettario.

DATI DI CASSA COMPLESSIVI:
- Liquidità Disponibile Totale nei conti: €${totalBalance.toLocaleString('it-IT')}
- Dettaglio Conti attivi: ${JSON.stringify((accounts || []).map((a: any) => ({ name: a.name, type: a.type, balance: a.balance, scope: a.scope })), null, 2)}

SUDDIVISIONE SPESE PERSONALI SECONDO LE REGOLE PRECISE DI DOMENICO:
- Spese Necessarie (Giroconti, bollette gas/luce/telefono, affitto, spese condominio): €${necessaryExpenses.toLocaleString('it-IT')}
- Spese Utili (Supermercati, alimenti, farmaci/medicine, visite mediche, assicurazioni, carburante, manutenzione auto): €${usefulExpenses.toLocaleString('it-IT')}
- Spese Extra & Tempo Libero (Tutte le altre spese di svago, relax e intrattenimento): €${extraExpenses.toLocaleString('it-IT')}

SUDDIVISIONE SPESE PROFESSIONALI / LAVORATIVE (Scope: 'professional'):
- Spese Necessarie / Utili Lavoro Totali: €${totalWorkingExpenses.toLocaleString('it-IT')} (Necessarie ditta: €${professionalNecessary.toLocaleString('it-IT')}, Utili ditta: €${professionalUseful.toLocaleString('it-IT')})

ANALISI ENTRATE E STIPENDIO:
- Stipendio Insegnamento (Ministero Istruzione reale accumulato finora): €${teachingIncomes.toLocaleString('it-IT')}
- Altre Entrate / Stipendi Personali: €${otherPersonalIncomes.toLocaleString('it-IT')}
- Entrate Professionali P.IVA (Fatturato ditta incassato finora): €${professionalRevenues.toLocaleString('it-IT')}

SITUAZIONE DEBITI / INDEBITAMENTO APERTO:
- Totale Debito Residuo Attivo: €${totalOutstandingDebt.toLocaleString('it-IT')}
- Dettaglio posizioni debitorie (Passività): ${JSON.stringify(activeDebtsList.map((d: any) => ({ nome: d.name, saldoDebito: d.balance })), null, 2)}
`;

    // 2. Map history array into Gemini content format
    const contentsPayload = [];
    if (history && Array.isArray(history)) {
      for (const h of history) {
        contentsPayload.push({
          role: h.role === 'model' ? 'model' : 'user',
          parts: [{ text: h.text }]
        });
      }
    }

    // Push the newest user message at the end
    contentsPayload.push({
      role: 'user',
      parts: [{ text: message }]
    });

    const systemInstruction = `Sei l'AI Advisor Finanziario Personale e Strategico di Domenico Pellegrino per l'app ContoSmart, un saggio ed empatico consulente italiano di 66 anni esperto in finanza familiare, gestione Partita IVA (regime forfettario), previdenza INPS, NASPI e calcolo dell'ISEE.

Il tuo obiettivo è supportare Domenico nel monitoraggio del suo andamento economico corrente, interpretando i dati finanziari reali estratti dai suoi conti correnti e dal libro giornale, aiutandolo a:
1. Ottimizzare le Spese Extra (benessere personale, svago, tempo libero) per preservare il suo tenore di vita.
2. Comprendere l'andamento del suo stipendio da insegnante (scadenza 30 giugno) rispetto alle fatture professionali della P.IVA.
3. Pianificare il rientro dei debiti aperti (es. Mutuo Lavoro, Compass, carta AMEX con saldi negativi).
4. Fornire strategie di abbattimento legale dell'ISEE per favorire la percezione della NASPI dopo il 30 giugno e altre prestazioni sociali (es. ottimizzando la giacenza media e saldo di fine anno di due anni prima, allocando fondi integrativi pensione deducibili o titoli di stato esenti, pianificando correttamente l'esclusione di beni e conti dell'altro figlio/nucleo Alberto Pellegrino).
5. Prepararsi serenamente al pensionamento a 67 anni previsto a Settembre 2027.

REGOLE ESSENZIALI DI STILE E DIALOGO:
- Sii estremamente caloroso, incoraggiante e specifico nei numeri: cita i saldi dei conti, le spese reali effettuate e l'indebitamento reale basandoti sul profilo che ti viene fornito!
- Non sovraccaricare Domenico con risposte monumentali o lunghi elenchi: mantieni risposte concise, fluide, empatiche e strutturate a piccoli paragrafi scannabili con grassetti.
- REGOLA D'ORO: **Devi interrogare Domenico! Per raccogliere informazioni sulla sua volontà, le sue abitudini di vita e i suoi reali obiettivi, devi concludere SEMPRE ogni singola risposta con un'unica domanda aperta, mirata ed elegante sulle sue preferenze relative ai conti, alla flessibilità di risparmio o al suo tenore di vita desiderato.**

Ecco la situazione aggiornata estratta in tempo reale dal suo database ContoSmart:
${financialProfileStr}
`;

    const response = await aiClient.models.generateContent({
      model: "gemini-2.5-flash",
      contents: contentsPayload,
      config: {
        systemInstruction: systemInstruction,
        temperature: 0.75,
      }
    });

    res.json({
      text: response.text || "Mi dispiace, non ho potuto elaborare una risposta. Ti va di riprovare?",
      fallback: false
    });

  } catch (error: any) {
    console.error("AI Chat Error:", error);
    res.status(500).json({ error: "Errore durante l'elaborazione del consulente AI nella chat." });
  }
});

// API endpoint for AI receipt / invoice analysis and OCR
app.post("/api/analyze-receipt", async (req, res) => {
  const { image, mimeType } = req.body;

  if (!image || !mimeType) {
    return res.status(400).json({ error: "Scontrino o fattura in formato immagine mancante o non valido." });
  }

  const aiClient = getGeminiClient();
  if (!aiClient) {
    return res.status(200).json({
      fallback: true,
      message: "Chiave API Gemini non configurata per l'analisi visiva delle spese. Carica manualmente i dati o configura la chiave."
    });
  }

  try {
    const imagePart = {
      inlineData: {
        data: image,
        mimeType: mimeType
      }
    };

    const prompt = `Analizza l'immagine di questa ricevuta fiscale, scontrino o fattura per estrarre le seguenti informazioni finanziarie.
Determina anche se si tratta di una spesa professionale (P.IVA, "professional") o personale ("personal") in base all'emettitore e agli articoli acquistati. ad esempio fatture di hosting, software, articoli per ufficio o consulenze tendono ad essere professionali. La spesa alimentare quotidiana o svago tende ad essere personale.

Estrai accuratamente i seguenti campi ed esegui la formattazione strettamente in JSON come specificato:
- "date": Data del documento in formato YYYY-MM-DD (se non trovi l'anno assume il 2026).
- "amount": Importo totale da pagare come numero decimale positivo.
- "description": Nome dell'attivita/commerciante e breve descrizione degli articoli (es. "FRESCO COOP MILANO - Spesa Alimentare" o "ARUBA SPA - Rinnovo Dominio").
- "scope": Ambito della spesa, deve essere "personal" o "professional".
- "category": Categoria adatta.
   - Se scope è "personal" deve essere una tra: "necessarie", "utili", "tempo_libero".
   - Se scope è "professional" deve essere una tra: "necessarie_lavoro", "utili_lavoro".
- "subcategory": Nome stringa per la sottocategoria specifica (es. "Alimentari", "Software", "Cancelleria", "Ristorante", "Tasse").
- "documentType": Se si tratta di "scontrino", "fattura" o "altro".

Rispondi solamente con un oggetto JSON valido basato sul seguente schema.`;

    const response = await aiClient.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [imagePart, prompt],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          required: ["date", "amount", "description", "scope", "category", "subcategory", "documentType"],
          properties: {
            date: { type: Type.STRING, description: "Format YYYY-MM-DD" },
            amount: { type: Type.NUMBER, description: "Total numeric amount" },
            description: { type: Type.STRING, description: "Clean vendor name and summary" },
            scope: { type: Type.STRING, description: "Must be 'personal' or 'professional'" },
            category: { type: Type.STRING, description: "Must match category options" },
            subcategory: { type: Type.STRING, description: "Specific subcategory name like Alimentari, Software" },
            documentType: { type: Type.STRING, description: "scontrino, fattura, or altro" }
          }
        }
      }
    });

    const resultText = response.text || "{}";
    res.json(JSON.parse(resultText));
  } catch (error: any) {
    console.error("Receipt Analysis Error:", error);
    res.status(500).json({ error: "Errore durante l'estrazione visiva con Gemini AI." });
  }
});

// --- SQLite Database REST API Routes ---

// Fetch the complete state
app.get("/api/db-state", async (req, res) => {
  try {
    const accounts = await dbOps.getAccounts();
    const transactions = await dbOps.getTransactions();
    const rules = await dbOps.getRules();
    const taxpayerName = await dbOps.getSetting("taxpayer_name") || "Domenico Pellegrino";
    const taxpayerCf = await dbOps.getSetting("taxpayer_cf") || "PLLDNC60B14A494R";
    const salaryDayOfMonth = Number(await dbOps.getSetting("salary_day_of_month") || "23");
    const cycleDurationDays = Number(await dbOps.getSetting("cycle_duration_days") || "30");
    
    let investmentsStr = await dbOps.getSetting("investments_data");
    if (!investmentsStr) {
      const defaultInvestments = [
        { id: "inv-1", name: "Strada Monti", description: "Fondo di investimento / Terreni Montani", type: "investment", buyValue: 15000, currentValue: 18200 },
        { id: "inv-2", name: "Fiat Tipo", description: "Automobile personale (Asset)", type: "asset", buyValue: 22000, currentValue: 14500 }
      ];
      investmentsStr = JSON.stringify(defaultInvestments);
      await dbOps.setSetting("investments_data", investmentsStr);
    }
    const investments = JSON.parse(investmentsStr);
    
    res.json({
      accounts,
      transactions,
      rules,
      taxpayerName,
      taxpayerCf,
      salaryDayOfMonth,
      cycleDurationDays,
      investments
    });
  } catch (error) {
    console.error("Error reading db-state:", error);
    res.status(500).json({ error: "Errore durante il caricamento del database SQLite." });
  }
});

// Accounts API
app.get("/api/accounts", async (req, res) => {
  try {
    res.json(await dbOps.getAccounts());
  } catch (error) {
    res.status(550).json({ error: "Errore nel recupero dei conti." });
  }
});

app.post("/api/accounts", async (req, res) => {
  try {
    const account = req.body;
    await dbOps.addAccount(account);
    res.status(201).json({ success: true, account });
  } catch (error) {
    console.error("Error creating account:", error);
    res.status(500).json({ error: "Errore nella creazione del conto." });
  }
});

app.put("/api/accounts/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const account = req.body;
    await dbOps.updateAccount(id, account);
    res.json({ success: true, account });
  } catch (error) {
    res.status(500).json({ error: "Errore nell'aggiornamento del conto." });
  }
});

app.delete("/api/accounts/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await dbOps.deleteAccount(id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Errore nella rimozione del conto." });
  }
});

// Transactions API
app.get("/api/transactions", async (req, res) => {
  try {
    res.json(await dbOps.getTransactions());
  } catch (error) {
    res.status(500).json({ error: "Errore nel recupero dei movimenti." });
  }
});

app.post("/api/transactions", async (req, res) => {
  try {
    const tx = req.body;
    await dbOps.addTransaction(tx);
    res.status(201).json({ success: true, transaction: tx });
  } catch (error) {
    console.error("Error creating transaction:", error);
    res.status(500).json({ error: "Errore nella registrazione del movimento." });
  }
});

app.put("/api/transactions/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const tx = req.body;
    await dbOps.updateTransaction(id, tx);
    res.json({ success: true, transaction: tx });
  } catch (error) {
    res.status(500).json({ error: "Errore nell'aggiornamento del movimento." });
  }
});

app.delete("/api/transactions/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await dbOps.deleteTransaction(id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Errore nell'eliminazione del movimento." });
  }
});

// Rules API
app.get("/api/rules", async (req, res) => {
  try {
    res.json(await dbOps.getRules());
  } catch (error) {
    res.status(500).json({ error: "Errore nel recupero delle regole." });
  }
});

app.post("/api/rules", async (req, res) => {
  try {
    const rule = req.body;
    await dbOps.addRule(rule);
    res.status(201).json({ success: true, rule });
  } catch (error) {
    res.status(500).json({ error: "Errore nel salvataggio della regola." });
  }
});

app.delete("/api/rules/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await dbOps.deleteRule(id);
    res.json({ success: true });
  } catch (error) {
    res.status(550).json({ error: "Errore nella rimozione della regola." });
  }
});

// Recurring Transactions API
app.get("/api/recurrences", async (req, res) => {
  try {
    res.json(await (dbOps as any).getRecurringTransactions());
  } catch (error) {
    res.status(500).json({ error: "Errore nel recupero delle scadenze ricorrenti." });
  }
});

app.post("/api/recurrences", async (req, res) => {
  try {
    const rt = req.body;
    await (dbOps as any).addRecurringTransaction(rt);
    res.status(201).json({ success: true, recurrence: rt });
  } catch (error) {
    res.status(500).json({ error: "Errore nel salvataggio della scadenza ricorrente." });
  }
});

app.put("/api/recurrences/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const rt = req.body;
    await (dbOps as any).updateRecurringTransaction(id, rt);
    res.json({ success: true, recurrence: rt });
  } catch (error) {
    res.status(500).json({ error: "Errore nell'aggiornamento della scadenza ricorrente." });
  }
});

app.delete("/api/recurrences/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await (dbOps as any).deleteRecurringTransaction(id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Errore nella rimozione della scadenza ricorrente." });
  }
});

// AI Recurring Transaction Detection Endpoint
app.post("/api/recurrences/analyze", async (req, res) => {
  try {
    const { isDemoMode } = req.body;
    const aiClient = getGeminiClient();
    
    // Retrieve transactions from database
    const allTxs = await dbOps.getTransactions();
    const filteredTxs = allTxs.filter(t => isDemoMode ? t.isDemo === true : !t.isDemo);

    if (filteredTxs.length === 0) {
      return res.json({ suggestedRecurrences: [] });
    }

    // Limit transactions to send to Gemini to avoid exceeding token limit (last 150 transactions)
    const txsForAI = filteredTxs.slice(0, 150).map(t => ({
      date: t.date,
      description: t.description,
      amount: t.amount,
      scope: t.scope,
      category: t.category,
      subcategory: t.subcategory
    }));

    if (!aiClient) {
      // Fallback: local heuristic analyzer (returning empty or basics)
      return res.json({ suggestedRecurrences: [] });
    }

    const prompt = `Sei l'analizzatore finanziario di ContoSmart.
Analizza la lista di transazioni bancarie fornita (in formato JSON) per identificare operazioni ricorrenti o ripetute nel tempo (es. affitto mensile, bollette dell'energia elettrica/gas bimestrali, stipendi mensili, abbonamenti Netflix/Amazon Prime annuali o mensili).

Per ciascun gruppo o serie di transazioni simili e ripetitive identificate nello storico, determina:
1. Un nome descrittivo della ricorrenza (es. "Affitto Studio", "Stipendio", "Bolletta Enel").
2. La parola chiave (keyword) ideale contenuta nella descrizione bancaria per intercettare il movimento in futuro (es. "NETFLIX", "LOCAZIONE", "ENEL ENERGIA").
3. L'importo stimato (se l'importo è variabile, calcola la media).
4. La frequenza (scegli strettamente uno tra: "weekly", "monthly", "bi_monthly", "quarterly", "annual").
5. L'ambito (personal o professional).
6. La categoria di appartenenza e la sottocategoria.
7. La data della prossima scadenza prevista (nextDueDate) nel formato YYYY-MM-DD. Calcola questa data proiettando l'intervallo a partire dall'ultimo movimento registrato nello storico. Tieni presente che la data corrente (oggi) è ${new Date().toISOString().split('T')[0]}.
8. Il livello di certezza (scegli tra "certain" per addebiti con lo stesso importo esatto a intervalli precisi, e "possible" per addebiti regolari ma ad importo o data variabile come le bollette).

Ecco la lista di transazioni storiche da analizzare:
${JSON.stringify(txsForAI, null, 2)}

Rispondi rigorosamente in formato JSON rispettando lo schema specificato.`;

    const response = await aiClient.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          required: ["suggestedRecurrences"],
          properties: {
            suggestedRecurrences: {
              type: Type.ARRAY,
              description: "Lista delle transazioni ricorrenti consigliate",
              items: {
                type: Type.OBJECT,
                required: ["name", "keyword", "amount", "frequency", "scope", "category", "subcategory", "nextDueDate", "confidence"],
                properties: {
                  name: { type: Type.STRING, description: "Nome della ricorrenza" },
                  keyword: { type: Type.STRING, description: "Parola chiave di matching" },
                  amount: { type: Type.NUMBER, description: "Importo della scadenza" },
                  frequency: { type: Type.STRING, description: "Frequenza (weekly, monthly, bi_monthly, quarterly, annual)" },
                  scope: { type: Type.STRING, description: "Ambito (personal o professional)" },
                  category: { type: Type.STRING, description: "Categoria di bilancio" },
                  subcategory: { type: Type.STRING, description: "Sottocategoria di bilancio" },
                  nextDueDate: { type: Type.STRING, description: "Prossima data di scadenza prevista (YYYY-MM-DD)" },
                  confidence: { type: Type.STRING, description: "Grado di certezza (certain o possible)" }
                }
              }
            }
          }
        }
      }
    });

    const resultText = response.text || "{}";
    res.json(JSON.parse(resultText));
  } catch (error: any) {
    console.error("Error analyzing recurrences:", error);
    res.status(500).json({ error: "Errore durante l'analisi delle ricorrenze tramite Intelligenza Artificiale: " + error.message });
  }
});

// Cash Flow Forecasting Endpoint
app.get("/api/forecast", async (req, res) => {
  try {
    const isDemoMode = req.query.isDemoMode === 'true';
    
    // Get starting balances from all accounts in scope
    const allAccounts = await dbOps.getAccounts();
    const filteredAccounts = allAccounts.filter(a => isDemoMode ? a.isDemo === true : !a.isDemo);
    
    const startingBalance = filteredAccounts.reduce((sum, acc) => sum + acc.balance, 0);

    // Get active recurring transactions
    const recurrences = await (dbOps as any).getRecurringTransactions();
    const activeRecs = recurrences.filter((r: any) => r.isActive && (isDemoMode ? r.isDemo === true : !r.isDemo));

    const startDate = new Date();
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + 6); // 6 months forecast

    const forecastEvents: { date: string; amount: number; name: string; scope: string; category: string; subcategory: string }[] = [];

    // Helper to format Date objects as YYYY-MM-DD
    const formatDate = (d: Date) => d.toISOString().split('T')[0];

    // Project recurrence dates for the next 6 months
    for (const r of activeRecs) {
      let currentDate = new Date(r.nextDueDate);
      if (isNaN(currentDate.getTime())) continue;

      // If nextDueDate is in the past, let's catch it up to today
      let safetyCounter = 0;
      while (currentDate < startDate && safetyCounter < 100) {
        safetyCounter++;
        if (r.frequency === 'weekly') {
          currentDate.setDate(currentDate.getDate() + 7);
        } else if (r.frequency === 'monthly') {
          currentDate.setMonth(currentDate.getMonth() + 1);
        } else if (r.frequency === 'bi_monthly') {
          currentDate.setMonth(currentDate.getMonth() + 2);
        } else if (r.frequency === 'quarterly') {
          currentDate.setMonth(currentDate.getMonth() + 3);
        } else if (r.frequency === 'annual') {
          currentDate.setFullYear(currentDate.getFullYear() + 1);
        } else {
          break;
        }
      }

      // Now generate all occurrences up to endDate
      safetyCounter = 0;
      while (currentDate <= endDate && safetyCounter < 100) {
        safetyCounter++;
        forecastEvents.push({
          date: formatDate(currentDate),
          amount: r.amount,
          name: r.name,
          scope: r.scope,
          category: r.category,
          subcategory: r.subcategory
        });

        // Advance by frequency
        if (r.frequency === 'weekly') {
          currentDate.setDate(currentDate.getDate() + 7);
        } else if (r.frequency === 'monthly') {
          currentDate.setMonth(currentDate.getMonth() + 1);
        } else if (r.frequency === 'bi_monthly') {
          currentDate.setMonth(currentDate.getMonth() + 2);
        } else if (r.frequency === 'quarterly') {
          currentDate.setMonth(currentDate.getMonth() + 3);
        } else if (r.frequency === 'annual') {
          currentDate.setFullYear(currentDate.getFullYear() + 1);
        } else {
          break;
        }
      }
    }

    // Sort forecastEvents chronologically
    forecastEvents.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Generate day-by-day projected balance curve
    const dailyBalancePoints: { date: string; balance: number; personalBalance: number; professionalBalance: number }[] = [];
    let currentBalance = startingBalance;
    
    // We also want to calculate scope-specific balances starting from their respective subsets
    const personalStarting = filteredAccounts.filter(a => a.scope === 'personal' || a.scope === 'mixed').reduce((sum, acc) => sum + acc.balance, 0);
    const professionalStarting = filteredAccounts.filter(a => a.scope === 'professional' || a.scope === 'mixed').reduce((sum, acc) => sum + acc.balance, 0);
    
    let currentPersonal = personalStarting;
    let currentProfessional = professionalStarting;

    // Loop through each day from today to endDate
    const dateCursor = new Date(startDate);
    
    // Add today's starting point
    dailyBalancePoints.push({
      date: formatDate(dateCursor),
      balance: Number(currentBalance.toFixed(2)),
      personalBalance: Number(currentPersonal.toFixed(2)),
      professionalBalance: Number(currentProfessional.toFixed(2))
    });

    let safetyDayCounter = 0;
    while (dateCursor < endDate && safetyDayCounter < 300) {
      safetyDayCounter++;
      dateCursor.setDate(dateCursor.getDate() + 1);
      const dateStr = formatDate(dateCursor);
      
      // Find all events on this day
      const dayEvents = forecastEvents.filter(e => e.date === dateStr);
      for (const e of dayEvents) {
        currentBalance += e.amount;
        if (e.scope === 'personal') {
          currentPersonal += e.amount;
        } else if (e.scope === 'professional') {
          currentProfessional += e.amount;
        } else {
          currentPersonal += e.amount;
          currentProfessional += e.amount;
        }
      }

      dailyBalancePoints.push({
        date: dateStr,
        balance: Number(currentBalance.toFixed(2)),
        personalBalance: Number(currentPersonal.toFixed(2)),
        professionalBalance: Number(currentProfessional.toFixed(2))
      });
    }

    res.json({
      startingBalance,
      forecastEvents,
      dailyBalancePoints
    });
  } catch (error: any) {
    console.error("Error generating forecast:", error);
    res.status(500).json({ error: "Errore durante la generazione delle previsioni finanziarie: " + error.message });
  }
});

// Settings API
app.post("/api/settings", async (req, res) => {
  try {
    const { taxpayerName, taxpayerCf, salaryDayOfMonth, cycleDurationDays, investments } = req.body;
    if (taxpayerName !== undefined) {
      await dbOps.setSetting("taxpayer_name", taxpayerName);
    }
    if (taxpayerCf !== undefined) {
      await dbOps.setSetting("taxpayer_cf", taxpayerCf);
    }
    if (salaryDayOfMonth !== undefined) {
      await dbOps.setSetting("salary_day_of_month", String(salaryDayOfMonth));
    }
    if (cycleDurationDays !== undefined) {
      await dbOps.setSetting("cycle_duration_days", String(cycleDurationDays));
    }
    if (investments !== undefined) {
      await dbOps.setSetting("investments_data", JSON.stringify(investments));
    }
    res.json({ success: true });
  } catch (error) {
    res.status(550).json({ error: "Errore nel salvataggio delle impostazioni." });
  }
});

// Full reset / Clear transactions and zero account balances
app.post("/api/transactions/clear-all", async (req, res) => {
  try {
    await dbOps.clearAllTransactions();
    res.json({
      success: true,
      accounts: await dbOps.getAccounts(),
      transactions: await dbOps.getTransactions()
    });
  } catch (error) {
    console.error("Error clearing transactions:", error);
    res.status(500).json({ error: "Errore durante lo svuotamento dei movimenti bancari." });
  }
});

// Backup & Restore Database API Routes

// JSON Export of all tables
app.get("/api/backup/export", async (req, res) => {
  try {
    const settings = await dbOps.getAllSettings();
    const accounts = await dbOps.getAccounts();
    const transactions = await dbOps.getTransactions();
    const rules = await dbOps.getRules();

    res.json({
      version: "1.0.0",
      timestamp: new Date().toISOString(),
      settings,
      accounts,
      transactions,
      rules
    });
  } catch (error) {
    console.error("Error exporting database JSON:", error);
    res.status(500).json({ error: "Errore durante la creazione del file di backup JSON." });
  }
});

// JSON Import (Overwrite entire DB)
app.post("/api/backup/import", async (req, res) => {
  try {
    const data = req.body;
    if (!data || (!data.accounts && !data.transactions && !data.rules && !data.settings)) {
      return res.status(400).json({ error: "Dati di backup non validi o vuoti." });
    }

    await dbOps.importAllData({
      accounts: data.accounts || [],
      transactions: data.transactions || [],
      rules: data.rules || [],
      settings: data.settings || []
    });

    res.json({
      success: true,
      message: "Database ripristinato con successo dal file di backup.",
      accounts: await dbOps.getAccounts(),
      transactions: await dbOps.getTransactions(),
      rules: await dbOps.getRules(),
      taxpayerName: await dbOps.getSetting("taxpayer_name") || "Domenico Pellegrino",
      taxpayerCf: await dbOps.getSetting("taxpayer_cf") || "PLLDNC60B14A494R"
    });
  } catch (error: any) {
    console.error("Error importing backup JSON:", error);
    res.status(500).json({ error: `Errore durante il ripristino del backup: ${error.message || error}` });
  }
});

// SQLite raw file download
app.get("/api/backup/sqlite", async (req, res) => {
  try {
    const dbFilePath = path.resolve(process.cwd(), 'database.db');
    res.download(dbFilePath, 'database.db', (err) => {
      if (err) {
        console.error("Error serving sqlite download:", err);
      }
    });
  } catch (error) {
    console.error("Error serving sqlite:", error);
    res.status(500).json({ error: "Impossibile scaricare il file .db" });
  }
});

// Full Master Backup ZIP Export
app.get("/api/backup/export/full-zip", async (req, res) => {
  try {
    const rootDir = process.cwd();
    const filesZip = new AdmZip();

    // Add directories recursively
    const srcDir = path.resolve(rootDir, "src");
    if (fs.existsSync(srcDir)) {
      filesZip.addLocalFolder(srcDir, "src");
    }

    const distDir = path.resolve(rootDir, "dist");
    if (fs.existsSync(distDir)) {
      filesZip.addLocalFolder(distDir, "dist");
    }

    // Add individual files
    const rootFiles = [
      "package.json",
      "tsconfig.json",
      "vite.config.ts",
      "index.html",
      "metadata.json",
      "server.ts",
      "server.js",
      "database.ts",
      "installer.php",
      "ecosystem.config.cjs",
      "install.sh",
      "README_HOSTINGER.md",
      ".env.example",
      ".gitignore"
    ];

    rootFiles.forEach((file) => {
      let filePath = path.resolve(rootDir, file);
      if (file === "installer.php") {
        filePath = path.resolve(rootDir, "php-installer", "installer.php");
      }
      if (fs.existsSync(filePath)) {
        filesZip.addLocalFile(filePath);
      }
    });

    const filesBuffer = filesZip.toBuffer();

    // Create db.zip
    const dbZip = new AdmZip();
    const dbFilePath = path.resolve(rootDir, "database.db");
    if (fs.existsSync(dbFilePath)) {
      dbZip.addLocalFile(dbFilePath);
    }
    const dbBuffer = dbZip.toBuffer();

    // Create master zip
    const masterZip = new AdmZip();
    masterZip.addFile("files.zip", filesBuffer);
    masterZip.addFile("db.zip", dbBuffer);

    const installerInstructions = `ContoSmart Master Backup Package
Questo file contiene la duplicazione esatta sia dei file sorgenti (files.zip) sia della contabilità (db.zip).
Carica questo intero file .zip direttamente nel pannello di autoinstallazione 'installer.php' di Hostinger per ripristinare o migrare l'intera applicazione in meno di un secondo.`;
    masterZip.addFile("INSTALL_INSTRUCTIONS.txt", Buffer.from(installerInstructions, "utf-8"));

    const masterBuffer = masterZip.toBuffer();

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", "attachment; filename=contosmart_master_backup.zip");
    res.send(masterBuffer);

  } catch (error: any) {
    console.error("Error creating full master zip archive:", error);
    res.status(500).json({ error: "Impossibile creare il pacchetto completo ZIP: " + error.message });
  }
});

// SQLite raw file upload (restore database.db directly)
app.post("/api/backup/sqlite/upload", async (req, res) => {
  try {
    const { fileBase64 } = req.body;
    if (!fileBase64) {
      return res.status(400).json({ error: "File binario SQLite (base64) mancante." });
    }

    const tempPath = path.resolve(process.cwd(), 'database_temp.db');
    const buffer = Buffer.from(fileBase64, 'base64');
    
    // Quick validation: SQLite files always start with "SQLite format 3\0"
    const header = buffer.toString('utf8', 0, 15);
    if (!header.startsWith("SQLite format 3")) {
      return res.status(400).json({ error: "Il file caricato non sembra un database SQLite valido." });
    }

    fs.writeFileSync(tempPath, buffer);

    // Call database manager to close active connection, overwrite db and re-open it
    await (dbOps as any).replaceDatabaseFile(tempPath);

    // Remove temp file
    try {
      fs.unlinkSync(tempPath);
    } catch (_) {}

    res.json({
      success: true,
      message: "Database SQLite binario ripristinato con successo!",
      accounts: await dbOps.getAccounts(),
      transactions: await dbOps.getTransactions(),
      rules: await dbOps.getRules(),
      taxpayerName: await dbOps.getSetting("taxpayer_name") || "Domenico Pellegrino",
      taxpayerCf: await dbOps.getSetting("taxpayer_cf") || "PLLDNC60B14A494R"
    });
  } catch (error: any) {
    console.error("Error restoring SQLite database:", error);
    res.status(500).json({ error: `Errore durante il ripristino del file SQLite: ${error.message || error}` });
  }
});

// Enable Banking Open Banking PSD2 API Routes

// Retrieve currently persisted Open Banking configuration metadata (without private key secret)
app.get("/api/bank/config", async (req, res) => {
  try {
    const clientId = await dbOps.getSetting("enable_banking_client_id") || process.env.ENABLE_BANKING_CLIENT_ID || "";
    const keyId = await dbOps.getSetting("enable_banking_key_id") || process.env.ENABLE_BANKING_KEY_ID || "";
    const hasPrivateKey = !!(await dbOps.getSetting("enable_banking_private_key") || process.env.ENABLE_BANKING_PRIVATE_KEY);
    res.json({
      isConfigured: !!clientId && hasPrivateKey,
      clientId,
      keyId
    });
  } catch (err: any) {
    res.status(500).json({ error: "Errore nel caricamento della configurazione bancaria." });
  }
});

// Update Open Banking API Credentials
app.post("/api/bank/config", async (req, res) => {
  try {
    const { clientId, keyId, privateKey } = req.body;
    if (clientId !== undefined) {
      await dbOps.setSetting("enable_banking_client_id", clientId.trim());
    }
    if (keyId !== undefined) {
      await dbOps.setSetting("enable_banking_key_id", keyId.trim());
    }
    if (privateKey !== undefined) {
      await dbOps.setSetting("enable_banking_private_key", privateKey.trim());
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: "Errore nel salvataggio delle credenziali bancarie." });
  }
});

// Initiate Open Banking Authorization Session with redirect URL
app.post("/api/bank/sessions", async (req, res) => {
  try {
    const { aspsp, isDemoMode } = req.body;
    if (!aspsp) {
      return res.status(400).json({ error: "Identificativo della banca (ASPSP) mancante." });
    }

    const clientId = await dbOps.getSetting("enable_banking_client_id") || process.env.ENABLE_BANKING_CLIENT_ID;
    const keyId = await dbOps.getSetting("enable_banking_key_id") || process.env.ENABLE_BANKING_KEY_ID;
    const privateKey = await dbOps.getSetting("enable_banking_private_key") || process.env.ENABLE_BANKING_PRIVATE_KEY;

    if (!clientId || !privateKey) {
      return res.status(200).json({
        requiresConfig: true,
        message: "Per abilitare i flussi reali PSD2 occorre configurare l'Application ID e la Chiave Privata RSA forniti da Enable Banking nelle Impostazioni."
      });
    }

    // Determine the redirect callback URL dynamically
    const host = req.get("host") || "localhost:3000";
    const protocol = req.protocol === "https" || req.headers["x-forwarded-proto"] === "https" ? "https" : "http";
    const appUrl = process.env.APP_URL && process.env.APP_URL !== "MY_APP_URL" ? process.env.APP_URL : `${protocol}://${host}`;
    const redirectUrl = `${appUrl}/api/bank/callback`;

    const state = `state-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

    const sessionInfo = await EnableBankingService.createSession(
      { clientId, privateKey, keyId },
      aspsp,
      redirectUrl,
      state
    );

    res.json({
      requiresConfig: false,
      url: sessionInfo.url,
      session_id: sessionInfo.session_id,
      state
    });
  } catch (error: any) {
    console.error("Open Banking session error:", error);
    res.status(500).json({ error: `Impossibile avviare il collegamento con la banca: ${error.message || error}` });
  }
});

// Callback route where bank redirects after approval
app.get("/api/bank/callback", (req, res) => {
  const { code, state, error, error_description } = req.query;
  if (error) {
    return res.redirect(`/?bank_sync_error=${encodeURIComponent(String(error_description || error))}`);
  }
  if (!code) {
    return res.redirect(`/?bank_sync_error=${encodeURIComponent("Nessun codice fornito nel reindirizzamento bancario.")}`);
  }
  res.redirect(`/?bank_sync_code=${code}&state=${state}`);
});

// Exchange code for real accounts to preview bank accounts and analyze candidates
app.post("/api/bank/session-accounts", async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) {
      return res.status(400).json({ error: "Codice di autorizzazione Open Banking nullo o non valido." });
    }

    const clientId = await dbOps.getSetting("enable_banking_client_id") || process.env.ENABLE_BANKING_CLIENT_ID;
    const keyId = await dbOps.getSetting("enable_banking_key_id") || process.env.ENABLE_BANKING_KEY_ID;
    const privateKey = await dbOps.getSetting("enable_banking_private_key") || process.env.ENABLE_BANKING_PRIVATE_KEY;

    if (!clientId || !privateKey) {
      return res.status(400).json({ error: "Configurazione delle API e firme crittografiche non completata." });
    }

    const config = { clientId, privateKey, keyId };

    // 1. Exchange temporary code for active PSD2 session token
    const sessionData = await EnableBankingService.exchangeCodeForSession(config, code);
    const sessionId = sessionData.session_id;
    const bankId = sessionData.aspsp || "Banca Sincronizzata";
    
    // Resolve clean bank display name
    let bankDisplayName = "Banca Open Banking";
    if (bankId.includes("bpm")) bankDisplayName = "Banco BPM";
    else if (bankId.includes("bbva")) bankDisplayName = "BBVA Italia";
    else if (bankId.includes("unicredit")) bankDisplayName = "UniCredit Spa";
    else if (bankId.includes("intesa")) bankDisplayName = "Intesa Sanpaolo";
    else if (bankId.includes("fineco")) bankDisplayName = "Fineco Bank";
    else if (bankId.includes("revolut")) bankDisplayName = "Revolut";
    else if (bankId.includes("mock-aspsp")) bankDisplayName = "Mock Bank Sanbox";

    // 2. Query accounts for this active session
    const bankAccounts = await EnableBankingService.getAccounts(config, sessionId);

    // 3. Match against existing SQL accounts
    const existingAccounts = await dbOps.getAccounts();

    const retrieved = bankAccounts.map((bAcc: any) => {
      // Find matches in local database
      const candidates = existingAccounts.filter((existing: any) => {
        // Direct Match: IBAN matches (omitting spacing/formatting)
        if (bAcc.iban && existing.iban) {
          const cleanB = bAcc.iban.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
          const cleanE = existing.iban.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
          if (cleanB && cleanE && (cleanB.endsWith(cleanE) || cleanE.endsWith(cleanB))) {
            return true;
          }
        }
        // Partial Name Match: Check if the bank display name matches keywords inside custom names
        // e.g. "BPM" inside "Banco BPM (YouWeb)"
        const nameUpper = existing.name.toUpperCase();
        const bankDisplayUpper = bankDisplayName.toUpperCase();
        if (bankDisplayUpper !== "BANCA OPEN BANKING") {
          if (nameUpper.includes(bankDisplayUpper)) return true;
          if (bankDisplayName === "Banco BPM" && nameUpper.includes("BPM")) return true;
          if (bankDisplayName === "UniCredit Spa" && nameUpper.includes("UNICREDIT")) return true;
          if (bankDisplayName === "BBVA Italia" && nameUpper.includes("BBVA")) return true;
          if (bankDisplayName === "Intesa Sanpaolo" && nameUpper.includes("INTESA")) return true;
          if (bankDisplayName === "Fineco Bank" && nameUpper.includes("FINECO")) return true;
          if (bankDisplayName === "Revolut" && nameUpper.includes("REVOLUT")) return true;
        }
        return false;
      });

      return {
        uid: bAcc.uid,
        iban: bAcc.iban || "",
        balance: bAcc.balance,
        name: `${bankDisplayName} - ${bAcc.iban || bAcc.uid.slice(0, 8)}`,
        candidates: candidates.map((c: any) => ({
          id: c.id,
          name: c.name,
          iban: c.iban,
          balance: c.balance
        }))
      };
    });

    res.json({
      success: true,
      sessionId,
      bankId,
      bankDisplayName,
      retrievedAccounts: retrieved,
      allExistingAccounts: existingAccounts.map((e: any) => ({
        id: e.id,
        name: e.name,
        iban: e.iban,
        balance: e.balance
      }))
    });

  } catch (error: any) {
    console.error("Open banking exchange info error:", error);
    res.status(500).json({ error: `La banca ha rifiutato la lettura iniziale della sessione: ${error.message || error}` });
  }
});

// Commit session accounts mapping associations and run transaction loading
app.post("/api/bank/confirm-sync", async (req, res) => {
  try {
    const { sessionId, bankId, bankDisplayName, associations, isDemoMode } = req.body;
    if (!sessionId) {
      return res.status(400).json({ error: "Sessione PSD2 non valida o scaduta." });
    }

    const clientId = await dbOps.getSetting("enable_banking_client_id") || process.env.ENABLE_BANKING_CLIENT_ID;
    const keyId = await dbOps.getSetting("enable_banking_key_id") || process.env.ENABLE_BANKING_KEY_ID;
    const privateKey = await dbOps.getSetting("enable_banking_private_key") || process.env.ENABLE_BANKING_PRIVATE_KEY;

    if (!clientId || !privateKey) {
      return res.status(400).json({ error: "Configurazione delle API non trovata." });
    }

    const config = { clientId, privateKey, keyId };
    const bankAccounts = await EnableBankingService.getAccounts(config, sessionId);

    let accountsImported = 0;
    let transactionsImported = 0;

    for (const bAcc of bankAccounts) {
      // Find association specified by user in frontend: associations is a map of { [bAcc.uid]: targetAccountId }
      // targetAccountId can be an existing account ID, or "new" which means create a new one.
      const targetAccountIdRaw = associations && associations[bAcc.uid];
      
      let accountId = `bank-acc-${bAcc.uid}`;
      let accountToUpdate: any = null;
      let isNew = true;

      const existingAccounts = await dbOps.getAccounts();

      if (targetAccountIdRaw && targetAccountIdRaw !== "new") {
        // Associate with existing account
        const matched = existingAccounts.find(a => a.id === targetAccountIdRaw);
        if (matched) {
          accountId = matched.id;
          accountToUpdate = matched;
          isNew = false;
        }
      } else {
        // Fallback: check if we already associated this specific bAcc.uid earlier
        const alreadyHas = existingAccounts.find(a => a.id === `bank-acc-${bAcc.uid}`);
        if (alreadyHas) {
          accountId = `bank-acc-${bAcc.uid}`;
          accountToUpdate = alreadyHas;
          isNew = false;
        }
      }

      const accountObj = {
        id: accountId,
        name: isNew 
          ? `${bankDisplayName} - ${bAcc.iban || bAcc.uid.slice(0, 8)}`
          : (accountToUpdate ? accountToUpdate.name : `${bankDisplayName} - ${bAcc.iban || bAcc.uid.slice(0, 8)}`),
        type: (accountToUpdate ? accountToUpdate.type : 'checking') as any,
        scope: (accountToUpdate ? accountToUpdate.scope : 'mixed') as any,
        balance: bAcc.balance,
        limit: accountToUpdate ? accountToUpdate.limit : null,
        iban: bAcc.iban || (accountToUpdate ? accountToUpdate.iban : ''),
        notes: `Allineato in tempo reale via API PSD2 con ID Sessione ${sessionId}`,
        isDemo: isNew ? !!isDemoMode : (accountToUpdate ? !!accountToUpdate.isDemo : !!isDemoMode)
      };

      if (!isNew) {
        await dbOps.updateAccount(accountId, accountObj);
      } else {
        await dbOps.addAccount(accountObj);
      }
      accountsImported++;

      // 3. Query transactions of the account for details
      try {
        const bankTransactions = await EnableBankingService.getTransactions(config, sessionId, bAcc.uid);
        for (const bTx of bankTransactions) {
          // Keep unique transaction ID based on banking tx.id so we don't import duplicates to the mapped account
          const txId = `bank-tx-${bTx.id}-${accountId}`; 
          const existingTransactions = await dbOps.getTransactions();
          const txExists = existingTransactions.find(t => t.id === txId || t.id === `bank-tx-${bTx.id}`);

          if (!txExists) {
            const amt = bTx.amount;
            
            // Smart auto-classifier heuristics
            let scope: 'personal' | 'professional' = 'personal';
            let category: string = 'necessarie';
            let subcategory = 'Abbonamento';

            const descUpper = bTx.description.toUpperCase();
            if (descUpper.includes("FATTURA") || descUpper.includes("BONIFICO CLIENTE") || descUpper.includes("INCASSO EMISSIONE") || descUpper.includes("CLIENTE") || descUpper.includes("PAGOPAV")) {
              scope = 'professional' as const;
              category = 'entrate_lavoro' as const;
              subcategory = 'Fattura';
            } else if (descUpper.includes("COMMERCIALISTA") || descUpper.includes("STUDIO ROSSI") || descUpper.includes("FATTURA N.")) {
              scope = 'professional' as const;
              category = 'necessarie_lavoro' as const;
              subcategory = 'Commercialista';
            } else if (descUpper.includes("ENEL") || descUpper.includes("PLENITUDE") || descUpper.includes("GAS") || descUpper.includes("UTENZE") || descUpper.includes("TELECOM") || descUpper.includes("FASTWEB")) {
              scope = 'professional' as const;
              category = 'necessarie_lavoro' as const;
              subcategory = 'Utenze';
            } else if (descUpper.includes("AWS") || descUpper.includes("AMAZON WEB") || descUpper.includes("GITHUB") || descUpper.includes("VERCEL") || descUpper.includes("CLOUDFLARE")) {
              scope = 'professional' as const;
              category = 'utili_lavoro' as const;
              subcategory = 'Software & Cloud';
            } else if (descUpper.includes("ESSELUNGA") || descUpper.includes("CONAD") || descUpper.includes("COOP") || descUpper.includes("LIDL") || descUpper.includes("CARREFOUR") || descUpper.includes("SUPERMERCATO")) {
              scope = 'personal' as const;
              category = 'necessarie' as const;
              subcategory = 'Alimentari';
            } else if (descUpper.includes("RISTORANTE") || descUpper.includes("CENA") || descUpper.includes("BAR") || descUpper.includes("PIZZERIA") || descUpper.includes("PUB")) {
              scope = 'personal' as const;
              category = 'tempo_libero' as const;
              subcategory = 'Ristoranti';
            } else if (descUpper.includes("ATM") || descUpper.includes("PRELIEVO BANCOMAT") || descUpper.includes("PRELEV") || descUpper.includes("CONTANT")) {
              scope = 'personal' as const;
              category = 'trasferimento' as const;
              subcategory = 'Prelievo';
            }

            const txObj = {
              id: txId,
              date: bTx.date,
              description: bTx.description,
              amount: amt,
              type: amt >= 0 ? ('income' as const) : ('expense' as const),
              accountId: accountId,
              destinationAccountId: null,
              scope,
              category,
              subcategory,
              isAutoMatched: 1,
              ruleId: null,
              isVerified: 1,
              isDemo: accountObj.isDemo,
              notes: "Effettuato via PSD2 Open Banking",
              customer: scope === 'professional' && amt >= 0 ? "Cliente PSD2" : null,
              invoiceId: null
            };

            await dbOps.addTransaction(txObj);
            transactionsImported++;
          }
        }
      } catch (txErr) {
        console.error(`Error loading transactions for bank account ${bAcc.uid}:`, txErr);
      }
    }

    res.json({
      success: true,
      bankName: bankDisplayName,
      accountsImported,
      transactionsImported,
      accounts: await dbOps.getAccounts(),
      transactions: await dbOps.getTransactions()
    });

  } catch (error: any) {
    console.error("Open banking commit error:", error);
    res.status(500).json({ error: `La banca ha rifiutato la memorizzazione delle transazioni nell'account associato: ${error.message || error}` });
  }
});

// Full reset / Seed database
app.post("/api/reset", async (req, res) => {
  try {
    await dbOps.resetAllDb();
    await initDb(); // Restores original seeds
    
    // Send back the seeded lists
    res.json({
      accounts: await dbOps.getAccounts(),
      transactions: await dbOps.getTransactions(),
      rules: await dbOps.getRules(),
      taxpayerName: await dbOps.getSetting("taxpayer_name") || "Domenico Pellegrino",
      taxpayerCf: await dbOps.getSetting("taxpayer_cf") || "PLLDNC60B14A494R"
    });
  } catch (error) {
    console.error("Error resetting DB:", error);
    res.status(500).json({ error: "Errore nel ripristino delle impostazioni iniziali." });
  }
});

// Copy all Demo data to Real tables
app.post("/api/copy-demo-to-real", async (req, res) => {
  try {
    await (dbOps as any).copyDemoToReal();
    res.json({
      success: true,
      accounts: await dbOps.getAccounts(),
      transactions: await dbOps.getTransactions(),
      rules: await dbOps.getRules()
    });
  } catch (error) {
    console.error("Error copying demo to real:", error);
    res.status(500).json({ error: "Errore durante la copia dei dati dimostrativi." });
  }
});

// Delete all Demo transactions
app.post("/api/delete-demo-transactions", async (req, res) => {
  try {
    await (dbOps as any).deleteDemoTransactions();
    res.json({
      success: true,
      accounts: await dbOps.getAccounts(),
      transactions: await dbOps.getTransactions()
    });
  } catch (error) {
    console.error("Error deleting demo transactions:", error);
    res.status(500).json({ error: "Errore durante la cancellazione delle transazioni demo." });
  }
});

// Configure Vite and static assets
async function setupServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server avviato su http://localhost:${PORT}`);
  });
}

setupServer();
