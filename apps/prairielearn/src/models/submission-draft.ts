import { execute, loadSqlEquiv, queryOptionalRow } from '@prairielearn/postgres';

import { type SubmissionDraft, SubmissionDraftSchema } from '../lib/db-types.js';

const sql = loadSqlEquiv(import.meta.url);

/**
 * Stores the current unsaved answer state for a variant, replacing any draft
 * that was previously stored. Only the latest draft is kept; drafts are not
 * submissions and are never graded.
 */
export async function upsertSubmissionDraft({
  variant_id,
  user_id,
  submitted_answer,
}: {
  variant_id: string;
  user_id: string;
  submitted_answer: Record<string, any>;
}): Promise<void> {
  await execute(sql.upsert_submission_draft, { variant_id, user_id, submitted_answer });
}

export async function selectOptionalSubmissionDraft({
  variant_id,
  user_id,
}: {
  variant_id: string;
  user_id: string;
}): Promise<SubmissionDraft | null> {
  return await queryOptionalRow(
    sql.select_submission_draft,
    { variant_id, user_id },
    SubmissionDraftSchema,
  );
}

/**
 * Selects the draft for a variant only if it should be offered to the student:
 * it must not have been dismissed, and it must be newer than the most recent
 * submission to the variant. A draft that is older than the latest submission
 * has already been superseded by saved work.
 */
export async function selectOptionalRecoverableSubmissionDraft({
  variant_id,
  user_id,
}: {
  variant_id: string;
  user_id: string;
}): Promise<SubmissionDraft | null> {
  return await queryOptionalRow(
    sql.select_recoverable_submission_draft,
    { variant_id, user_id },
    SubmissionDraftSchema,
  );
}

export async function dismissSubmissionDraft({
  variant_id,
  user_id,
}: {
  variant_id: string;
  user_id: string;
}): Promise<void> {
  await execute(sql.dismiss_submission_draft, { variant_id, user_id });
}

export async function deleteSubmissionDraft({
  variant_id,
  user_id,
}: {
  variant_id: string;
  user_id: string;
}): Promise<void> {
  await execute(sql.delete_submission_draft, { variant_id, user_id });
}
