import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PhillipsProvider } from "./phillips.provider";

describe("PhillipsProvider", () => {
  const provider = new PhillipsProvider();
  const fixture = readFileSync(
    join(__dirname, "../__fixtures__/phillips-auction.html"),
    "utf8",
  );

  it("parses current Phillips cards, JSON-LD, and the largest dist image", () => {
    const result = provider.parse(fixture, {
      sourceUrl: "https://www.phillips.com/auction/NY030826",
    });

    expect(result.source).toMatchObject({
      auctionCode: "NY030826",
      auctionTitle: "New York Editions",
      location: "New York",
      startsAt: "2026-04-23T19:00:00Z",
      endsAt: undefined,
    });
    expect(result.drafts).toHaveLength(2);
    expect(result.drafts[0]).toMatchObject({
      artwork: {
        title: "Blue Work",
        artist: "Ada Artist",
        price: 3000,
        maxPrice: 5000,
        endDate: undefined,
        isAuction: true,
        useForTaster: true,
        isPrivate: false,
        shouldDisplayPrice: false,
      },
      source: {
        sourceImageUrl: "https://dist.phillips.com/image-1600.jpg",
        originalEstimateText: "$3,000–5,000",
        pricingConversionStatus: "not_required",
        identity: { sourceLotNumber: "1" },
      },
    });
    expect(result.drafts[0].issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "missing_end_date", blocking: true }),
      ]),
    );
  });

  it("uses the legacy estimate fallback and does not convert GBP", () => {
    expect(resultForLegacy().source).toMatchObject({
      sourceImageUrl: "https://assets.phillips.com/legacy-large.jpg",
      originalEstimateCurrency: "GBP",
      originalEstimateLow: 2000,
      originalEstimateHigh: 3000,
      pricingConversionStatus: "not_attempted",
    });
    expect(resultForLegacy().artwork.price).toBeUndefined();
  });

  it("accepts singular and plural Phillips auction paths", () => {
    expect(
      provider.canParse(new URL("https://www.phillips.com/auction/NY030826")),
    ).toBe(true);
    expect(
      provider.canParse(new URL("https://phillips.com/auctions/UK010126")),
    ).toBe(true);
  });

  function resultForLegacy() {
    return provider.parse(fixture, {
      sourceUrl: "https://www.phillips.com/auction/NY030826",
    }).drafts[1];
  }
});
