# ADR 0004: Allow partial journeys from 20 to 90 minutes

- Status: Accepted
- Date: 2026-07-27

## Context

The first deliverable part of the Day of Prayer journey contains two ordered,
10-minute Short Study module instances. The previous 60-minute availability
floor treated the eventual full-event duration as a requirement for every
incremental journey configuration. That made the valid 20-minute opening
journey unavailable and encouraged false per-module recommendations.

The complete Day of Prayer journey is still expected to last 60–90 minutes as
later activities are added.

## Decision

Treat a structurally valid journey as available when the sum of its module
recommendations is between 20 and 90 minutes, inclusive. Continue to enforce
contiguous module positions, positive per-module durations, the per-module
maximum, registered behavior keys, and valid behavior configuration.

This supersedes the interpretation that the 60-minute full-event target is the
minimum duration for an available journey. It does not change the eventual
60–90-minute event target or make recommendations control progression.

## Consequences

- The two opening 10-minute Short Studies form an available partial journey.
- Journeys shorter than 20 minutes or longer than 90 minutes remain
  unavailable.
- Later modules can be delivered incrementally without inflating activity
  recommendations to satisfy the full-event target.
- Existing structural and module validation remains unchanged.
