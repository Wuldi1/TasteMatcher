import type { Domain, User } from "@tastematcher/common";
import { buildEmailContent } from "./DailyDomainOwnerSummary";

describe("DailyDomainOwnerSummary email", () => {
  it("renders the premium shell, legal links, and escaped collector data", () => {
    const domain = {
      id: "domain-1",
      name: "House & Gallery",
    } as Domain;
    const owner = {
      id: "owner-1",
      name: "Avery",
      email: "owner@example.com",
    } as User;
    const collector = {
      id: "collector-1",
      domainId: "domain-1",
      name: "<Collector>",
      email: "collector@example.com",
      role: "customer",
      status: "active",
      onboardingStatus: "completed",
      comments: [],
      swipeCount: 0,
    } as User;

    const content = buildEmailContent({
      domain,
      owner,
      users: [collector],
      preferenceStats: new Map(),
      proposalStats: new Map(),
      nowEligibleUserIds: new Set(),
      recentProposalUpdates: [],
      since: Date.now() - 86_400_000,
    });

    expect(content.html).toContain("background:#f6f4ef");
    expect(content.html).toContain("background:#23372d");
    expect(content.html).toContain("House &amp; Gallery");
    expect(content.html).toContain("&lt;Collector&gt;");
    expect(content.html).not.toContain("<Collector>");
    expect(content.html).toContain("/privacy-policy");
    expect(content.html).toContain("/terms-of-service");
  });
});
