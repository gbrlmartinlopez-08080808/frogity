import { tr } from '../lib/i18n';
import { tap } from '../lib/native';
export function HomeTabs({ active, onPick }: { active: 'library' | 'interesting'; onPick: (t: 'library' | 'interesting') => void }) {
  return (
    <div className="home-tabs" role="tablist">
      <button role="tab" aria-selected={active === 'library'} className={active === 'library' ? 'on' : ''} onClick={() => active !== 'library' && (tap('select'), onPick('library'))}>{tr("library")}</button>
      <button role="tab" aria-selected={active === 'interesting'} className={active === 'interesting' ? 'on' : ''} onClick={() => active !== 'interesting' && (tap('select'), onPick('interesting'))}>
        <span className="frogmark mono" aria-hidden>{tr("(@)")}</span>{tr("interesting")}</button>
    </div>
  );
}
