# Task Brief

## Objective

- Add a private, domain-scoped PDF intake inventory under Automatic Uploads so Jaclyn can email auction PDFs, review parsed drafts, and approve them into the artwork list.

## Scope

- In scope: Gmail ingestion, private Azure Blob artifacts, Cosmos intake metadata, owner-only inventory APIs, PDFs tab, review/approval reuse, tests, and setup documentation.
- Out of scope: direct artwork creation from email, public blob URLs, non-PDF attachments, OCR for unsupported layouts, and production deployment.

## Acceptance Criteria

1. An allowlisted Gmail message can create one idempotent PDF intake with private source PDF and normalized import JSON artifacts.
2. Only the matching domain owner can list, inspect, download, and approve that domain's PDF intakes.
3. The Automatic Uploads page contains a PDFs tab that follows the current design and reuses the existing draft review and approval workflow.
4. Approval binds edits to the trusted stored import file and records the resulting intake status.
5. Gmail replies with an Alfred-branded success or failure summary and never attaches the generated JSON.

## Constraints

- Technical: preserve existing Automatic Uploads contracts, Azure connection configuration, Cosmos Core partitioning by `domainId`, and current uncommitted redesign work.
- Product: PDFs remain private and approval is always manual.
- Time: implement and validate locally; deployment is a separate explicit action.

## Suggested Agent Plan

1. planner-agent: define security and lifecycle contracts.
2. shared-types-agent: add PDF intake response types.
3. backend-agent / frontend-agent: implement API, persistence, Gmail client, and UI.
4. review-agent: verify authorization, idempotency, trusted-source approval, and tests.
5. docs-agent: document required environment variables and operation.

## Files Likely Affected

- `common/src/types/automatic-upload.types.ts`
- `common/src/services/Blob/BlobService.ts`
- `webapi/src/automatic-uploads/`
- `frontend/src/pages/AutomaticUploads/AutomaticUploadsPage.tsx`
- `frontend/src/utils/api.ts`
- `scripts/automatic-uploads/gmail_pdf_intake.py`
- `scripts/automatic-uploads/test_gmail_pdf_intake.py`

## Validation Commands

- `pnpm --filter @tastematcher/webapi typecheck`
- focused Web API and frontend Jest tests
- `python3 -m unittest scripts/automatic-uploads/test_gmail_pdf_intake.py`
- `git diff --check`

## Risks

- Variable PDF layouts can produce incomplete drafts; retain parser warnings and require owner review.
- Email retries can duplicate records; enforce Gmail message and attachment idempotency within the configured domain.
- Client edits could tamper with source identity; rebuild approval requests from the stored import file.
