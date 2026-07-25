"use client";

import { useActionState } from "react";

import { RECOVERY_CODE_LENGTH, RECOVERY_COPY } from "@/lib/recovery";

import { recoverAction } from "./recover/actions";
import { INITIAL_RECOVERY_STATE } from "./recover/recovery-state";

/**
 * Recovery-code entry (§7.4, #8): the self-service form that restores a
 * participant's return view on any device. Rendered by {@link RecoveryPanel}
 * wherever a visitor has no entry on this phone.
 *
 * The input is deliberately forgiving — any case, and spaces or dashes are
 * fine — because the code is typically being read off a screenshot; the server
 * normalizes before looking anything up. Server-side validation is
 * authoritative; the `pattern`/`maxLength` attributes here only save a
 * round-trip on an obvious typo.
 */
export function RecoveryForm() {
  const [state, formAction, pending] = useActionState(
    recoverAction,
    INITIAL_RECOVERY_STATE,
  );

  return (
    <form
      action={formAction}
      style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}
    >
      <label
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "0.35rem",
          fontSize: "0.95rem",
          fontWeight: 600,
          textAlign: "left",
        }}
      >
        {RECOVERY_COPY.label}
        <input
          type="text"
          name="recoveryCode"
          required
          // Generous enough to accept the spaces/dashes the server strips.
          maxLength={RECOVERY_CODE_LENGTH * 2}
          // Deliberately no `pattern`: the server normalizes case, spaces and
          // dashes and checks the code alphabet, and it gives a specific message
          // for each way a code can be wrong. A browser-side pattern loose
          // enough not to reject a valid typing would add nothing, and a strict
          // one risks blocking a code the server would have accepted.
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          inputMode="text"
          aria-invalid={state.error ? true : undefined}
          aria-describedby={
            state.error ? "recovery-error recovery-hint" : "recovery-hint"
          }
          style={{
            padding: "0.6rem",
            fontSize: "1.4rem",
            fontWeight: 600,
            letterSpacing: "0.25em",
            textTransform: "uppercase",
            fontVariantNumeric: "tabular-nums",
            border: "1px solid #ccc",
            borderRadius: "0.5rem",
            fontFamily: "inherit",
          }}
        />
        <span
          id="recovery-hint"
          style={{ color: "#777", fontSize: "0.8rem", fontWeight: 400 }}
        >
          {RECOVERY_COPY.hint}
        </span>
      </label>

      {state.error ? (
        <p
          id="recovery-error"
          role="alert"
          style={{
            color: "#b00020",
            margin: 0,
            fontSize: "0.9rem",
            textAlign: "left",
          }}
        >
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        style={{
          padding: "0.85rem",
          fontSize: "1.05rem",
          fontWeight: 600,
          color: "#fff",
          background: pending ? "#888" : "#3b5bdb",
          border: "none",
          borderRadius: "0.5rem",
          cursor: pending ? "default" : "pointer",
        }}
      >
        {pending ? RECOVERY_COPY.pending : RECOVERY_COPY.button}
      </button>
    </form>
  );
}
