import { useEffect, useRef, useState } from 'react';
import { rng } from '../lib/games';
import { tr } from '../lib/i18n';
const WORDS = [
  'fern',
  'reed',
  'lily',
  'moss',
  'willow',
  'lotus',
  'clover',
  'mint',
  'ivy',
  'sage',
];
/** A quiet, keyboard-accessible memory game. The daily deck is repeatable, with no network. */
export function PondPairs({
  level,
  paused,
  onEnd,
}: {
  level: number;
  paused: boolean;
  onEnd: (win: boolean, text: string) => void;
}) {
  const [deck] = useState(() => {
    const r = rng(Math.floor(Date.now() / 86400000) + level * 971);
    const words = [...WORDS];
    for (let i = words.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [words[i], words[j]] = [words[j], words[i]];
    }
    const cards = words.slice(0, 6).flatMap((word) => [word, word]);
    for (let i = cards.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [cards[i], cards[j]] = [cards[j], cards[i]];
    }
    return cards;
  });
  const [open, setOpen] = useState<number[]>([]),
    [matched, setMatched] = useState<number[]>([]),
    [moves, setMoves] = useState(0),
    [hint, setHint] = useState(false),
    [hints, setHints] = useState(2);
  const ended = useRef(false);
  useEffect(() => {
    if (open.length !== 2 || paused) return;
    const [a, b] = open;
    const timer = setTimeout(
      () => {
        if (deck[a] === deck[b]) setMatched((old) => [...old, a, b]);
        setOpen([]);
      },
      deck[a] === deck[b] ? 250 : 1000,
    );
    return () => clearTimeout(timer);
  }, [open, paused, deck]);
  useEffect(() => {
    if (matched.length === deck.length && !ended.current) {
      ended.current = true;
      onEnd(
        true,
        `All six pairs found in ${moves} moves. ${moves <= 9 ? 'A wonderfully sharp memory.' : 'Patience brought the pond together.'}`,
      );
    }
  }, [matched, deck, moves, onEnd]);
  useEffect(() => {
    if (!hint || paused) return;
    const t = setTimeout(() => setHint(false), 1500);
    return () => clearTimeout(t);
  }, [hint, paused]);
  return (
    <section className="pond-pairs" aria-label={tr('Pond pairs')}>
      <h2>{tr('Find the matching plants')}</h2>
      <p>
        {tr(
          'Turn two cards. Matching words stay open. There is no time limit.',
        )}
      </p>
      <p className="mono" role="status">
        {matched.length / 2}/6 pairs · {moves} moves
      </p>
      <div className="pairs-grid">
        {deck.map((word, i) => {
          const face = hint || open.includes(i) || matched.includes(i);
          return (
            <button
              key={i}
              className={`pair-card ${face ? 'revealed' : ''}`}
              disabled={
                paused ||
                open.length === 2 ||
                open.includes(i) ||
                matched.includes(i)
              }
              aria-label={face ? word : `Hidden card ${i + 1}`}
              aria-pressed={face}
              onClick={() => {
                if (open.length === 1) setMoves((m) => m + 1);
                setOpen((old) => [...old, i]);
              }}
            >
              {face ? word : '?'}
            </button>
          );
        })}
      </div>
      <button
        className="pill ghost"
        disabled={!hints || hint || paused}
        onClick={() => {
          setHints((n) => n - 1);
          setHint(true);
        }}
      >
        {tr('Peek at the pond')} · {hints}
      </button>
    </section>
  );
}
