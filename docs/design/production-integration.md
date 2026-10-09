# Production-connected redesign

## Implementation approach

The standalone prototype remains the design reference. The real React pages now adopt the premium visual system while retaining their existing authentication contexts, React Query state, API client, role behavior, and production data contracts. This avoids a parallel application with simulated state.

The connected review runs at `http://localhost:3000` with the local Web API at `http://localhost:8080`. The API health check verifies the production-backed database and storage connections before review.

## Real workflow connections

- Collector home uses live user, questionnaire, taste statistics, proposal metadata, advisor comments, and shared collection uploads.
- Taster loads untasted artwork from the real API and persists left/right decisions through the existing preference endpoint.
- Recommendations, catalog, onboarding, proposals, sales, management, manual upload, automatic auction review, and email campaigns continue to use their existing `apiClient` methods.
- The redesign does not introduce a second data model or browser-only substitute for those workflows.

## Mobile Taster behavior

The production Taster retains Tinder-style cards:

- right swipe records a like;
- left swipe records a dislike;
- a 100-pixel horizontal threshold commits the decision;
- vertical gestures remain available for page scrolling;
- buttons and arrow keys use the same mutation path;
- overlapping input events cannot create duplicate preference writes;
- failed saves restore the current artwork and display a retry message;
- the next artwork is preloaded behind the active card.

## Email design and links

Transactional, proposal, campaign, recommendation, daily-summary, and auction-intake emails use the same ivory, ink, moss, and brass visual language as the application. Templates use table-based layouts and system fonts for broad email-client support, include plain-text alternatives where the sender supports them, and link to the public `https://tastematcher.art` origin when no environment-specific frontend URL is configured. Privacy Policy and Terms of Service links appear in each branded footer.

Artwork recommendation links open the referenced catalog work, and proposal activity uses collector-facing or team-facing copy based on the recipient context. Dynamic values in Function-generated email HTML are escaped and external artwork images are limited to HTTP(S) URLs.

Management campaign previews render in a sandboxed iframe. Advanced HTML remains a trusted administrator capability and is sent as authored. A marketing unsubscribe or notification-preferences flow is intentionally not claimed here because the product has no preference contract or endpoint yet; it should be designed before adding an unsubscribe link that cannot be honored.

## Authorization and privacy hardening

The connected review exposed two production risks that were fixed with focused regression coverage:

- customers can no longer reach staff upload, sales, or management routes through a copied URL;
- upload, image replacement, artwork editing, and deletion now require `dealer`, `domain_owner`, or `global_admin` at the API and service layers;
- hidden customer auction pricing now removes both `price` and `maxPrice`.

Customer catalog deep links remain available for liked and disliked artwork review.

## Running the review

Use Node.js 24, then run:

```sh
pnpm run start:local:production
```

Open `http://localhost:3000/login` and sign in with an existing invited account. The local runtime uses live production-backed data. Taste decisions, comments, onboarding changes, uploads, proposal edits, invitations, approval actions, and management mutations are real writes. Use designated test accounts and test records. Local safeguards suppress invitation, proposal-notification, and bulk-campaign email delivery; login verification email remains enabled.

## Validation completed

- Full repository tests passed.
- Full repository lint and TypeScript checks passed.
- Production frontend build passed.
- API health reported healthy database and storage connections.
- Connected public pages were checked at 320×568, 390×844, 430×932, and 768×1024 with no horizontal overflow and 48-pixel primary controls.
- Taster component tests cover mobile left swipe, desktop drag, vertical mobile scrolling, under-threshold cancellation, duplicate-event suppression, and API failure recovery.

Physical iOS Safari and Android Chrome checks are still required to judge gesture feel, browser chrome, and safe-area behavior on real hardware.
