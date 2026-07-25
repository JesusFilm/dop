/**
 * Pure helpers and locked copy for the participant **return view** (§7.3, #6,
 * #13) — the "guided steps" screen someone lands on when they come back to the
 * page they submitted from.
 *
 * Two states, both driven by the app-clock reveal gate (§5): before the reveal a
 * status header plus numbered "what happens next" steps and an edit affordance,
 * no partner; after it, a header naming the partner's **full name** (#13) and one
 * request card per partner. Connection is **in person only** (#6) — there is no
 * messaging, no contact exchange, and no "mark as prayed", and the copy below
 * deliberately offers none of them.
 *
 * Kept free of React/Next/database concerns so the copy and the
 * partners-of-a-group derivation unit-test with plain values.
 */

import type { GroupAssignment, GroupMember } from "@/lib/repository";

/**
 * The locked return-view copy. Held as data so it is asserted by a test and
 * changed in exactly one place. Anything that interpolates the organizer-set
 * reveal time (#14) is a function below rather than a constant here — freezing
 * Monday's 11:00 into a string would silently lie for any other reveal time.
 */
export const RETURN_COPY = {
  /** Pre-reveal status header (§7.3). */
  preRevealHeading: "Your request is in",
  /** Heading for the numbered "what happens next" list (§7.3). */
  nextStepsHeading: "What happens next",
  /** The pre-reveal edit affordance (§6: editable until the reveal). */
  editSummary: "Edit my request",
  /**
   * Back to the confirmation screen (§7.2). The recovery code is the only way
   * into this view from another device (#8, §7.4), so it must stay reachable
   * after the one-shot screen that first showed it.
   */
  recoveryCodeLink: "See my recovery code",
  /**
   * Closing line under the partner cards. States the in-person connection and,
   * by saying there is nothing more to do here, quietly rules out the
   * "mark as prayed" affordance #6 decided against.
   */
  pairedFooter:
    "That's everything — find each other, and pray together. Nothing else to do on this page.",
  /**
   * n=1 (§4 small-n): the lone participant. Never self-matched, and told
   * gently rather than left staring at an empty screen. This copy states a
   * *cause* — "yours was the only request" — so it may only be shown when that
   * is actually known to be true: the pairing froze and produced no groups at
   * all. When the pairing did pair the room and merely left this entry out,
   * {@link unpairedHeading} is the honest screen instead.
   */
  loneHeading: "Not enough people this time",
  loneBody:
    "Yours was the only request in when we closed, so there was no one to pair you with. Find an organizer — they'll pray with you.",
  /**
   * The pairing ran and produced groups, but this participant is in none of
   * them. Rare and not supposed to happen — an entry accepted a hair before the
   * reveal can miss the pairing's cutoff, since the freeze filters on the
   * database's own `createdAt` stamp while the submit gate reads the app clock.
   * Claims no cause, because the page cannot know it; hands the participant to
   * the one thing that reliably fixes it in a room, which is a person (§10).
   */
  unpairedHeading: "We couldn't pair you",
  unpairedBody:
    "Something went wrong matching you this time — this isn't your fault, and your request wasn't seen by anyone else. Find an organizer and they'll pair you up in the room.",
  /**
   * Reveal time has passed but the pairing has not been frozen yet (the freeze
   * triggers land in #22). Accurate for the seconds-long gap: the reveal is
   * now, so this must not read as "come back later".
   */
  pendingHeading: "It's reveal time",
  pendingBody:
    "Who you're praying for will appear here in just a moment — this page will catch up on its own.",
  /**
   * Replaces {@link pendingBody}'s promise once the page has stopped checking
   * on its own. Nothing about the wait is the participant's fault, so this hands
   * them the two things that still work — a reload, and a person.
   */
  pendingStalledBody:
    "This is taking longer than it should. Try again — and if it still doesn't change, find an organizer and they'll sort it out with you.",
  /** The manual retry offered once the automatic checking has stopped. */
  pendingRetryLabel: "Check again",
} as const;

/**
 * Which screen the participant landing serves. Named so the branch order lives
 * in one tested place rather than in JSX:
 *
 * - `submit` — no entry on this device, before the reveal: the §7.1 form.
 * - `pre-reveal` — own entry, before the reveal: the §7.3 guided steps.
 * - `paired` — own entry, after the reveal, in a frozen group: partner card(s).
 * - `lone` — the pairing froze and produced no groups at all: the n=1 case (§4).
 * - `unpaired` — the pairing froze and produced groups, but none containing this
 *   entry. Shouldn't happen; reported without inventing a cause.
 * - `pending-freeze` — after the reveal but nothing frozen yet: a brief wait.
 * - `recover` — no entry, after the reveal: recovery-code entry (§7.3, §7.4).
 */
