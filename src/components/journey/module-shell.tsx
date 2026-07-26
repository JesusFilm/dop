"use client";

import { useState } from "react";
import { ArrowRight, BadgeCheck, CircleUserRound } from "lucide-react";
import { Countdown } from "@/components/journey/countdown";
import { ModuleRenderer } from "@/components/journey/module-renderer";
import { ActionButton } from "@/components/ui/action-button";
import { Modal } from "@/components/ui/modal";
import type { ParticipantSnapshot } from "@/lib/gathering/types";

type RoomSnapshot = Extract<ParticipantSnapshot, { state: "ROOM" }>;
type ActiveJourney = Extract<
  NonNullable<RoomSnapshot["journey"]>,
  { state: "ACTIVE" }
>;

export function ModuleShell({
  snapshot,
  journey,
  onAdvance,
  onTakeover,
  isPending,
  error,
}: {
  snapshot: RoomSnapshot;
  journey: ActiveJourney;
  onAdvance: () => Promise<void>;
  onTakeover: () => Promise<void>;
  isPending: boolean;
  error: string;
}) {
  const [isTakeoverOpen, setTakeoverOpen] = useState(false);
  const [isTakeoverPending, setTakeoverPending] = useState(false);
  const [takeoverError, setTakeoverError] = useState("");
  const viewerIsCoordinator = snapshot.room.members.some(
    ({ id, isCoordinator }) => id === snapshot.participant.id && isCoordinator,
  );

  async function confirmTakeover() {
    setTakeoverPending(true);
    setTakeoverError("");
    try {
      await onTakeover();
      setTakeoverOpen(false);
    } catch {
      setTakeoverError("We couldn’t update the coordinator. Please try again.");
    } finally {
      setTakeoverPending(false);
    }
  }

  return (
    <>
      <main className="mx-auto w-full max-w-3xl px-5 pb-16 pt-10 sm:px-8">
        <header>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
            {snapshot.room.name} · {journey.journeyName}
          </p>
          <h1 className="mt-3 font-serif text-4xl font-bold tracking-tight text-ink sm:text-5xl">
            {journey.module.title}
          </h1>
          {journey.joinedInProgress ? (
            <p className="mt-4 rounded-2xl bg-sky-50 px-4 py-3 text-sm text-sky-950">
              Your room is already underway. Join the activity where the group
              is now.
            </p>
          ) : null}
        </header>

        <section className="mt-8 rounded-[2rem] bg-white p-6 shadow-ambient sm:p-10">
          <Countdown
            startedAt={journey.module.startedAt}
            recommendedSeconds={journey.module.recommendedSeconds}
            serverTime={journey.module.serverTime}
          />
          <div className="mt-8">
            <ModuleRenderer module={journey.module} />
          </div>
        </section>

        {error ? (
          <p role="alert" className="mt-5 text-sm font-medium text-danger">
            {error}
          </p>
        ) : null}
        <div className="mt-8">
          {viewerIsCoordinator ? (
            <>
              <p className="mb-3 flex items-center justify-center gap-2 text-sm font-semibold text-primary">
                <BadgeCheck aria-hidden="true" className="size-4" />
                You control when the room continues
              </p>
              <ActionButton onClick={onAdvance} disabled={isPending}>
                {isPending ? "Continuing…" : "Continue"}
                <ArrowRight aria-hidden="true" className="size-5" />
              </ActionButton>
            </>
          ) : (
            <ActionButton
              tone="secondary"
              onClick={() => setTakeoverOpen(true)}
              disabled={isPending}
            >
              Coordinator unavailable? Take over
            </ActionButton>
          )}
        </div>
      </main>

      <Modal
        open={isTakeoverOpen}
        onClose={() => setTakeoverOpen(false)}
        title="Lead this group?"
        description="If the selected coordinator isn’t here, you can take over. Everyone in the room will see that you now control when the journey continues."
      >
        <div className="mx-auto mb-6 grid size-16 place-items-center rounded-full bg-primary text-white">
          <CircleUserRound aria-hidden="true" className="size-8" />
        </div>
        <div className="flex flex-col gap-3">
          {takeoverError ? (
            <p role="alert" className="text-sm text-danger">
              {takeoverError}
            </p>
          ) : null}
          <ActionButton onClick={confirmTakeover} disabled={isTakeoverPending}>
            {isTakeoverPending ? "Updating…" : "Confirm takeover"}
            <ArrowRight aria-hidden="true" className="size-5" />
          </ActionButton>
          <ActionButton
            tone="secondary"
            onClick={() => setTakeoverOpen(false)}
            disabled={isTakeoverPending}
          >
            Go back
          </ActionButton>
        </div>
      </Modal>
    </>
  );
}
