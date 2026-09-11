import { omit } from 'es-toolkit';
import { type Request, type Response } from 'express';

import { HttpStatusError } from '@prairielearn/error';

import {
  deleteVariantDraft,
  selectOptionalVariantDraft,
  upsertVariantDraft,
} from '../models/variant-draft.js';
import { selectAndAuthzVariant } from '../models/variant.js';

import { saveAndGradeSubmission, saveSubmission } from './grading.js';

interface ProcessSubmissionOptions {
  /** Whether the submission is associated with a student assessment instance.  */
  studentSubmission?: boolean;
  /** Whether this processing is happening on a public question preview route. */
  publicQuestionPreview?: boolean;
}

/**
 * Pulls the variant and the raw submitted answer out of a question form post.
 * The two question types transport the answer differently: Freeform questions
 * post one form field per element, while v2 questions post a single JSON blob.
 */
function extractSubmittedAnswer(
  req: Request,
  res: Response,
): { variant_id: string; submitted_answer: Record<string, any> } {
  if (res.locals.question.type === 'Freeform') {
    return {
      variant_id: req.body.__variant_id,
      submitted_answer: omit(req.body, ['__action', '__csrf_token', '__variant_id']),
    };
  }

  if (!req.body.postData) {
    throw new HttpStatusError(400, 'No postData');
  }
  let postData;
  try {
    postData = JSON.parse(req.body.postData);
  } catch {
    throw new HttpStatusError(400, 'JSON parse failed on body.postData');
  }
  return {
    variant_id: postData.variant ? postData.variant.id : null,
    submitted_answer: postData.submittedAnswer,
  };
}

function buildSubmission(
  { variant_id, submitted_answer }: { variant_id: string; submitted_answer: Record<string, any> },
  res: Response,
  options: ProcessSubmissionOptions,
) {
  return {
    variant_id,
    user_id: res.locals.user.id,
    auth_user_id: res.locals.authn_user.id,
    submitted_answer,
    ...(options.studentSubmission
      ? {
          credit: res.locals.authz_result.credit,
          mode: res.locals.authz_data.mode,
          client_fingerprint_id: res.locals.client_fingerprint_id,
        }
      : {}),
  };
}

async function authzVariantForSubmission(
  variant_id: string,
  res: Response,
  options: ProcessSubmissionOptions = {},
) {
  const variant = await selectAndAuthzVariant({
    unsafe_variant_id: variant_id,
    variant_course: res.locals.course,
    question_id: res.locals.question.id,
    course_instance_id: res.locals.course_instance?.id,
    instance_question_id: res.locals.instance_question?.id,
    authz_data: res.locals.authz_data,
    authn_user: res.locals.authn_user,
    user: res.locals.user,
    is_administrator: res.locals.is_administrator,
    publicQuestionPreview: options.publicQuestionPreview,
  });

  // This is also checked when we try to save a submission, but if that check
  // fails, it's reported as a 500. We report with a friendlier error message
  // and status code here, which will keep this error from contributing to 5XX
  // monitors.
  //
  // We have a decent chance of hitting this code path if an instructor
  // force-breaks variants, as we could be in a case where the variant wasn't
  // broken when the user loaded the page but it is broken when they submit.
  if (variant.broken_at) {
    throw new HttpStatusError(403, 'Cannot submit to a broken variant');
  }

  return variant;
}

export async function processSubmission(
  req: Request,
  res: Response,
  options: ProcessSubmissionOptions = {},
): Promise<string> {
  const submission = buildSubmission(extractSubmittedAnswer(req, res), res, options);
  const variant = await authzVariantForSubmission(submission.variant_id, res, options);

  if (req.body.__action === 'grade') {
    const ignoreGradeRateLimit = !options.studentSubmission;
    const ignoreRealTimeGradingDisabled = !options.studentSubmission;
    await saveAndGradeSubmission(
      submission,
      variant,
      res.locals.question,
      res.locals.course,
      ignoreGradeRateLimit,
      ignoreRealTimeGradingDisabled,
    );
    return submission.variant_id;
  } else if (req.body.__action === 'save') {
    await saveSubmission(submission, variant, res.locals.question, res.locals.course);
    return submission.variant_id;
  } else {
    throw new HttpStatusError(400, `unknown __action: ${req.body.__action}`);
  }
}

/**
 * Stores the current contents of the question form as a draft. Drafts are not
 * parsed or graded; they exist only so that work can be recovered if the
 * student's browser or computer fails before they save.
 */
export async function processDraftSave(req: Request, res: Response): Promise<void> {
  const { variant_id, submitted_answer } = extractSubmittedAnswer(req, res);
  const variant = await authzVariantForSubmission(variant_id, res);

  await upsertVariantDraft({
    variant_id: variant.id,
    raw_submitted_answer: submitted_answer,
    user_id: res.locals.user.id,
    auth_user_id: res.locals.authn_user.id,
  });
}

/**
 * Saves a previously stored draft as a real submission. This runs the same path
 * as a manual save, which is what turns the draft's raw form data back into a
 * canonical submitted answer.
 *
 * Returns the variant that was restored into, or `null` if the draft was
 * already gone (e.g. the student submitted the form in another tab).
 */
export async function processDraftRestore(req: Request, res: Response): Promise<string | null> {
  // The restore form only carries the variant, so read it from the body
  // directly rather than going through the answer extraction, which would
  // demand a `postData` payload for v2 questions.
  const variant = await authzVariantForSubmission(req.body.__variant_id, res);

  const draft = await selectOptionalVariantDraft({ variant_id: variant.id });
  if (draft == null) return null;

  const submission = buildSubmission(
    { variant_id: variant.id, submitted_answer: draft.raw_submitted_answer },
    res,
    { studentSubmission: true },
  );

  await saveSubmission(submission, variant, res.locals.question, res.locals.course);
  return variant.id;
}

/**
 * Discards a stored draft. The variant is authorized first so that a request
 * can't delete a draft belonging to someone else's variant.
 */
export async function processDraftDiscard(req: Request, res: Response): Promise<string> {
  const variant = await authzVariantForSubmission(req.body.__variant_id, res);

  await deleteVariantDraft({ variant_id: variant.id });
  return variant.id;
}
