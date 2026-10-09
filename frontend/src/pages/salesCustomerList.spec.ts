import type { Proposal } from "@tastematcher/common";
import {
  buildSalesCustomerList,
  canLoadSalesCustomerStats,
} from "./salesCustomerList";

const makeProposal = (
  userId: string,
  status: Proposal["status"],
  updatedAt: number,
): Proposal => ({
  id: `${userId}-${status}-${updatedAt}`,
  type: "proposal",
  domainId: "domain-1",
  userId,
  items: [],
  status,
  generalComments: [],
  createdAt: updatedAt,
  updatedAt,
});

describe("buildSalesCustomerList", () => {
  it("includes every customer and orders them by actionable proposal status", () => {
    const result = buildSalesCustomerList(
      [
        { id: "no-proposal", name: "No Proposal", email: "none@example.com" },
        { id: "accepted", name: "Accepted", email: "accepted@example.com" },
        { id: "draft", name: "Draft", email: "draft@example.com" },
        { id: "submitted", name: "Submitted", email: "submitted@example.com" },
      ],
      [
        makeProposal("accepted", "accepted", 200),
        makeProposal("draft", "draft", 300),
        makeProposal("submitted", "submitted", 100),
      ],
    );

    expect(result.map((item) => item.customer.id)).toEqual([
      "submitted",
      "draft",
      "accepted",
      "no-proposal",
    ]);
  });

  it("uses the highest-priority proposal when a customer has proposal history", () => {
    const [result] = buildSalesCustomerList(
      [{ id: "customer-1", name: "Collector", email: "collector@example.com" }],
      [
        makeProposal("customer-1", "accepted", 500),
        makeProposal("customer-1", "draft", 100),
      ],
    );

    expect(result.proposalStatus).toBe("draft");
    expect(result.proposal?.status).toBe("draft");
  });
});

describe("canLoadSalesCustomerStats", () => {
  it("waits for a customer before loading cross-domain global-admin stats", () => {
    expect(canLoadSalesCustomerStats("domain-1", undefined, true)).toBe(false);
    expect(canLoadSalesCustomerStats("domain-1", "customer-1", true)).toBe(
      true,
    );
  });

  it("allows a domain user to load their own implicit stats", () => {
    expect(canLoadSalesCustomerStats("domain-1", undefined, false)).toBe(true);
    expect(canLoadSalesCustomerStats(undefined, "customer-1", false)).toBe(
      false,
    );
  });
});
