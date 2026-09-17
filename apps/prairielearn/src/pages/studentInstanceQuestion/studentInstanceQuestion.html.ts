import { EncodedData } from '@prairielearn/browser-utils';
import { formatDate } from '@prairielearn/formatter';
import { html, unsafeHtml } from '@prairielearn/html';
import { generatePrefixCsrfToken } from '@prairielearn/signed-token';

import {
  RegenerateInstanceAlert,
  RegenerateInstanceModal,
} from '../../components/AssessmentRegenerate.js';
import { AssessmentScorePanel } from '../../components/AssessmentScorePanel.js';
import {
  CalculatorDrawer,
  CalculatorDrawerHeadScripts,
  CalculatorDrawerToggle,
} from '../../components/CalculatorDrawer.js';
import { InstructorInfoPanel } from '../../components/InstructorInfoPanel.js';
import { PageLayout } from '../../components/PageLayout.js';
import { PersonalNotesPanel } from '../../components/PersonalNotesPanel.js';
import { QuestionContainer, QuestionTitle } from '../../components/QuestionContainer.js';
import { QuestionNavSideGroup } from '../../components/QuestionNavigation.js';
import { QuestionScorePanel } from '../../components/QuestionScore.js';
import { assetPath, compiledScriptTag, nodeModulesAssetPath } from '../../lib/assets.js';
import {
  UNSAVED_WORK_INTERVAL_MS,
  UNSAVED_WORK_MAX_BYTES,
  type UnsavedWorkData,
} from '../../lib/client/unsaved-work.js';
import { config } from '../../lib/config.js';
import { type CopyTarget } from '../../lib/copy-content.js';
import type { AssessmentTool, SubmissionDraft, User } from '../../lib/db-types.js';
import { getRoleNamesForUser } from '../../lib/groups.shared.js';
import type { ResLocalsInstanceQuestionRender } from '../../lib/question-render.types.js';
import type { ResLocalsForPage } from '../../lib/res-locals.js';

