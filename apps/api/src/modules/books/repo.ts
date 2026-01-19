import { db, type DbBook, type SortKey } from "../../db";

export function getBook(userId: string, id: string): DbBook | undefined {
  const stmt = db.prepare("SELECT * FROM books WHERE id = ? AND user_id = ?");
  return stmt.get(id, userId) as DbBook | undefined;
}

export function insertBook(book: DbBook) {
  const stmt = db.prepare(`
    INSERT INTO books (
      id, user_id, title, author, format, canonicalFormat, dateAdded, updated_at,
      filePathOriginal, filePathCanonical, coverPath, status, errorMessage
    ) VALUES (
      @id, @user_id, @title, @author, @format, @canonicalFormat, @dateAdded, @updated_at,
      @filePathOriginal, @filePathCanonical, @coverPath, @status, @errorMessage
    )
  `);
  stmt.run(book);
}

export function updateBookStatus(userId: string, id: string, status: string, errorMessage: string | null, filePathCanonical: string | null, updatedAt: string) {
  const stmt = db.prepare(`
    UPDATE books
    SET status = @status, errorMessage = @errorMessage, filePathCanonical = @filePathCanonical, updated_at = @updated_at
    WHERE id = @id AND user_id = @user_id
  `);
  stmt.run({ id, user_id: userId, status, errorMessage, filePathCanonical, updated_at: updatedAt });
}

export function updateBookMetadata(userId: string, id: string, title: string, author: string | null, updatedAt: string) {
  const stmt = db.prepare(`
    UPDATE books
    SET title = @title, author = @author, updated_at = @updated_at
    WHERE id = @id AND user_id = @user_id
  `);
  stmt.run({ id, user_id: userId, title, author, updated_at: updatedAt });
}

export function listBooks(userId: string, sort: SortKey, query: string | null): DbBook[] {
  const orderBy = sort === "title" ? "title COLLATE NOCASE" : sort === "author" ? "author COLLATE NOCASE" : "dateAdded DESC";
  const where = query ? "WHERE user_id = @user_id AND (title LIKE @q OR author LIKE @q)" : "WHERE user_id = @user_id";
  const stmt = db.prepare(`SELECT * FROM books ${where} ORDER BY ${orderBy}`);
  if (!query) {
    return stmt.all({ user_id: userId }) as DbBook[];
  }
  return stmt.all({ user_id: userId, q: `%${query}%` }) as DbBook[];
}

export function updateBookTitle(userId: string, id: string, title: string, updatedAt: string) {
  const stmt = db.prepare(`
    UPDATE books
    SET title = @title, updated_at = @updated_at
    WHERE id = @id AND user_id = @user_id
  `);
  stmt.run({ id, user_id: userId, title, updated_at: updatedAt });
}

export function updateBookAuthor(userId: string, id: string, author: string | null, updatedAt: string) {
  const stmt = db.prepare(`
    UPDATE books
    SET author = @author, updated_at = @updated_at
    WHERE id = @id AND user_id = @user_id
  `);
  stmt.run({ id, user_id: userId, author, updated_at: updatedAt });
}

export function updateBookCover(userId: string, id: string, coverPath: string | null, updatedAt: string) {
  const stmt = db.prepare(`
    UPDATE books
    SET coverPath = @coverPath, updated_at = @updated_at
    WHERE id = @id AND user_id = @user_id
  `);
  stmt.run({ id, user_id: userId, coverPath, updated_at: updatedAt });
}

export function deleteBook(userId: string, id: string) {
  const stmt = db.prepare("DELETE FROM books WHERE id = ? AND user_id = ?");
  stmt.run(id, userId);
}

export function countBooksMissingOwner(): number {
  const row = db.prepare("SELECT COUNT(*) as count FROM books WHERE user_id IS NULL").get() as { count: number };
  return row.count;
}

export function backfillBooksOwner(userId: string) {
  const stmt = db.prepare(`
    UPDATE books
    SET user_id = @user_id,
        updated_at = COALESCE(updated_at, dateAdded)
    WHERE user_id IS NULL
  `);
  stmt.run({ user_id: userId });
}
