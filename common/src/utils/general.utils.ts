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

import { Artwork } from "../types/artwork.types";
import { Role } from "../types/user.types";

export const cleanupArtworkBeforeResponseToClient = (
  artwork: Artwork,
  role: Role
): Partial<Artwork> => {
  // create a shallow copy excluding vector and vectorModel via destructuring
  const { vector, vectorModel, ...base } = artwork;

  // Conditionally omit price if shouldDisplayPrice is falsy or role is not customer
  if (!artwork.shouldDisplayPrice && role === "customer") {
    const { price, ...withoutPrice } = base;
    return withoutPrice as Partial<Artwork>;
  }

  return base as Partial<Artwork>;
};

export const isAuctionEnded = (
  artwork: Pick<Artwork, "isAuction" | "endDate">,
  nowMs: number = Date.now()
): boolean => {
  if (artwork?.isAuction && artwork?.endDate) {
    return new Date(artwork.endDate).getTime() <= nowMs;
  }
  return true;
};
