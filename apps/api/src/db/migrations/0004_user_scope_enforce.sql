CREATE TABLE books_new (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  author TEXT,
  format TEXT NOT NULL,
  canonicalFormat TEXT NOT NULL,
  dateAdded TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  filePathOriginal TEXT NOT NULL,
  filePathCanonical TEXT,
  coverPath TEXT,
  status TEXT NOT NULL,
  errorMessage TEXT
);

WITH default_owner AS (
  SELECT id FROM (
    SELECT id, created_at, 0 as is_fallback
    FROM users
    WHERE is_admin = 1
    UNION ALL
    SELECT id, created_at, 1 as is_fallback
    FROM users
  )
  ORDER BY is_fallback, created_at
  LIMIT 1
)
INSERT INTO books_new (
  id,
  user_id,
  title,
  author,
  format,
  canonicalFormat,
  dateAdded,
  updated_at,
  filePathOriginal,
  filePathCanonical,
  coverPath,
  status,
  errorMessage
)
SELECT
  id,
  COALESCE(user_id, (SELECT id FROM default_owner)),
  title,
  author,
  format,
  canonicalFormat,
  dateAdded,
  COALESCE(updated_at, dateAdded),
  filePathOriginal,
  filePathCanonical,
  coverPath,
  status,
  errorMessage
FROM books;

DROP TABLE books;
ALTER TABLE books_new RENAME TO books;

CREATE INDEX IF NOT EXISTS books_title_idx ON books(title);
CREATE INDEX IF NOT EXISTS books_author_idx ON books(author);
CREATE INDEX IF NOT EXISTS books_user_updated_idx ON books(user_id, updated_at);

CREATE TABLE progress_new (
  user_id TEXT NOT NULL,
  bookId TEXT NOT NULL,
  locationJson TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  PRIMARY KEY (user_id, bookId),
  FOREIGN KEY(bookId) REFERENCES books(id) ON DELETE CASCADE
);

WITH default_owner AS (
  SELECT id FROM (
    SELECT id, created_at, 0 as is_fallback
    FROM users
    WHERE is_admin = 1
    UNION ALL
    SELECT id, created_at, 1 as is_fallback
    FROM users
  )
  ORDER BY is_fallback, created_at
  LIMIT 1
)
INSERT INTO progress_new (user_id, bookId, locationJson, updatedAt)
SELECT
  COALESCE(user_id, (SELECT id FROM default_owner)),
  bookId,
  locationJson,
  updatedAt
FROM progress;

DROP TABLE progress;
ALTER TABLE progress_new RENAME TO progress;

CREATE INDEX IF NOT EXISTS progress_user_updated_idx ON progress(user_id, updatedAt);
