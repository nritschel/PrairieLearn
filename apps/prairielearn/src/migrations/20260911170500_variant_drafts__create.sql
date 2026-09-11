CREATE TABLE variant_drafts (
  variant_id bigint PRIMARY KEY,
  raw_submitted_answer jsonb NOT NULL,
  user_id bigint,
  auth_user_id bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  modified_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT variant_drafts_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES variants (id) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT variant_drafts_user_id_fkey FOREIGN KEY (user_id) REFERENCES users (id) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT variant_drafts_auth_user_id_fkey FOREIGN KEY (auth_user_id) REFERENCES users (id) ON UPDATE CASCADE ON DELETE CASCADE
);
