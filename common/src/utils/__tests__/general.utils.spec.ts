import { describe, expect, it } from "vitest";
import { Artwork } from "../../types/artwork.types";
import { cleanupArtworkBeforeResponseToClient } from "../general.utils";

const hiddenPriceArtwork = {
  id: "artwork-1",
  domainId: "domain-1",
  type: "artwork",
  title: "Private estimate",
  filename: "artwork.jpg",
  price: 10_000,
  maxPrice: 15_000,
  shouldDisplayPrice: false,
} as Artwork;

describe("cleanupArtworkBeforeResponseToClient", () => {
  it("removes the complete hidden price range from customer responses", () => {
    const result = cleanupArtworkBeforeResponseToClient(
      hiddenPriceArtwork,
      "customer",
    );

    expect(result).not.toHaveProperty("price");
    expect(result).not.toHaveProperty("maxPrice");
  });

  it("preserves hidden pricing for staff roles", () => {
    for (const role of ["dealer", "domain_owner", "global_admin"] as const) {
      expect(
        cleanupArtworkBeforeResponseToClient(hiddenPriceArtwork, role),
      ).toMatchObject({ price: 10_000, maxPrice: 15_000 });
    }
  });

  it("preserves public pricing for customers", () => {
    const result = cleanupArtworkBeforeResponseToClient(
      { ...hiddenPriceArtwork, shouldDisplayPrice: true },
      "customer",
    );

    expect(result).toMatchObject({ price: 10_000, maxPrice: 15_000 });
  });
});
