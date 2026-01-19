import type { BookRecord, BooksListResponse, BookProgressResponse } from "@booktainer/shared";

async function requestJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const res = await fetch(input, init);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export async function listBooks(params: { sort: string; q: string }): Promise<BookRecord[]> {
  const searchParams = new URLSearchParams();
  if (params.sort) searchParams.set("sort", params.sort);
  if (params.q) searchParams.set("q", params.q);
  const data = await requestJson<BooksListResponse>(`/api/books?${searchParams.toString()}`);
  return data.items;
}

export async function uploadBook(file: File): Promise<BookRecord> {
  const form = new FormData();
  form.append("file", file);
  return requestJson<BookRecord>("/api/books/upload", {
    method: "POST",
    body: form
  });
}

export async function getBook(id: string): Promise<BookRecord> {
  return requestJson<BookRecord>(`/api/books/${id}`);
}

export async function renameBook(id: string, title: string): Promise<BookRecord> {
  return requestJson<BookRecord>(`/api/books/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title })
  });
}

export async function updateAuthor(id: string, author: string | null): Promise<BookRecord> {
  return requestJson<BookRecord>(`/api/books/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ author })
  });
}

export async function deleteBook(id: string): Promise<void> {
  await requestJson(`/api/books/${id}`, {
    method: "DELETE"
  });
}

export async function getProgress(id: string): Promise<BookProgressResponse> {
  return requestJson<BookProgressResponse>(`/api/books/${id}/progress`);
}

export async function saveProgress(id: string, location: Record<string, unknown>): Promise<void> {
  await requestJson(`/api/books/${id}/progress`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ location })
  });
}

export function getBookFileUrl(id: string): string {
  return `/api/books/${id}/file`;
}

export function getBookCoverUrl(id: string): string {
  return `/api/books/${id}/cover`;
}
