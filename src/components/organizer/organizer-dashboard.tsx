"use client";

import { useState } from "react";
import { ArrowRight, BadgeCheck, DoorOpen, Star } from "lucide-react";
import { AdminShell } from "@/components/organizer/admin-shell";
import { updateOrganizer } from "@/components/organizer/update-organizer";
import { ActionButton } from "@/components/ui/action-button";
import { Modal } from "@/components/ui/modal";
import type {
  OrganizerRoomSnapshot,
  OrganizerSnapshot,
} from "@/lib/gathering/types";
import { useLiveSnapshot } from "@/lib/use-live-snapshot";

function RoomCard({
  room,
  totalParticipants,
}: {
  room: OrganizerRoomSnapshot;
  totalParticipants: number;
}) {
  return (
    <article className="flex flex-col rounded-3xl border border-outline/35 bg-white p-5 shadow-card">
      <header className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-primary-faint text-primary">
          <DoorOpen aria-hidden="true" className="size-5" />
        </span>
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold text-ink">
            {room.name}
          </h2>
          <p className="mt-0.5 text-sm text-ink-muted">
            {room.maxCapacity === null
              ? `${room.memberCount} of ${totalParticipants}`
              : `${room.memberCount} of ${room.maxCapacity}`}
            {room.directions ? ` · ${room.directions}` : ""}
          </p>
          {room.journeyState !== "unavailable" ? (
            <p className="mt-1 text-xs font-semibold capitalize text-primary">
              Journey: {room.journeyState}
            </p>
          ) : null}
        </div>
      </header>

      <div className="mt-5 border-t border-outline/40 pt-4">
        {room.members.length === 0 ? (
          <p className="text-sm text-ink-muted">No one has joined yet.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-1.5">
            {room.members.map((member) => (
              <li
                key={member.id}
                className="flex items-center gap-2 rounded-xl bg-surface-subtle px-3 py-2 text-sm font-medium text-ink"
              >
                <span className="min-w-0 flex-1 truncate">{member.name}</span>
                {member.isCoordinator ? (
                  <Star
                    aria-label="Coordinator"
                    className="size-4 shrink-0 fill-primary text-primary"
                  />
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </article>
  );
}

export function OrganizerDashboard({
  initialSnapshot,
}: {
  initialSnapshot: OrganizerSnapshot;
}) {
  const { snapshot, setSnapshot, isDisconnected } = useLiveSnapshot(
    initialSnapshot,
    "/api/organizer",
  );
  const [isConfirmingLaunch, setConfirmingLaunch] = useState(false);
  const [error, setError] = useState("");
  const [isPending, setPending] = useState(false);
  const roomsInUse = snapshot.rooms.filter(
    ({ memberCount }) => memberCount > 0,
  ).length;
  const roomsAtCapacity = snapshot.rooms.filter(
    ({ maxCapacity, memberCount }) =>
      maxCapacity !== null && memberCount >= maxCapacity,
  ).length;

  function closeConfirmation() {
    setError("");
    setConfirmingLaunch(false);
  }

  async function confirmLaunch() {
    setPending(true);
    setError("");
    try {
      setSnapshot(await updateOrganizer("/api/organizer/launch"));
      closeConfirmation();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Update failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <AdminShell active="dashboard">
      <header className="flex flex-wrap items-start justify-between gap-6">
        <div>
          <h1 className="font-serif text-4xl font-bold tracking-tight text-ink sm:text-5xl">
            Dashboard
          </h1>
          {isDisconnected ? (
            <p className="mt-2 text-sm font-medium text-danger">
              Reconnecting to live updates…
            </p>
          ) : null}
        </div>

        <div className="ml-auto w-full sm:w-auto">
          {snapshot.phase === "ASSIGNED" ? (
            <span className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-primary-faint px-4 text-sm font-semibold text-primary sm:w-auto">
              <BadgeCheck aria-hidden="true" className="size-5" />
              Assignments revealed
            </span>
          ) : (
            <ActionButton
              size="compact"
              fullWidth={false}
              className="w-full sm:w-auto"
              disabled={isPending || !snapshot.capacitySufficient}
              onClick={() => {
                setError("");
                setConfirmingLaunch(true);
              }}
            >
              Reveal assignments
              <ArrowRight aria-hidden="true" className="size-4" />
            </ActionButton>
          )}
        </div>
      </header>

      <section
        aria-label="Dashboard statistics"
        className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4"
      >
        {[
          {
            label: "Participants joined",
            value: snapshot.participantCount,
          },
          {
            label: "Prayer requests",
            value: snapshot.prayerRequestCount,
          },
          { label: "Rooms in use", value: roomsInUse },
          { label: "Rooms at capacity", value: roomsAtCapacity },
        ].map((stat) => (
          <article
            key={stat.label}
            className="rounded-2xl border border-outline/35 bg-white px-4 py-4 shadow-card"
          >
            <strong className="font-serif text-3xl font-semibold leading-none text-ink">
              {stat.value}
            </strong>
            <p className="mt-1 text-sm text-ink-muted">{stat.label}</p>
          </article>
        ))}
      </section>

      {error ? (
        <p
          role="alert"
          className="mt-6 rounded-2xl bg-red-50 px-5 py-4 text-sm font-medium text-danger"
        >
          {error}
        </p>
      ) : null}

      {!snapshot.capacitySufficient ? (
        <p className="mt-4 text-right text-sm text-danger">
          Room configuration needs an unlimited room and valid finite capacities
          before assignments can be revealed.
        </p>
      ) : null}

      {snapshot.rooms.length === 0 ? (
        <p className="mt-8 rounded-3xl border border-dashed border-outline p-6 text-center text-ink-muted">
          Room seed configuration is missing. Seed at least one unlimited room
          before participants join.
        </p>
      ) : (
        <section
          aria-label="Room assignments"
          className="mt-8 grid items-start gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
        >
          {snapshot.rooms.map((room) => (
            <RoomCard
              key={room.id}
              room={room}
              totalParticipants={snapshot.participantCount}
            />
          ))}
        </section>
      )}

      <Modal
        open={isConfirmingLaunch}
        onClose={closeConfirmation}
        title="Reveal room assignments?"
        description={`This will reveal the existing assignments for ${snapshot.participantCount} participants across ${snapshot.rooms.length} rooms. ${snapshot.journey.available ? "Each room will then gather before its coordinator starts the journey." : "The guided journey is unavailable, so only the room handoff will begin."} Those assignments are final until the gathering is reset.`}
      >
        <div className="flex flex-col gap-3">
          {error ? (
            <p
              role="alert"
              className="rounded-2xl bg-danger/8 px-4 py-3 text-sm font-medium text-danger"
            >
              {error}
            </p>
          ) : null}
          <ActionButton onClick={confirmLaunch} disabled={isPending}>
            {isPending ? "Updating…" : "Reveal assignments"}
          </ActionButton>
          <ActionButton
            tone="secondary"
            onClick={closeConfirmation}
            disabled={isPending}
          >
            Cancel
          </ActionButton>
        </div>
      </Modal>
    </AdminShell>
  );
}
