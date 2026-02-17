import {
  convertPriceFromCurrencyToUsd,
  formatDimensionsForViewer,
  formatPriceForViewer,
  formatPriceRangeForViewer,
} from "./viewFormatting";

describe("viewFormatting", () => {
  it("formats USD values without conversion", () => {
    expect(formatPriceForViewer(1000, "USD")).toBe("$1,000");
  });

  it("formats EUR and GBP using hard-coded conversion", () => {
    expect(formatPriceForViewer(1000, "EUR")).toBe("€920");
    expect(formatPriceForViewer(1000, "GBP")).toBe("£790");
  });

  it("converts entered prices back to USD for storage", () => {
    expect(convertPriceFromCurrencyToUsd(920, "EUR")).toBe(1000);
    expect(convertPriceFromCurrencyToUsd(790, "GBP")).toBe(1000);
    expect(convertPriceFromCurrencyToUsd(1000, "USD")).toBe(1000);
  });

  it("formats price ranges", () => {
    expect(formatPriceRangeForViewer(1000, 2000, "USD")).toBe(
      "$1,000 → $2,000",
    );
    expect(formatPriceRangeForViewer(undefined, 2000, "USD")).toBe(
      "— → $2,000",
    );
  });

  it("formats dimensions in inches and centimeters", () => {
    expect(formatDimensionsForViewer(10, 20, 2, "in")).toBe("10 × 20 × 2 in");
    expect(formatDimensionsForViewer(10, 20, 2, "cm")).toBe(
      "25.40 × 50.80 × 5.08 cm",
    );
  });

  it("returns dash when dimensions are empty", () => {
    expect(formatDimensionsForViewer(undefined, undefined, undefined, "in")).toBe(
      "—",
    );
  });
});
