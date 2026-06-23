import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import ErrorBoundary from './components/ErrorBoundary.tsx';
import './index.css';

// Intercetta ed evita di propagare messaggi generici "Script error." derivanti da estensioni del browser o iframe cross-origin
window.addEventListener('error', (event) => {
  if (event.message === 'Script error.') {
    console.warn("[ContoSmart Logger] Intercettato Script error cross-origin generico ignorato per evitare crash.");
    event.preventDefault();
  }
});

// Rileva automaticamente e gestisce le sottocartelle (es. /wallet) su Hostinger intercettando le fetch globali verso /api/
(() => {
  const path = window.location.pathname;
  const segments = path.split('/');
  if (segments.length > 1) {
    const last = segments[segments.length - 1];
    if (last.includes('.') || last === '') {
      segments.pop();
    }
  }
  const subFolder = segments.join('/');
  if (subFolder && subFolder !== '/') {
    const originalFetch = window.fetch;
    window.fetch = function (input: RequestInfo | URL, init?: RequestInit) {
      if (typeof input === 'string') {
        if (input.startsWith('/api/')) {
          input = subFolder + input;
        } else if (input.startsWith('/installer.php')) {
          input = subFolder + input;
        }
      }
      return originalFetch.call(this, input, init);
    };
  }
})();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
