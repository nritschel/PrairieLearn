import { execute, loadSqlEquiv, queryOptionalRow } from '@prairielearn/postgres';

import { type VariantDraft, VariantDraftSchema } from '../lib/db-types.js';

const sql = loadSqlEquiv(import.meta.url);

/**
 * Stores the in-progress answer for a variant, replacing any existing draft.
 *
 * Drafts hold only the raw form data that the browser submitted; they are never
 * parsed or graded. A draft is deleted as soon as a real submission is inserted
 * for the variant.
 */
export async function upsertVariantDraft({
  variant_id,
  raw_submitted_answer,
  user_id,
  auth_user_id,
}: {
  variant_id: string;
  raw_submitted_answer: Record<string, any>;
  user_id: string | null;
  auth_user_id: string;
}): Promise<void> {
  await execute(sql.upsert_variant_draft, {
    variant_id,
    raw_submitted_answer,
    user_id,
    auth_user_id,
  });
}

export async function selectOptionalVariantDraft({
  variant_id,
}: {
  variant_id: string;
}): Promise<VariantDraft | null> {
  return await queryOptionalRow(sql.select_variant_draft, { variant_id }, VariantDraftSchema);
}

export async function deleteVariantDraft({ variant_id }: { variant_id: string }): Promise<void> {
  await execute(sql.delete_variant_draft, { variant_id });
}
