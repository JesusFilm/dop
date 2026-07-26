"use client";

import { useState, type FormEvent } from "react";
import { ArrowRight, LoaderCircle, LockKeyhole } from "lucide-react";
import { ActionButton } from "@/components/ui/action-button";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import type { ParticipantSnapshot } from "@/lib/gathering/types";

export function JoinForm({
  onJoined,
  initialName = "",
  endpoint = "/api/participant",
}: {
  onJoined: (snapshot: ParticipantSnapshot) => void;
  initialName?: string;
  endpoint?: string;
}) {
  const [name, setName] = useState(initialName);
  const [request, setRequest] = useState("");
  const [error, setError] = useState("");
  const [isPending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const cleanName = name.trim().replace(/\s+/g, " ");
    if (!cleanName) {
      setError("Please enter your name so your room can recognise you.");
      return;
    }

    setError("");
    setPending(true);
    try {
      const response = await fetchWithTimeout(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: cleanName,
          prayerRequest: request,
        }),
      });
      const result = (await response.json()) as ParticipantSnapshot & {
        error?: string;
      };
      if (!response.ok) {
        setError(result.error ?? "We couldn’t add you. Please try again.");
        return;
      }
      onJoined(result);
    } catch {
      setError("We couldn’t reach the gathering. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      className="mt-10 flex w-full flex-col gap-6 text-left"
      onSubmit={handleSubmit}
      noValidate
    >
      <div className="flex flex-col gap-2">
        <label
          className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-muted"
          htmlFor="participant-name"
        >
          Your name
        </label>
        <input
          id="participant-name"
          name="name"
          autoComplete="name"
          value={name}
          maxLength={100}
          onChange={(event) => setName(event.target.value)}
          aria-describedby={error ? "name-error" : undefined}
          aria-invalid={Boolean(error)}
          placeholder="How should we call you?"
          className="min-h-14 w-full rounded-xl border border-transparent bg-surface-muted px-5 text-lg text-ink placeholder:text-slate-500 transition focus:border-primary focus:bg-white focus:outline-none"
        />
        {error ? (
          <p id="name-error" role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-4">
          <label
            className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-muted"
            htmlFor="prayer-request"
          >
            Prayer request
          </label>
          <span className="text-xs text-ink-muted">Optional</span>
        </div>
        <textarea
          id="prayer-request"
          name="request"
          rows={4}
          value={request}
          maxLength={2000}
          onChange={(event) => setRequest(event.target.value)}
          placeholder="What is on your heart today?"
          className="w-full resize-none rounded-xl border border-transparent bg-surface-muted px-5 py-4 text-base leading-6 text-ink placeholder:text-slate-500 transition focus:border-primary focus:bg-white focus:outline-none"
        />
        <p className="flex items-center gap-2 text-sm text-ink-muted">
          <LockKeyhole aria-hidden="true" className="size-4 text-primary" />
          This will only be shared with your room later.
        </p>
      </div>

      <ActionButton
        type="submit"
        disabled={isPending}
        className="mt-2 min-h-16 text-base"
      >
        {isPending ? (
          <>
            <LoaderCircle aria-hidden="true" className="size-5 animate-spin" />
            Joining…
          </>
        ) : (
          <>
            Join Day of Prayer
            <ArrowRight aria-hidden="true" className="size-5" />
          </>
        )}
      </ActionButton>
    </form>
  );
}
