import { decodeData } from '@prairielearn/browser-utils';

import type { UnsavedWorkData } from '../../../src/lib/client/unsaved-work.js';

import { getQuestionFormData } from './confirmOnUnload.js';

/**
 * Periodically sends the current answer state to the server so that it can be
 * recovered if the browser or the computer fails before the student saves. The
 * server keeps at most one draft per question, so each snapshot replaces the
 * previous one. Snapshots are not submissions and are never graded.
 */
export function captureUnsavedWork(form: HTMLFormElement): () => void {
  const { url, csrfToken, intervalMs, maxBytes } = decodeData<UnsavedWorkData>('unsaved-work-data');

  // The last state we sent successfully, so that an idle page doesn't send the
  // same snapshot over and over.
  let lastSentFormData: string | null = null;
  let stopped = false;

  const snapshot = ({ unloading }: { unloading: boolean }) => {
    if (stopped) return;

    const currentFormData = getQuestionFormData(form);

    // `originalFormData` is maintained by `confirmOnUnload`. If it still
    // matches, there are no unsaved changes worth capturing.
    if (currentFormData === form.dataset.originalFormData) return;
    if (currentFormData === lastSentFormData) return;

    const body = new URLSearchParams();
    new FormData(form).forEach((value, name) => {
      if (typeof value === 'string') body.append(name, value);
    });
    body.set('__csrf_token', csrfToken);
    if (body.toString().length > maxBytes) return;

    lastSentFormData = currentFormData;
    void fetch(url, { method: 'POST', body, keepalive: unloading }).then(
      (response) => {
        if (response.ok) return;

        // The student can no longer submit to this question, so there's nothing
        // left to recover into.
        if (response.status === 403) {
          stopCapturing();
          return;
        }

        lastSentFormData = null;
      },
      () => {
        lastSentFormData = null;
      },
    );
  };

  const intervalId = setInterval(() => snapshot({ unloading: false }), intervalMs);

  // A closing or crashing tab won't reach the next interval, so capture the
  // latest state as the page goes away. `keepalive` lets the request outlive it.
  const handleVisibilityChange = () => {
    if (document.visibilityState === 'hidden') snapshot({ unloading: true });
  };
  const handlePageHide = () => snapshot({ unloading: true });

  document.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('pagehide', handlePageHide);

  function stopCapturing() {
    stopped = true;
    clearInterval(intervalId);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    window.removeEventListener('pagehide', handlePageHide);
  }

  return stopCapturing;
}
