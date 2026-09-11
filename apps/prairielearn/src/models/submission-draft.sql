-- BLOCK upsert_submission_draft
INSERT INTO
  submission_drafts (variant_id, user_id, submitted_answer)
VALUES
  ($variant_id, $user_id, $submitted_answer)
ON CONFLICT (variant_id, user_id) DO UPDATE
SET
  submitted_answer = EXCLUDED.submitted_answer,
  modified_at = CURRENT_TIMESTAMP,
  dismissed_at = NULL;

-- BLOCK select_submission_draft
SELECT
  sd.*
FROM
  submission_drafts AS sd
WHERE
  sd.variant_id = $variant_id
  AND sd.user_id = $user_id;

-- BLOCK select_recoverable_submission_draft
SELECT
  sd.*
FROM
  submission_drafts AS sd
WHERE
  sd.variant_id = $variant_id
  AND sd.user_id = $user_id
  AND sd.dismissed_at IS NULL
  AND sd.modified_at > COALESCE(
    (
      SELECT
        max(s.date)
      FROM
        submissions AS s
      WHERE
        s.variant_id = $variant_id
    ),
    '-infinity'::timestamptz
  );

-- BLOCK dismiss_submission_draft
UPDATE submission_drafts
SET
  dismissed_at = CURRENT_TIMESTAMP
WHERE
  variant_id = $variant_id
  AND user_id = $user_id;

-- BLOCK delete_submission_draft
DELETE FROM submission_drafts
WHERE
  variant_id = $variant_id
  AND user_id = $user_id;
