"use client";

import { useState } from "react";
import {
  ArrowRight,
  BadgeCheck,
  CircleUserRound,
  PartyPopper,
} from "lucide-react";
import { ActionButton } from "@/components/ui/action-button";
import { Modal } from "@/components/ui/modal";
import type {
  ParticipantMember,
  ParticipantSnapshot,
} from "@/lib/gathering/types";

type RoomSnapshot = Extract<ParticipantSnapshot, { state: "ROOM" }>;

function MemberRow({ member }: { member: ParticipantMember }) {
  return (
    <li
      className={
        member.isLeader
          ? "rounded-3xl bg-primary-soft p-4"
          : "rounded-3xl bg-white p-4 shadow-card"
      }
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-lg font-semibold text-ink">{member.name}</p>
        {member.isLeader ? (
          <p className="mt-0.5 flex items-center gap-1.5 text-sm font-semibold text-primary">
            <BadgeCheck aria-hidden="true" className="size-4" />
            Room leader
          </p>
        ) : null}
      </div>
    </li>
  );
}

export function RoomAssignment({
  snapshot,
  onTakeover,
  onStartJourney,
  isJourneyPending = false,
  journeyError = "",
}: {
  snapshot: RoomSnapshot;
  onTakeover: () => Promise<void>;
  onStartJourney?: () => Promise<void>;
  isJourneyPending?: boolean;
  journeyError?: string;
}) {
  const [isTakeoverOpen, setTakeoverOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [error, setError] = useState("");
  const [isPending, setPending] = useState(false);
  const { participant: viewer, room } = snapshot;
  const leader = room.members.find(({ isLeader }) => isLeader);
  const viewerIsLeader = viewer.id === leader?.id;
  const directions = room.directions
    ? `${room.directions[0].toLowerCase()}${room.directions.slice(1)}`
    : "follow the organizer’s directions";

  async function confirmTakeover() {
    setPending(true);
    setError("");
    try {
      await onTakeover();
      setAnnouncement(`${viewer.name} is now the room leader.`);
      setTakeoverOpen(false);
    } catch {
      setError("We couldn’t update the leader. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <main
        className={`mx-auto w-full max-w-2xl px-5 pt-8 sm:px-8 ${
          viewerIsLeader && onStartJourney ? "pb-48" : "pb-16"
        }`}
      >
        <header className="animate-fade-up text-center">
          <PartyPopper
            aria-hidden="true"
            className="mx-auto size-8 text-primary"
          />
          <h1 className="mt-3 font-serif text-4xl font-bold tracking-tight text-ink sm:text-5xl">
            Your group is ready.
          </h1>
          <p className="mt-1 text-lg font-semibold text-primary">
            {room.name}, {directions}
          </p>
          <p className="mx-auto mt-2 max-w-lg text-base leading-7 text-ink-muted">
            Please make your way to {room.name} and wait for the group to
            gather.
          </p>
        </header>

        <section className="mt-7" aria-label="Room members">
          <ul className="flex flex-col gap-3">
            {room.members.map((member) => (
              <MemberRow key={member.id} member={member} />
            ))}
          </ul>
        </section>

        {viewerIsLeader ? (
          onStartJourney ? (
            <div className="fixed inset-x-0 bottom-0 z-30 bg-gradient-to-t from-white via-white/95 to-transparent px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-12 sm:px-8">
              <div className="mx-auto w-full max-w-2xl">
                <p className="mb-3 flex items-center justify-center gap-2 text-sm font-semibold text-primary">
                  <BadgeCheck aria-hidden="true" className="size-4" />
                  You’re the room leader
                </p>
                {journeyError ? (
                  <p
                    role="alert"
                    className="mb-3 text-center text-sm font-medium text-danger"
                  >
                    {journeyError}
                  </p>
                ) : null}
                <ActionButton
                  onClick={onStartJourney}
                  disabled={isJourneyPending}
                >
                  {isJourneyPending ? "Starting…" : "Start first activity"}
                  <ArrowRight aria-hidden="true" className="size-5" />
                </ActionButton>
              </div>
            </div>
          ) : (
            <div className="mt-10 text-center">
              <p className="inline-flex items-center gap-2 rounded-full bg-primary-faint px-5 py-3 text-sm font-semibold text-primary">
                <BadgeCheck aria-hidden="true" className="size-4" />
                You’re the room leader
              </p>
            </div>
          )
        ) : (
          <div className="mt-10 text-center">
            <button
              className="rounded-full px-4 py-3 text-sm font-semibold text-ink-muted underline decoration-outline underline-offset-4 transition hover:text-primary"
              onClick={() => setTakeoverOpen(true)}
            >
              Leader unavailable?
            </button>
          </div>
        )}

        <p className="sr-only" aria-live="polite">
          {announcement}
        </p>
      </main>

      <Modal
        open={isTakeoverOpen}
        onClose={() => setTakeoverOpen(false)}
        title="Lead this group?"
        description="If the selected leader isn’t here, you can take over. Everyone in the room will see that you are now the leader."
      >
        <div className="mx-auto mb-6 grid size-16 place-items-center rounded-full bg-primary text-white">
          <CircleUserRound aria-hidden="true" className="size-8" />
        </div>
        <div className="flex flex-col gap-3">
          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}
          <ActionButton onClick={confirmTakeover} disabled={isPending}>
            {isPending ? "Updating…" : "Confirm takeover"}
            <ArrowRight aria-hidden="true" className="size-5" />
          </ActionButton>
          <ActionButton tone="secondary" onClick={() => setTakeoverOpen(false)}>
            Go back
          </ActionButton>
        </div>
      </Modal>
    </>
  );
}
