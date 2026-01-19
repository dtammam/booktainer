Mission

Build Booktainer: a single Docker image hosting a responsive web library + reader for PDF/EPUB/MOBI/TXT/MD, with persisted reading progress and native browser TTS + TikTok subtitle mode.

Hard Constraints

Support only: PDF, EPUB, MOBI, TXT, MD

Must run in Docker with a mounted /data volume for persistence

Avoid multi-service complexity (single container, single repo)

Prefer boring, stable libraries over clever ones

Repo Structure (target)
booktainer/
  apps/
    web/                # React/Vite frontend
    api/                # Node/Fastify backend
  packages/
    shared/             # shared types, utils
  data/                 # dev-only local data (gitignored)
  docker/
    Dockerfile
  compose.yaml
  README.md

Build/Run Commands (target)

Dev:

npm install

npm run dev (runs web + api)

Prod container:

docker build -t booktainer .

docker run -p 8080:8080 -v $(pwd)/data:/data booktainer

Implementation Order (do in this sequence)

Backend skeleton

Fastify server

SQLite init + migrations

/api/health

Data dir handling: ensure /data/library, /data/covers, /data/tmp

Upload + library list

POST /api/books/upload (multipart)

Persist original file to /data/library/<id>/original.ext

Insert book row with dateAdded

GET /api/books?sort=...&q=...

Basic frontend library

Library page with upload button, search input, sort dropdown

Grid list with placeholders (no covers yet)

Readers

EPUB reader using epubjs, persist CFI

PDF reader using pdf.js, persist page number

TXT/MD reader, persist scroll percent

GET /api/books/:id/file streaming

Progress persistence

GET/POST /api/books/:id/progress

Frontend autosaves progress (throttle)

Covers (best-effort)

EPUB cover extraction

PDF: client-side render page 1 thumbnail and upload to backend (simplest)

TXT/MD: generic cover

MOBI strategy

Implement server-side conversion MOBI→EPUB using ebook-convert (Calibre)

Store canonical epub and set canonicalFormat=epub

If conversion fails, mark book status=error with message

TTS + TikTok mode

Use Web Speech API

Generate phrase queue from the current chapter/page text

TikTok view: centered phrase display synced to speech events

Fallback: if boundary events missing, advance per phrase duration heuristic

Docker hardening

Multi-stage build

Non-root user

Healthcheck

Document env vars

Coding Standards

TypeScript everywhere

Strict linting

Shared types for API responses

No silent failures: surface errors in UI and logs

Known Risk Areas (handle explicitly)

Safari TTS boundary events may be inconsistent. Implement graceful degradation:

If onboundary doesn’t fire, phrase-level timed advancement.

PDF text extraction/highlight is messy. Do not chase perfect word highlighting for Day 1.

MOBI: conversion path is the mainline; avoid half-working JS parsers.

Acceptance Checklist

Fresh /data works with no manual setup

Upload each format; library shows entries

Open and read each format

Progress restores after reload

TTS plays for TXT/MD/EPUB at minimum; PDF best-effort

TikTok mode displays phrases synced reasonably

One docker run command launches everything