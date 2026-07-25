# Day of Prayer

## Agent skills

### Issue tracker

Issues and PRDs live as **GitHub issues** in `JesusFilm/dop`, managed via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Domain docs

**Single-context**: one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

Read `CONTEXT.md` and the relevant ADRs before changing application behavior.
Preserve their terminology and surface conflicts instead of silently overriding decisions.

`CONCEPTS.md` at the repo root holds the shared domain vocabulary (entities, named
processes, status concepts) — relevant when orienting to the codebase or discussing
domain concepts.

`docs/solutions/` holds documented solutions to past problems (bugs, best practices,
workflow patterns), organized by category with YAML frontmatter (`module`, `tags`,
`problem_type`) — relevant when implementing or debugging in documented areas.

### Compound Engineering

Use the Compound Engineering plugin from Evry Incorporated for substantive engineering work:

- Use `ce-brainstorm` when product behavior, scope, actors, or success criteria are unclear.
- Use `ce-plan` to turn confirmed requirements into an implementation-ready plan.
- Use `ce-work` to execute an approved plan.
- Use `ce-debug` for bugs, regressions, failing tests, and open-ended diagnosis.
- Use `ce-test-browser` for browser acceptance of changed routes.
- Use `ce-code-review` before shipping non-mechanical changes, then resolve eligible findings.
- Use `ce-commit` for intentional commits and `ce-commit-push-pr` for normal PR delivery.
- Use `lfg` only when the user explicitly requests the autonomous plan-to-PR pipeline.

The repo-local skills under `.agents/skills/` remain available for their documented workflows.
Compound Engineering is additive; it does not replace those skills or the domain-document authority above.
If the plugin is unavailable, disclose that constraint rather than claiming its workflow ran.
Do not vendor plugin source or generated plugin state.

## Engineering expectations

- Use pnpm exclusively; do not create npm or Yarn lockfiles.
- Preserve unrelated changes and do not use destructive Git commands to discard user work.
- Add or update tests for behavior changes and capture failure or characterization evidence before implementation when practical.
- Run `pnpm verify` before delivery.
- Run `pnpm db:check` against PostgreSQL when persistence configuration changes.
- Keep secrets out of version control and update `.env.example` when environment requirements change.
- Keep Railway deployment behavior in `railway.toml`.
- Treat `main` as the production source branch and deliver changes through reviewed pull requests.
- Do not write execution progress into `docs/plans/`.
