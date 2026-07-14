import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

const isFramed = window.self !== window.top;

createRoot(document.getElementById('root')!).render(
  isFramed ? (
    <main className="frame-blocked" role="alert">
      <span aria-hidden="true">CF</span>
      <h1>Abra o ColaFig diretamente</h1>
      <p>Por segurança, a sua coleção não pode ser usada dentro de outro site.</p>
      <a href={window.location.href} rel="noreferrer" target="_top">Abrir ColaFig</a>
    </main>
  ) : (
    <StrictMode>
      <App />
    </StrictMode>
  ),
);

if (!isFramed && 'serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/colafig/sw.js');
  });
}
