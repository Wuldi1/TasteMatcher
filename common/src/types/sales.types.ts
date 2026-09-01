// ---------- CODEGEN CHECKLIST (must be satisfied) ----------
// 1. Uses TypeScript strict types (no `any`). If any `any` present, justify with comment.
// 2. Uses shared `common` types for API contracts where applicable.
// 3. Includes unit tests written first (test file present next to implementation).
// 4. Adds structured logging at function entry/exit and on errors.
// 5. Adds at least one assertion or guard for input validation.
// 6. No duplicate logic — reuse existing service/util or extract shared module.
// 7. Adds or updates README or docs if public API changes.
// 8. Adds meaningful JSDoc for exported functions/classes.
// 9. CI-friendly: code passes lint, typecheck, and tests locally.\
// 10. Frontend-specific: UI changes must be responsive (mobile + desktop) and smooth (no visual regressions). Include accessibility considerations (semantic markup, aria attributes, keyboard navigation, focus management) and automated accessibility checks (axe, Playwright/accessibility audit) where applicable.
// -----------------------------------------------------------

export type ProposalStatus = "draft" | "submitted" | "accepted" | "rejected";
export type ProposalItemStatus = "pending" | "approved" | "rejected";

export type Comment = {
  author: string;
  text: string;
  createdAt: number;
};

export type ProposalItem = {
  artworkId: string;
  comments: Comment[];
  status: ProposalItemStatus;
  askedPrice: number;
  askedMaxPrice?: number;
};

export interface GenerateProposalDraftRequest {
  userId: string;
  limit?: number;
  includeLikedOnly?: boolean;
}

export interface GeneratedProposalDraft {
  userId: string;
  items: ProposalItem[];
  metadata: Record<string, unknown>;
  generalComments: Comment[];
  status: "draft";
}

export interface ProposalGenerationEligibility {
  userId: string;
  isEligible: boolean;
  reasons: string[];
  onboardingCompleted: boolean;
  swipeCount: number;
  minimumSwipeCount: number;
  preferenceVectorReady: boolean;
  activeAuctionRecommendationCount: number;
}

export type ProposalWorkflowStage =
  | "drafting"
  | "ready_to_review"
  | "sent"
  | "viewed"
  | "responded"
  | "negotiating"
  | "won"
  | "lost";

export type ProposalTemplateId =
  | "first_introduction"
  | "auction_opportunity"
  | "budget_shortlist"
  | "follow_up";

export interface ProposalSalesWorkflow {
  stage: ProposalWorkflowStage;
  templateId?: ProposalTemplateId;
  budgetMinimum?: number;
  budgetMaximum?: number;
  priorityArtworkIds?: string[];
  nextFollowUpAt?: number;
  lastCustomerActivityAt?: number;
}

export type ProposalEngagementEventType = "opened" | "artwork_viewed";

export interface RecordProposalEngagementRequest {
  event: ProposalEngagementEventType;
  artworkId?: string;
}

export interface ProposalEngagement {
  viewCount: number;
  firstViewedAt?: number;
  lastViewedAt?: number;
  viewedArtworkIds: string[];
  lastCustomerActivityAt?: number;
}

export interface Proposal {
  id: string;
  type: "proposal";
  domainId: string;
  userId: string; // customer / owner of artworks
  dealerId?: string; // who created the proposal
  items: ProposalItem[]; // list of artwork IDs
  status: ProposalStatus;
  generalComments: Comment[];
  createdAt: number;
  updatedAt?: number;
  submittedAt?: number;
  metadata?: Record<string, unknown>;
}
