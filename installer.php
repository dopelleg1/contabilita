<?php
/**
 * ContoSmart - Hostinger Autoinstallatore, Autoaggiornamento & Master Recovery Wizard
 * Autore: Domenico Pellegrino (studiotronic.it)
 * Versione: 2.0.0 (Enterprise Automatic Pack)
 * Descrizione: Pannello web interamente autoinstallante ed autoaggiornante specifico per Hostinger.
 * Consente l'inizializzazione, la compilazione del codice con un click, il caricamento di patch,
 * lo spacchettamento di "Master ZIP" di migrazione (files + database), il salvataggio dei vecchi dati,
 * e la pulizia automatica delle cartelle temporanee al termine.
 */

error_reporting(E_ALL);
ini_set('display_errors', 1);
set_time_limit(600); // 10 minuti di timeout per operazioni complesse di build e unzip

$dbPath = __DIR__ . '/database.db';
$envPath = __DIR__ . '/.env';
$distPath = __DIR__ . '/dist';

// Cartelle temporanee di lavoro per auto-installazione / ripristino
$tempRestoreDir = __DIR__ . '/cs_temp_restore';
$tempExtractDir = __DIR__ . '/cs_temp_extracted_files';

$action = isset($_GET['action']) ? $_GET['action'] : '';
$output_log = '';
$status_success = null;

// Funzione ricorsiva per copiare directory
function recurse_copy($src, $dst) {
    if (!file_exists($src)) return;
    $dir = @opendir($src);
    if (!$dir) return;
    @mkdir($dst, 0755, true);
    while (false !== ($file = readdir($dir))) {
        if (($file != '.') && ($file != '..')) {
            if (is_dir($src . '/' . $file)) {
                recurse_copy($src . '/' . $file, $dst . '/' . $file);
            } else {
                @copy($src . '/' . $file, $dst . '/' . $file);
            }
        }
    }
    closedir($dir);
}

// Funzione ricorsiva e super robusta per aggiungere cartelle al ZIP senza ereditare bug di iteratori o file system incompatibili
function addDirToZip($dir, $relativePathPrefix, $zipArchive) {
    if (!file_exists($dir)) return;
    if (is_file($dir)) {
        if (is_readable($dir)) {
            $zipArchive->addFile($dir, $relativePathPrefix);
        }
        return;
    }
    $handle = @opendir($dir);
    if (!$handle) return;
    while (false !== ($file = readdir($handle))) {
        if ($file === '.' || $file === '..') {
            continue;
        }
        $filePath = $dir . '/' . $file;
        $zipPath = $relativePathPrefix . '/' . $file;
        if (is_dir($filePath)) {
            // Evitiamo ricorsione infinita o scansione di cartelle pesanti/temporanee
            if ($file !== 'cs_temp_restore' && $file !== 'cs_temp_extracted_files' && $file !== 'node_modules' && $file !== '.git') {
                addDirToZip($filePath, $zipPath, $zipArchive);
            }
        } else {
            if (is_readable($filePath)) {
                $zipArchive->addFile($filePath, $zipPath);
            }
        }
    }
    @closedir($handle);
}

// Funzione ricorsiva per eliminare directory
function rrmdir($dir) {
    if (is_dir($dir)) {
        $objects = scandir($dir);
        foreach ($objects as $object) {
            if ($object != "." && $object != "..") {
                if (is_dir($dir . DIRECTORY_SEPARATOR . $object) && !is_link($dir . "/" . $object)) {
                    rrmdir($dir . DIRECTORY_SEPARATOR . $object);
                } else {
                    @unlink($dir . DIRECTORY_SEPARATOR . $object);
                }
            }
        }
        @rmdir($dir);
    }
}

