Booktainer (Book Container) — Architecture & Design Document (v0.1)
1) Purpose

Booktainer is a self-hosted, Dockerized web app for uploading, organizing, and reading eBooks/documents on any device via a responsive web UI (KyBook-like library + reader). It persists library state and reading position per book, supports text-to-speech (TTS) with word/phrase highlighting, and includes a “TikTok mode” subtitle-style reading view.

2) Scope (Day 1 vs Day 2)

Day 1 (ship this)

Docker image runs the whole app (frontend + backend).

Library:

Upload files: PDF, EPUB, MOBI, TXT, MD

List/grid library view with cover thumbnails where possible

Sort by: date added, title, author

Search by title/author

Reader:

EPUB reader with pagination/scroll, full-screen and two-page mode

PDF reader with pagination/zoom

TXT/MD reader with pagination/scroll

Persist reading position per book

TTS (Day 1 implementation):

Use device/browser native TTS (Web Speech API where available)

Basic “read/pause/stop”, speed/voice selection (if supported)

Highlight “current phrase/sentence” during TTS (best-effort)

“TikTok mode”: show current phrase centered while TTS plays

Day 2 (explicitly out-of-scope for first build, but scaffold for it)

Genres/tags, collections, series

Multi-user accounts / per-user progress

OPDS feed

Whisper or server TTS engines (Piper, Coqui, etc.)

Sync across devices via login, WebSockets presence, etc.

Annotations/export, advanced highlights, notes

3) Key Requirements / Constraints

Low admin friction: run with Docker + a mounted volume.

Fast and responsive on mobile and desktop.

No format creep: only PDF/EPUB/MOBI/TXT/MD.

Reading progress persists across sessions/devices.

TTS uses native device initially (no server GPU requirements).

MOBI handling must not become a time sink.

4) Recommended Tech Stack (minimize pain)

Backend

Node.js 20+ (TypeScript)

Fastify (or Express; Fastify recommended for structure/perf)

SQLite for metadata + progress (single-file DB, robust, simple)

File storage on disk under a mounted volume

Frontend

React + Vite + TypeScript

Tailwind CSS (or plain CSS modules if you want fewer deps)

Reader libraries:

EPUB: epubjs

PDF: pdfjs-dist

Markdown: marked + DOMPurify (sanitize)

TXT: plain text renderer

Why SQLite over “JSON files”?
JSON works until you need consistent sorting/search/progress updates and you hit corruption/concurrency edge cases. SQLite removes that whole class of problems without becoming “real DB ops”.

5) System Architecture

Single container serving:

/ static frontend (SPA)

