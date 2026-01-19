import path from "node:path";
import fsp from "node:fs/promises";
import type { BookRecord, BooksListResponse } from "@booktainer/shared";
import { deleteBook, getBook, listBooks, updateBookAuthor, updateBookTitle } from "./repo";

function toBookRecord(row: ReturnType<typeof getBook>): BookRecord {
  if (!row) {
    throw new Error("Book not found");
  }
  return {
    id: row.id,
    title: row.title,
    author: row.author,
    format: row.format as BookRecord["format"],
    canonicalFormat: row.canonicalFormat as BookRecord["canonicalFormat"],
    dateAdded: row.dateAdded,
    coverUrl: row.coverPath ? `/api/books/${row.id}/cover` : null,
    status: row.status as BookRecord["status"],
    errorMessage: row.errorMessage
  };
}

export function listBookRecords(sort: "dateAdded" | "title" | "author", query: string | null): BooksListResponse {
  const rows = listBooks(sort, query);
  const items = rows.map((row) => toBookRecord(row));
  return { items };
}

export function getBookRecord(id: string): BookRecord | null {
  const row = getBook(id);
  if (!row) {
    return null;
  }
  return toBookRecord(row);
}

export function updateBookRecord(id: string, title?: string, author?: string | null): BookRecord | null {
  const row = getBook(id);
  if (!row) {
    return null;
  }
  if (title !== undefined) {
    updateBookTitle(id, title);
  }
  if (author !== undefined) {
    const nextAuthor = author?.trim();
    updateBookAuthor(id, nextAuthor ? nextAuthor : null);
  }
  const updated = getBook(id);
  return updated ? toBookRecord(updated) : null;
}

export async function removeBook(id: string): Promise<boolean> {
  const row = getBook(id);
  if (!row) {
    return false;
  }
  const bookDir = path.dirname(row.filePathOriginal);
  await fsp.rm(bookDir, { recursive: true, force: true });
  deleteBook(id);
  return true;
}

export { toBookRecord };
