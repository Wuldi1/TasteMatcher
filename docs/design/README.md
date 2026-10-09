# TasteMatcher — private art advisory redesign

Design proposal and connected implementation, 6 October 2026. The brief is a complete page-by-page rethink for a prestigious service used by affluent collectors and their advisors. The standalone prototype remains the design reference; its system and mobile behavior are now integrated into the real React application while preserving the existing API contracts. Nothing has been deployed by this work.

## Review the proposal

Run from the repository root:

```sh
python3 -m http.server 4173 --bind 127.0.0.1 --directory docs/design/prototype
```

Open **http://localhost:4173/#/home**. Use the page selector to visit every proposed screen and the role selector to see collector, advisor, gallery-owner, and administrator navigation. The review controls are prototype tools, not proposed production navigation. The prototype uses hash routes to remain independent of the app's authentication and services. Session changes reset on reload. Forms, messages, import approval, invitations, and publication use local demonstrations only.

## The direction

The visual reference is a private art advisory and a thoughtfully composed exhibition catalog. Prestige comes from proportion, typography, accurate artwork presentation, and confidence in the service. The collector sees a personal gallery rather than a dashboard of software features.

Warm ivory and mineral neutrals form the canvas. Deep ink carries text; moss anchors primary actions; brass appears sparingly in rules and small labels. Editorial serif headings pair with a precise sans-serif for controls and data. Artwork keeps its natural proportions. The interface remains quiet enough for very different artists and palettes to coexist.

Collectors receive generous spacing, focused choices, a private viewing presentation, and an easily reached specialist. Staff receive efficient record tables, useful status hierarchies, a curation workspace, and explicit review steps. Those are different compositions within one visual language.

## Every page, reconsidered

| Current page / variant         | Proposed page structure                                                                                         | Main objective preserved                                            |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Login and access requests      | Art-led welcome, narrow task-specific form, discreet diagnostics; code and both request branches                | Authenticate or request the correct access                          |
| Onboarding, four steps         | Named steps with contextual explanation, clear selections, image previews, deliberate save states               | Capture and revisit taste, collection, and inspiration              |
| Collector Home                 | Personal welcome, artwork-led next step, private viewing summary, specialist conversation, compact taste record | Continue discovery and communicate with the advisor                 |
| Staff Home                     | Compact workload summary, actionable proposal records, intake and activity sections                             | Find the next piece of gallery work                                 |
| Catalog, collector and staff   | Open artwork gallery with compact filters; staff inventory-table alternative and contextual bulk controls       | Find, inspect, react to, and manage artwork                         |
| Taster                         | One generous viewing stage with two labelled responses and unobtrusive progress                                 | Collect honest taste preferences quickly                            |
| AI Suggestions                 | Image-led selection; progressive feedback; seller-only recommendation evidence                                  | Evaluate recommendations and refine taste or curate                 |
| Sales customer list            | Scannable collector directory with separate proposal, engagement, and follow-up columns                         | Find a collector and open the relevant work                         |
| Sales customer detail          | Collector record and proposal workspace with context available alongside the work                               | Understand the collector and manage the relationship                |
| Proposal composer, five steps  | Full-page sequence: collector, select, curate, presentation, review/share                                       | Preserve draft, pricing, presentation, and publication distinctions |
| Buying Proposal                | Private viewing room with per-work decisions, notes, and an explicit update action                              | Review and respond to a curated proposal                            |
| Upload                         | Artwork preparation workspace with image and structured metadata side by side                                   | Upload one correctly described work                                 |
| Automatic Uploads              | Source entry, inspectable lot table, editing, explicit approval, separate partial results                       | Review auction data before ingesting it                             |
| Management — Users             | Searchable directory and focused record dialogs                                                                 | Invite, edit, and administer permitted users                        |
| Management — Domains           | Compact gallery directory with clear context and editing                                                        | Administer galleries within existing permissions                    |
| Management — Domain Requests   | Read-only request inbox                                                                                         | Inspect the requests supported by today's app                       |
| Management — Customer Requests | Admin-only review flow                                                                                          | Process customer requests within existing permissions               |
| Email campaign wizard          | Compose, recipients, review, aggregate results                                                                  | Deliberately prepare and send to a reviewed audience                |
| Privacy and Terms              | Quiet reading layout, useful section navigation, unchanged legal text                                           | Make existing policies readable and accessible                      |

Detailed controls, layouts, role differences, edge states, responsive behavior, and Before/After/Why review tables are in:

