"use client";

import { useState } from "react";
import { JoinForm } from "@/components/participant/join-form";
import { CompletedState } from "@/components/journey/completed-state";
import { Countdown } from "@/components/journey/countdown";
import { ModuleShell } from "@/components/journey/module-shell";
import { LobbyStatus } from "@/components/participant/lobby-status";
import { ParticipantHeader } from "@/components/participant/participant-header";
import { RoomAssignment } from "@/components/participant/room-assignment";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import type { ParticipantSnapshot } from "@/lib/gathering/types";
import { useLiveSnapshot } from "@/lib/use-live-snapshot";

function JoinScreen({
  onJoined,
  initialName,
  endpoint,
  homeHref,
}: {
  onJoined: (snapshot: ParticipantSnapshot) => void;
  initialName?: string;
  endpoint: string;
  homeHref: string;
}) {
  return (
    <>
      <ParticipantHeader homeHref={homeHref} />
      <main className="relative mx-auto flex min-h-[calc(100dvh-5.5rem)] w-full max-w-5xl items-center justify-center overflow-hidden px-5 py-12 sm:px-8">
        <div
          aria-hidden="true"
          className="absolute -left-48 top-0 size-[34rem] rounded-full bg-sky-100/45 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="absolute -right-40 bottom-0 size-[30rem] rounded-full bg-primary-faint blur-3xl"
        />
        <section className="animate-fade-up relative w-full max-w-xl rounded-[2rem] bg-white/80 p-6 text-center shadow-ambient backdrop-blur sm:p-10">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
            Welcome
          </p>
          <h1 className="mt-4 font-serif text-4xl font-bold tracking-tight text-ink sm:text-5xl">
            Welcome to Day of Prayer
          </h1>
          <p className="mx-auto mt-4 max-w-md text-lg leading-7 text-ink-muted">
            Enlightening the eyes of our hearts together.
          </p>
          <JoinForm
            onJoined={onJoined}
            initialName={initialName}
            endpoint={endpoint}
          />
        </section>
      </main>
    </>
  );
}

export type ParticipantEndpoints = {
  snapshot: string;
  leader: string;
  journeyAdvance: string;
  journeyReassign: string;
};

const defaultEndpoints: ParticipantEndpoints = {
  snapshot: "/api/participant",
  leader: "/api/participant/leader",
  journeyAdvance: "/api/participant/journey/advance",
  journeyReassign: "/api/participant/journey/reassign",
};

export function ParticipantExperience({
  initialSnapshot,
  initialName,
  endpoints = defaultEndpoints,
  homeHref = "/",
}: {
  initialSnapshot: ParticipantSnapshot;
  initialName?: string;
  endpoints?: ParticipantEndpoints;
  homeHref?: string;
}) {
  const { snapshot, setSnapshot, isDisconnected } = useLiveSnapshot(
    initialSnapshot,
    endpoints.snapshot,
  );
  const [isJourneyPending, setJourneyPending] = useState(false);
  const [journeyError, setJourneyError] = useState("");

  async function takeOver() {
    const response = await fetchWithTimeout(endpoints.leader, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expectedRevision: snapshot.revision }),
    });
    if (!response.ok) throw new Error("Leader update failed");
    setSnapshot((await response.json()) as ParticipantSnapshot);
  }

  async function advanceJourney(expectedState: string) {
    setJourneyPending(true);
    setJourneyError("");
    try {
      const response = await fetchWithTimeout(endpoints.journeyAdvance, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedState,
          expectedRevision: snapshot.revision,
        }),
      });
      const result = (await response.json()) as ParticipantSnapshot & {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(result.error ?? "The room could not continue.");
      }
      setSnapshot(result);
    } catch (error) {
      setJourneyError(
        error instanceof Error ? error.message : "The room could not continue.",
      );
    } finally {
      setJourneyPending(false);
    }
  }

  async function reassignReader(
    expectedState: string,
  ): Promise<"changed" | "stale" | "unavailable" | "error"> {
    setJourneyPending(true);
    setJourneyError("");
    try {
      const response = await fetchWithTimeout(endpoints.journeyReassign, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedState,
          expectedRevision: snapshot.revision,
        }),
      });
      const result = (await response.json()) as {
        snapshot?: ParticipantSnapshot;
        reassigned?: boolean;
        result?: "changed" | "stale" | "unavailable";
        error?: string;
      };
      if (!response.ok || !result.snapshot) {
        throw new Error(result.error ?? "The reader could not be reassigned.");
      }
      setSnapshot(result.snapshot);
      return result.result ?? (result.reassigned ? "changed" : "unavailable");
    } catch (error) {
      setJourneyError(
        error instanceof Error
          ? error.message
          : "The reader could not be reassigned.",
      );
      return "error";
    } finally {
      setJourneyPending(false);
    }
  }

  return (
    <>
      {isDisconnected ? (
        <div
          role="status"
          className="bg-amber-50 px-4 py-2 text-center text-sm font-medium text-amber-900"
        >
          Reconnecting… Your place is saved.
        </div>
      ) : null}
      {snapshot.state === "JOIN" ? (
        <JoinScreen
          onJoined={setSnapshot}
          initialName={initialName}
          endpoint={endpoints.snapshot}
          homeHref={homeHref}
        />
      ) : snapshot.state === "LOBBY" ? (
        <>
          <ParticipantHeader homeHref={homeHref} />
          <LobbyStatus
            name={snapshot.participant.name}
            participantCount={snapshot.participantCount}
          />
        </>
      ) : snapshot.journey?.state === "ACTIVE" ? (
        <>
          <ParticipantHeader
            homeHref={homeHref}
            trailing={
              <Countdown
                startedAt={snapshot.journey.module.startedAt}
                recommendedSeconds={snapshot.journey.module.recommendedSeconds}
                serverTime={snapshot.journey.module.serverTime}
                compact
              />
            }
          />
          <ModuleShell
            snapshot={snapshot}
            journey={snapshot.journey}
            onAdvance={() => advanceJourney(snapshot.journey!.expectedState)}
            onReassign={() => reassignReader(snapshot.journey!.expectedState)}
            onTakeover={takeOver}
            isPending={isJourneyPending}
            error={journeyError}
          />
        </>
      ) : snapshot.journey?.state === "COMPLETED" ? (
        <>
          <ParticipantHeader homeHref={homeHref} />
          <CompletedState snapshot={snapshot} />
        </>
      ) : (
        <>
          <ParticipantHeader homeHref={homeHref} />
          <RoomAssignment
            snapshot={snapshot}
            onTakeover={takeOver}
            onStartJourney={
              snapshot.journey?.state === "GATHERING"
                ? () => advanceJourney(snapshot.journey!.expectedState)
                : undefined
            }
            isJourneyPending={isJourneyPending}
            journeyError={journeyError}
          />
        </>
      )}
    </>
  );
}
