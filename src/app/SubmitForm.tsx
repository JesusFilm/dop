"use client";

import { useActionState, useRef, useState } from "react";

import {
  FIELD_MAX_LENGTHS,
  STARTER_CHIPS,
  submissionsCloseLine,
  SUBMIT_COPY,
  type SubmissionFieldErrors,
} from "@/lib/submit";

import { INITIAL_SUBMIT_STATE, type SubmitFormState } from "./submit-state";

type SubmitFormAction = (
  state: SubmitFormState,
  formData: FormData,
) => Promise<SubmitFormState>;

export interface SubmitFormDefaults {
  firstName: string;
  lastName: string;
  request: string;
}

const fieldStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.35rem",
  fontSize: "0.95rem",
  fontWeight: 600,
};

const inputStyle: React.CSSProperties = {
  padding: "0.6rem",
  fontSize: "1rem",
  fontWeight: 400,
  border: "1px solid #ccc",
  borderRadius: "0.5rem",
  fontFamily: "inherit",
};

const errorStyle: React.CSSProperties = {
  color: "#b00020",
  margin: 0,
  fontSize: "0.85rem",
  fontWeight: 400,
};

function FieldError({ message }: { message?: string }) {
  return message ? (
    <span role="alert" style={errorStyle}>
      {message}
    </span>
  ) : null;
}

/**
 * The participant submit screen (§7.1, #7, #13) and the pre-reveal edit view
 * (§6). One component in two modes: `create` shows the warm intro, the optional
 * starter chips, and the consent line; `edit` re-renders the same fields
 * pre-filled from a returning participant's entry (name/request editable). Two
 * separate required name fields (#13); the request is required. Copy is locked
 * in {@link SUBMIT_COPY}. Server-side validation is authoritative — the
 * `required` attributes here are only a convenience.
 */
export function SubmitForm({
  action,
  mode = "create",
  defaults,
  revealLabel,
}: {
  action: SubmitFormAction;
  mode?: "create" | "edit";
  defaults?: SubmitFormDefaults;
  /** The organizer-set reveal time, formatted for the close-time fine print. */
  revealLabel: string;
}) {
  const [state, formAction, pending] = useActionState(
    action,
    INITIAL_SUBMIT_STATE,
  );
  const fieldErrors: SubmissionFieldErrors = state.fieldErrors ?? {};

  const [request, setRequest] = useState(defaults?.request ?? "");
  const requestRef = useRef<HTMLTextAreaElement>(null);

  function applyStarter(starter: string) {
    setRequest(starter);
    // Move focus to the end of the prefilled starter so typing continues it.
    requestRef.current?.focus();
    requestRef.current?.setSelectionRange(starter.length, starter.length);
  }

  return (
    <form
      action={formAction}
      style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}
    >
      <div style={{ display: "flex", gap: "0.75rem" }}>
        <label style={{ ...fieldStyle, flex: 1 }}>
          {SUBMIT_COPY.firstNameLabel}
          <input
            type="text"
            name="firstName"
            required
            maxLength={FIELD_MAX_LENGTHS.name}
            autoComplete="given-name"
            defaultValue={defaults?.firstName ?? ""}
            style={inputStyle}
          />
          <FieldError message={fieldErrors.firstName} />
        </label>

        <label style={{ ...fieldStyle, flex: 1 }}>
          {SUBMIT_COPY.lastNameLabel}
          <input
            type="text"
            name="lastName"
            required
            maxLength={FIELD_MAX_LENGTHS.name}
            autoComplete="family-name"
            defaultValue={defaults?.lastName ?? ""}
            style={inputStyle}
          />
          <FieldError message={fieldErrors.lastName} />
        </label>
      </div>

      {mode === "create" ? (
        <div
          style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}
        >
          <span style={{ fontSize: "0.9rem", color: "#555" }}>
            {SUBMIT_COPY.chipsPrompt}
          </span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
            {STARTER_CHIPS.map((chip) => (
              <button
                key={chip.label}
                type="button"
                onClick={() => applyStarter(chip.starter)}
                style={{
                  padding: "0.4rem 0.75rem",
                  fontSize: "0.9rem",
                  border: "1px solid #c9d2f0",
                  borderRadius: "999px",
                  background: "#f3f6ff",
                  color: "#2d3a7b",
                  cursor: "pointer",
                }}
              >
                {chip.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <label style={fieldStyle}>
        {SUBMIT_COPY.requestLabel}
        <textarea
          ref={requestRef}
          name="request"
          required
          maxLength={FIELD_MAX_LENGTHS.request}
          rows={5}
          placeholder={SUBMIT_COPY.requestPlaceholder}
          value={request}
          onChange={(event) => setRequest(event.target.value)}
          style={{ ...inputStyle, resize: "vertical" }}
        />
        <FieldError message={fieldErrors.request} />
      </label>

      <p style={{ color: "#555", fontSize: "0.85rem", margin: 0 }}>
        {SUBMIT_COPY.consent}
      </p>

      {state.error ? (
        <p role="alert" style={{ ...errorStyle, fontSize: "0.95rem" }}>
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
        {pending
          ? "Saving…"
          : mode === "edit"
            ? "Save changes"
            : SUBMIT_COPY.button}
      </button>

      <p
        style={{
          color: "#888",
          fontSize: "0.8rem",
          margin: 0,
          textAlign: "center",
        }}
      >
        {submissionsCloseLine(revealLabel)}
      </p>
    </form>
  );
}
