import { BadRequestException } from "@nestjs/common";
import {
  parseApprovalDraft,
  parseApprovalRequest,
} from "./automatic-upload.validation";

describe("parseApprovalRequest", () => {
  const request = (draftCount: number) => ({
    provider: "phillips",
    sourceUrl: "https://www.phillips.com/auction/NY030826",
    drafts: Array.from({ length: draftCount }, (_, index) => ({
      draftId: `draft-${index + 1}`,
    })),
  });

  const draft = () => ({
    draftId: "draft-1",
    source: {
      identity: {
        provider: "phillips",
        sourceAuctionUrl: "https://www.phillips.com/auction/NY030826",
        sourceLotNumber: "1",
      },
      pricingConversionStatus: "not_required",
    },
    artwork: {
      title: "Untitled",
      description: "",
      artist: "Artist",
      isAuction: true,
      shouldDisplayPrice: false,
      useForTaster: false,
      isPrivate: false,
      tags: [],
    },
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

  it.each([
    ["omitted", undefined],
    ["empty", ""],
    ["populated", "2024"],
  ])("accepts an %s optional artwork date", (_label, date) => {
    const value = draft();
    if (date !== undefined) Object.assign(value.artwork, { date });

    expect(
      parseApprovalDraft(
        value,
        0,
        "https://www.phillips.com/auction/NY030826",
        "phillips",
      ),
    ).toMatchObject({
      valid: true,
      draft: { artwork: { date } },
    });
  });

  it.each([null, 2024, [], {}])(
    "rejects malformed artwork date value %#",
    (date) => {
      const value = draft();
      Object.assign(value.artwork, { date });

      expect(
        parseApprovalDraft(
          value,
          0,
          "https://www.phillips.com/auction/NY030826",
          "phillips",
        ),
      ).toMatchObject({
        valid: false,
        draftId: "draft-1",
        message: "drafts[0].artwork.date must be a valid string.",
      });
    },
  );
});
