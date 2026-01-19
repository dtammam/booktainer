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

export interface AuthUser {
  id: string;
  email: string;
  isAdmin: boolean;
}

export interface AuthLoginRequest {
  email: string;
  password: string;
}

export interface AuthLoginResponse {
  user: AuthUser;
}

export interface AuthMeResponse {
  user: AuthUser;
}

export interface AuthLogoutResponse {
  ok: true;
}

export interface AdminCreateUserRequest {
  email: string;
  password: string;
  isAdmin?: boolean;
}

export interface AdminCreateUserResponse {
  user: AuthUser;
}

export interface TtsVoice {
  id: string;
  name: string;
  locale?: string;
}

export interface TtsVoicesResponse {
  online: TtsVoice[];
  offline: TtsVoice[];
  defaultMode: "online" | "offline";
  defaultVoice: string;
}

export interface TtsSpeakRequest {
  mode: "online" | "offline";
  voice: string;
  rate?: number;
  text: string;
}

export interface TtsInstallVoiceRequest {
  voice: string;
}

export interface TtsInstallVoiceResponse {
  voice: TtsVoice;
  catalog: TtsVoice[];
}

export interface TtsSpeakUrlResponse {
  url: string;
}

export interface BooksListResponse {
  items: BookRecord[];
}

export interface BookProgressResponse {
  progress: BookProgress | null;
}
