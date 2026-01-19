import fs from "node:fs";
import Database from "better-sqlite3";
import { dataPaths } from "./paths";

export type SortKey = "dateAdded" | "title" | "author";

export interface DbBook {
  id: string;
  title: string;
  author: string | null;
  format: string;
  canonicalFormat: string;
  dateAdded: string;
  filePathOriginal: string;
  filePathCanonical: string | null;
  coverPath: string | null;
  status: string;
  errorMessage: string | null;
}

export interface DbProgress {
  bookId: string;
  locationJson: string;
  updatedAt: string;
}

fs.mkdirSync(dataPaths.root, { recursive: true });
export const db = new Database(dataPaths.dbFile);

db.pragma("journal_mode = WAL");

db.exec(`
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
`);


export function setProgress(bookId: string, locationJson: string, updatedAt: string) {
  const stmt = db.prepare(`
    INSERT INTO progress (bookId, locationJson, updatedAt)
    VALUES (@bookId, @locationJson, @updatedAt)
    ON CONFLICT(bookId) DO UPDATE SET
      locationJson = excluded.locationJson,
      updatedAt = excluded.updatedAt
  `);
  stmt.run({ bookId, locationJson, updatedAt });
}

export function getProgress(bookId: string): DbProgress | undefined {
  const stmt = db.prepare("SELECT * FROM progress WHERE bookId = ?");
  return stmt.get(bookId) as DbProgress | undefined;
}
