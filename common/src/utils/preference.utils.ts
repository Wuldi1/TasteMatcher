// ---------- CODEGEN CHECKLIST (must be satisfied) ----------
// 1. Uses TypeScript strict types (no `any`).
// 2. Uses shared `common` types for API contracts where applicable.
// 3. Includes unit tests written first (test file present next to implementation).
// 4. Adds structured logging at function entry/exit and on errors.
// 5. Adds at least one assertion or guard for input validation.
// 6. No duplicate logic — reuse existing service/util or extract shared module.
// 7. Adds or updates README or docs if public API changes.
// 8. Adds meaningful JSDoc for exported functions/classes.
// 9. CI-friendly: code passes lint, typecheck, and tests locally.
// 10. Frontend-specific: responsive (mobile + desktop), smooth, accessible (WCAG AA).
// -----------------------------------------------------------

/**
 * Generate unique preference ID from userId and artworkId
 * Used as the document ID in Cosmos DB for ArtworkPreference
 * 
 * @param userId - User ID
 * @param artworkId - Artwork ID
 * @returns Composite ID in format: `${userId}_${artworkId}`
 * @throws Error if userId or artworkId is empty
 * 
 * @example
 * ```ts
 * const prefId = generatePreferenceId('user-123', 'artwork-456');
 * // Returns: 'user-123_artwork-456'
 * ```
 */
export function generatePreferenceId(userId: string, artworkId: string): string {
  if (!userId || !artworkId) {
    throw new Error('userId and artworkId are required to generate preference ID');
  }

  return `${userId}_${artworkId}`;
}