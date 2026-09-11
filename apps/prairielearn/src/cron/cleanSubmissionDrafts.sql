-- BLOCK clean_submission_drafts
DELETE FROM submission_drafts
WHERE
  modified_at < now() - make_interval(secs => $retention_period_sec);