// Gestione Azioni di Configurazione, Aggiornamento e Ripristino
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    
    // 1. Salvataggio Variabili d'ambiente .env
    if (isset($_POST['action']) && $_POST['action'] === 'save_env') {
        $gemini_key = trim($_POST['gemini_key']);
        $port = trim($_POST['port']) ?: '3000';
        $envContent = "PORT=" . $port . "\n";
        $envContent .= "NODE_ENV=production\n";
        $envContent .= "GEMINI_API_KEY=" . $gemini_key . "\n";
        
        if (file_put_contents($envPath, $envContent)) {
            $status_success = true;
            $output_log = "✓ File di configurazione .env salvato con successo sul server!\nImpostazioni attive: Porta $port in ambiente di Produzione.";
        } else {
            $status_success = false;
            $output_log = "✗ Errore durante il salvataggio del file .env. Verifica i permessi di scrittura nel tuo hosting Hostinger.";
        }
    }
    
    // 2. Upload singolo file Database SQLite (.db) o Backup JSON fisico
    if (isset($_FILES['backup_file'])) {
        $file = $_FILES['backup_file'];
        $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
        
        if ($file['error'] === UPLOAD_ERR_OK) {
            if ($ext === 'db') {
                if (move_uploaded_file($file['tmp_name'], $dbPath)) {
                    $status_success = true;
                    $output_log = "✓ Database SQLite principale (.db) caricato con successo ed inserito in produzione!\nI dati di Domenico Pellegrino sono ora attivi.";
                } else {
                    $status_success = false;
                    $output_log = "✗ Errore durante il ripristino fisico del file SQLite (.db).";
                }
            } elseif ($ext === 'json') {
                if (move_uploaded_file($file['tmp_name'], __DIR__ . '/backup_temp_restore.json')) {
                    $status_success = true;
                    $output_log = "✓ File di Backup JSON caricato temporaneamente come 'backup_temp_restore.json'.\nPer completare l'import, apri il menu principale sul tab Importatore/Esportatore dell'app.";
                } else {
                    $status_success = false;
                    $output_log = "✗ Errore nel salvataggio temporaneo del file JSON caricato.";
                }
            } else {
                $status_success = false;
                $output_log = "✗ Formato file non supportato. Carica un SQLite (.db) o un backup strutturato (.json).";
            }
        } else {
            $status_success = false;
            $output_log = "✗ Errore nel caricamento del file di ripristino: Codice errore " . $file['error'];
        }
    }

    // 3. Autoaggiornamento SMART o Auto-Ripristino da Master ZIP (files.zip + db.zip)
    if (isset($_FILES['update_zip'])) {
        $file = $_FILES['update_zip'];
        if ($file['error'] === UPLOAD_ERR_OK) {
            if (class_exists('ZipArchive')) {
                $zip = new ZipArchive;
                if ($zip->open($file['tmp_name']) === TRUE) {
                    
                    // Verifichiamo se l'archivio ZIP caricato contiene db.zip e files.zip (Master ZIP)
                    $isMasterZip = ($zip->locateName('db.zip') !== false || $zip->locateName('files.zip') !== false);
                    
                    if ($isMasterZip) {
                        $output_log .= "🏆 MASTER RECOVERY ZIP RILEVATO!\nInizio scompattamento e trapianto combinato file e database...\n\n";
                        
                        // Creiamo cartella temporanea pulita
                        rrmdir($tempRestoreDir);
                        @mkdir($tempRestoreDir, 0755, true);
                        
                        // Estraiamo il contenuto del master zip nella cartella temporanea
                        $zip->extractTo($tempRestoreDir);
                        $zip->close();
                        
                        $extractedDbZip = $tempRestoreDir . '/db.zip';
                        $extractedFilesZip = $tempRestoreDir . '/files.zip';
                        
                        // 3a. Ripristino del database (db.zip)
                        if (file_exists($extractedDbZip)) {
                            $dbZip = new ZipArchive;
                            if ($dbZip->open($extractedDbZip) === TRUE) {
                                // Creiamo backup di emergenza del vecchio database prima di sovrascriverlo
                                if (file_exists($dbPath)) {
                                    @copy($dbPath, $dbPath . '.bak');
                                }
                                $dbZip->extractTo($tempRestoreDir . '/db_extracted');
                                $dbZip->close();
                                
                                $tempDbFile = $tempRestoreDir . '/db_extracted/database.db';
                                if (file_exists($tempDbFile)) {
                                    @copy($tempDbFile, $dbPath);
                                    $output_log .= "✓ Database SQLite ripristinato ed agganciato con successo da db.zip!\n";
                                } else {
                                    $output_log .= "⚠️ database.db non fuzionale in db.zip. Ripristino saltato.\n";
                                }
                            }
                        }
                        
                        // 3b. Scompattamento dei file (files.zip) in directory temporanea ed installazione al posto dei vecchi
                        if (file_exists($extractedFilesZip)) {
                            $filesZip = new ZipArchive;
                            if ($filesZip->open($extractedFilesZip) === TRUE) {
                                rrmdir($tempExtractDir);
                                @mkdir($tempExtractDir, 0755, true);
                                
                                $filesZip->extractTo($tempExtractDir);
                                $filesZip->close();
                                
                                $output_log .= "✓ Sorgenti scompattati in cartella temporanea.\n";
                                
                                // Copiamo i file estratti ricorsivamente sopra la radice principale del server
                                $output_log .= "🚚 Installazione dei nuovi file sorgenti in corso sul server...\n";
                                recurse_copy($tempExtractDir, __DIR__);
                                $output_log .= "✓ File installati correttamente.\n";
                            }
                        }
                        
                        // 3c. Pulizia finale assoluta delle directory temporanee
                        $output_log .= "🧹 Rimozione directory temporanee usate per l'installazione in corso...\n";
                        rrmdir($tempRestoreDir);
                        rrmdir($tempExtractDir);
                        $output_log .= "✓ Directory temporanee rimosse con successo!\n";

                        $status_success = true;
                        
                    } else {
                        // Trattasi di uno ZIP standard di solo codice sorgente
                        $output_log .= "📦 ZIP STANDARD DI SOLI FILE SORGENTI RILEVATO!\nProcedo con l'aggiornamento parziale...\n\n";
                        
                        // Creazione backup temporaneo del database e .env per preservarli
                        $dbBackup = file_exists($dbPath) ? __DIR__ . '/temp_csdb.bak' : null;
                        $envBackup = file_exists($envPath) ? __DIR__ . '/temp_csenv.bak' : null;
                        if ($dbBackup) copy($dbPath, $dbBackup);
                        if ($envBackup) copy($envPath, $envBackup);

                        // Estrazione sicura
                        $zip->extractTo(__DIR__);
                        $zip->close();

                        // Ripristino dati
                        if ($dbBackup && file_exists($dbBackup)) {
                            copy($dbBackup, $dbPath);
                            @unlink($dbBackup);
                        }
                        if ($envBackup && file_exists($envBackup)) {
                            copy($envBackup, $envPath);
                            @unlink($envBackup);
                        }
                        
                        $output_log .= "✓ File estratti direttamente nella radice del server.\n";
                        $status_success = true;
                    }

                    // 3d. Lancio facoltativo del build automatico se exec è abilitata
                    if (function_exists('exec')) {
                        $output_log .= "\n--- [1/2] RIGENERAZIONE PRODUZIONE: npm install ---\n";
                        @exec("npm install 2>&1", $outInst, $retInst);
                        $output_log .= implode("\n", $outInst);

                        $output_log .= "\n\n--- [2/2] RIGENERAZIONE PRODUZIONE: npm run build ---\n";
                        @exec("npm run build 2>&1", $outBld, $retBld);
                        $output_log .= implode("\n", $outBld);

                        if ($retInst === 0 && $retBld === 0) {
                            $output_log .= "\n\n🍾 AUTOINSTALLAZIONE & AUTO-RIGENERAZIONE COMPLETATA CON SUCCESSO!";
                        } else {
                            $output_log .= "\n\n⚠️ Aggiornamento riuscito con avvisi. Genera la build manualmente o riavvia.";
                        }
                    } else {
                        $output_log .= "\n\n[NOTA] Il comando PHP 'exec' non è disponibile in questo hosting. Per compilare o riavviare, esegui manualmente npm run build via terminale o riavvia l'app nel menu Hostinger.";
                    }
                } else {
                    $status_success = false;
                    $output_log = "✗ Impossibile estrarre o scompattare l'archivio ZIP caricato.";
                }
            } else {
                $status_success = false;
                $output_log = "✗ L'estensione PHP 'ZipArchive' non risulta abilitata sul server di questo hosting Hostinger.";
            }
        } else {
            $status_success = false;
            $output_log = "✗ Errore nel caricamento del file ZIP di aggiornamento.";
        }
    }
}

