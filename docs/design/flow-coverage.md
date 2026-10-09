# Production flow redesign coverage

This checklist records the production surfaces covered by the premium redesign. A
flow is complete only when its real API behavior is preserved, its primary and
edge states use the shared visual language, and its narrow-screen behavior has
been reviewed. Global color replacement alone does not count as a page-level
redesign.

## Public and account flows

| Flow                              | Production entry                        | Required states                                                                                                  |
| --------------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Login and access request          | `/`, `/login`                           | Email, verification code, resend/error, unknown account, collector request, gallery request, both success states |
| Onboarding and profile            | `/onboarding`                           | Four steps, saved selection, upload progress/error, completion/error, edit mode, narrow footer                   |
| Account and display settings      | `/settings`                             | Identity summary, profile editing entry, currency, dimensions, support, legal links, sign out                    |
| Privacy policy                    | `/privacy-policy`                       | Section navigation, readable document, contact link, legal cross-links, print layout                             |
| Terms of service                  | `/terms-of-service`                     | Section navigation, readable document, contact link, legal cross-links, print layout                             |
| Route initialization and fallback | Protected/public route wrappers and `*` | Branded loading, access denial redirect, useful not-found destination                                            |

## Collector flows

| Flow                      | Production entry   | Required states                                                                                   |
| ------------------------- | ------------------ | ------------------------------------------------------------------------------------------------- |
| Home                      | `/home`            | Personalized data, incomplete onboarding, collection entry, proposal summary, empty states        |
| Taster                    | `/taster`          | Loading, artwork, touch/drag/keyboard decisions, vertical scrolling, save failure, complete/empty |
| AI suggestions            | `/ai-suggestions`  | Eligibility lock, loading, recommendations, feedback, empty/error, artwork detail                 |
| Catalog and taste history | `/catalog`         | Gallery, liked/disliked deep links, filters, loading/empty/error, artwork detail                  |
| Buying proposal           | `/buying-proposal` | Loading, missing/error, artwork decisions, comments, staged update, success/failure               |

## Staff flows

| Flow                       | Production entry     | Required states                                                                       |
| -------------------------- | -------------------- | ------------------------------------------------------------------------------------- |
| Home                       | `/home`              | Workload summary, activity, proposals, onboarding/empty states                        |
| Catalog and artwork detail | `/catalog`           | Grid, filters, bulk selection, feedback, edit/delete, loading/empty/error             |
| Manual upload              | `/upload`            | Image, metadata, validation, auction fields, progress, success/error                  |
| Automatic uploads          | `/automatic-uploads` | Source/import, preview, draft editing, issue states, approval, partial results        |
| Sales directory            | `/sales`             | Search/list, engagement, proposal and follow-up status, empty/error                   |
| Collector sales workspace  | `/sales/:userId`     | Profile, questionnaire, conversation, proposal history, images, loading/error         |
| Proposal composer          | Sales workspace      | Collector, selection, curation, presentation, review/share, draft and failure states  |
| Management                 | `/management`        | Users, domains, domain requests, customer requests, dialogs, permissions, empty/error |
| Email campaign             | Management           | Compose, audience, preview, send, aggregate result, failure                           |

## Email flows

| Email                             | Sender                                    |
| --------------------------------- | ----------------------------------------- |
| Login verification                | Web API email service                     |
| User/gallery invitation           | Web API email service                     |
| Customer proposal notification    | Web API email service                     |
| Proposal activity digest          | Web API email service                     |
| Management campaign               | Management wizard and Web API passthrough |
| New artwork match                 | New-artwork Azure Function                |
| Daily gallery-owner summary       | Daily-summary Azure Function              |
| Auction PDF success/failure reply | Gmail intake script                       |

All email HTML uses email-safe layout, the ivory/ink/moss/brass palette, escaped
dynamic values, a canonical public origin, and Privacy and Terms links. Marketing
preference or unsubscribe behavior remains a separate product/API requirement
until the application has a notification-preference contract.

## Verification boundary

Automated checks cover contracts, rendering branches, responsive CSS, and touch
gesture logic. Browser viewport review covers common phone and tablet sizes. A
physical-device pass remains required for iOS Safari and Android Chrome browser
chrome, safe areas, virtual keyboards, VoiceOver, TalkBack, and gesture feel.
