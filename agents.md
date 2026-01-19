# Booktainer — AGENTS.md

This repository is a Dockerized, browser-first reading app with multi-user support, offline+online TTS, and a TikTok-style engagement mode.

## North Star
Build a clean, modular, testable system that avoids bolt-ons:
- Multi-user (admin creates accounts)
- Private shelves for MVP (no shared shelves yet)
- Reader supports EPUB/PDF/TXT/MD
- TTS is provider-agnostic: Offline (Piper) + Online (OpenAI Audio `audio/speech`)
- Docker-first, reproducible builds, persistent `/data`

## Non-negotiable architecture rules
1) **Thin routes**: Route handlers must do validation + call services only. No business logic in routes.
2) **Service layer**: Business logic lives in `service.ts` and is unit-testable.
3) **Repository layer**: DB access only in `repo.ts`. Never inline SQL in routes/services.
4) **Provider adapters**: External integrations (OpenAI, Piper, filesystem) must implement interfaces under `apps/api/src/providers/*`.
5) **Shared contracts**: Request/response types live in `packages/shared`. Keep client/server in sync.
6) **Runtime validation**: Validate request bodies/params with Zod (or equivalent) at API boundaries.
7) **Streaming first**: Never buffer whole files/audio. Use streams for range requests and TTS audio.
8) **Explicit jobs for long work**: Conversion and voice install use a `jobs` table with states + error detail.
9) **iOS constraints baked in**: Audio must start from user gesture; speech boundary events are unreliable—always have fallbacks.
10) **Migrations**: DB/file layout changes must ship with forward-only migrations and a safe upgrade path.

## Target repo structure
### API
- `apps/api/src/modules/<feature>/`
  - `routes.ts` (Fastify routes; thin)
  - `schemas.ts` (zod schemas)
  - `service.ts` (business logic)
  - `repo.ts` (SQLite access)
  - `types.ts` (feature-local types)
- `apps/api/src/providers/`
  - `tts/`
    - `interface.ts`
    - `registry.ts`
    - `openai.ts`
    - `piper.ts`
- `apps/api/src/db/` (db init + migrations)
- `apps/api/src/lib/` (stream helpers, errors, auth/session utils, etc.)

### Web
- `apps/web/src/features/<feature>/`
  - `components/`
  - `hooks/`
  - `api/`
  - `state/`

### Shared
- `packages/shared/`
  - `api/` (request/response DTOs)
  - `types/` (domain types)
  - `schemas/` (optional shared zod schemas)

## MVP features (must not regress)
- Auth: admin creates accounts; cookie sessions; Argon2id
- Books: upload/list/get/patch/delete; file streaming w/ range; cover streaming
- Progress: per-user per-book
- TTS:
  - Offline: Piper voices downloaded to `/data/tts-voices` on first use
  - Online: OpenAI `audio/speech` via server-side API key
  - Frontend plays streamed audio (HTMLAudio), not Web Speech API
- TikTok mode: presentation layer; phrase segmentation + highlighting remains stable

## Implementation standards
- TypeScript strict mode on
- No `any` unless justified
- Centralized error handling and consistent error shapes
- Logging: structured logs; avoid leaking secrets
- Config: env-driven; online TTS only appears if `OPENAI_API_KEY` is configured

## Definition of Done (per PR)
- Types updated in `packages/shared` when API changes
- Zod validation on routes for any new/changed endpoint
- Unit tests for service logic when practical
- Migration added when schema changes
- Runbook updated when env/ops changes
- Docker build and compose run succeed locally
- No large buffers for files/audio; streaming verified

## Commands (expected)
- `pnpm install`
- `pnpm -w build`
- `pnpm -w test`
- `docker compose up --build`

## Guardrails for coding agents
- If you need to “quickly hack it in,” stop and refactor first.
- Prefer adding an interface and adapter rather than coupling a vendor SDK into core logic.
- When uncertain, implement the simplest version that preserves the architecture rules above.
