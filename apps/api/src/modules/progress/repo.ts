import { db, type DbProgress } from "../../db";

export function getProgress(bookId: string): DbProgress | undefined {
  const stmt = db.prepare("SELECT * FROM progress WHERE bookId = ?");
  return stmt.get(bookId) as DbProgress | undefined;
}

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
