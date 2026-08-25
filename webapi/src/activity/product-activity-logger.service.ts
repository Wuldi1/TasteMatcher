import { Injectable } from "@nestjs/common";

/**
 * Emits a small, intentionally anonymous event for production operations
 * reporting. These records are collected from stdout by Container Apps; do
 * not add ids, emails, names, URLs, artwork metadata, or comment text here.
 */
export type ProductActivityAction =
  | "user.login_succeeded"
  | "gallery.created"
  | "user.invited"
  | "artwork.created"
  | "artwork.preference_liked"
  | "artwork.preference_unliked"
  | "artwork.comment_added"
  | "proposal.created"
  | "proposal.status_changed"
  | "proposal.comment_added"
  | "user.comment_added"
  | "auction.import_completed";

type ProductActivityProperties = Readonly<
  Partial<{
    actorRole: string;
    source: "manual" | "automatic";
    proposalStatus: string;
    previousProposalStatus: string;
    provider: string;
    count: number;
    skippedCount: number;
    failedCount: number;
  }>
>;

@Injectable()
export class ProductActivityLoggerService {
  log(eventName: ProductActivityAction, properties: ProductActivityProperties = {}): void {
    // Keep this schema flat and stable so Log Analytics queries can aggregate it.
    // console.log is used deliberately: it is captured by Container App stdout.
    console.log(
      JSON.stringify({
        event: "product_activity",
        eventName,
        count: 1,
        ...properties,
      }),
    );
  }
}
