"use client";

import { useState } from "react";
import {
  ArrowRight,
  BadgeCheck,
  CircleUserRound,
  MapPin,
  PartyPopper,
} from "lucide-react";
import { ActionButton } from "@/components/ui/action-button";
import { Avatar } from "@/components/ui/avatar";
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
        member.isCoordinator
          ? "flex items-center gap-4 rounded-3xl bg-primary-soft p-4"
          : "flex items-center gap-4 rounded-3xl bg-white p-4 shadow-card"
      }
    >
      <Avatar name={member.name} highlighted={member.isCoordinator} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-lg font-semibold text-ink">{member.name}</p>
        {member.isCoordinator ? (
          <p className="mt-0.5 flex items-center gap-1.5 text-sm font-semibold text-primary">
            <BadgeCheck aria-hidden="true" className="size-4" />
            Room coordinator
          </p>
        ) : null}
      </div>
    </li>
  );
}

export function RoomAssignment({
  snapshot,
  onTakeover,
}: {
  snapshot: RoomSnapshot;
  onTakeover: () => Promise<void>;
}) {
  const [isTakeoverOpen, setTakeoverOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [error, setError] = useState("");
  const [isPending, setPending] = useState(false);
  const { participant: viewer, room } = snapshot;
  const coordinator = room.members.find(({ isCoordinator }) => isCoordinator);
  const viewerIsCoordinator = viewer.id === coordinator?.id;

  async function confirmTakeover() {
    setPending(true);
    setError("");
    try {
      await onTakeover();
      setAnnouncement(`${viewer.name} is now the room coordinator.`);
      setTakeoverOpen(false);
    } catch {
      setError("We couldn’t update the coordinator. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <main className="mx-auto w-full max-w-2xl px-5 pb-16 pt-10 sm:px-8">
        <header className="animate-fade-up text-center">
          <PartyPopper
            aria-hidden="true"
            className="mx-auto size-8 text-primary"
          />
          <h1 className="mt-5 font-serif text-4xl font-bold tracking-tight text-ink sm:text-5xl">
            Your group is ready.
          </h1>
          <p className="mx-auto mt-4 max-w-lg text-lg leading-7 text-ink-muted">
            Please make your way to {room.name} and wait for the group to
            gather.
          </p>
        </header>

        <section className="mt-10 rounded-[2rem] bg-surface-muted p-6 text-center shadow-card sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-muted">
            Room name
          </p>
          <h2 className="mt-3 font-serif text-4xl font-bold text-ink">
            {room.name}
          </h2>
          <div className="mt-6 flex items-start gap-3 rounded-2xl bg-white/70 p-4 text-left">
            <MapPin
              aria-hidden="true"
              className="mt-0.5 size-5 shrink-0 text-primary"
            />
            <p className="leading-6 text-ink-muted">
              {room.directions ||
                "Follow the organizer’s directions to this room."}
            </p>
          </div>
        </section>

        <section className="mt-12" aria-labelledby="gathering-heading">
          <div className="flex items-end justify-between gap-4">
            <h2
              id="gathering-heading"
              className="font-serif text-3xl font-bold text-ink"
            >
              Gathering
            </h2>
            <span className="text-sm text-ink-muted">
              {room.members.length}{" "}
              {room.members.length === 1 ? "member" : "members"}
            </span>
          </div>
          <ul className="mt-6 flex flex-col gap-3">
            {room.members.map((member) => (
              <MemberRow key={member.id} member={member} />
            ))}
          </ul>
        </section>

        <div className="mt-10 text-center">
          {viewerIsCoordinator ? (
            <p className="inline-flex items-center gap-2 rounded-full bg-primary-faint px-5 py-3 text-sm font-semibold text-primary">
              <BadgeCheck aria-hidden="true" className="size-4" />
              You’re the room coordinator
            </p>
          ) : (
            <button
              className="rounded-full px-4 py-3 text-sm font-semibold text-ink-muted underline decoration-outline underline-offset-4 transition hover:text-primary"
              onClick={() => setTakeoverOpen(true)}
            >
              Coordinator unavailable?
            </button>
          )}
        </div>

        <p className="sr-only" aria-live="polite">
          {announcement}
        </p>
      </main>

      <Modal
        open={isTakeoverOpen}
        onClose={() => setTakeoverOpen(false)}
        title="Lead this group?"
        description="If the selected coordinator isn’t here, you can take over. Everyone in the room will see that you are now the coordinator."
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
