import type { BookProgressResponse } from "@booktainer/shared";
import { getProgress, setProgress } from "./repo";

export function getBookProgress(bookId: string): BookProgressResponse {
  const progress = getProgress(bookId);
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

export function setBookProgress(bookId: string, location: Record<string, unknown>) {
  const updatedAt = new Date().toISOString();
  setProgress(bookId, JSON.stringify(location), updatedAt);
}
