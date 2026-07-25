import type { SubmissionFieldErrors } from "@/lib/submit";

/**
 * Shared form state for the submit/edit server actions and the `SubmitForm`
 * client component. Kept out of the `"use server"` actions module, which may
 * only export async functions — a plain value/type export there breaks the
 * build.
 */
export interface SubmitFormState {
  /** A whole-form message (session not open, submissions closed). */
  error: string | null;
  /** Per-field required-field messages (#13, §7.1). */
  fieldErrors?: SubmissionFieldErrors;
}

export const INITIAL_SUBMIT_STATE: SubmitFormState = { error: null };
