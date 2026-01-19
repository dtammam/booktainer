import { db, type DbBook, type SortKey } from "../../db";

export function getBook(id: string): DbBook | undefined {
  const stmt = db.prepare("SELECT * FROM books WHERE id = ?");
  return stmt.get(id) as DbBook | undefined;
}

export function insertBook(book: DbBook) {
  const stmt = db.prepare(`
    INSERT INTO books (
      id, title, author, format, canonicalFormat, dateAdded,
      filePathOriginal, filePathCanonical, coverPath, status, errorMessage
    ) VALUES (
      @id, @title, @author, @format, @canonicalFormat, @dateAdded,
      @filePathOriginal, @filePathCanonical, @coverPath, @status, @errorMessage
    )
  `);
  stmt.run(book);
}

export function updateBookStatus(id: string, status: string, errorMessage: string | null, filePathCanonical: string | null) {
  const stmt = db.prepare(`
    UPDATE books
    SET status = @status, errorMessage = @errorMessage, filePathCanonical = @filePathCanonical
    WHERE id = @id
  `);
  stmt.run({ id, status, errorMessage, filePathCanonical });
}

export function updateBookMetadata(id: string, title: string, author: string | null) {
  const stmt = db.prepare(`
    UPDATE books
    SET title = @title, author = @author
    WHERE id = @id
  `);
  stmt.run({ id, title, author });
}

export function listBooks(sort: SortKey, query: string | null): DbBook[] {
  const orderBy = sort === "title" ? "title COLLATE NOCASE" : sort === "author" ? "author COLLATE NOCASE" : "dateAdded DESC";
  const where = query ? "WHERE title LIKE @q OR author LIKE @q" : "";
  const stmt = db.prepare(`SELECT * FROM books ${where} ORDER BY ${orderBy}`);
  if (!query) {
    return stmt.all() as DbBook[];
  }
  return stmt.all({ q: `%${query}%` }) as DbBook[];
}

export function updateBookTitle(id: string, title: string) {
  const stmt = db.prepare(`
    UPDATE books
    SET title = @title
    WHERE id = @id
  `);
  stmt.run({ id, title });
}

export function updateBookAuthor(id: string, author: string | null) {
  const stmt = db.prepare(`
    UPDATE books
    SET author = @author
    WHERE id = @id
  `);
  stmt.run({ id, author });
}

export function updateBookCover(id: string, coverPath: string | null) {
  const stmt = db.prepare(`
    UPDATE books
    SET coverPath = @coverPath
    WHERE id = @id
  `);
  stmt.run({ id, coverPath });
}

export function deleteBook(id: string) {
  const stmt = db.prepare("DELETE FROM books WHERE id = ?");
  stmt.run(id);
}
