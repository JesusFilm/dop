"use client";

import { useState } from "react";
import {
  ArrowRight,
  BadgeCheck,
  CircleUserRound,
  RefreshCw,
} from "lucide-react";
import { ModuleRenderer } from "@/components/journey/module-renderer";
import { ActionButton } from "@/components/ui/action-button";
import { Modal } from "@/components/ui/modal";
import { cx } from "@/lib/classnames";
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
  onReassign,
  onTakeover,
  isPending,
  error,
}: {
  snapshot: RoomSnapshot;
  journey: ActiveJourney;
  onAdvance: () => Promise<void>;
  onReassign: (
    targetParticipantId?: string,
  ) => Promise<"changed" | "stale" | "unavailable" | "error">;
  onTakeover: () => Promise<void>;
  isPending: boolean;
  error: string;
}) {
  const [isTakeoverOpen, setTakeoverOpen] = useState(false);
  const [isTakeoverPending, setTakeoverPending] = useState(false);
  const [takeoverError, setTakeoverError] = useState("");
  const [reassignMessage, setReassignMessage] = useState("");
  const viewerIsLeader = snapshot.room.members.some(
    ({ id, isLeader }) => id === snapshot.participant.id && isLeader,
  );
  const isPersonalPrayerGrouping =
    journey.module.behaviorKey === "personal-prayer" &&
    journey.module.personalPrayer.phase === "grouping";
  const isShortStudyPrayer =
    journey.module.behaviorKey === "short-study" &&
    journey.module.shortStudy.contribution.kind === "prayer";

  async function confirmTakeover() {
    setTakeoverPending(true);
    setTakeoverError("");
    try {
      await onTakeover();
      setTakeoverOpen(false);
    } catch {
      setTakeoverError("We couldn’t update the leader. Please try again.");
    } finally {
      setTakeoverPending(false);
    }
  }

  async function reassignParticipant(targetParticipantId?: string) {
    setReassignMessage("");
    const result = await onReassign(targetParticipantId);
    if (result === "unavailable") {
      setReassignMessage("No other reader is available.");
    } else if (result === "stale") {
      setReassignMessage("The room moved on. Try reassigning again.");
    }
  }

  return (
    <>
      <main
        className={cx(
          "mx-auto w-full max-w-3xl px-5 pt-6 sm:px-8 sm:pt-8",
          viewerIsLeader ? "pb-64" : "pb-16",
        )}
      >
        <header>
          <h1 className="font-serif text-4xl font-bold tracking-tight text-ink sm:text-5xl">
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
          <ModuleRenderer module={journey.module} />
        </section>

        {error && !viewerIsLeader ? (
          <p role="alert" className="mt-5 text-sm font-medium text-danger">
            {error}
          </p>
        ) : null}
        {viewerIsLeader ? (
          <div className="fixed inset-x-0 bottom-0 z-30 bg-gradient-to-t from-white via-white/95 to-transparent px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-12 sm:px-8">
            <div className="mx-auto w-full max-w-3xl">
              {error ? (
                <p
                  role="alert"
                  className="mb-3 text-center text-sm font-medium text-danger"
                >
                  {error}
                </p>
              ) : null}
              <p className="mb-3 flex items-center justify-center gap-2 text-sm font-semibold text-primary">
                <BadgeCheck aria-hidden="true" className="size-4" />
                You control when the room continues
              </p>
              <ActionButton onClick={onAdvance} disabled={isPending}>
                {isPending
                  ? isPersonalPrayerGrouping
                    ? "Revealing…"
                    : "Continuing…"
                  : isPersonalPrayerGrouping
                    ? "Reveal prayer requests"
                    : isShortStudyPrayer
                      ? "Finish study"
                      : "Continue"}
                <ArrowRight aria-hidden="true" className="size-5" />
              </ActionButton>
              {journey.module.behaviorKey === "short-study" &&
              journey.module.shortStudy.canReassign ? (
                <ActionButton
                  className="mt-3 bg-white"
                  tone="secondary"
                  onClick={() => reassignParticipant()}
                  disabled={isPending}
                >
                  <RefreshCw aria-hidden="true" className="size-5" />
                  Reassign current reader
                </ActionButton>
              ) : null}
              {journey.module.behaviorKey === "ministry-prayer" &&
              journey.module.ministryPrayer.canReassign
                ? journey.module.ministryPrayer.assignees.map((assignee) => (
                    <ActionButton
                      key={assignee.id}
                      className="mt-3 bg-white"
                      tone="secondary"
                      onClick={() => reassignParticipant(assignee.id)}
                      disabled={isPending}
                    >
                      <RefreshCw aria-hidden="true" className="size-5" />
                      Replace {assignee.name}
                    </ActionButton>
                  ))
                : null}
              {reassignMessage ? (
                <p
                  role="status"
                  className="mt-3 text-center text-sm text-ink-muted"
                >
                  {reassignMessage}
                </p>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="mt-8">
            <ActionButton
              tone="secondary"
              onClick={() => setTakeoverOpen(true)}
              disabled={isPending}
            >
              Leader unavailable? Take over
            </ActionButton>
          </div>
        )}
      </main>

      <Modal
        open={isTakeoverOpen}
        onClose={() => setTakeoverOpen(false)}
        title="Lead this group?"
        description="If the selected leader isn’t here, you can take over. Everyone in the room will see that you now control when the journey continues."
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
