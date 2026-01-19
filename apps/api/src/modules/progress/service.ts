import type { BookProgressResponse } from "@booktainer/shared";
import { getBook } from "../books/repo";
import { getProgress, setProgress } from "./repo";

export function getBookProgress(userId: string, bookId: string): BookProgressResponse | null {
  const book = getBook(userId, bookId);
  if (!book) {
    return null;
  }
  const progress = getProgress(userId, bookId);
  return {
    progress: progress
      ? {
          bookId: progress.bookId,
          location: JSON.parse(progress.locationJson) as Record<string, unknown>,
          updatedAt: progress.updatedAt
        }
      : null
  };
}

export function setBookProgress(userId: string, bookId: string, location: Record<string, unknown>): boolean {
  const book = getBook(userId, bookId);
  if (!book) {
    return false;
  }
  const updatedAt = new Date().toISOString();
  setProgress(userId, bookId, JSON.stringify(location), updatedAt);
  return true;
}
