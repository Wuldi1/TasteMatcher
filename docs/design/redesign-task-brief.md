# TasteMatcher redesign task brief

## Objective

User refinement: the experience should feel prestigious and premium for affluent collectors. The chosen direction is a private art advisory: editorial type, generous art presentation, ivory and ink, restrained brass details, and discreet personal service.

Future direction: the system should convert cleanly into a native mobile application. Responsive screens must establish mobile information hierarchy, touch behavior, safe areas, resumable drafts, and platform-neutral design tokens without assuming the eventual native framework.

Propose a coherent, page-by-page redesign of TasteMatcher that preserves each workflow's purpose and existing data/actions while reconsidering page composition, navigation, typography, colors, controls, tables, artwork presentation, and motion. Deliver a reviewable visual proposal plus an evidence-based audit; distinguish proposed interactions from implemented production functionality.

## Scope

- In scope: all routed pages, customer/dealer/domain-owner/global-admin variants, authentication phases, onboarding steps, dialogs, artwork details, sales workspace tabs, management tabs, loading/error/empty/permission states, desktop and mobile navigation.
- In scope: the principles in Emil Kowalski's linked skills, especially intentional motion, responsive press feedback, clear state transitions, accessible controls, and realistic content stress cases.
- Out of scope for this proposal: changing authentication, API contracts, role permissions, recommendation algorithms, commercial terms, legal policy wording, or live user/gallery data. No deployment or real messages are needed to review a proposal.

## Acceptance criteria

1. Every route below has a named proposed screen or explicit variant; high-value child flows are not hidden behind a generic component redesign.
2. Each audit describes the preserved job, evidence from current source, proposed page hierarchy, action hierarchy, mobile behavior, and meaningful states.
3. Proposed screens emphasize artworks and decisions using consistent foundations; administrative tables remain information-dense and usable.
4. All prototype data is visibly identified as sample data; prototype controls never imply that real proposals, invitations, uploads, or messages have been sent.
5. Motion has a purpose, a timing/easing choice, and a reduced-motion behavior. Navigation, rapid filtering, and keyboard actions stay immediate.
6. Review covers keyboard focus, accessible control names, dialogs, narrow widths, long titles/names, missing imagery, unavailable values, and empty/error states.
7. Implementation scope and validation claims clearly distinguish source review, prototype verification, and production behavior testing.

## Route and variant inventory

The route map comes from `frontend/src/routes/AppRoutes.tsx`; menu audiences come from `frontend/src/constants/navigation.ts`. A hidden menu link is not itself a route authorization rule. Most routes use the generic authenticated guard; Automatic Uploads also has an explicit owner/admin guard. Preserve server authorization and evaluate page guards separately during implementation.

