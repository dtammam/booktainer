export type BookFormat = "pdf" | "epub" | "mobi" | "txt" | "md";
export type CanonicalFormat = "pdf" | "epub" | "txt" | "md";

export type BookStatus = "ready" | "processing" | "error";

export interface BookRecord {
  id: string;
  title: string;
  author: string | null;
  format: BookFormat;
  canonicalFormat: CanonicalFormat;
  dateAdded: string;
  coverUrl: string | null;
  status: BookStatus;
  errorMessage: string | null;
}

export interface BookProgress {
  bookId: string;
  location: Record<string, unknown>;
  updatedAt: string;
}

export interface ApiError {
  error: string;
}

export interface BooksListResponse {
  items: BookRecord[];
}

export interface BookProgressResponse {
  progress: BookProgress | null;
}
