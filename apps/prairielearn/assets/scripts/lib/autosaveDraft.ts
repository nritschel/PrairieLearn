import { getQuestionFormData } from './confirmOnUnload.js';

/** How long to wait after the student stops editing before saving a draft. */
const IDLE_DELAY_MS = 3_000;

/**
 * The longest an edit may go unsaved while the student keeps working. Without
 * this, continuous typing would keep pushing the idle timer back and nothing
 * would ever be saved.
 */
const MAX_DELAY_MS = 30_000;

type Status = 'saving' | 'saved' | 'error';

/**
 * Attaches the status element next to the save/grade buttons, falling back to
 * the end of the footer. The footer is replaced wholesale when real-time
 * grading results arrive, so this is called again whenever the element has
 * been detached.
 */
function attachStatusElement(form: HTMLFormElement, element: HTMLElement): void {
  const buttonGroup = form
    .querySelector<HTMLButtonElement>('button.question-save, button.question-grade')
    ?.closest('span');
  (buttonGroup ?? form.querySelector('#question-panel-footer-content'))?.append(element);
}

function buildDraftBody(form: HTMLFormElement): string {
  const params = new URLSearchParams();
  for (const [key, value] of new FormData(form)) {
    // File inputs can't be represented in a urlencoded body. Elements that
    // handle files keep their state in hidden text inputs, so nothing that
    // belongs to the answer is dropped here.
    if (typeof value !== 'string') continue;
    params.append(key, value);
  }
  params.set('__action', 'save_draft');
  return params.toString();
}

/**
 * Periodically saves the contents of a question form as a draft, so that work
 * can be recovered if the student's browser or computer fails before they save.
 *
 * Drafts are stored server-side: a student whose machine dies in a testing
 * center may be moved to a different workstation, so anything kept only in this
 * browser would be lost.
 */
export function autosaveDraft(form: HTMLFormElement): () => void {
  const abortController = new AbortController();
  const { signal } = abortController;

  const statusElement = document.createElement('span');
  statusElement.className = 'js-autosave-status small text-secondary ms-2';
  statusElement.setAttribute('aria-live', 'polite');
  attachStatusElement(form, statusElement);

  let lastSavedFormData = getQuestionFormData(form);
  let saving = false;
  let changedWhileSaving = false;
  let idleTimeout: ReturnType<typeof setTimeout> | undefined;
  let maxTimeout: ReturnType<typeof setTimeout> | undefined;

  function setStatus(status: Status) {
    if (!statusElement.isConnected) attachStatusElement(form, statusElement);

    if (status === 'saving') {
      statusElement.textContent = 'Saving…';
      statusElement.classList.remove('text-danger');
    } else if (status === 'saved') {
      const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      statusElement.textContent = `Answer autosaved at ${time}`;
      statusElement.classList.remove('text-danger');
    } else {
      statusElement.textContent = "Couldn't autosave — use Save to keep your work";
      statusElement.classList.add('text-danger');
    }
  }

  function clearTimers() {
    if (idleTimeout !== undefined) clearTimeout(idleTimeout);
    if (maxTimeout !== undefined) clearTimeout(maxTimeout);
    idleTimeout = undefined;
    maxTimeout = undefined;
  }

  async function save() {
    clearTimers();

    if (saving) {
      changedWhileSaving = true;
      return;
    }

    const formData = getQuestionFormData(form);
    if (formData === lastSavedFormData) return;

    saving = true;
    setStatus('saving');
    try {
      const response = await fetch(window.location.href, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: buildDraftBody(form),
        signal,
      });
      if (!response.ok) throw new Error(`Autosave failed with status ${response.status}`);
      lastSavedFormData = formData;
      setStatus('saved');
    } catch (err) {
      if (signal.aborted) return;
      console.error(err);
      setStatus('error');
    } finally {
      saving = false;
      if (changedWhileSaving) {
        changedWhileSaving = false;
        scheduleSave();
      }
    }
  }

  function scheduleSave() {
    if (idleTimeout !== undefined) clearTimeout(idleTimeout);
    idleTimeout = setTimeout(() => void save(), IDLE_DELAY_MS);
    maxTimeout ??= setTimeout(() => void save(), MAX_DELAY_MS);
  }

  /**
   * Saves without waiting for a response, for use while the page is going away.
   * `fetch` is cancelled on unload, so a beacon is the only reliable option.
   */
  function flush() {
    clearTimers();
    const formData = getQuestionFormData(form);
    if (formData === lastSavedFormData) return;
    const queued = navigator.sendBeacon(
      window.location.href,
      new Blob([buildDraftBody(form)], { type: 'application/x-www-form-urlencoded' }),
    );
    // `visibilitychange` fires on every tab switch, so record what we sent to
    // avoid re-sending an unchanged answer. If the beacon wasn't even queued,
    // leave the state dirty so the next attempt retries.
    if (queued) lastSavedFormData = formData;
  }

  form.addEventListener('input', scheduleSave, { signal });
  form.addEventListener('change', scheduleSave, { signal });

  // A real submit supersedes the draft, and the server deletes it when the
  // submission is inserted. Stop autosaving so we can't write a new draft
  // after that.
  form.addEventListener('submit', () => abortController.abort(), { signal });

  // `pagehide` covers navigation and tab close; `visibilitychange` covers the
  // cases where a mobile browser never fires `pagehide` at all.
  window.addEventListener('pagehide', flush, { signal });
  document.addEventListener(
    'visibilitychange',
    () => {
      if (document.visibilityState === 'hidden') flush();
    },
    { signal },
  );

  return () => abortController.abort();
}
