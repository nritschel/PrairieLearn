/** Configuration for capturing unsaved student work, passed to the client. */
export interface UnsavedWorkData {
  /** Where to POST the current answer state. */
  url: string;
  /**
   * A prefix CSRF token for the unsaved work routes. The question form's own
   * token is scoped to the question page URL, so it can't be used here.
   */
  csrfToken: string;
  intervalMs: number;
  maxBytes: number;
}

/** How often the current answer state is sent to the server while it's dirty. */
export const UNSAVED_WORK_INTERVAL_MS = 30_000;

/**
 * Snapshots above this size are skipped. Elements like `pl-file-upload` embed
 * file contents in the question form, which can be far larger than the typed
 * answers this feature is meant to protect.
 */
export const UNSAVED_WORK_MAX_BYTES = 1024 * 1024;