export type ReturnViewState =
  | "submit"
  | "pre-reveal"
  | "paired"
  | "lone"
  | "unpaired"
  | "pending-freeze"
  | "recover";

export interface ReturnViewInputs {
  /** Whether this device resolved an entry of its own (cookie, §6, or §7.4). */
  hasEntry: boolean;
  /** The app clock's verdict on the reveal boundary (§5) — the only gate. */
  revealOpen: boolean;
  /** Whether the session's pairing has been frozen (§4). */
  pairingFrozen: boolean;
  /** How many partners the caller's frozen group holds (0 for none). */
  partnerCount: number;
  /**
   * Whether the frozen pairing produced **any** group in this session (a bare
   * count from {@link countGroups} — never membership or request content). This
   * is what separates "yours was the only request" from "the room got paired and
   * you were left out": both look identical from `partnerCount` alone. Only
   * consulted when the caller has no partner after the freeze.
   */
  sessionHasGroups: boolean;
}

/**
 * Chooses the return-view state (§7.3). Pure, so the branch order — especially
 * "nothing partner-shaped before the reveal" and "waiting ≠ alone" — is asserted
 * by tests instead of inferred from a component.
 *
 * The reveal gate is checked **before** anything derived from the pairing, so a
 * partner's request cannot be served early even if a pairing were somehow frozen
 * ahead of the reveal instant.
 *
 * Having no partner is deliberately **three** different situations, never one.
 * `partnerCount === 0` on its own says nothing about why, so it is never reported
 * as a cause: before the freeze it means the pairing hasn't run
 * (`pending-freeze`); after a freeze that produced no groups at all it genuinely
 * means this was the only submission (`lone`, §4 small-n); after a freeze that
 * *did* pair the room it means this entry was left out (`unpaired`) — which the
 * two-clock gap between the submit cutoff and the pairing's `createdAt` filter
 * makes reachable for a last-second entry. Collapsing the last two would tell a
 * person in a paired room that they were here alone.
 */
export function selectReturnState(inputs: ReturnViewInputs): ReturnViewState {
  if (!inputs.revealOpen) {
    return inputs.hasEntry ? "pre-reveal" : "submit";
  }
  if (!inputs.hasEntry) {
    return "recover";
  }
  if (inputs.partnerCount > 0) {
    return "paired";
  }
  if (!inputs.pairingFrozen) {
    return "pending-freeze";
  }
  return inputs.sessionHasGroups ? "unpaired" : "lone";
}

/** The full name a partner reads to find someone in the room (#13). */
export function formatFullName(person: {
  firstName: string;
  lastName: string;
}): string {
  return `${person.firstName.trim()} ${person.lastName.trim()}`.trim();
}

/**
 * Joins names for the paired header: `"A"`, `"A and B"` (the trio case, §7.3),
 * or comma-separated with a final "and" for any larger group.
 */
export function formatNameList(names: readonly string[]): string {
  if (names.length === 0) {
    return "";
  }
  if (names.length === 1) {
    return names[0];
  }
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * The post-reveal status header (§7.3): every partner's full name, then the
 * in-person instruction. One name for a pair, both for a trio.
 */
export function pairedHeading(partnerNames: readonly string[]): string {
  return `You're paired with ${formatNameList(partnerNames)} · go find them in the room`;
}

/** The heading on a partner's request card (§7.3, #13). */
export function requestCardHeading(fullName: string): string {
  return `${fullName} asked prayer for`;
}

/**
 * The pre-reveal status line: when the entry was shared and that it locks at the
 * reveal instant (§7.3, §6 hard cutoff).
 */
export function sharedAtLine(sharedLabel: string, revealLabel: string): string {
  return `Shared at ${sharedLabel} · locked at ${revealLabel}`;
}

/**
 * The two numbered "what happens next" steps (§7.3), named with the
 * organizer-set reveal time (#14). Step two is the in-person connection — the
 * whole point of the activity, and the only "action" the app ever asks for.
 */
export function nextSteps(revealLabel: string): readonly string[] {
  return [
    `At ${revealLabel} this page will show you who you're praying for, and their request.`,
    "Go and find them in the room, and pray together, in person.",
  ];
}

/**
 * The partners in the caller's frozen group: every member except the caller,
 * in the group's own stored order so the numbered cards stay stable across
 * reads (§7.3). Empty for a null assignment — the caller is not in a frozen
 * group yet (before the freeze, or the lone n=1 person, §4).
 */
export function partnersOf(
  assignment: GroupAssignment | null,
): readonly GroupMember[] {
  if (!assignment) {
    return [];
  }
  return assignment.members.filter((member) => !member.isSelf);
}
