CREATE TABLE sync_owners (
  owner_id TEXT PRIMARY KEY NOT NULL,
  issuer TEXT NOT NULL,
  subject TEXT NOT NULL,
  created_at INTEGER NOT NULL CHECK (created_at > 0),
  UNIQUE (issuer, subject)
) STRICT;

CREATE TABLE sync_maps (
  owner_id TEXT NOT NULL,
  map_id TEXT NOT NULL CHECK (length(CAST(map_id AS BLOB)) BETWEEN 1 AND 255),
  document_json TEXT NOT NULL CHECK (json_valid(document_json)),
  revision INTEGER NOT NULL CHECK (revision >= 1),
  updated_at INTEGER NOT NULL CHECK (updated_at > 0),
  deleted_at INTEGER CHECK (deleted_at IS NULL OR deleted_at > 0),
  PRIMARY KEY (owner_id, map_id),
  FOREIGN KEY (owner_id) REFERENCES sync_owners(owner_id) ON DELETE CASCADE,
  CHECK (length(CAST(document_json AS BLOB)) <= 1900000)
) STRICT;

CREATE INDEX sync_maps_owner_updated
  ON sync_maps(owner_id, updated_at DESC, map_id ASC);
