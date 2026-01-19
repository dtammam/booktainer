# Booktainer

Booktainer is a single-container web library + reader for PDF, EPUB, MOBI, TXT, and Markdown with progress tracking and browser-native TTS.

## Dev

```bash
npm install
npm run dev
```

API runs on `http://localhost:8080`, web on `http://localhost:5173`.

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

## Notes

- MOBI uploads are converted server-side via Calibre `ebook-convert` to EPUB.
- Progress is stored per book and restored on reload.
- TTS uses the browser's Web Speech API with a phrase-level fallback for Safari boundary issues.
- `/data` is required for persistence (library, covers, progress).
