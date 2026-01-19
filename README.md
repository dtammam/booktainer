# Booktainer

Booktainer is a single-container web library + reader for PDF, EPUB, MOBI, TXT, and Markdown with progress tracking and browser-native TTS.

## Dev

```bash
pnpm install
pnpm -r build
pnpm dev
```

API runs on `http://localhost:8080`, web on `http://localhost:5173`.

Dev note:
- corepack pnpm is broken on Windows Node 22.13.1 (keyid error); use npm-installed pnpm.
- Ensure PATH contains: C:\Users\dean\.npm-global
- Clean install:
  - remove node_modules folders and pnpm-lock.yaml
  - pnpm install
  - pnpm -r build

## Docker

Build and run the single container:

```bash
docker build -t booktainer .
docker run -p 8080:8080 -v $(pwd)/data:/data booktainer
```

Or use Docker Compose:

```bash
docker compose up --build
```

## Environment

- `PORT` (default: 8080)
- `DATA_DIR` (default: /data)
- `ALLOW_UPLOAD` (default: true)
- `MAX_UPLOAD_MB` (default: 500)
- `SESSION_SECRET` (required)
- `SESSION_TTL_DAYS` (default: 30)
- `ADMIN_EMAIL` (required for first admin bootstrap)
- `ADMIN_PASSWORD` (required for first admin bootstrap)

## Notes

- MOBI uploads are converted server-side via Calibre `ebook-convert` to EPUB.
- Progress is stored per book and restored on reload.
- TTS uses the browser's Web Speech API with a phrase-level fallback for Safari boundary issues.
- `/data` is required for persistence (library, covers, progress).