export function StudentInstanceQuestion({
  resLocals,
  renderState,
  userCanDeleteAssessmentInstance,
  assignedGrader,
  lastGrader,
  questionCopyTargets,
  enabledTools = [],
  unsavedWorkDraft = null,
  recordUnsavedWork = false,
}: {
  resLocals: ResLocalsForPage<'instance-question'>;
  renderState: ResLocalsInstanceQuestionRender | null;
  userCanDeleteAssessmentInstance: boolean;
  assignedGrader?: User | null;
  lastGrader?: User | null;
  questionCopyTargets?: CopyTarget[] | null;
  enabledTools?: AssessmentTool[];
  unsavedWorkDraft?: SubmissionDraft | null;
  recordUnsavedWork?: boolean;
}) {
  const questionContext =
    resLocals.assessment.type === 'Exam' ? 'student_exam' : 'student_homework';
  // TODO: support more tools
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  const hasCalculator = enabledTools.some((t) => t.tool === 'calculator');

  const unsavedWorkUrl = `${resLocals.urlPrefix}/instance_question/${resLocals.instance_question.id}/unsaved_work`;
  // Scoped to the unsaved work routes, which the question form's own CSRF token
  // doesn't cover.
  const unsavedWorkCsrfToken = generatePrefixCsrfToken(
    { url: unsavedWorkUrl, authn_user_id: resLocals.authn_user.id },
    config.secretKey,
  );

  return PageLayout({
    resLocals,
    pageTitle: '',
    navContext: {
      type: 'student',
      page: 'assessment_instance',
    },
    headContent: html`
      <meta
        name="mathjax-fonts-path"
        content="${nodeModulesAssetPath('@mathjax/mathjax-newcm-font')}"
      />
      ${compiledScriptTag('question.ts')} ${hasCalculator ? CalculatorDrawerHeadScripts() : ''}
      ${recordUnsavedWork
        ? EncodedData<UnsavedWorkData>(
            {
              url: unsavedWorkUrl,
              csrfToken: unsavedWorkCsrfToken,
              intervalMs: UNSAVED_WORK_INTERVAL_MS,
              maxBytes: UNSAVED_WORK_MAX_BYTES,
            },
            'unsaved-work-data',
          )
        : ''}
      ${resLocals.assessment.type === 'Exam'
        ? html`
            ${compiledScriptTag('examTimeLimitCountdown.ts')}
            ${EncodedData(
              {
                serverRemainingMS: resLocals.assessment_instance_remaining_ms,
                serverTimeLimitMS: resLocals.assessment_instance_time_limit_ms,
                serverUpdateURL: `${resLocals.urlPrefix}/assessment_instance/${resLocals.assessment_instance.id}/time_remaining`,
                canTriggerFinish: resLocals.authz_result.authorized_edit,
                showsTimeoutWarning: true,
                reloadOnFail: true,
                csrfToken: resLocals.__csrf_token,
              },
              'time-limit-data',
            )}
          `
        : ''}
      <script defer src="${nodeModulesAssetPath('mathjax/tex-svg.js')}"></script>
      <script>
        document.urlPrefix = '${resLocals.urlPrefix}';
      </script>
      ${renderState?.variant == null
        ? ''
        : html`
            ${resLocals.question.type !== 'Freeform'
              ? html`
                  <script src="${nodeModulesAssetPath('lodash/lodash.min.js')}"></script>
                  <script src="${assetPath('javascripts/require.js')}"></script>
                  <script src="${assetPath('localscripts/question.js')}"></script>
                  <script src="${assetPath('localscripts/questionCalculation.js')}"></script>
                `
              : ''}
            ${unsafeHtml(renderState.extraHeadersHtml)}
          `}
    `,
    preContent: html`
      ${userCanDeleteAssessmentInstance
        ? RegenerateInstanceModal({ csrfToken: resLocals.__csrf_token })
        : ''}
    `,
    postContent: hasCalculator
      ? CalculatorDrawer({
          storageKey: `calculator-${resLocals.assessment.uuid}-${resLocals.assessment_instance.id}`,
        })
      : '',
    content: html`
      ${userCanDeleteAssessmentInstance ? RegenerateInstanceAlert() : ''}
      <div class="row">
        <div class="col-lg-9 col-sm-12">
          ${resLocals.instance_question_info.question_access_mode === 'read_only_lockpoint'
            ? html`
                <div class="alert alert-warning">
                  This question is read-only because you advanced past a lockpoint. You can review
                  your previous submissions but cannot make new ones.
                </div>
              `
            : ''}
          ${unsavedWorkDraft != null && renderState?.variant != null
            ? UnsavedWorkAlert({
                draft: unsavedWorkDraft,
                variantId: renderState.variant.id,
                timezone: resLocals.course_instance.display_timezone,
                csrfToken: unsavedWorkCsrfToken,
                actionPrefix: unsavedWorkUrl,
              })
            : ''}
          ${renderState?.variant == null
            ? html`
                <div class="card mb-4">
                  <div class="card-header bg-primary text-white">
                    <h1>
                      ${QuestionTitle({
                        questionContext,
                        question: resLocals.question,
                        questionNumber: resLocals.instance_question_info.question_number,
                        showQuestionTitles: !!resLocals.assessment.show_question_titles,
                      })}
                    </h1>
                  </div>
                  <div class="card-body">
                    This question was not viewed while the assessment was open, so no variant was
                    created.
                  </div>
                </div>
              `
            : QuestionContainer({
                resLocals,
                questionContext,
                questionCopyTargets,
                showFooter: resLocals.assessment_instance.open ?? false,
              })}
        </div>

        <div class="col-lg-3 col-sm-12">
          ${resLocals.assessment.type === 'Exam'
            ? html`
                <div class="card mb-4">
                  <div class="card-header bg-secondary">
                    <h2>
                      <a
                        class="text-white"
                        href="${resLocals.urlPrefix}/assessment_instance/${resLocals
                          .assessment_instance.id}/"
                      >
                        ${resLocals.assessment_set.name} ${resLocals.assessment.number}
                      </a>
                    </h2>
                  </div>

                  <div class="card-body">
                    <div class="d-flex justify-content-center">
                      <a
                        class="btn btn-info"
                        href="${resLocals.urlPrefix}/assessment_instance/${resLocals
                          .assessment_instance.id}/"
                      >
                        Assessment overview
                      </a>
                    </div>

                    ${resLocals.assessment_instance.open &&
                    resLocals.assessment_instance_remaining_ms != null
                      ? html`
                          <div class="mt-3">
                            <div id="countdownProgress"></div>
                            <p class="mb-0">Time remaining: <span id="countdownDisplay"></span></p>
                          </div>
                        `
                      : ''}
                  </div>
                </div>
              `
            : AssessmentScorePanel({
                urlPrefix: resLocals.urlPrefix,
                assessment: resLocals.assessment,
                assessment_set: resLocals.assessment_set,
                assessment_instance: resLocals.assessment_instance,
              })}
          ${QuestionScorePanel({
            instance_question: resLocals.instance_question,
            assessment: resLocals.assessment,
            assessment_question: resLocals.assessment_question,
            question: resLocals.question,
            assessment_instance: resLocals.assessment_instance,
            instance_question_info: resLocals.instance_question_info,
            variant: renderState?.variant ?? undefined,
            authz_result: resLocals.authz_result,
            csrfToken: resLocals.__csrf_token,
            allowGradeLeftMs: renderState?.allowGradeLeftMs ?? 0,
          })}
          ${QuestionNavSideGroup({
            urlPrefix: resLocals.urlPrefix,
            prevInstanceQuestionId: resLocals.instance_question_info.prev_instance_question.id,
            nextInstanceQuestionId: resLocals.instance_question_info.next_instance_question.id,
            nextQuestionAccessMode:
              resLocals.instance_question_info.next_instance_question.question_access_mode,
            prevGroupRolePermissions: resLocals.prev_instance_question_role_permissions,
            nextGroupRolePermissions: resLocals.next_instance_question_role_permissions,
            advanceScorePerc: resLocals.instance_question_info.advance_score_perc,
            userGroupRoles: resLocals.group_info
              ? getRoleNamesForUser(resLocals.group_info, resLocals.user).join(', ')
              : null,
          })}
          ${resLocals.assessment.allow_personal_notes
            ? PersonalNotesPanel({
                fileList: resLocals.file_list,
                context: 'question',
                courseInstanceId: resLocals.course_instance.id,
                assessment_instance: resLocals.assessment_instance,
                authz_result: resLocals.authz_result,
                variantId: renderState?.variant.id,
                csrfToken: resLocals.__csrf_token,
                lockdownBrowser: resLocals.lockdown_browser,
              })
            : ''}
          ${hasCalculator ? CalculatorDrawerToggle() : ''}
          ${InstructorInfoPanel({
            course: resLocals.course,
            course_instance: resLocals.course_instance,
            assessment: resLocals.assessment,
            assessment_instance: resLocals.assessment_instance,
            instance_question: resLocals.instance_question,
            assignedGrader,
            lastGrader,
            question: resLocals.question,
            variant: renderState?.variant ?? undefined,
            instance_group: resLocals.instance_group,
            instance_group_uid_list: resLocals.instance_group_uid_list,
            instance_user: resLocals.instance_user,
            authz_data: resLocals.authz_data,
            question_is_shared: renderState?.question_is_shared ?? false,
            questionContext:
              resLocals.assessment.type === 'Exam' ? 'student_exam' : 'student_homework',
            csrfToken: resLocals.__csrf_token,
          })}
        </div>
      </div>
    `,
  });
}

