export type DomainActivityType =
  | "user_login"
  | "user_swipe"
  | "proposal_updated"
  | "artwork_liked"
  | "artwork_disliked"
  | "artwork_comment";

export interface DomainActivityEvent {
  id: string;
  type: "domainActivity";
  domainId: string;
  ttl?: number;
  activityType: DomainActivityType;
  userId: string;
  userEmail?: string;
  createdAt: number;
  metadata?: Record<string, unknown>;
}

export interface DomainActivitySummaryRow {
  userId: string;
  userName?: string;
  userEmail?: string;
  loginTimestamps: number[];
  swipes: number;
  proposalUpdates: number;
  likes: number;
  dislikes: number;
  artworkComments: number;
  lastActivityAt: number;
}

export interface DomainActivitySummaryResponse {
  since: number;
  until: number;
  rows: DomainActivitySummaryRow[];
  totals: {
    loginEvents: number;
    swipes: number;
    proposalUpdates: number;
    likes: number;
    dislikes: number;
    artworkComments: number;
  };
}
