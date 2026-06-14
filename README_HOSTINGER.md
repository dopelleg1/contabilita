# Guida di Avvio ed Installazione in Produzione su Hostinger 🚀

Questa guida illustra dettagliatamente come importare, configurare ed eseguire in produzione l'applicazione **ContoSmart** sul tuo hosting **Hostinger** (VPS o piano Hosting Node.js / cPanel), inclusa la configurazione del sistema automatico di Backup e Ripristino.

---

## 🛠️ Contenuto del Pacchetto Hostinger Deployment

Il codice contiene tre script pronti per ottimizzare l'ambiente Hostinger:
*   `installer.php`: Portale web grafico autoinstallante. Se caricato in una directory web, consente di compilare ed installare le dipendenze, configurare la porta e le chiavi `.env`, e iniettare file di backup fisici `.db` direttamente dal browser.
*   `ecosystem.config.cjs`: File di configurazione **PM2** per mantenere l'applicazione Node.js sempre accesa in background sul server.
*   `install.sh`: Bash script automatico per installare le dipendenze Node, compilare il front-end con Vite, e schedulare l'avvio sicuro tramite PM2.

---

## 🏎️ Strategia 1: Deploy Rapido tramite `installer.php` (Interfaccia Web)

Se utilizzi un piano Hostinger Condiviso con supporto Node.js, puoi fare tutto via browser:

1.  **Carica i file** dell'applicazione tramite la sezione *Gestione File / FTP* di Hostinger nella cartella principale del tuo dominio.
2.  **Apri l'installatore** digitale nel browser all'indirizzo `https://tuo-dominio.com/installer.php`.
3.  **Configura l'ambiente**: Inserisci la tua chiave API di Gemini ed imposta la porta (es. `3000`). Clicca su **Salva Configurazione**.
4.  **Inizializza l'applicazione**: Clicca su **Esegui npm install** e successivamente su **Esegui Build Vite** per compilare l'interfaccia ad alte prestazioni.
5.  **Configura Node in Hostinger**: Nel pannello Hostinger, seleziona Node.js, configura l'applicazione indicando come file di avvio principale: `dist/server.cjs` e clicca su **Avvia**.

---

## 💻 Strategia 2: Deploy tramite Shell SSH o VPS (Consigliato)

Se possiedi un piano VPS o hai accesso SSH abilitato su Hostinger:

1.  Collegati al server tramite SSH:
    ```bash
    ssh utente@server-hostinger.com
    ```
2.  Naviga nella cartella in cui hai caricato il codice:
    ```bash
    cd public_html/contosmart
    ```
3.  Rendi eseguibile lo script di autoinstallazione ed eseguito:
    ```bash
    chmod +x install.sh
    ./install.sh
    ```
    *Questo script installerà automaticamente le dipendenze, compilerà il frontend con Vite e avvierà in sicurezza il server Node in background tramite PM2 daemonizer.*

---

## 💾 Gestione Sicurezza, Backup & Ripristino (SQLite + JSON)

ContoSmart dispone di tre canali di salvaguardia dati per Domenico Pellegrino:

### 1. Esportazione JSON
*   **Perché:** Genera un file portabile interoperabile contenente transazioni, conti e regole di categorizzazione personalizzate.
*   **Come Ripristinare:** All'interno del tab **Importa/Esporta**, seleziona "Ripristina da un Backup (.json)" e carica il file.

### 2. Download File SQLite Binario
*   **Perché:** Permette di possedere la copia fisica esatta e speculare del database relazionale locale `database.db`.
*   **Come Scaricare:** Clicca su **Scarica SQLite (.db)** all'interno della sezione Backup dell'applicazione.

### 3. Ripristino del File SQLite Fisico (.db) - NOVITÀ
*   **Browser:** Trascina o carica direttamente il file `.db` all'interno dell'interfaccia web di `installer.php` per ripristinare fisicamente il file al 100% sul server.
*   **SSH:** Sostituisci manualmente il file `database.db` caricandolo via SFTP, quindi riavvia l'applicazione con `pm2 restart contosmart`.

---

## 📌 Configurazione Specifica Nginx Reverse Proxy su Hostinger

Se configuri la porta `3000` per Node.js, assicurati di configurare l'indirizzo IP del server o istanza e reindirizzare la porta web (80/443) col proxy Nginx:

```nginx
server {
    listen 80;
    server_name contosmart.studiotronic.it;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```
