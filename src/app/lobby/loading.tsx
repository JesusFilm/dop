export default function LobbyLoading() {
  return (
    <main className="grid min-h-dvh place-items-center">
      <div className="size-24 animate-pulse rounded-full bg-primary-faint" />
      <span className="sr-only">Loading the gathering lobby</span>
    </main>
  );
}
