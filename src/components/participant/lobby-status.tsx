import { Sparkles } from "lucide-react";

type LobbyStatusProps = {
  name: string;
  participantCount: number;
};

export function LobbyStatus({ name, participantCount }: LobbyStatusProps) {
  return (
    <main className="relative mx-auto flex min-h-[calc(100dvh-5.5rem)] w-full max-w-2xl flex-col items-center overflow-hidden px-5 pb-14 pt-14 text-center sm:px-8">
      <div className="animate-fade-up">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
          You’re in
        </p>
        <h1 className="mt-4 font-serif text-4xl font-bold tracking-tight text-ink sm:text-5xl">
          You’ve joined, {name}.
        </h1>
        <p className="mx-auto mt-4 max-w-sm text-xl leading-8 text-ink-muted">
          Take a breath while everyone gathers.
        </p>
      </div>

      <div className="relative my-12 grid aspect-square w-full max-w-[22rem] place-items-center sm:my-16">
        <span
          aria-hidden="true"
          className="absolute size-[88%] rounded-full bg-primary-faint"
          style={{ animation: "breathe-outer 7s ease-in-out infinite" }}
        />
        <span
          aria-hidden="true"
          className="absolute size-[70%] rounded-full border-[12px] border-sky-100"
          style={{ animation: "breathe-inner 7s ease-in-out infinite" }}
        />
        <div className="relative grid size-[58%] place-items-center rounded-full bg-white shadow-card">
          <div>
            <strong className="block font-serif text-6xl font-semibold text-primary sm:text-7xl">
              {participantCount}
            </strong>
            <span className="mt-2 block text-xs font-semibold uppercase tracking-[0.18em] text-ink-muted">
              Participants
              <br />
              arrived
            </span>
          </div>
        </div>
      </div>

      <div className="flex w-full items-center gap-4 rounded-3xl bg-surface-subtle px-5 py-5 text-left shadow-card sm:px-7">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary-faint text-primary">
          <Sparkles aria-hidden="true" className="size-5" />
        </span>
        <p className="text-lg leading-7 text-ink-muted">
          Wait here. We’ll announce room assignments shortly.
        </p>
      </div>
    </main>
  );
}
