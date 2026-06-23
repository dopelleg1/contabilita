/**
 * Hostinger App Hosting Entry Point
 * Questo file fa da ponte per consentire a Hostinger di rilevare ed avviare server.js.
 * Utilizza un import dinamico per evitare errori di validazione se la cartella 'dist'
 * non è stata ancora compilata dal build system.
 */
async function start() {
  try {
    await import('./dist/server.cjs');
  } catch (err) {
    console.warn("[Hostinger Validation/Startup Check] Impossibile caricare dist/server.cjs (probabilmente non ancora compilato):", err.message);
    // Non crashiamo se siamo in fase di scansione/rilevamento di Hostinger
    if (process.env.NODE_ENV === 'production') {
      console.log("In attesa che venga completata la build...");
    }
  }
}
start();

