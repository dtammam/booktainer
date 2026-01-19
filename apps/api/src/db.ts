import fs from "node:fs";
import Database from "better-sqlite3";
import { dataPaths } from "./paths";
export type SortKey = "dateAdded" | "title" | "author";

export interface DbBook {
  id: string;
  user_id: string;
  title: string;
  author: string | null;
  format: string;
  canonicalFormat: string;
  dateAdded: string;
  updated_at: string;
  filePathOriginal: string;
  filePathCanonical: string | null;
  coverPath: string | null;
  status: string;
  errorMessage: string | null;
}

export interface DbProgress {
  user_id: string;
  bookId: string;
  locationJson: string;
  updatedAt: string;
}

fs.mkdirSync(dataPaths.root, { recursive: true });
export const db = new Database(dataPaths.dbFile);

db.pragma("journal_mode = WAL");

