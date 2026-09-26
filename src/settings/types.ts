import type { Settings } from '$lib/settings';

export interface UpdateOptions {
  /** The caller shows the error itself (e.g. next to the hotkey field) instead of a toast. */
  inlineError?: boolean;
}

/** Optimistically apply a settings patch; resolves to an error message, or null on success. */
export type UpdateFn = (patch: Partial<Settings>, options?: UpdateOptions) => Promise<string | null>;
