#!/bin/bash

# ==============================================================================
# ContoSmart - Script di Installazione Automatica e Avvio Produzione (Hostinger)
# ==============================================================================

# Colore output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}=====================================================${NC}"
echo -e "${GREEN}    ContoSmart - Installatore Automatico per Hostinger   ${NC}"
echo -e "${BLUE}=====================================================${NC}"

# 1. Verifica requisiti Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}[ERRORE] Node.js non è installato. Installa Node.js v18 o superiore.${NC}"
    exit 1
fi

NODE_VERSION=$(node -v)
echo -e "${GREEN}[OK] Trovato Node.js: $NODE_VERSION${NC}"

# 2. Copia l'ambiente .env se non esiste
if [ ! -f .env ]; then
    echo -e "${YELLOW}[INFO] File .env non presente. Creazione da .env.example...${NC}"
    if [ -f .env.example ]; then
        cp .env.example .env
        echo -e "${GREEN}[OK] File .env creato. Ricordati di configurare le tue api keys qui dentro!${NC}"
    else
        touch .env
        echo "PORT=3000" >> .env
        echo -e "${GREEN}[OK] File .env vuoto creato con PORT=3000.${NC}"
    fi
fi

# 3. Installazione dipendenze npm
echo -e "${BLUE}[1/4] Installazione delle dipendenze in corso (npm install)...${NC}"
npm install
if [ $? -ne 0 ]; then
    echo -e "${RED}[ERRORE] Errore durante npm install. Verifica i log.${NC}"
    exit 1
fi
echo -e "${GREEN}[OK] Dipendenze installate correttamente.${NC}"

# 4. Compilazione dell'applicazione (Vite + esbuild backend)
echo -e "${BLUE}[2/4] Generazione della build di produzione (npm run build)...${NC}"
npm run build
if [ $? -ne 0 ]; then
    echo -e "${RED}[ERRORE] Errore durante la compilazione (npm run build).${NC}"
    exit 1
fi
echo -e "${GREEN}[OK] Build completata. File generati in ./dist/${NC}"

# 5. Configurazione database sqlite vuoto se non esiste
if [ ! -f database.db ]; then
    echo -e "${BLUE}[3/4] Inizializzazione del database SQLite vuoto...${NC}"
    # Si autoinizializzerà al primo avvio del server
    echo -e "${GREEN}[OK] Il database verrà autoinizializzato al primo avvio su database.db${NC}"
fi

# 6. Avvio tramite PM2 se disponibile
echo -e "${BLUE}[4/4] Configurazione del processo di avvio permanente...${NC}"
if command -v pm2 &> /dev/null; then
    echo -e "${GREEN}[OK] PM2 rilanciato! Avvio del processo tramite ecosystem.config.cjs...${NC}"
    pm2 delete contosmart 2>/dev/null
    pm2 start ecosystem.config.cjs
    pm2 save
    echo -e "${GREEN}=====================================================${NC}"
    echo -e "${GREEN}  INSTALLAZIONE COMPLETATA CON SUCCESSO CON PM2!       ${NC}"
    echo -e "${GREEN}  Il server risponde sulla porta 3000 in background.    ${NC}"
    echo -e "${GREEN}  Visualizza lo stato con: pm2 status                  ${NC}"
    echo -e "${GREEN}=====================================================${NC}"
else
    echo -e "${YELLOW}[NOTIFICA] PM2 (process manager) non è installato a livello globale.${NC}"
    echo -e "${YELLOW}Puoi installarlo con: npm install -g pm2${NC}"
    echo -e "${YELLOW}Oppure puoi avviare manualmente l'applicazione con:${NC}"
    echo -e "${BLUE}  npm run start${NC}"
    echo -e "${GREEN}=====================================================${NC}"
    echo -e "${GREEN}  INSTALLAZIONE COMPLETATA CON AVVIO MANUALE!         ${NC}"
    echo -e "${GREEN}=====================================================${NC}"
fi
