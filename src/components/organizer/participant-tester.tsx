import { AdminShell } from "@/components/organizer/admin-shell";
import { TESTER_PARTICIPANT_SLOTS } from "@/lib/gathering/participant-session";

export function ParticipantTester() {
  return (
    <AdminShell active="tester">
      <div className="mx-auto max-w-[120rem]">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
            Rehearsal
          </p>
          <h1 className="mt-3 font-serif text-4xl font-bold tracking-tight text-ink sm:text-5xl">
            Participant tester
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-ink-muted">
            Join and follow the gathering as six independent participants. Names
            are pre-filled; each participant still enters a prayer request.
          </p>
        </div>

        <div className="mt-8 grid gap-6 xl:grid-cols-2 2xl:grid-cols-3">
          {TESTER_PARTICIPANT_SLOTS.map((slot) => (
            <section
              key={slot}
              className="overflow-hidden rounded-[2rem] border border-outline/50 bg-white shadow-card"
            >
              <div className="border-b border-outline/40 bg-surface-subtle px-5 py-4">
                <h2 className="font-semibold text-ink">Participant {slot}</h2>
              </div>
              <iframe
                title={`Participant ${slot}`}
                src={`/admin/tester/participant/${slot}`}
                className="h-[48rem] w-full bg-surface"
              />
            </section>
          ))}
        </div>
      </div>
    </AdminShell>
  );
}
