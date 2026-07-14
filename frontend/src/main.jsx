import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.getRegistrations()
      .then((registrations) => {
        registrations.forEach((registration) => {
          Promise.resolve(registration.unregister()).catch(() => {});
        });
      })
      .catch(() => {});
  });
}

if ('caches' in window) {
  window.addEventListener('load', () => {
    caches.keys()
      .then((keys) => {
        keys.forEach((key) => {
          Promise.resolve(caches.delete(key)).catch(() => {});
        });
      })
      .catch(() => {});
  });
}

window.requestAnimationFrame(() => {
  window.document.body.classList.add('booted');
});
