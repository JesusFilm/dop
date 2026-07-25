"use client";

import { useState } from "react";
import {
  ArrowRight,
  BadgeCheck,
  DoorOpen,
  Radio,
  RotateCcw,
  Users,
} from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { ActionButton } from "@/components/ui/action-button";
import { Modal } from "@/components/ui/modal";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import type {
  OrganizerRoomSnapshot,
  OrganizerSnapshot,
} from "@/lib/gathering/types";
import { useLiveSnapshot } from "@/lib/use-live-snapshot";

type Confirmation = { kind: "launch" } | { kind: "reset" };

async function mutate<T>(endpoint: string, body?: unknown): Promise<T> {
  const response = await fetchWithTimeout(endpoint, {
    method: "POST",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const result = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(result.error ?? "The gathering could not be updated.");
  }
  return result;
}

function RoomCard({
  room,
  revealed,
}: {
  room: OrganizerRoomSnapshot;
  revealed: boolean;
}) {
  const summary = (
    <div className="flex min-w-0 flex-1 items-center gap-4">
      <span className="grid size-12 shrink-0 place-items-center rounded-full bg-primary-faint text-primary">
        <DoorOpen aria-hidden="true" className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-lg font-semibold text-ink">{room.name}</h3>
        <p className="mt-0.5 text-sm text-ink-muted">
          {room.memberCount} {room.memberCount === 1 ? "member" : "members"}
          {" · "}
          {room.maxCapacity === null
            ? "Unlimited"
            : `Maximum ${room.maxCapacity}`}
        </p>
      </div>
    </div>
  );

  return (
    <details className="rounded-3xl bg-surface-muted p-4 sm:p-5">
      <summary className="flex cursor-pointer list-none items-center gap-3">
        {summary}
        <BadgeCheck
          aria-hidden="true"
          className="size-5 shrink-0 text-primary"
        />
      </summary>
      <div className="mt-5 border-t border-outline/50 pt-4">
        <p className="text-sm text-ink-muted">
          Coordinator:{" "}
          <strong className="text-ink">
            {revealed
              ? (room.coordinatorName ?? "Not assigned")
              : "Shown at reveal"}
          </strong>
        </p>
        <ul className="mt-3 flex flex-wrap gap-2">
          {room.members.map((member) => (
            <li
              key={member.id}
              className="rounded-full bg-white px-3 py-2 text-sm text-ink"
            >
              {member.name}
              {revealed && member.isCoordinator ? " · coordinator" : ""}
            </li>
          ))}
        </ul>
      </div>
    </details>
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
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [error, setError] = useState("");
  const [isPending, setPending] = useState(false);

  async function run(endpoint: string, body?: unknown) {
    setPending(true);
    setError("");
    try {
      const next = await mutate<OrganizerSnapshot>(endpoint, body);
      setSnapshot(next);
      return next;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Update failed.");
      throw caught;
    } finally {
      setPending(false);
    }
  }

  function openConfirmation(next: Confirmation) {
    setError("");
    setConfirmation(next);
  }

  function closeConfirmation() {
    setError("");
    setConfirmation(null);
  }

  async function confirmAction() {
    if (!confirmation) return;
    try {
      if (confirmation.kind === "launch") {
        await run("/api/organizer/launch");
      } else {
        await run("/api/organizer/reset");
      }
      closeConfirmation();
    } catch {}
  }

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[18rem_1fr]">
      <aside className="border-b border-outline/40 bg-surface-subtle px-5 py-5 lg:fixed lg:inset-y-0 lg:w-72 lg:border-b-0 lg:border-r lg:px-7 lg:py-8">
        <BrandMark />
        <p className="mt-3 hidden text-xs font-semibold uppercase tracking-[0.18em] text-ink-muted lg:block">
          Organizer portal
        </p>
        <span className="mt-6 inline-flex items-center gap-2 rounded-full bg-white px-3 py-2 text-xs font-semibold text-primary shadow-card lg:w-full lg:justify-center lg:rounded-2xl lg:py-4">
          <Radio aria-hidden="true" className="size-4" />
          {isDisconnected
            ? "Reconnecting"
            : snapshot.phase === "FORMING"
              ? "Waiting for reveal"
              : "Rooms revealed"}
        </span>
      </aside>

      <main className="px-5 py-8 sm:px-8 lg:col-start-2 lg:px-12 lg:py-10 xl:px-16">
        <header className="mx-auto flex max-w-7xl flex-wrap items-end justify-between gap-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
              Day of Prayer
            </p>
            <h1 className="mt-2 font-serif text-4xl font-bold tracking-tight text-ink sm:text-5xl">
              Room handoff
            </h1>
          </div>
          <ActionButton
            tone="secondary"
            className="w-auto"
            onClick={() => openConfirmation({ kind: "reset" })}
            disabled={isPending}
          >
            <RotateCcw aria-hidden="true" className="size-4" /> Reset gathering
          </ActionButton>
        </header>

        {error ? (
          <p
            role="alert"
            className="mx-auto mt-6 max-w-7xl rounded-2xl bg-red-50 px-5 py-4 text-sm font-medium text-danger"
          >
            {error}
          </p>
        ) : null}

        <div className="mx-auto mt-10 grid max-w-7xl gap-8 xl:grid-cols-[minmax(20rem,0.9fr)_minmax(30rem,1.3fr)]">
          <section aria-labelledby="rooms-heading">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                  Physical spaces
                </p>
                <h2
                  id="rooms-heading"
                  className="mt-2 font-serif text-3xl font-bold text-ink"
                >
                  Rooms
                </h2>
              </div>
              <span className="rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-white">
                {snapshot.rooms.length} total
              </span>
            </div>
            <div className="mt-6 flex flex-col gap-3">
              {snapshot.rooms.length === 0 ? (
                <p className="rounded-3xl border border-dashed border-outline p-6 text-center text-ink-muted">
                  Room seed configuration is missing. Seed at least one
                  unlimited room before participants join.
                </p>
              ) : null}
              {snapshot.rooms.map((room) => (
                <RoomCard
                  key={room.id}
                  room={room}
                  revealed={snapshot.phase === "ASSIGNED"}
                />
              ))}
            </div>
          </section>

          <section className="relative overflow-hidden rounded-[2.5rem] bg-white p-7 shadow-ambient sm:p-10">
            <div
              aria-hidden="true"
              className="absolute -right-20 -top-24 size-80 rounded-full bg-primary-faint blur-3xl"
            />
            <div className="relative">
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                <Radio aria-hidden="true" className="size-4" /> Live status
              </p>
              <div className="mt-7 flex items-end gap-4">
                <strong className="font-serif text-7xl font-semibold leading-none text-ink sm:text-8xl">
                  {snapshot.participantCount}
                </strong>
                <p className="pb-2 text-lg text-ink-muted">
                  {snapshot.participantCount === 1
                    ? "participant joined"
                    : "participants joined"}
                </p>
              </div>

              {snapshot.phase === "ASSIGNED" ? (
                <div className="mt-9 flex items-center gap-4 rounded-3xl bg-primary-faint p-5 text-primary">
                  <BadgeCheck aria-hidden="true" className="size-8 shrink-0" />
                  <div>
                    <h2 className="text-lg font-semibold">
                      Room assignments revealed
                    </h2>
                    <p className="mt-1 text-sm">
                      Expand a room to see its roster and coordinator.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="mt-10">
                  <ActionButton
                    disabled={isPending || !snapshot.capacitySufficient}
                    className="min-h-16 text-base"
                    onClick={() => openConfirmation({ kind: "launch" })}
                  >
                    Reveal room assignments{" "}
                    <ArrowRight aria-hidden="true" className="size-5" />
                  </ActionButton>
                  <p className="mx-auto mt-5 max-w-xl text-center text-sm leading-6 text-ink-muted">
                    {snapshot.capacitySufficient
                      ? `${snapshot.participantCount} hidden ${snapshot.participantCount === 1 ? "assignment is" : "assignments are"} ready to reveal across ${snapshot.rooms.length} ${snapshot.rooms.length === 1 ? "room" : "rooms"}.`
                      : "The seeded rooms must include at least one unlimited room, and every finite capacity must be at least two."}
                  </p>
                </div>
              )}

              <div className="mt-8 flex items-center gap-3 rounded-2xl bg-surface-muted px-5 py-4 text-ink-muted">
                <Users aria-hidden="true" className="size-5 text-primary" />
                Prayer requests are collected privately and never appear here.
              </div>
            </div>
          </section>
        </div>
      </main>

      <Modal
        open={confirmation !== null}
        onClose={closeConfirmation}
        title={
          confirmation?.kind === "launch"
            ? "Reveal room assignments?"
            : "Reset this gathering?"
        }
        description={
          confirmation?.kind === "launch"
            ? `This will reveal the existing assignments for ${snapshot.participantCount} participants across ${snapshot.rooms.length} rooms. Those assignments are final until the gathering is reset.`
            : "This clears every participant and prayer request, but keeps the seeded rooms."
        }
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
          <ActionButton
            tone={confirmation?.kind === "launch" ? "primary" : "danger"}
            onClick={confirmAction}
            disabled={isPending}
          >
            {isPending
              ? "Updating…"
              : confirmation?.kind === "launch"
                ? "Reveal assignments"
                : "Reset gathering"}
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
    </div>
  );
}
