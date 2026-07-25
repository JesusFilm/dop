"use client";

import { useState, type FormEvent } from "react";
import {
  ArrowRight,
  BadgeCheck,
  DoorOpen,
  Pencil,
  Plus,
  Radio,
  RotateCcw,
  Trash2,
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

type RoomDraft = Pick<
  OrganizerRoomSnapshot,
  "id" | "name" | "directions" | "maxCapacity"
>;

type Confirmation =
  | { kind: "launch" }
  | { kind: "reset" }
  | { kind: "remove"; room: OrganizerRoomSnapshot };

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

function RoomForm({
  room,
  onSave,
  onCancel,
}: {
  room: RoomDraft | null;
  onSave: (draft: Omit<RoomDraft, "id">) => Promise<void>;
  onCancel: () => void;
}) {
  const [error, setError] = useState("");
  const [isPending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const name = String(data.get("name") ?? "").trim();
    if (!name) {
      setError("Give the room a name before saving it.");
      return;
    }
    const capacityValue = String(data.get("capacity") ?? "").trim();
    setPending(true);
    setError("");
    try {
      await onSave({
        name,
        directions: String(data.get("directions") ?? "").trim(),
        maxCapacity: capacityValue ? Number(capacityValue) : null,
      });
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Room update failed.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-ink-muted">
        Room name
        <input
          name="name"
          autoFocus
          required
          maxLength={100}
          defaultValue={room?.name}
          className="min-h-14 rounded-xl border border-outline bg-white px-4 text-base font-normal normal-case tracking-normal text-ink focus:border-primary focus:outline-none"
          placeholder="e.g. Garden Room"
        />
      </label>
      <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-ink-muted">
        Wayfinding note
        <textarea
          name="directions"
          rows={3}
          maxLength={500}
          defaultValue={room?.directions}
          className="resize-none rounded-xl border border-outline bg-white px-4 py-3 text-base font-normal normal-case tracking-normal text-ink focus:border-primary focus:outline-none"
          placeholder="Level 1, beside reception."
        />
      </label>
      <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-ink-muted">
        Maximum capacity
        <input
          name="capacity"
          type="number"
          min={1}
          max={500}
          defaultValue={room?.maxCapacity ?? ""}
          className="min-h-14 rounded-xl border border-outline bg-white px-4 text-base font-normal normal-case tracking-normal text-ink focus:border-primary focus:outline-none"
          placeholder="Leave blank for unlimited"
        />
        <span className="font-normal normal-case tracking-normal">
          Leave blank for unlimited. At least one room must stay unlimited.
        </span>
      </label>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      <div className="flex flex-col gap-3 sm:flex-row-reverse">
        <ActionButton type="submit" disabled={isPending}>
          {isPending ? "Saving…" : room ? "Save room" : "Add room"}
        </ActionButton>
        <ActionButton tone="secondary" onClick={onCancel}>
          Cancel
        </ActionButton>
      </div>
    </form>
  );
}

function RoomCard({
  room,
  canEdit,
  onEdit,
  onRemove,
}: {
  room: OrganizerRoomSnapshot;
  canEdit: boolean;
  onEdit: () => void;
  onRemove: () => void;
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

  if (canEdit) {
    return (
      <article className="flex items-center gap-3 rounded-3xl bg-surface-muted p-4 sm:p-5">
        {summary}
        <button
          type="button"
          aria-label={`Edit ${room.name}`}
          className="grid size-10 place-items-center rounded-full text-ink-muted hover:bg-white hover:text-primary"
          onClick={onEdit}
        >
          <Pencil aria-hidden="true" className="size-4" />
        </button>
        <button
          type="button"
          aria-label={`Remove ${room.name}`}
          className="grid size-10 place-items-center rounded-full text-ink-muted hover:bg-white hover:text-danger"
          onClick={onRemove}
        >
          <Trash2 aria-hidden="true" className="size-4" />
        </button>
      </article>
    );
  }

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
            {room.coordinatorName ?? "Not assigned"}
          </strong>
        </p>
        <ul className="mt-3 flex flex-wrap gap-2">
          {room.members.map((member) => (
            <li
              key={member.id}
              className="rounded-full bg-white px-3 py-2 text-sm text-ink"
            >
              {member.name}
              {member.isCoordinator ? " · coordinator" : ""}
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
  const [roomEditor, setRoomEditor] = useState<RoomDraft | "new" | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [error, setError] = useState("");
  const [isPending, setPending] = useState(false);
  const canEdit = snapshot.phase === "FORMING";

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

  async function saveRoom(draft: Omit<RoomDraft, "id">) {
    await run("/api/organizer/rooms", {
      action: roomEditor === "new" ? "add" : "update",
      id: roomEditor === "new" ? undefined : roomEditor?.id,
      ...draft,
    });
    setRoomEditor(null);
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
      if (confirmation.kind === "remove") {
        await run("/api/organizer/rooms", {
          action: "remove",
          id: confirmation.room.id,
        });
      } else if (confirmation.kind === "launch") {
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
              ? "Waiting for launch"
              : "Rooms assigned"}
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
                  Add the first physical room to prepare the gathering.
                </p>
              ) : null}
              {snapshot.rooms.map((room) => (
                <RoomCard
                  key={room.id}
                  room={room}
                  canEdit={canEdit}
                  onEdit={() => setRoomEditor(room)}
                  onRemove={() => openConfirmation({ kind: "remove", room })}
                />
              ))}
            </div>
            {canEdit ? (
              <ActionButton
                tone="secondary"
                className="mt-5"
                onClick={() => setRoomEditor("new")}
              >
                <Plus aria-hidden="true" className="size-5" /> Add room
              </ActionButton>
            ) : null}
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
                      Room assignment launched
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
                    Launch room assignment{" "}
                    <ArrowRight aria-hidden="true" className="size-5" />
                  </ActionButton>
                  <p className="mx-auto mt-5 max-w-xl text-center text-sm leading-6 text-ink-muted">
                    {snapshot.rooms.length === 0
                      ? "Add at least one room before launching."
                      : snapshot.capacityShortfall > 0
                        ? `Add capacity for ${snapshot.capacityShortfall} more ${snapshot.capacityShortfall === 1 ? "person" : "people"} before launching.`
                        : `Ready to distribute everyone evenly across ${snapshot.rooms.length} ${snapshot.rooms.length === 1 ? "room" : "rooms"}.`}
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
        open={roomEditor !== null}
        onClose={() => setRoomEditor(null)}
        title={roomEditor === "new" ? "Add a room" : "Edit room"}
        description="Give participants a recognizable name, directions, and an optional maximum."
      >
        <RoomForm
          room={roomEditor === "new" ? null : roomEditor}
          onSave={saveRoom}
          onCancel={() => setRoomEditor(null)}
        />
      </Modal>

      <Modal
        open={confirmation !== null}
        onClose={closeConfirmation}
        title={
          confirmation?.kind === "launch"
            ? "Launch room assignment?"
            : confirmation?.kind === "reset"
              ? "Reset this gathering?"
              : `Remove ${confirmation?.room.name ?? "this room"}?`
        }
        description={
          confirmation?.kind === "launch"
            ? `This will assign ${snapshot.participantCount} participants across ${snapshot.rooms.length} rooms. Assignment is final until the gathering is reset.`
            : confirmation?.kind === "reset"
              ? "This clears every participant and prayer request, but keeps the room setup."
              : "Participants will no longer be assigned to this physical space."
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
                ? "Assign everyone"
                : confirmation?.kind === "reset"
                  ? "Reset gathering"
                  : "Remove room"}
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
