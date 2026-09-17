-- BLOCK upsert_variant_draft
INSERT INTO
  variant_drafts (
    variant_id,
    raw_submitted_answer,
    user_id,
    auth_user_id
  )
VALUES
  (
    $variant_id,
    $raw_submitted_answer,
    $user_id,
    $auth_user_id
  )
ON CONFLICT (variant_id) DO UPDATE
SET
  raw_submitted_answer = EXCLUDED.raw_submitted_answer,
  user_id = EXCLUDED.user_id,
  auth_user_id = EXCLUDED.auth_user_id,
  modified_at = now();

-- BLOCK select_variant_draft
SELECT
  *
FROM
  variant_drafts
WHERE
  variant_id = $variant_id;

-- BLOCK delete_variant_draft
DELETE FROM variant_drafts
WHERE
  variant_id = $variant_id;