| Route                   | Preserved purpose                                                  | Variants and required review surfaces                                                                                                                                                       |
| ----------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`, `/login`           | Email-code sign-in and access requests                             | Email; verification code/resend/change email; unknown account; customer request/success; gallery request/success; loading/error; signed-in redirect                                         |
| `/privacy-policy`       | Read privacy policy                                                | Public document, section navigation, effective date, contact, legal cross-link                                                                                                              |
| `/terms-of-service`     | Read service terms                                                 | Public document, section navigation, effective date, contact, legal cross-link                                                                                                              |
| `/onboarding`           | Capture and edit collector preferences                             | Four steps: Basic Info; art interests; collection status/images; aesthetic text/images. Save/skip/upload/finalization states and existing-answer editing                                    |
| `/home` — customer      | Resume discovery, understand progress, communicate with specialist | Unstarted/in-progress onboarding redirect; skipped/completed profile; below/above recommendation eligibility; proposal absent/present; likes/dislikes; shared gallery; comments/attachments |
| `/home` — dealer        | Manage proposals and inventory                                     | Dealer-scoped proposals, pending/accepted counts, recent uploads, recent proposals                                                                                                          |
| `/home` — domain owner  | Oversee gallery activity                                           | Dealer dashboard plus seven-day user activity table                                                                                                                                         |
| `/home` — global admin  | Inspect gallery activity                                           | Owner dashboard variant with domain picker for activity summary; do not imply that this picker scopes every dashboard metric                                                                |
| `/catalog`              | Browse and inspect art                                             | Dealer/owner management; admin domain selection; customer liked/disliked views (`?view=liked`, `?view=disliked`); filters; selection/bulk actions; artwork detail/edit overlays             |
| `/taster`               | Capture preference signals                                         | Active art evaluation, information/details, progress, no untasted art, completion, initial guidance, loading/error                                                                          |
| `/ai-suggestions`       | Review personalized recommendations                                | Customer eligibility lock/explanation; available recommendations; detail/reasoning; customer interactions; staff conditional controls present in source                                     |
| `/upload`               | Add artworks and metadata                                          | Upload modes, image/data entry, validation, progress/results, correction/retry                                                                                                              |
| `/automatic-uploads`    | Preview, review, and approve auction intake                        | Domain owner/global admin, provider tabs, target gallery, preview queue, lot review, selection, approval/result states                                                                      |
| `/sales`                | Find and work with customers                                       | Dealer/owner customer list; global-admin domain selector; filtering/sorting/customer selection                                                                                              |
| `/sales/:userId`        | Curate and manage a customer's sale                                | Customer identity/context; details/profile/messages; catalog/recommendation selection; proposal editing/review; send-related states                                                         |
| `/buying-proposal`      | Review proposed artworks and respond                               | Customer proposal, item decisions/comments, pricing/details, empty/loading/error; shared proposal presentation                                                                              |
| `/management`           | Administer access and gallery membership                           | Dealer/owner Users tab; admin Domains, Users, Domain Requests, Customer Requests tabs; invite/edit/assignment dialogs; email wizard                                                         |
| Unknown route           | Recover gracefully                                                 | Existing redirect to `/`; propose a clearly explained recovery state only if routing behavior is intentionally changed                                                                      |
| Shared protected layout | Move between permitted workflows                                   | Expanded/collapsed desktop rail; mobile navigation; viewer currency/dimension preferences; user/profile/logout; introductory tour; AI eligibility feedback                                  |

## Constraints

- Technical: existing React/TypeScript architecture and `common` contracts remain the implementation baseline. Demo calculations cannot substitute for actual recommendation/price/status semantics.
- Product: retain role distinctions, proposal item responses, explicit import review, gallery scope, currency/dimension preferences, and all access-request branches.
- Content: use real source facts in audit; sample artwork/customer information in prototype must remain demonstrative.
- Safety: do not send communications, edit live records, import works, or publish the proposal while reviewing UI.
- Working tree: preserve unrelated `.azure/plan.md` and `.gitignore` changes.

## Suggested agent plan

1. Planner maps routes and audits foundations, auth, onboarding, home, and legal.
2. Independent review owners audit collector discovery and gallery operations.
3. Final owner builds one coherent visual proposal covering pages and variants.
4. Review pass checks coverage, behavior preservation, source accuracy, accessibility, and prototype claims.
5. Documentation records proposal choices, remaining implementation work, and verification actually performed.

## Files likely affected

- `docs/design/redesign-task-brief.md`
- `docs/design/audit-foundations.md`
- Other page-family audit documents and a standalone prototype artifact.
- Production implementation, if undertaken, will touch page components, shared layout, global styles, and behavior tests; no cross-package changes are expected purely for presentation.

## Validation commands

- `rg -n 'path=' frontend/src/routes/AppRoutes.tsx`
- `rg -n 'roles:|href:' frontend/src/constants/navigation.ts`
- `git diff --check`
- Inspect prototype at desktop and narrow mobile sizes; keyboard through primary flow and overlays; test reduced motion and representative state controls.
- If production code changes, run existing focused tests for affected routes/pages and the frontend build, rather than claiming prototype checks validate production behavior.

## Risks

- A visually unified redesign can erase role distinctions: retain explicit per-page variants and controls.
- Art cropping can distort the central product: contain art in discovery/detail contexts and label purposeful thumbnail crops.
- Dashboard enhancements can imply unavailable data: use existing counts, proposals, comments, and activity only; mark any future features separately.
- Gallery selector scope differs between pages today: label the scope honestly rather than presenting a misleading global workspace switch.
- Static source review cannot prove visual defects on a live account: label inferred layout risks and record browser verification separately.
