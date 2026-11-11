import { Suspense } from 'react';
import { Capacitor } from '@capacitor/core';
import { createRoot } from 'react-dom/client';
import './styles/base.css';
import './styles/fonts.css';
import './styles/reader.css';
import './styles/ui.css';
import './styles/overlays.css';
import './styles/interesting.css';
import App from './App';
import { ErrorBoundary } from './ui/ErrorBoundary';
import { startI18n } from './lib/i18n';

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <Suspense fallback={<p role="status">Opening Frogity…</p>}><App /></Suspense>
  </ErrorBoundary>,
);
startI18n();

if (import.meta.env.PROD && !Capacitor.isNativePlatform() && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('./sw.js').then(reg => { const offer = () => { if (reg.waiting) void import('./ui/kit').then(m => m.toast('Update ready · tap to restart', undefined, () => { navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once: true }); reg.waiting?.postMessage('activate'); })); }; offer(); reg.addEventListener('updatefound', () => reg.installing?.addEventListener('statechange', () => { if (reg.installing?.state === 'installed' && navigator.serviceWorker.controller) offer(); })); }).catch(e => console.warn('Offline setup failed', e)); });
}
