import { PartyPopper } from "lucide-react";
import type { ParticipantSnapshot } from "@/lib/gathering/types";

type RoomSnapshot = Extract<ParticipantSnapshot, { state: "ROOM" }>;

export function CompletedState({ snapshot }: { snapshot: RoomSnapshot }) {
  return (
    <main className="mx-auto w-full max-w-2xl px-5 pb-16 pt-8 text-center sm:px-8">
      <section className="w-full rounded-[2rem] bg-white p-8 shadow-ambient sm:p-12">
        <PartyPopper
          aria-hidden="true"
          className="mx-auto size-8 text-primary"
        />
        <h1 className="mt-3 font-serif text-4xl font-bold text-ink sm:text-5xl">
          Thanks for praying, {snapshot.participant.name}.
        </h1>
        <p className="mt-3 text-xl font-semibold text-primary">
          We hope you enjoyed this experience.
        </p>
        <p className="mx-auto mt-5 max-w-lg text-lg leading-7 text-ink-muted">
          Go in peace. May the God of hope fill you with all joy and peace as
          you trust in Him. — Romans 15:13
        </p>
      </section>
    </main>
  );
}
