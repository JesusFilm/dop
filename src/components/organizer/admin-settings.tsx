"use client";

import { useState } from "react";
import { RotateCcw } from "lucide-react";
import { AdminShell } from "@/components/organizer/admin-shell";
import { updateOrganizer } from "@/components/organizer/update-organizer";
import { ActionButton } from "@/components/ui/action-button";
import { Modal } from "@/components/ui/modal";

export function AdminSettings() {
  const [isConfirmingReset, setConfirmingReset] = useState(false);
  const [isPending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  function closeConfirmation() {
    setError("");
    setConfirmingReset(false);
  }

  async function confirmReset() {
    setPending(true);
    setError("");
    setSuccess("");
    try {
      await updateOrganizer("/api/organizer/reset");
      closeConfirmation();
      setSuccess("The gathering has been reset.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Reset failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <AdminShell active="settings">
      <header>
        <h1 className="font-serif text-4xl font-bold tracking-tight text-ink sm:text-5xl">
          Settings
        </h1>
      </header>

      {success ? (
        <p
          role="status"
          className="mt-6 rounded-2xl bg-primary-faint px-5 py-4 text-sm font-medium text-primary"
        >
          {success}
        </p>
      ) : null}

      <section className="mt-10 max-w-3xl rounded-3xl border border-danger/20 bg-white p-6 shadow-card sm:p-8">
        <h2 className="text-xl font-semibold text-ink">Reset gathering</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-muted">
          Clear all participants, assignments, leaders, and launch state so the
          gathering can start again. Seeded room configuration will be
          preserved, along with the reusable journey configuration.
        </p>
        <ActionButton
          tone="danger"
          fullWidth={false}
          className="mt-6"
          onClick={() => {
            setError("");
            setSuccess("");
            setConfirmingReset(true);
          }}
        >
          <RotateCcw aria-hidden="true" className="size-4" />
          Reset gathering
        </ActionButton>
      </section>

      <Modal
        open={isConfirmingReset}
        onClose={closeConfirmation}
        title="Reset this gathering?"
        description="This clears every participant, prayer request, and room journey progress, but keeps the seeded rooms and reusable journey configuration."
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
            tone="danger"
            onClick={confirmReset}
            disabled={isPending}
          >
            {isPending ? "Resetting…" : "Reset gathering"}
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
