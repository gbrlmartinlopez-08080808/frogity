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

/** Lay the interface out ~8% smaller than the device width (everything scales together). */
const UI_SCALE = 0.92;
function fitViewport() {
  const sw = screen.width || window.innerWidth;
  const w = sw < 700 ? Math.round(sw / UI_SCALE) : 0;
  const meta = document.querySelector('meta[name="viewport"]');
  meta?.setAttribute('content', w ? `width=${w}, viewport-fit=cover, user-scalable=no, interactive-widget=resizes-content` : 'width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no, interactive-widget=resizes-content');
}
fitViewport();
let rt = 0;
window.addEventListener('orientationchange', () => setTimeout(fitViewport, 250));
window.addEventListener('resize', () => {
  clearTimeout(rt);
  rt = window.setTimeout(() => {
    const m = document.querySelector('meta[name="viewport"]')?.getAttribute('content') ?? '';
    const want = Math.round((screen.width || window.innerWidth) / UI_SCALE);
    if (!m.includes(`width=${want}`) && (screen.width || 0) < 700) fitViewport();
  }, 300);
});

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <Suspense fallback={<p role="status">Opening Frogity…</p>}><App /></Suspense>
  </ErrorBoundary>,
);
startI18n();

if (import.meta.env.PROD && !Capacitor.isNativePlatform() && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('./sw.js').then(reg => { const offer = () => { if (reg.waiting) void import('./ui/kit').then(m => m.toast('Update ready · tap to restart', undefined, () => { navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once: true }); reg.waiting?.postMessage('activate'); })); }; offer(); reg.addEventListener('updatefound', () => reg.installing?.addEventListener('statechange', () => { if (reg.installing?.state === 'installed' && navigator.serviceWorker.controller) offer(); })); }).catch(e => console.warn('Offline setup failed', e)); });
}
