import { ProductActivityLoggerService } from "./product-activity-logger.service";

describe("ProductActivityLoggerService", () => {
  it("writes a compact structured stdout event without identifiers or content", () => {
    const consoleSpy = jest.spyOn(console, "log").mockImplementation();
    const service = new ProductActivityLoggerService();

    service.log("proposal.status_changed", {
      actorRole: "dealer",
      previousProposalStatus: "draft",
      proposalStatus: "submitted",
    });

    expect(consoleSpy).toHaveBeenCalledWith(
      JSON.stringify({
        event: "product_activity",
        eventName: "proposal.status_changed",
        count: 1,
        actorRole: "dealer",
        previousProposalStatus: "draft",
        proposalStatus: "submitted",
      }),
    );
    consoleSpy.mockRestore();
  });
});
