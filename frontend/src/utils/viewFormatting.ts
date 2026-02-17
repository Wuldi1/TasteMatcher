import type { Currency, DimensionUnit } from "../contexts/ViewerPreferencesContext";

export const USD_TO_EUR_RATE = 0.92;
export const USD_TO_GBP_RATE = 0.79;
const INCH_TO_CM = 2.54;

const toDisplayCurrency = (usdValue: number, currency: Currency): number => {
  if (currency === "EUR") {
    return usdValue * USD_TO_EUR_RATE;
  }
  if (currency === "GBP") {
    return usdValue * USD_TO_GBP_RATE;
  }
  return usdValue;
};

export const convertPriceFromCurrencyToUsd = (
  value: number,
  currency: Currency,
): number => {
  if (currency === "EUR") {
    return value / USD_TO_EUR_RATE;
  }
  if (currency === "GBP") {
    return value / USD_TO_GBP_RATE;
  }
  return value;
};

export const getCurrencySymbol = (currency: Currency): string => {
  if (currency === "EUR") return "€";
  if (currency === "GBP") return "£";
  return "$";
};

const formatDimensionNumber = (value: number): string => {
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
};

export const formatPriceForViewer = (
  usdValue: number | undefined,
  currency: Currency,
): string => {
  if (usdValue === undefined || Number.isNaN(usdValue)) {
    return "—";
  }

  const displayValue = toDisplayCurrency(usdValue, currency);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(displayValue);
};

export const formatPriceRangeForViewer = (
  minUsd: number | undefined,
  maxUsd: number | undefined,
  currency: Currency,
): string => {
  const minDisplay = formatPriceForViewer(minUsd, currency);
  const maxDisplay = formatPriceForViewer(maxUsd, currency);

  if (minDisplay === "—" && maxDisplay === "—") {
    return "—";
  }
  if (maxDisplay === "—") {
    return minDisplay;
  }
  return `${minDisplay} → ${maxDisplay}`;
};

const convertInchesToUnit = (inches: number, unit: DimensionUnit): number =>
  unit === "cm" ? inches * INCH_TO_CM : inches;

export const formatDimensionsForViewer = (
  widthIn?: number,
  heightIn?: number,
  depthIn?: number,
  unit: DimensionUnit = "in",
): string => {
  if (
    widthIn === undefined &&
    heightIn === undefined &&
    depthIn === undefined
  ) {
    return "—";
  }

  const width =
    widthIn !== undefined ? formatDimensionNumber(convertInchesToUnit(widthIn, unit)) : "-";
  const height =
    heightIn !== undefined
      ? formatDimensionNumber(convertInchesToUnit(heightIn, unit))
      : "-";
  const depth =
    depthIn !== undefined
      ? ` × ${formatDimensionNumber(convertInchesToUnit(depthIn, unit))}`
      : "";

  return `${width} × ${height}${depth} ${unit}`;
};
