import fs from "node:fs";
import Database from "better-sqlite3";
import { dataPaths } from "./paths";
import { runMigrations } from "./db/migrations";

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
runMigrations(db);

