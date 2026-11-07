import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import '@fontsource/saira-condensed/latin-500.css';
import '@fontsource/saira-condensed/latin-600.css';
import '@fontsource/ibm-plex-sans/latin-400.css';
import '@fontsource/ibm-plex-sans/latin-500.css';
import '@fontsource/ibm-plex-sans/latin-600.css';
import '@fontsource/ibm-plex-sans/latin-700.css';
import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/ibm-plex-mono/latin-500.css';
import './index.css';

// Si se publicó una versión nueva mientras la app estaba abierta, los archivos
// de cada pantalla cambian de nombre: se recarga una vez para tomar la versión nueva.
const recargarPorVersionNueva = () => {
  try {
    if (sessionStorage.getItem('recarga-version') === '1') return false;
    sessionStorage.setItem('recarga-version', '1');
  } catch { /* sin almacenamiento */ }
  window.location.reload();
  return true;
};
(window as any).recargarPorVersionNueva = recargarPorVersionNueva;
window.addEventListener('vite:preloadError', (e) => { e.preventDefault(); recargarPorVersionNueva(); });
window.addEventListener('load', () => setTimeout(() => { try { sessionStorage.removeItem('recarga-version'); } catch { /* */ } }, 10000));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