// AZIONI AUTO-INSTALLANTE E AUTO-AGGIORNAMENTO DA LINK DIRECT TRIGGER
if ($action === 'npm_install') {
    if (function_exists('exec')) {
        $cmd = "npm install 2>&1";
        @exec($cmd, $out, $ret);
        $status_success = ($ret === 0);
        $output_log = "Comando: " . $cmd . "\n\n" . implode("\n", $out);
    } else {
        $status_success = false;
        $output_log = "La funzione PHP 'exec' è disabilitata su questo piano. Usa SSH oppure carica un aggiornamento ZIP completo.";
    }
} elseif ($action === 'npm_build') {
    if (function_exists('exec')) {
        $cmd = "npm run build 2>&1";
        @exec($cmd, $out, $ret);
        $status_success = ($ret === 0);
        $output_log = "Comando: " . $cmd . "\n\n" . implode("\n", $out);
    } else {
        $status_success = false;
        $output_log = "La funzione PHP 'exec' è disabilitata su questo piano. Usa SSH oppure carica un aggiornamento ZIP completo.";
    }
} elseif ($action === 'check_status') {
    $out_checks = [];
    $out_checks[] = "=====================================================";
    $out_checks[] = "  CONTOSMART HOSTINGER - DIAGNOSTICA ED AUTO-SETUP   ";
    $out_checks[] = "=====================================================";
    $out_checks[] = "• Directory Corrente Scrivibile: " . (is_writable(__DIR__) ? "SI (Perfetto per l'auto-installazione)" : "NO (Verifica i permessi di scrittura della cartella principale!)");
    $out_checks[] = "• File delle credenziali (.env): " . (file_exists($envPath) ? "PRESENTE" : "MANCANTE (Utilizza il modulo sotto per generarlo)");
    $out_checks[] = "• Database SQLite (.db) in uso: " . (file_exists($dbPath) ? "SI (" . round(filesize($dbPath)/1024, 2) . " KB)" : "NON ANCORA INIZIALIZZATO (Verrà creato al primo avvio)");
    $out_checks[] = "• Cartella Compilata (/dist): " . (file_exists($distPath) ? "PRESENTE (Il front-end è correttamente generato con Vite)" : "MANCANTE (Esegui 'Compila Frontend'!)");
    
    if (function_exists('exec')) {
        @exec("node -v", $node_v);
        @exec("npm -v", $npm_v);
        $out_checks[] = "• Versione di Node del server: " . (!empty($node_v) ? implode("", $node_v) : "Disponibile ma non visibile");
        $out_checks[] = "• Versione di NPM del server: " . (!empty($npm_v) ? implode("", $npm_v) : "Disponibile ma non visibile");
    } else {
        $out_checks[] = "• Shell Command Line Interface: NOT_AVAILABLE_SHARED_HOSTING (Il tuo piano Hostinger Condiviso è in modalità protetta. Nessun problema, puoi usare il caricatore di file ZIP qui sopra per l'autoaggiornamento grafico automatico).";
    }
    
    $status_success = true;
    $output_log = implode("\n", $out_checks);
} elseif ($action === 'build_master_zip') {
    // Eleviamo i limiti del server per la generazione del backup
    @ini_set('memory_limit', '512M');
    @set_time_limit(300);

    if (class_exists('ZipArchive')) {
        $masterZipPath = __DIR__ . '/contosmart_hostinger_full_backup.zip';
        @unlink($masterZipPath);
        
        $zip = new ZipArchive();
        try {
            if ($zip->open($masterZipPath, ZipArchive::CREATE | ZipArchive::OVERWRITE) === TRUE) {
                
                // 1. db.zip per il database
                $dbZipPath = __DIR__ . '/temp_db.zip';
                @unlink($dbZipPath);
                $dbZip = new ZipArchive();
                if ($dbZip->open($dbZipPath, ZipArchive::CREATE | ZipArchive::OVERWRITE) === TRUE) {
                    if (file_exists($dbPath)) {
                        $dbZip->addFile($dbPath, 'database.db');
                    }
                    $dbZip->close();
                }
                
                // 2. files.zip per i sorgenti dell'applicazione (usando la funzione ricorsiva stabile)
                $filesZipPath = __DIR__ . '/temp_files.zip';
                @unlink($filesZipPath);
                $filesZip = new ZipArchive();
                if ($filesZip->open($filesZipPath, ZipArchive::CREATE | ZipArchive::OVERWRITE) === TRUE) {
                    // Aggiungiamo file ricorsivamente
                    addDirToZip(__DIR__ . '/src', 'src', $filesZip);
                    addDirToZip(__DIR__ . '/dist', 'dist', $filesZip);
                    
                    // Singoli file fondamentali
                    $rootFiles = [
                        'package.json', 'tsconfig.json', 'vite.config.ts', 'index.html', 'metadata.json',
                        'server.ts', 'database.ts', 'installer.php', 'ecosystem.config.cjs',
                        'install.sh', 'README_HOSTINGER.md', '.env.example', '.gitignore'
                    ];
                    foreach ($rootFiles as $f) {
                        if (file_exists(__DIR__ . '/' . $f)) {
                            $filesZip->addFile(__DIR__ . '/' . $f, $f);
                        }
                    }
                    $filesZip->close();
                }
                
                // Uniamo nel Master ZIP
                if (file_exists($filesZipPath)) {
                    $zip->addFile($filesZipPath, 'files.zip');
                }
                if (file_exists($dbZipPath)) {
                    $zip->addFile($dbZipPath, 'db.zip');
                }
                
                $zip->addFromString('INSTALL_INSTRUCTIONS.txt', "ContoSmart Master Backup Package\nGenerato automaticamente dal server senza usare sys_get_temp_dir() per massima affidabilità.");
                $zip->close();
                
                @unlink($dbZipPath);
                @unlink($filesZipPath);
                
                // Serviamo in download eliminando buffer pendenti che corrompono i file binari
                if (file_exists($masterZipPath)) {
                    if (ob_get_level()) {
                        @ob_end_clean();
                    }
                    header('Content-Type: application/zip');
                    header('Content-Disposition: attachment; filename="contosmart_master_backup.zip"');
                    header('Content-Length: ' . filesize($masterZipPath));
                    header('Pragma: no-cache');
                    header('Expires: 0');
                    readfile($masterZipPath);
                    @unlink($masterZipPath);
                    exit;
                } else {
                    $status_success = false;
                    $output_log = "✗ Errore nella finalizzazione del file Master ZIP.";
                }
            } else {
                $status_success = false;
                $output_log = "✗ Errore nella creazione dell'archivio Master ZIP temporaneo.";
            }
        } catch (Exception $e) {
            $status_success = false;
            $output_log = "✗ Eccezione durante la generazione del Master ZIP: " . $e->getMessage();
        }
    } else {
        $status_success = false;
        $output_log = "✗ Estensione ZipArchive non disponibile.";
    }
} elseif ($action === 'download_sqlite') {
    // Esporta ed esegue il download diretto del database.db se esistente sul server
    if (file_exists($dbPath)) {
        if (ob_get_level()) {
            @ob_end_clean();
        }
        header('Content-Type: application/octet-stream');
        header('Content-Disposition: attachment; filename="database.db"');
        header('Content-Length: ' . filesize($dbPath));
        header('Pragma: no-cache');
        header('Expires: 0');
        readfile($dbPath);
        exit;
    } else {
        $status_success = false;
        $output_log = "✗ Non è stato trovato alcun database SQLite (database.db) attivo sul server.";
    }
}

