export default function LoadingScreen() {
  return (
    <div
      className="flex min-h-dvh items-center justify-center bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500"
      role="status"
      aria-live="polite"
    >
      <div className="text-center">
        <div className="mb-4 animate-bounce text-6xl" aria-hidden="true">
          💰
        </div>
        <p className="mb-2 text-4xl font-bold text-white">Financedly</p>
        <p className="text-white/80">Loading your financial journey...</p>
      </div>
    </div>
  );
}
