import { CheckCircle2 } from "lucide-react";
import type { ParticipantSnapshot } from "@/lib/gathering/types";

type RoomSnapshot = Extract<ParticipantSnapshot, { state: "ROOM" }>;

export function CompletedState({ snapshot }: { snapshot: RoomSnapshot }) {
  return (
    <main className="mx-auto grid min-h-[calc(100dvh-5.5rem)] w-full max-w-2xl place-items-center px-5 py-12 text-center sm:px-8">
      <section className="w-full rounded-[2rem] bg-white p-8 shadow-ambient sm:p-12">
        <CheckCircle2
          aria-hidden="true"
          className="mx-auto size-12 text-primary"
        />
        <p className="mt-6 text-xs font-semibold uppercase tracking-[0.16em] text-primary">
          {snapshot.room.name}
        </p>
        <h1 className="mt-3 font-serif text-4xl font-bold text-ink sm:text-5xl">
          Your room has completed the journey.
        </h1>
        <p className="mx-auto mt-5 max-w-lg text-lg leading-7 text-ink-muted">
          Thank you for praying together. You can leave this screen open; your
          room’s completed state is saved.
        </p>
      </section>
    </main>
  );
}
