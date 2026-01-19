CREATE TABLE IF NOT EXISTS books (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  author TEXT,
  format TEXT NOT NULL,
  canonicalFormat TEXT NOT NULL,
  dateAdded TEXT NOT NULL,
  filePathOriginal TEXT NOT NULL,
  filePathCanonical TEXT,
  coverPath TEXT,
  status TEXT NOT NULL,
  errorMessage TEXT
);

CREATE TABLE IF NOT EXISTS progress (
  bookId TEXT PRIMARY KEY,
  locationJson TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  FOREIGN KEY(bookId) REFERENCES books(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS books_title_idx ON books(title);
CREATE INDEX IF NOT EXISTS books_author_idx ON books(author);
