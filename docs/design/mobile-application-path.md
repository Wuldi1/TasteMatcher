# Mobile application path

The redesign is intentionally shaped so TasteMatcher can become a native mobile application without rethinking the product again. The visual language should survive the transition; browser-specific layout code should not become the product architecture.

## Product model

The collector application should feel like a private gallery in the hand: quiet, image-led, personal, and direct. The staff application should remain a working desk. They may eventually be separate native app targets or separate role shells in one app, but they should share the same domain contracts and design foundations.

The current responsive prototype demonstrates the hierarchy at 390px. A production native build should implement platform navigation and controls rather than wrap these exact HTML screens in a WebView.

| Web proposal             | Native mobile expression                                                  | Reason                                                                                   |
| ------------------------ | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Desktop collector rail   | Four-item native tab bar: Collection, Discover, For You, Viewing          | These are stable peer destinations used frequently                                       |
| Desktop staff rail       | Overview, Collectors, Artworks, More                                      | Keeps the primary staff tasks reachable; intake and administration live under More       |
| Page header actions      | Native navigation-bar action or bottom action sheet                       | Preserves reachability and platform expectations                                         |
| Centered dialog          | Native sheet for contextual editing; full-screen route for complex work   | Focus, keyboard, dismissal, and accessibility come from the platform                     |
| Artwork detail dialog    | Full-screen artwork route with a contained image and scrollable facts     | Inspection deserves the full phone viewport                                              |
| Catalog filters          | Bottom sheet with explicit Apply/Clear state                              | Avoids cramped horizontal toolbars                                                       |
| Staff bulk toolbar       | Safe-area-aware bottom action bar                                         | Keeps selection actions near the thumb without covering records                          |
| Taster buttons and swipe | Buttons remain canonical; horizontal drag is an additional direct gesture | Accessibility and recovery do not depend on learning a gesture                           |
| Proposal composer        | One full-screen step per stage with saved draft state                     | Long, multi-section desktop forms do not shrink gracefully into one phone view           |
| Import lot table         | Summary rows opening a full-screen lot inspector                          | Wide operational tables require a mobile information hierarchy, not horizontal squeezing |
| Management tables        | Searchable mobile records with detail sheets                              | Names, statuses, and actions stay readable at narrow widths                              |

## Shared foundations

Create platform-neutral tokens before the native build:

- semantic colors: canvas, surface, ink, muted text, border, primary action, brass accent, success, warning, danger;
- type roles: display, artwork title, body, label, numeric data;
- spacing, radii, image-mount treatment, touch target, and elevation roles;
- motion intent: press feedback, sheet transition, state change, reduced motion;
- content vocabulary and status names.

Represent those tokens as data that can feed CSS today and a native theme later. Avoid treating Tailwind utility combinations or DOM class names as the source of truth.

Keep API contracts, validation, price/dimension formatting, recommendation terminology, authorization rules, and proposal state in shared TypeScript packages where platform APIs do not leak in. Web and native UI should consume the same typed domain layer. Browser storage, file pickers, routing, dialogs, and image caching belong behind platform adapters.

## Native navigation and state

Use native stack navigation for drill-in flows and native tabs for stable peer destinations. Do not animate tab changes. Preserve scroll position when returning from artwork details. Deep links should cover collector viewing, artwork, customer workspace, and import-review records without bypassing authorization.

Drafts must survive interruption. Onboarding, messages, notes, proposal composition, artwork entry, and lot edits need explicit local-draft behavior before native development begins. A mobile operating system can background or terminate the application at any point; component-local state is not sufficient.

Mutations should expose a consistent state machine across platforms: idle, validating, pending, succeeded, recoverable failure, and terminal failure. Optimistic UI is appropriate only when failure can be reversed without misrepresenting a business outcome. Import approval, proposal publication, invitations, and campaign sending should wait for authoritative success.

## Images, gestures, and performance

Artwork is the heaviest and most important content. Define thumbnail, card, detail, and zoom asset sizes; retain full aspect ratios; use progressive loading and disk caching; and never let metadata reflow move the decision controls. A native viewer may add pinch-to-zoom, but zoom cannot replace a visible full-image inspection route.

The Taster drag should track the finger on the UI thread, accept a decisive distance or velocity, remain interruptible, and fall back to visible Like / Not for me buttons. Keyboard animation is a web-only concern; native screen transitions should use platform defaults. Routine lists, tabs, filters, and table-like records update immediately. Reduced-motion mode removes translation and rotation while preserving opacity or color state feedback.

Large catalogs, customers, and management records require paginated or virtualized native lists with stable row keys and image recycling. Do not port a DOM grid that renders every record.

## Mobile web baseline before native development

The standalone proposal now includes `viewport-fit=cover`, dynamic-viewport behavior, safe-area padding, 16px mobile fields, touch highlight removal, pointer-capability hover gating, immediate press feedback, controlled overscroll, and touch-axis ownership for the Taster. These changes make the responsive proposal a useful stepping stone and a stronger product test surface.

Real hardware remains required. Before calling the web experience mobile-ready, check iOS Safari and Android Chrome with:

- the software keyboard open on login, onboarding, message, price, and proposal fields;
- portrait and landscape orientations;
- a notched device and home indicator;
- VoiceOver or TalkBack, large text, and reduced motion;
- slow network, failed artwork image, app background/resume, and interrupted mutations;
- a device several years old, plus an iPad with both touch and trackpad.

## Decisions to make before implementation

1. Choose whether the first native release is collector-only or contains both collector and staff roles. Collector-only is the smaller, clearer first release.
2. Choose the native stack only after confirming the team’s operating and release model. The product architecture above does not require React Native, Expo, Flutter, or fully native code.
3. Define offline and draft guarantees per workflow before selecting storage technology.
4. Define push-notification events around real user value: proposal ready, advisor reply, and import completion. Avoid engagement notifications without a clear service event.
5. Audit every API for mobile session refresh, deep links, resumable uploads, backgrounding, and idempotent mutation behavior.

The prototype is a design proposal, not a claim that these native behaviors already exist.
