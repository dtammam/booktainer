import { db, type DbProgress } from "../../db";

export function getProgress(userId: string, bookId: string): DbProgress | undefined {
  const stmt = db.prepare("SELECT * FROM progress WHERE user_id = ? AND bookId = ?");
  return stmt.get(userId, bookId) as DbProgress | undefined;
}

export function setProgress(userId: string, bookId: string, locationJson: string, updatedAt: string) {
  const stmt = db.prepare(`
    INSERT INTO progress (user_id, bookId, locationJson, updatedAt)
    VALUES (@user_id, @bookId, @locationJson, @updatedAt)
    ON CONFLICT(user_id, bookId) DO UPDATE SET
      locationJson = excluded.locationJson,
      updatedAt = excluded.updatedAt
  `);
  stmt.run({ user_id: userId, bookId, locationJson, updatedAt });
}

export function countProgressMissingOwner(): number {
  const row = db.prepare("SELECT COUNT(*) as count FROM progress WHERE user_id IS NULL").get() as { count: number };
  return row.count;
}

export function backfillProgressOwner(userId: string) {
  const stmt = db.prepare(`
    UPDATE progress
    SET user_id = @user_id
    WHERE user_id IS NULL
  `);
  stmt.run({ user_id: userId });
}
