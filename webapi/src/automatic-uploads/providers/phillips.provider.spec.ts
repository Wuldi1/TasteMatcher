import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PhillipsProvider } from "./phillips.provider";

describe("PhillipsProvider", () => {
  const provider = new PhillipsProvider();
  const fixture = readFileSync(
    join(__dirname, "../__fixtures__/phillips-auction.html"),
    "utf8",
  );
  const detailFixture = readFileSync(
    join(__dirname, "../__fixtures__/phillips-lot-detail.html"),
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
        soldPriceText: "Sold for $6,350",
        soldPriceCurrency: "USD",
        soldPriceAmount: 6350,
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
    expect(resultForLegacy().source.soldPriceText).toBeUndefined();
  });

  it.each([
    ["HK$", "HKD"],
    ["A$", "AUD"],
    ["C$", "CAD"],
    ["S$", "SGD"],
  ])("does not treat %s amounts as USD", (symbol, currency) => {
    const localized = fixture
      .replace("$3,000–5,000", `${symbol}3,000–5,000`)
      .replace("Sold for $6,350", `Sold for ${symbol}6,350`);
    const result = provider.parse(localized, {
      sourceUrl: "https://www.phillips.com/auction/NY030826",
    }).drafts[0];

    expect(result.source).toMatchObject({
      originalEstimateCurrency: currency,
      soldPriceCurrency: currency,
    });
    expect(result.artwork.price).toBeUndefined();
    expect(result.artwork.maxPrice).toBeUndefined();
    expect(result.source.pricingConversionStatus).toBe("not_attempted");
  });

  it("enriches missing artwork cataloging fields from lot detail HTML", () => {
    const draft = resultForLegacy();
    const enriched = provider.enrichDraftFromLotDetail(draft, detailFixture);

    expect(enriched).not.toBe(draft);
    expect(enriched.artwork).toMatchObject({
      date: "1998",
      medium: "Unique oil painting, on panel.",
      height: 15.5,
      width: 19.5,
      signature: "Signed and dated lower right, framed.",
    });
    expect(enriched.issues).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "missing_date" }),
        expect.objectContaining({ code: "missing_medium" }),
        expect.objectContaining({ code: "missing_signature" }),
      ]),
    );
    expect(enriched.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "missing_description" }),
      ]),
    );
  });

  it("preserves a draft when detail cataloging is unavailable", () => {
    const draft = resultForLegacy();
    expect(
      provider.enrichDraftFromLotDetail(draft, "<html><body></body></html>"),
    ).toBe(draft);
  });

  it("preserves ordered cataloging slots when an earlier field is empty", () => {
    const draft = resultForLegacy();
    const enriched = provider.enrichDraftFromLotDetail(
      draft,
      `<section id="lot-cataloging-section">
        <div data-testid="html-parser"></div>
        <div data-testid="html-parser">Cast bronze</div>
      </section>`,
    );

    expect(enriched.artwork.date).toBe(draft.artwork.date);
    expect(enriched.artwork.medium).toBe("Cast bronze");
  });

  it("classifies cataloging fields when Phillips omits an optional row", () => {
    const draft = resultForLegacy();
    const enriched = provider.enrichDraftFromLotDetail(
      draft,
      `<section id="lot-cataloging-section">
        <div data-testid="html-parser">1998</div>
        <div data-testid="html-parser">15 1/2 x 19 1/2 in.</div>
        <div data-testid="html-parser">Signed lower right</div>
      </section>`,
    );

    expect(enriched.artwork).toMatchObject({
      date: "1998",
      height: 15.5,
      width: 19.5,
      signature: "Signed lower right",
    });
    expect(enriched.artwork.medium).toBe(draft.artwork.medium);
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
