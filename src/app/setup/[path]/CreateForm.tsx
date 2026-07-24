"use client";

import { useActionState } from "react";

import { createSessionAction, type CreateSessionState } from "./actions";

const INITIAL_STATE: CreateSessionState = { error: null };

const fieldStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.35rem",
  fontSize: "0.95rem",
};

const inputStyle: React.CSSProperties = {
  padding: "0.6rem",
  fontSize: "1rem",
  border: "1px solid #ccc",
  borderRadius: "0.5rem",
};

/**
 * The create-once form (§7.5): event date + open time + reveal time, all
 * interpreted in Pacific/Auckland (close = reveal). Defaults are Monday's
 * configured values (#14) but every field is editable. Submitting runs the
 * server action, which creates the one session and redirects to the read-only
 * view. Shown only on first visit — never re-rendered after creation.
 */
export function CreateForm({ path }: { path: string }) {
  const boundAction = createSessionAction.bind(null, path);
  const [state, formAction, pending] = useActionState(
    boundAction,
    INITIAL_STATE,
  );

  return (
    <form
      action={formAction}
      style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
    >
      <p style={{ color: "#555", margin: 0 }}>
        Set the event date and times. Times are in{" "}
        <strong>Pacific/Auckland</strong>; submissions close at the reveal time.
      </p>

      <label style={fieldStyle}>
        Event date
        <input
          type="date"
          name="date"
          required
          defaultValue="2026-07-27"
          style={inputStyle}
        />
      </label>

      <label style={fieldStyle}>
        Open time
        <input
          type="time"
          name="openTime"
          required
          defaultValue="09:00"
          style={inputStyle}
        />
      </label>

      <label style={fieldStyle}>
        Reveal time (submissions close)
        <input
          type="time"
          name="revealTime"
          required
          defaultValue="11:00"
          style={inputStyle}
        />
      </label>

      {state.error ? (
        <p role="alert" style={{ color: "#b00020", margin: 0 }}>
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        style={{
          padding: "0.75rem",
          fontSize: "1rem",
          fontWeight: 600,
          color: "#fff",
          background: pending ? "#888" : "#3b5bdb",
          border: "none",
          borderRadius: "0.5rem",
          cursor: pending ? "default" : "pointer",
        }}
      >
        {pending ? "Creating…" : "Create session & generate QR"}
      </button>
    </form>
  );
}
