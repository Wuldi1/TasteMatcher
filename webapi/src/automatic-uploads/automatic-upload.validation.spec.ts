import { BadRequestException } from "@nestjs/common";
import { parseApprovalRequest } from "./automatic-upload.validation";

describe("parseApprovalRequest", () => {
  const request = (draftCount: number) => ({
    provider: "phillips",
    sourceUrl: "https://www.phillips.com/auction/NY030826",
    drafts: Array.from({ length: draftCount }, (_, index) => ({
      draftId: `draft-${index + 1}`,
    })),
  });

  it("accepts an approval envelope containing 20 raw drafts", () => {
    const result = parseApprovalRequest(request(20));
    expect(result.drafts).toHaveLength(20);
  });

  it("rejects an approval envelope containing 21 drafts", () => {
    expect(() => parseApprovalRequest(request(21))).toThrow(
      new BadRequestException("A maximum of 20 drafts may be approved."),
    );
  });
});
