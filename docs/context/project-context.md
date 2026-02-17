# Project Context

## Product

TasteMatcher is an AI-powered art matching platform with:

1. Catalog and artwork upload workflows.
2. Taste profiling and recommendations.
3. Sales tooling (`AI Suggestions`, `Sale Proposal`, and dealer flows).

## Monorepo Structure

1. `common/`: shared types and utilities.
2. `webapi/`: API service (NestJS) and business logic.
3. `frontend/`: React app.
4. `functions/`: Azure Functions for async processing and summaries.

## Architecture Constraints

1. Keep cross-package contracts in `common/` and consume them from FE/BE/functions.
2. Prefer strict TypeScript, explicit validation, and typed errors.
3. Avoid duplicate logic across packages.
4. Keep docs synchronized with behavior changes.

## High-Value Domains

1. Artwork ingestion and enrichment.
2. Semantic search and recommendation scoring.
3. Dealer/sales workflows.
4. Daily domain-owner summary jobs.

## Ingestion Tooling

1. HTML/PDF ingestion scripts are under `scripts/scapper/`.
2. Upload-ready structure is `<artwork_folder>/image.*` + `metadata.json`.
3. Upload pipeline consumes metadata fields used by `scripts/scapper/upload_artworks.js`.

## Common Commands

1. Install dependencies: `pnpm install`
2. Build frontend: `pnpm run build:frontend`
3. Build API: `pnpm run build:webapi`
4. Build functions: `pnpm run build:functions`
5. Run API dev server: `pnpm run start:dev:webapi`

## Collaboration Defaults

1. Start with planner brief before larger tasks.
2. Use parallel sub-agents for independent FE/BE/functions work.
3. Reserve final pass for review + docs synchronization.