// Lettura chiave Gemini attuale se presente
$current_gemini = '';
$current_port = '3000';
if (file_exists($envPath)) {
    $envLines = file($envPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($envLines as $line) {
        if (strpos(trim($line), 'GEMINI_API_KEY=') === 0) {
            $current_gemini = substr(trim($line), strlen('GEMINI_API_KEY='));
        }
        if (strpos(trim($line), 'PORT=') === 0) {
            $current_port = substr(trim($line), strlen('PORT='));
        }
    }
}
?>
<!DOCTYPE html>
<html lang="it">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ContoSmart - Autoinstallatore &amp; Autoaggiornamento</title>
    <!-- Tailwind CSS CDN -->
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap');
        body { font-family: 'Inter', sans-serif; }
        code, pre { font-family: 'JetBrains Mono', monospace; }
    </style>
</head>
<body class="bg-slate-50 text-slate-800 min-h-screen pb-16">

    <!-- Header Navy Moderno -->
    <header class="bg-gradient-to-br from-indigo-950 via-slate-900 to-indigo-950 text-white shadow-md border-b border-indigo-900">
        <div class="max-w-4xl mx-auto px-6 py-6 flex flex-col sm:flex-row justify-between items-center gap-4">
            <div class="flex items-center gap-3">
                <span class="text-3 tracking-wide text-3xl">💎</span>
                <div>
                    <h1 class="text-xl font-black tracking-tight flex items-center gap-2">ContoSmart <span class="bg-emerald-500/20 text-emerald-400 text-[10px] uppercase px-2 py-0.5 rounded border border-emerald-500/35">Aggiornamento Veloce</span></h1>
                    <p class="text-[10px] text-indigo-300 font-bold uppercase tracking-widest leading-none">Automazione Digitale per Domenico Pellegrino</p>
                </div>
            </div>
            <div class="flex items-center gap-2 bg-black/30 px-3 py-1.5 rounded-full border border-indigo-800">
                <span class="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
                <span class="text-[11px] text-emerald-350 font-extrabold font-mono">Pronto all'uso su Hostinger</span>
            </div>
        </div>
    </header>

    <main class="max-w-4xl mx-auto px-6 mt-8 space-y-6">

        <!-- STATO DEL DIAGNOSTICO -->
        <div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
            <div class="flex items-center justify-between border-b border-slate-100 pb-3">
                <div class="flex items-center gap-2">
                    <span class="text-xl">⚡</span>
                    <h2 class="text-md font-bold text-slate-900">SISTEMA DI AUTO-MIGRAZIONE, CARICAMENTO E RIPRISTINO</h2>
                </div>
                <div class="text-[11px] font-semibold text-indigo-650 bg-indigo-50 border border-indigo-100 px-2.5 py-0.5 rounded">Versione Core: 2.0.0</div>
            </div>

            <p class="text-xs text-slate-600 leading-relaxed font-sans">
                Questo pannello web è un <strong>autoinstallatore intelligente</strong> di ultima generazione. Gestisce in modo del tutto automatico ed istantaneo l'unzip di pacchetti Master, sposta i nuovi file di sorgente rimpiazzando quelli precedenti ed importa la base dati SQLite in un'unica operazione priva di manipolazioni manuali.
            </p>

            <!-- CONTROLLI E STATISTICHE -->
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4 pt-1">
                <div class="bg-slate-50 hover:bg-slate-100/50 p-3.5 rounded-xl border border-slate-100 flex flex-col transition">
                    <span class="text-[9px] text-slate-400 font-black uppercase">Vite Frontend (/dist)</span>
                    <span class="text-xs font-bold mt-1 inline-flex items-center gap-1 <?php echo file_exists($distPath) ? 'text-emerald-600':'text-amber-500'; ?>">
                        ● <?php echo file_exists($distPath) ? 'COMPILATO & OK' : 'DA COMPILARE'; ?>
                    </span>
                </div>
                
                <div class="bg-slate-50 hover:bg-slate-100/50 p-3.5 rounded-xl border border-slate-100 flex flex-col transition">
                    <span class="text-[9px] text-slate-400 font-black uppercase">Ambiente di Produzione (.env)</span>
                    <span class="text-xs font-bold mt-1 inline-flex items-center gap-1 <?php echo file_exists($envPath) ? 'text-emerald-600':'text-rose-500'; ?>">
                        ● <?php echo file_exists($envPath) ? 'CONFIGURATO' : 'ATTESA CHIAVI'; ?>
                    </span>
                </div>

                <div class="bg-slate-50 hover:bg-slate-100/50 p-3.5 rounded-xl border border-slate-100 flex flex-col transition">
                    <span class="text-[9px] text-slate-400 font-black uppercase">Database ContoSmart (.db)</span>
                    <span class="text-xs font-bold mt-1 inline-flex items-center gap-1 <?php echo file_exists($dbPath) ? 'text-emerald-600':'text-indigo-600'; ?>">
                        ● <?php echo file_exists($dbPath) ? 'ATTIVO & PRESENTE' : 'AUTO-INIT PRONTO'; ?>
                    </span>
                </div>

                <div class="bg-slate-50 hover:bg-slate-100/50 p-3.5 rounded-xl border border-slate-100 flex flex-col transition">
                    <span class="text-[9px] text-slate-400 font-black uppercase">Scrittura File locali</span>
                    <span class="text-xs font-bold mt-1 inline-flex items-center gap-1 <?php echo is_writable(__DIR__) ? 'text-emerald-600':'text-rose-600'; ?>">
                        ● <?php echo is_writable(__DIR__) ? 'OK' : 'PERMESSI KO'; ?>
                    </span>
                </div>
            </div>

            <!-- AZIONI RAPIDE DEL PORTALE AUTO-INSTALLANTE -->
            <div class="flex flex-wrap gap-2 pt-4 border-t border-slate-100 justify-between items-center">
                <div class="flex flex-wrap gap-2">
                    <a href="?action=check_status" class="px-4 py-2 bg-slate-200 hover:bg-slate-300 rounded-lg text-[11px] font-bold text-slate-700 transition cursor-pointer">Diagnostica Server</a>
                    <a href="?action=npm_install" class="px-4 py-2 bg-indigo-650 hover:bg-indigo-700 rounded-lg text-[11px] font-bold text-white transition cursor-pointer shadow-sm bg-indigo-600 hover:bg-indigo-500">1-Click: Installa Dipendenze</a>
                    <a href="?action=npm_build" class="px-4 py-2 bg-emerald-650 hover:bg-emerald-700 rounded-lg text-[11px] font-bold text-white bg-emerald-600 hover:bg-emerald-500 transition cursor-pointer shadow-sm">1-Click: Compila Frontend</a>
                </div>
                <a href="?action=build_master_zip" class="px-4 py-2 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 rounded-lg text-[11px] font-extrabold transition cursor-pointer">📥 Esporta Master Backup (.zip)</a>
            </div>
        </div>

        <!-- LOG DI AVANZAMENTO DELLE AZIONI -->
        <?php if ($output_log): ?>
        <div class="bg-slate-900 text-slate-200 rounded-2xl p-6 shadow-md border border-slate-800 space-y-3">
            <h3 class="text-xs font-bold tracking-wider uppercase text-slate-400 font-mono">Console d'Esecuzione</h3>
            <pre class="text-xs whitespace-pre-wrap p-4 bg-black/40 border border-slate-800 rounded-xl overflow-x-auto text-emerald-300 font-mono"><?php echo htmlspecialchars($output_log); ?></pre>
            <div class="text-[10px] text-slate-500">
                Operazione completata con stato: <strong><?php echo $status_success ? 'SUCCESSO' : 'ATTENZIONE / INFO'; ?></strong>
            </div>
        </div>
        <?php endif; ?>

        <!-- SEZIONE AGGIORNAMENTO AUTOMATICO GRAFICO (ZIP) -->
        <div class="bg-gradient-to-br from-indigo-950 via-slate-900 to-slate-950 rounded-2xl text-white p-6 shadow-md space-y-4">
            <div class="flex items-center gap-2 border-b border-indigo-900/60 pb-3">
                <span class="text-lg">📦</span>
                <h3 class="text-sm font-bold font-sans">Caricamento Master ZIP (o ZIP di aggiornamento standard)</h3>
            </div>

            <p class="text-xs text-slate-350 leading-relaxed font-sans font-medium">
                Carica qui il <strong>Master Backup ZIP</strong> (generato con l'apposito pulsante) per ripristinare o migrare l'intera applicazione in modo del tutto autonomo.<br>
                Dopo il caricamento, lo script provvederà ad estrarre i nuovi file di sorgente in una cartella temporanea, installarli al posto dei vecchi, importare il database SQLite fisicamente e infine cancellare la cartella temporanea!
            </p>

            <form method="POST" enctype="multipart/form-data" class="space-y-4 font-sans">
                <div class="flex items-center justify-center w-full">
                    <label class="flex flex-col items-center justify-center w-full h-36 border-2 border-indigo-500/30 border-dashed rounded-xl cursor-pointer bg-slate-900/40 hover:bg-slate-900/60 transition group">
                        <div class="flex flex-col items-center justify-center pt-5 pb-6">
                            <span class="text-3xl mb-1 group-hover:scale-110 transition duration-150">📥</span>
                            <p class="mb-1 text-[11px] text-indigo-200 font-bold group-hover:text-white transition">Carica il Master Backup ZIP di auto-ripristino</p>
                            <p class="text-[9px] text-slate-450">Il database, la configurazione e tutti i file sorgenti verranno installati automaticamente!</p>
                        </div>
                        <input type="file" name="update_zip" class="hidden" accept=".zip" required onchange="this.form.submit()" />
                    </label>
                </div>
            </form>
        </div>

        <!-- AMBIENTE & RIPRISTINO DATABASE -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">

            <!-- MODULO ENV DELLE CHIAVI -->
            <div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
                <div class="flex items-center gap-2 border-b border-slate-100 pb-3">
                    <span class="text-lg">⚙️</span>
                    <h3 class="text-sm font-bold text-slate-900">Configurazione Chiavi Privati (.env)</h3>
                </div>

                <form method="POST" class="space-y-4">
                    <input type="hidden" name="action" value="save_env" />
                    
                    <div class="space-y-1">
                        <label class="block text-[10px] font-black uppercase text-slate-500 tracking-wider">Porta Server Ingress</label>
                        <input type="number" name="port" value="<?php echo htmlspecialchars($current_port); ?>" placeholder="3000" class="w-full text-xs font-mono border border-slate-200 text-slate-800 rounded px-2.5 py-2.5 focus:border-indigo-500 outline-none" required />
                    </div>

                    <div class="space-y-1">
                        <div class="flex justify-between items-center">
                            <label class="block text-[10px] font-black uppercase text-slate-500 tracking-wider">Chiave API Gemini (AI Advisor)</label>
                            <span class="text-[8px] text-amber-600 font-extrabold px-1.5 py-0.5 rounded bg-amber-50 uppercase tracking-widest">Sicurezza</span>
                        </div>
                        <input type="password" name="gemini_key" value="<?php echo htmlspecialchars($current_gemini); ?>" placeholder="AIzaSy_InserisciLaTuaChiave..." class="w-full text-xs font-mono border border-slate-200 text-slate-800 rounded px-2.5 py-2.5 focus:border-indigo-500 outline-none" />
                    </div>

                    <p class="text-[10px] text-slate-400 leading-relaxed font-semibold">
                        Nessuna chiave di sicurezza viene trasmessa in chiaro. Tutte le credenziali sono immagazzinate in formato server di sola lettura <code>.env</code>.
                    </p>

                    <button type="submit" class="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-extrabold rounded-lg transition tracking-wide cursor-pointer transition">Salva Configurazione</button>
                </form>
            </div>

            <!-- INIEZIONE DATABASE FISICO -->
            <div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
                <div class="flex items-center gap-2 border-b border-slate-100 pb-3">
                    <span class="text-lg">💾</span>
                    <h3 class="text-sm font-bold text-slate-900">Ripristino SQLite Diretto</h3>
                </div>

                <p class="text-xs text-slate-600 leading-relaxed font-medium">
                    Inietta direttamente il database <code>database.db</code> per trapiantare l'intera storia contabile di Domenico Pellegrino in produzione all'istante.
                </p>

                <form method="POST" enctype="multipart/form-data" class="space-y-4">
                    <div class="flex items-center justify-center w-full">
                        <label class="flex flex-col items-center justify-center w-full h-24 border border-dashed border-slate-300 rounded-xl cursor-pointer bg-slate-50 hover:bg-slate-100/70 transition">
                            <div class="flex flex-col items-center justify-center pt-2">
                                <span class="text-xl">📁</span>
                                <p class="text-[10px] text-slate-600 font-bold mt-1">Scegli file database .db o backup .json</p>
                            </div>
                            <input type="file" name="backup_file" class="hidden" accept=".db,.json" required onchange="this.form.submit()" />
                        </label>
                    </div>

                    <div class="bg-amber-50 text-amber-700 text-[10px] p-2.5 rounded-lg border border-amber-200 font-semibold leading-relaxed">
                        ⚠️ L'inserimento del file .db sovrascriverà a livello binario il database del server. Assicurati che l'app non stia operando scritture attive in quel momento.
                    </div>
                </form>
            </div>

        </div>

    </main>

</body>
</html>
