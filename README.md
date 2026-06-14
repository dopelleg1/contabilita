# ContoSmart 💼📊

**ContoSmart** è un'applicazione web full-stack avanzata per la gestione finanziaria e aziendale personale. Sviluppata in **TypeScript** con un'architettura moderna basata su **React + Vite** per il frontend ed **Express** per il backend, utilizza **SQLite** come database locale leggero, performante e autonomo.

Il sistema include moduli intelligenti per la categorizzazione, statistiche dinamiche e strumenti robusti per l'importazione di estratti conti bancari e la gestione dei flussi di cassa.

---

## 🚀 Funzionalità Principali

- **Dashboard Interattiva**: Monitoraggio in tempo reale di saldi, flussi, grafici di andamento e bento-grid delle scadenze.
- **Transazioni & Riconciliazione**: Gestione dettagliata e ricerca semantica/avanzata delle entrate ed uscite, con supporto multi-conto.
- **Riconoscimento & Regole Automatiche**: Categorizzazione delle transazioni assistita da regole locali configurabili.
- **Importazione ed Esportazione**: Importatore drag-and-drop robusto di file CSV bancari universali ed esportazione flessibile in CSV, JSON o backup SQLite fisico.
- **Master Backup Integrato**: Generatore automatico di pacchetti ZIP pre-configurati (`files.zip` + `db.zip`) pronti per il ripristino istantaneo.

---

## 🛠️ Architettura Tecnologica

- **Frontend**: React 18, Vite, Tailwind CSS per un design ultra-fluido, moderno e ad alto contrasto, animazioni firmate `motion/react` e icone `lucide-react`.
- **Backend (API)**: Express Server con proxy integrato sicuro per salvaguardare le chiavi d'accesso ed elaborazioni server-side.
- **Database**: SQLite gestito tramite driver relazionale nativo ad alte prestazioni, con sistema di persistenza e ripristino istantaneo via API.
- **Deployment & Daemons**: PM2, script di automazione `install.sh` ed utility grafica `installer.php` per hosting condivisi (es. Hostinger).

---

## 💻 Installazione Locale

Per eseguire ed esplorare l'applicazione in locale sulla tua macchina, segui questi passaggi:

### 1. Prerequisiti
Assicurati di aver installato [Node.js](https://nodejs.org/) (versione 18 o superiore) sul tuo sistema.

### 2. Clona il Repository
Una volta esportato l'applet su GitHub, esegui il clone sul tuo computer:
```bash
git clone https://github.com/tuo-username/contosmart.git
cd contosmart
```

### 3. Configura le Variabili d'Ambiente
Copia il file di configurazione di esempio e inserisci le tue variabili (come la chiave di Gemini API):
```bash
cp .env.example .env
```
Modifica il file `.env` aggiungendo la tua chiave (se applicabile):
```env
GEMINI_API_KEY=tua_chiave_gemini
PORT=3000
```

### 4. Installa le Dipendenze ed Avvia il Server di Sviluppo
```bash
# Installa tutti i pacchetti necessari
npm install

# Avvia l'applicazione in modalità sviluppo (Express + Vite HMR)
npm run dev
```
L'applicazione sarà accessibile all'indirizzo `http://localhost:3000` (o sulla porta specificata nel file `.env`).

---

## 📦 Compilazione e Avvio in Produzione

Per compilare l'applicazione per la produzione:

```bash
# Compila il frontend con Vite e il server TypeScript con Esbuild
npm run build

# Avvia l'applicazione compilata e ottimizzata
npm start
```

Il comando `npm run build` genera il client statico nella cartella `./dist` e compila il server in un unico file ottimizzato ed autonomo `dist/server.cjs`, ideale per esecuzioni rapide e sicure.

---

## ☁️ Deploy su Hostinger

Per i dettagli completi su come caricare ed eseguire l'applicazione sui piani hosting condivisi o VPS di **Hostinger** (utilizzando l'installatore grafico integrato `installer.php` o PM2 in SSH), fai riferimento alla guida dedicata:

👉 **[Leggi la Guida Hostinger in README_HOSTINGER.md](./README_HOSTINGER.md)**