/api/* backend API

/data mounted volume for persistence:

/data/library/ uploaded book files

/data/covers/ generated cover thumbnails

/data/booktainer.db SQLite database

/data/tmp/ transient conversions/extractions

Data flow

User uploads a file

Backend stores it to /data/library/<bookId>/original.<ext>

Backend extracts metadata + (optional) cover + (optional) text index

Backend writes metadata to SQLite

Frontend queries library + opens reader

Reader emits progress updates (position) to backend

6) File Format Handling
EPUB

Parse metadata (title/author) via epubjs or a lightweight epub metadata parser

Cover: extract from EPUB manifest or render first “cover” resource

PDF

Metadata: PDF title if present, else filename

Cover: render first page thumbnail via pdf.js on server (Node canvas) or do it client-side and upload thumbnail (client-side is simpler initially)

Text extraction: optional for Day 1; only needed for high-fidelity word highlighting. For Day 1, do phrase-level highlighting from rendered page text layer if feasible; otherwise highlight the currently spoken phrase in UI.

TXT / MD

TXT: filename as title, author unknown

MD: render to HTML (sanitize) and paginate/scroll

TTS source text is straightforward

MOBI (risk area)

MOBI parsing/rendering in pure JS is inconsistent. The lowest-risk approach is:

Convert MOBI → EPUB on upload using Calibre’s ebook-convert.

Store:

original file

converted EPUB as the canonical readable artifact

Metadata + cover derived from the converted EPUB.

Tradeoff: container image gets bigger (Calibre). But it avoids endless edge-case debugging. If image size is a hard constraint, fallback plan is “MOBI accepted but must be converted externally” — but that violates your “low friction” goal. I’d take the bigger image.

7) Core UX
Library (KyBook-like)

Top bar: search, sort dropdown, upload button

Grid view default:

cover thumbnail

title + author

progress indicator (optional)

Sort options:

Date added (default)

Title (A–Z)

Author (A–Z)

Click opens reader at last position

Reader

Modes:

Full-screen

Two-page (landscape/tablet/desktop)

Controls:

next/prev page

scrub/slider (optional for Day 1; can be Day 2)

font size/theme for EPUB/TXT/MD (Day 1 if easy; otherwise Day 2)

Progress persistence:

EPUB: CFI position

PDF: page number + (optional) scroll offset

TXT/MD: scroll percentage + (optional) character offset

TTS + Highlighting

TTS engine: browser’s Speech Synthesis

UI:

Play/Pause/Stop

Rate (speed)

Voice select (if available)

Highlight strategy (Day 1, pragmatic):

Use utterance boundary events (onboundary) where supported.

If word boundaries are unreliable (common), highlight current phrase/sentence and optionally auto-scroll the reader to keep the phrase visible.

TikTok mode always works because it only needs “current phrase”.

TikTok Mode

Screen shows:

faint page behind (optional)

large centered phrase currently spoken

previous/next phrase subtle above/below (optional)

Sync from same phrase queue used for TTS

8) Backend API (v1)

All JSON unless noted.

Library

GET /api/books?sort=dateAdded|title|author&q=...

POST /api/books/upload (multipart form-data)

GET /api/books/:id (metadata)

DELETE /api/books/:id (optional Day 1; can be Day 2)

GET /api/books/:id/file (stream original or canonical artifact)

GET /api/books/:id/cover (image)

POST /api/books/:id/progress { location: {...}, updatedAt }

GET /api/books/:id/progress

Optional (Day 1 if easy, else Day 2)

GET /api/books/:id/text (extracted text or structured segments)

9) Database Schema (SQLite)

books

id (uuid)

title

author

format (pdf|epub|mobi|txt|md)

canonicalFormat (pdf|epub|txt|md) // mobi becomes epub if converted

dateAdded

filePathOriginal

filePathCanonical (nullable)

coverPath (nullable)

totalPages (nullable; pdf known, epub optional)

metadataJson (nullable blob/text)

progress

bookId (fk)

locationJson (cfi/page/scroll/etc.)

updatedAt

Later (Day 2): tags, collections, users, etc.

10) Containerization

Image name: booktainer/booktainer:latest

Exposes port 8080

Volume mount: -v /your/path:/data

Env vars:

PORT=8080

DATA_DIR=/data

ALLOW_UPLOAD=true

MAX_UPLOAD_MB=500 (example)

Run example:

docker run -p 8080:8080 -v /srv/booktainer:/data booktainer/booktainer:latest

Non-root runtime user.
Healthcheck on /api/health.

11) Security Posture (explicit decision)

Day 1 options:

Default: no auth (assume trusted LAN / behind reverse proxy auth)

Add a simple optional gate:

BASICAUTH_USER/BASICAUTH_PASS env vars

Or “single shared access token” header
This avoids building a whole auth system prematurely.

12) Performance Targets

Library list returns <200ms for 1k books on typical homelab hardware (NUC-class).

Upload processing is async:

API returns book created quickly

“processing” state in UI until metadata/cover ready

Reader loads first page/section quickly (EPUB and PDF progressive loading).

13) Testing

Unit tests: metadata parsing, DB operations, sort/search

Minimal integration tests: upload → book appears → open → progress saved

Manual smoke tests on:

iOS Safari

Android Chrome

Desktop Chrome/Edge

14) Definition of Done (Day 1)

docker run ... works with a fresh empty /data

Upload each supported format

Library renders, sorts, searches

Open and read each format

Close and reopen preserves position

TTS works on at least one major browser (Chrome/Edge) and degrades gracefully elsewhere

TikTok mode functions (phrase display + TTS sync)