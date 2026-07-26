---
title: Admin Participant Tester - Plan
type: feat
date: 2026-07-27
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-brainstorm
execution: code
---

# Admin Participant Tester - Plan

## Goal Capsule

- **Objective:** Give an organizer one admin page for manually rehearsing the Day of Prayer flow as six independent participants in any deployed environment.
- **Product authority:** The confirmed conversation scope and `CONTEXT.md`.
- **Execution profile:** Lightweight, test-first where the existing component and route seams support it.
- **Stop condition:** Six frames can join, poll, reload, and perform participant actions without sharing identities or changing the normal `/` participant session.
- **Tail ownership:** Follow the repository's normal reviewed pull-request workflow.

## Product Contract

### Summary

Add Tester to the admin navigation.
The Tester page presents six real participant experiences with independent remembered sessions and editable pre-filled names.

### Problem Frame

The opaque participant cookie correctly remembers one participant per browser, but six same-host iframes share that cookie jar.
An organizer therefore cannot rehearse a multi-participant gathering from one browser page.

### Requirements

- R1. The admin navigation includes Tester alongside Dashboard and Settings.
- R2. `/admin/tester` displays exactly six participant frames with editable names pre-filled as Participant 1 through Participant 6.
- R3. Each frame uses an independent remembered participant identity across polling, actions, and reloads.
- R4. Tester uses the real participant experience after selecting its session slot, including manual joining.
- R5. Tester is available in every environment without a feature flag.
- R6. The normal `/` participant session and API behavior remain unchanged.

### Acceptance Examples

- AE1. **Covers:** R2, R3, R4. **Given** a fresh browser on `/admin/tester`, **when** Participant 1 and Participant 2 join, **then** the gathering contains two distinct participants and each frame continues showing its own state.
- AE2. **Covers:** R3. **Given** multiple joined tester frames, **when** the page reloads, **then** every frame returns to its own participant identity.
- AE3. **Covers:** R6. **Given** a normal participant has joined at `/`, **when** Tester sessions are used, **then** the normal participant cookie continues selecting only the normal participant.

### Scope Boundaries

- No organizer dashboard is embedded inside Tester.
- Tester does not auto-submit joins or reset the gathering.
- Admin authentication is unchanged; placing Tester under admin navigation is organization, not access control.

## Planning Contract

### Key Technical Decisions

- KTD1. **Use numbered same-host session slots.** Each tester frame selects one of six validated cookie names while normal requests retain the existing cookie name. This works on localhost and deployed hosts without wildcard DNS. (session-settled: user-approved — chosen over per-frame subdomains: the page must work in every deployed environment.)
- KTD2. **Configure the shared participant UI with endpoints.** The normal experience keeps its current defaults, while tester frames receive slot-qualified API endpoints and an initial editable name.
- KTD3. **Keep tester identity selection server-owned.** Tester cookies remain opaque and HttpOnly; invalid slot values fail rather than falling back to the normal participant session.

### Sequencing

1. Add validated participant cookie-slot resolution and apply it to participant APIs.
2. Make participant endpoints and the initial join name configurable without changing defaults.
3. Add the tester frame route, admin page, and navigation item.
4. Run focused tests, `pnpm verify`, and browser acceptance.

### Risks and Dependencies

- All six cookies are sent to the same host, so every participant route must consistently select the requested slot.
- The six live frames poll concurrently; this remains within the existing gathering target and uses the existing one-second polling contract.

## Implementation Units

### U1. Isolate tester participant sessions

- **Goal:** Let participant APIs select one of six independent HttpOnly cookie sessions while preserving the normal cookie contract.
- **Requirements:** R3, R5, R6
- **Files:** `src/lib/gathering/constants.ts`, `src/lib/gathering/session.ts`, `src/app/api/participant/**`, focused tests
- **Approach:** Add one validated cookie-name resolver and use it consistently across snapshot, join, leader, advance, and reassign handlers.
- **Test scenarios:** Normal requests use the existing cookie; slots 1 and 6 resolve distinct names; invalid slots are rejected; separate slot joins remain distinct.
- **Verification:** Focused route/session tests pass.

### U2. Configure the shared participant experience

- **Goal:** Reuse the production participant UI with caller-provided endpoints and a pre-filled editable name.
- **Requirements:** R2, R4, R6
- **Files:** `src/components/participant/participant-experience.tsx`, `src/components/participant/join-form.tsx`, focused component tests
- **Approach:** Add optional configuration with defaults identical to the normal participant experience.
- **Test scenarios:** Normal rendering keeps blank name and existing endpoints; tester rendering shows its supplied name and posts to its supplied endpoint.
- **Verification:** Participant component tests pass.

### U3. Add the admin Tester page

- **Goal:** Present six independent participant frames from the admin navigation.
- **Requirements:** R1, R2, R5
- **Files:** `src/components/organizer/admin-shell.tsx`, `src/app/admin/tester/**`, focused UI tests
- **Approach:** Add a Tester navigation item, a responsive frame grid, and one slot page per iframe.
- **Test scenarios:** Admin navigation marks Tester active; the page renders six titled frames; every frame points at a different slot and pre-filled participant name.
- **Verification:** Focused UI tests and browser acceptance at desktop and mobile widths pass.

## Verification Contract

| Gate                    | Command or check                                                                        | Covers  |
| ----------------------- | --------------------------------------------------------------------------------------- | ------- |
| Focused tests           | `pnpm test -- <changed test files>`                                                     | U1-U3   |
| Repository verification | `pnpm verify`                                                                           | R1-R6   |
| Browser acceptance      | Open `/admin/tester`, join at least two frames, reload, and confirm identity separation | AE1-AE3 |

## Definition of Done

- U1-U3 verification is observed and passing.
- Six tester frames retain separate identities without changing normal participant continuity.
- Tester appears in desktop and mobile admin navigation.
- The page works from the current host in local and deployed environments without hostname assumptions.
- Abandoned or duplicate implementation paths are removed from the diff.
