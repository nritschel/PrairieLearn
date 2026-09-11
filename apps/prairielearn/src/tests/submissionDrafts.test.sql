-- BLOCK select_drafts_for_variant
SELECT
  sd.*
FROM
  submission_drafts AS sd
WHERE
  sd.variant_id = $variant_id;

-- BLOCK select_submissions_for_variant
SELECT
  s.*
FROM
  submissions AS s
WHERE
  s.variant_id = $variant_id
ORDER BY
  s.date DESC;