- [Foundations, auth, onboarding, homes, legal](audit-foundations.md)
- [Catalog, discovery, sales, proposals, artwork dialogs](audit-discovery-sales.md)
- [Uploads, import review, management, campaign, shared controls](audit-operations.md)
- [Task brief and acceptance criteria](redesign-task-brief.md)
- [Mobile application path](mobile-application-path.md)
- [Final design and prototype review](final-review.md)
- [Production-connected implementation and validation](production-integration.md)
- [Production flow coverage checklist](flow-coverage.md)

The audit is the complete specification. The interactive prototype demonstrates the proposed compositions and representative flows; it is not a feature-complete replacement for the current application. Backend failures, long lists, true asynchronous persistence, gesture physics, and every permission combination require implementation and regression testing before release.

The responsive design is also a bridge to a future native application. The mobile path maps every major web pattern to native tabs, stacks, sheets, lists, safe-area actions, persistent drafts, and platform adapters. It recommends a collector-first initial native release while keeping web and mobile on the same domain contracts and semantic design tokens.

## Shared design decisions

| Element             | Proposed treatment                                                                               | Reason                                                                       |
| ------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| Canvas and surfaces | Ivory `#F6F4EF`, near-white `#FFFEFA`, mineral navigation                                        | Gives art a consistent, calm surrounding                                     |
| Text and action     | Ink `#242A25`, moss `#344D40`, secondary text `#666A61`                                          | Strong hierarchy without saturated blue/purple everywhere                    |
| Accent              | Brass `#8A6C3E` on small rules and labels                                                        | Restrained warmth, not ornamental gold on every control                      |
| Typography          | Georgia/system serif display; system sans controls; tabular figures                              | Editorial identity with readable operational data; no remote font dependency |
| Buttons             | One clear primary action per task; quiet secondary/tertiary actions; explicit destructive labels | Makes the decision understandable before interaction                         |
| Artwork             | Contained images, neutral mounts, no routine image zoom                                          | Respect the whole work and avoid misleading crops                            |
| Tables              | Semantic headings, consistent columns, restrained separators, text statuses                      | Supports comparison and efficient staff work                                 |
| Forms               | Visible labels, grouped sections, meaningful error/retry states, selected-state semantics        | Makes trust and reliability part of the visual experience                    |
| Motion              | 120ms pointer press; 180ms contextual dialog; instant frequent and keyboard actions              | Clear response without repeated spectacle                                    |
| Accessibility       | Native controls/dialog, visible focus, reduced motion, touch-sized actions, responsive layout    | Makes the intended experience usable across input modes                      |

The prototype intentionally introduces no external UI dependencies. When integrating production dialogs/popovers, assess accessible primitives against the existing stack rather than copying demonstration code without review. Reuse the app's current token names and formatting/contract utilities.

## Skill references

Reviewed the supplied [Emil Kowalski skills repository](https://github.com/emilkowalski/skills/tree/main/skills), snapshot `e8a175de22ae1e49370fc144c1f3bb9aeedf988d`. Applied the web-relevant design engineering, animation, animation review, improvement, and opportunity guidance to the audits and proposal. The mobile-native guidance shaped the future application path, including native navigation, safe-area actions, touch behavior, persistent drafts, image caching, and physical-device validation. The library and prototype skill scopes were inspected; no framework migration or multi-variant component exercise was necessary for this proposal.

The useful rules here are purpose before motion, immediate frequent interactions, precise transition properties, reduced-motion handling, visible feedback, and full-page decisions grounded in each task. These skills guide execution; the premium art-advisory direction comes from the user's brief.

## Artwork and sample data

The six local images are public-domain works from The Metropolitan Museum of Art, retrieved through its collection API. [artworks.js](prototype/artworks.js) contains the original record links, image URLs, credits, titles, media, and dimensions. They are visual stand-ins, not available inventory. All displayed prices and customer, proposal, and activity records are illustrative. Do not promote those records into production fixtures or present the amounts as valuations.

The actual app's sign-in screen was visually inspected. Authenticated page findings come from the checked-in source; no authenticated production walkthrough is claimed. The proposal itself is reviewed separately through the local browser and documented in the verification report. Production coverage is tracked route by route in the [flow checklist](flow-coverage.md).

## Implementation sequence after design review

1. Adopt tokens, navigation, accessible primitives, and shared states while keeping current routes and API contracts.
2. Integrate authentication, onboarding, and collector home; correct the collection deep link and visible save errors.
3. Integrate catalog, Taster, recommendations, and private viewing; preserve price privacy and seller-only signal visibility.
4. Integrate staff overview, collector workspace, and the five-step proposal workflow.
5. Integrate artwork intake, auction review, management, and campaign states.
6. Run role-specific regressions, keyboard/mobile testing, and visual verification before deployment.

No new backend claims are implied: recommendation signals are not purchase probabilities; proposal responses are not a checkout; import preview remains separate from approval; aggregate email results do not imply per-recipient retry support; management permissions remain as implemented.
