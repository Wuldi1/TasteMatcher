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

import {
  getDerivativeBlobPath,
  getOriginalBlobPath,
  getSearchDocId,
} from "../naming";
import { describe, expect, it } from "vitest";

describe("naming utils", () => {
  const domainId = "11111111-1111-1111-1111-111111111111";
  const artworkId = "22222222-2222-2222-2222-222222222222";

  it("returns original blob path", () => {
    expect(getOriginalBlobPath(domainId, artworkId, "jpg")).toBe(
      `${domainId}/artworks/${artworkId}/original.jpg`,
    );
  });

  it("returns derivative path", () => {
    expect(getDerivativeBlobPath(domainId, artworkId, "Small")).toBe(
      `${domainId}/artworks/${artworkId}/small.jpg`,
    );
  });

  it("returns search doc id", () => {
    expect(getSearchDocId(domainId, artworkId)).toBe(
      `${domainId}::${artworkId}`,
    );
  });

  it("throws for invalid ids", () => {
    expect(() => getOriginalBlobPath("", artworkId, "jpg")).toThrow();
    expect(() =>
      getDerivativeBlobPath(domainId, artworkId, "XLarge"),
    ).toThrow();
  });
});