function UnsavedWorkAlert({
  draft,
  variantId,
  timezone,
  csrfToken,
  actionPrefix,
}: {
  draft: SubmissionDraft;
  variantId: string;
  timezone: string;
  csrfToken: string;
  actionPrefix: string;
}) {
  return html`
    <div class="alert alert-warning" role="alert">
      <h2 class="h5">We found unsaved work for this question</h2>
      <p>
        You had work in progress at ${formatDate(draft.modified_at, timezone)} that was never saved,
        so it isn't part of your submissions. Restoring it saves it as your latest answer without
        grading it. Your last saved answer is shown below until you choose.
      </p>
      <div class="d-flex flex-wrap gap-2">
        <form method="POST" action="${actionPrefix}/restore">
          <input type="hidden" name="__csrf_token" value="${csrfToken}" />
          <input type="hidden" name="__variant_id" value="${variantId}" />
          <button type="submit" class="btn btn-primary">Restore unsaved work</button>
        </form>
        <form method="POST" action="${actionPrefix}/dismiss">
          <input type="hidden" name="__csrf_token" value="${csrfToken}" />
          <input type="hidden" name="__variant_id" value="${variantId}" />
          <button type="submit" class="btn btn-outline-secondary">Keep last saved answer</button>
        </form>
      </div>
    </div>
  `;
}
