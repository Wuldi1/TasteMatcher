import { Artwork, ThumbnailInfo } from "./artwork.types";

export type UploadStatus = 'pending' | 'enqueued' | 'processing' | 'completed' | 'failed';

export interface IndexingJobMessage {
  messageId: string;
  artId: string;
  domainId: string;
  blobName: string;
  artwork: Artwork;
  attempt: number;
  enqueuedAt?: number; // timestamp
}


export interface ProcessingStatus {
  artId: string;
  status: UploadStatus;
  progress: number;       // 0-100 percentage
  thumbnails?: Array<ThumbnailInfo>;
  error?: string;          // error message if failed
}

// ---------- CODEGEN CHECKLIST (must be satisfied) ----------
// 1. Uses TypeScript strict types (no `any`). If any `any` present, justify with comment.
// 2. Uses shared `common` types for API contracts where applicable.
// 3. Includes unit tests written first (test file present next to implementation).
// 4. Adds structured logging at function entry/exit and on errors.
// 5. Adds at least one assertion or guard for input validation.
// 6. No duplicate logic — reuse existing service/util or extract shared module.
// 7. Adds or updates README or docs if public API changes.
// 8. Adds meaningful JSDoc for exported functions/classes.
// 9. CI-friendly: code passes lint, typecheck, and tests locally.
// -----------------------------------------------------------
