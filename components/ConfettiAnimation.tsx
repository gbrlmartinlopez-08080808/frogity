const COLORS = ["#FF6B6B", "#4ECDC4", "#45B7D1", "#FFA07A", "#98D8C8", "#F7DC6F", "#BB8FCE", "#85C1E2"];

// Deterministic pieces: no randomness at render time, and identical on every run.
const PIECES = Array.from({ length: 60 }, (_, i) => ({
  id: i,
  left: (i * 37) % 100,
  duration: 2.2 + (i % 5) * 0.35,
  delay: (i % 12) * 0.07,
  drift: ((i * 53) % 120) - 60,
  size: 6 + (i % 3) * 3,
  color: COLORS[i % COLORS.length],
  round: i % 4 === 0,
}));

export default function ConfettiAnimation({ show }: { show: boolean }) {
  if (!show) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden" aria-hidden="true">
      {PIECES.map((piece) => (
        <div
          key={piece.id}
          className={`absolute animate-confetti-fall ${piece.round ? "rounded-full" : "rounded-sm"}`}
          style={
            {
              left: `${piece.left}%`,
              top: "-16px",
              width: piece.size,
              height: piece.size,
              backgroundColor: piece.color,
              animationDuration: `${piece.duration}s`,
              animationDelay: `${piece.delay}s`,
              "--drift": `${piece.drift}px`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
