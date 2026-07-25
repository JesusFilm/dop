/**
 * Shared form state for the recovery-code server action and the `RecoveryForm`
 * client component (§7.4). Kept out of the `"use server"` actions module, which
 * may only export async functions — a plain value/type export there breaks the
 * build (the same split as `submit-state.ts`).
 */
export interface RecoveryFormState {
  /** A whole-form message: bad code, unknown code, or session not open. */
  error: string | null;
}

export const INITIAL_RECOVERY_STATE: RecoveryFormState = { error: null };
