import { createRoot } from 'react-dom/client';
import { Play } from '../src/screens/Games';
export function mountGames() {
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;inset:0;z-index:100;background:#efeeec';
  document.body.append(el);
  createRoot(el).render(<Play />);
}
