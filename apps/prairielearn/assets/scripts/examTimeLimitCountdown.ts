import { Toast } from 'bootstrap';

import { onDocumentReady, decodeData, parseHTMLElement } from '@prairielearn/browser-utils';
import { html } from '@prairielearn/html';

import { saveQuestionFormData } from './lib/confirmOnUnload.js';
import { setupCountdown } from './lib/countdown.js';

onDocumentReady(() => {
  const timeLimitData = decodeData<{
    serverRemainingMS: number;
    serverTimeLimitMS: number;
    serverUpdateURL: string;
    canTriggerFinish: boolean;
    showsTimeoutWarning: boolean;
    csrfToken: string;
  }>('time-limit-data');
  setupCountdown({
    displaySelector: '#countdownDisplay',
    progressSelector: '#countdownProgress',
    initialServerRemainingMS: timeLimitData.serverRemainingMS,
    initialServerTimeLimitMS: timeLimitData.serverTimeLimitMS,
    serverUpdateURL: timeLimitData.serverUpdateURL,
    onTimerOut: () => {
      const countdown = document.querySelector('#countdownDisplay');
      if (countdown) countdown.innerHTML = 'expired';
      // if viewing exam as a different effective user, do not trigger time limit finish
      if (timeLimitData.canTriggerFinish) {
        // do not trigger unsaved warning dialog
        saveQuestionFormData(document.querySelector('form.question-form'));
        const form = parseHTMLElement<HTMLFormElement>(
          document,
          html`<form method="POST">
            <input type="hidden" name="__action" value="timeLimitFinish" />
            <input type="hidden" name="__csrf_token" value="${timeLimitData.csrfToken}" />
          </form>`,
        );
        document.body.append(form);
        form.submit();
      }
    },
    onRemainingTime: {
      60000: () => {
        if (timeLimitData.showsTimeoutWarning) {
          const popup = parseHTMLElement<HTMLDivElement>(
            document,
            html`<div class="position-relative d-flex flex-column align-items-center mt-5">
              <div
                id="time-warning-toast"
                class="toast align-items-center text-bg-warning border-0 jiggle"
                role="alert"
                aria-live="assertive"
                aria-atomic="true"
              >
                <div class="d-flex">
                  <div class="toast-body">
                    Your exam is ending soon. Please finish and submit your work.
                  </div>
                  <button
                    type="button"
                    class="btn-close me-2 m-auto"
                    data-bs-dismiss="toast"
                    aria-label="Close"
                  ></button>
                </div>
              </div>
            </div>`,
          );
          document.body.append(popup);
          popup.querySelectorAll('.toast').forEach((e) => {
            new Toast(e, { autohide: false }).show();
          });
        }
      },
    },
    onServerUpdateFail: () => {
      // On time limit fail, reload the page
      window.location.reload();
    },
    getBackgroundColor: (remainingSec) => {
      if (remainingSec >= 180) {
        return 'bg-primary';
      } else if (remainingSec >= 60) {
        return 'bg-warning';
      } else {
        return 'bg-danger';
      }
    },
  });
});
