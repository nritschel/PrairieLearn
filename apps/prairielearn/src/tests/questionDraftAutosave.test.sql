-- BLOCK select_variant_drafts
SELECT
  *
FROM
  variant_drafts
ORDER BY
  variant_id;

-- BLOCK select_submissions
SELECT
  *
FROM
  submissions
WHERE
  variant_id = $variant_id
ORDER BY
  date DESC,
  id DESC;

-- BLOCK make_draft_stale
UPDATE variant_drafts
SET
  modified_at = (
    SELECT
      min(s.date) - interval '1 minute'
    FROM
      submissions AS s
    WHERE
      s.variant_id = variant_drafts.variant_id
  )
WHERE
  variant_id = $variant_id;
