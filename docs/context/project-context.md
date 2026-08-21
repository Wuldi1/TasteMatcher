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
4. The in-app Phillips preview, review, and approval workflow is documented in
   [`automatic-uploads.md`](./automatic-uploads.md).

## Common Commands

1. Select the repository runtime: `nvm use` (Node.js 24 LTS).
2. Install pinned dependencies: `corepack enable && pnpm install --frozen-lockfile`
3. Sync ignored local configuration from production (Azure read-only):
   `pnpm run sync:local:production`
4. Run the local API and frontend against production-backed services:
   `pnpm run start:local:production`
5. Read-only local API smoke check: `curl --fail http://localhost:8080/health`
6. Read-only Azure Node.js 24 preflight:
   `./scripts/azure/update-node24-runtimes.sh`
7. Build frontend: `pnpm run build:frontend`
8. Build API: `pnpm run build:webapi`
9. Build functions: `pnpm run build:functions`

## Collaboration Defaults

1. Start with planner brief before larger tasks.
2. Use parallel sub-agents for independent FE/BE/functions work.
3. Reserve final pass for review + docs synchronization.
