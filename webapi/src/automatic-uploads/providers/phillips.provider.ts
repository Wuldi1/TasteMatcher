import { Injectable } from "@nestjs/common";
import {
  AutomaticUploadArtworkDraftIssue,
  AutomaticUploadBatchIssue,
  AutomaticUploadEditableArtworkInput,
  AutomaticUploadPreviewResponse,
  AutomaticUploadPricingConversionStatus,
} from "@tastematcher/common";
import { load } from "cheerio";
import {
  AutomaticUploadParseContext,
  AutomaticUploadProviderAdapter,
} from "./automatic-upload-provider.interface";

const SOURCE_HOSTS = new Set(["phillips.com", "www.phillips.com"]);
const IMAGE_HOSTS = new Set(["assets.phillips.com", "dist.phillips.com"]);

interface ParsedEstimate {
  text?: string;
  currency?: string;
  low?: number;
  high?: number;
}

interface SchemaEvent {
  name?: string;
  url?: string;
  startDate?: string;
  endDate?: string;
  location?: string;
}

/** Pure Phillips HTML parser. It performs no network or persistence work. */
@Injectable()
export class PhillipsProvider implements AutomaticUploadProviderAdapter {
  readonly provider = "phillips" as const;

  canParse(url: URL): boolean {
    return (
      SOURCE_HOSTS.has(url.hostname.toLowerCase()) &&
      /^\/auctions?\/[A-Za-z0-9_-]+\/?$/i.test(url.pathname)
    );
  }

  parse(
    html: string,
    context: AutomaticUploadParseContext,
  ): AutomaticUploadPreviewResponse {
    const $ = load(html);
    const schemaEvent = this.extractSchemaEvent($);
    const canonical =
      this.allowedSourceUrl(schemaEvent.url) ?? context.sourceUrl;
    const auctionCode = this.extractAuctionCode(canonical, html);
    const auctionTitle =
      this.normalize(schemaEvent.name) ||
      this.normalize($("h1").first().text()) ||
      this.normalize($("title").first().text()).replace(
        /\s*\|\s*Phillips.*$/i,
        "",
      ) ||
      undefined;
    const cards = $("a.seldon-object-tile.pah-lot-object-tile").toArray();
    const issues: AutomaticUploadBatchIssue[] = [];
    if (cards.length === 0) {
      issues.push({
        scope: "batch",
        code: "no_lots_found",
        message: "No Phillips auction lots were found on this page.",
        severity: "warning",
        blocking: false,
      });
    }

    const drafts = cards.map((element, index) => {
      const tile = $(element);
      const lotNumber = this.normalize(
        tile.find(".seldon-object-tile__lot-number").first().text(),
      ).replace(/^LOT\s+/i, "");
      const title = this.normalize(
        tile.find(".seldon-object-tile__title .pah-html-parser").first().text(),
      );
      const artist = this.normalize(
        tile.find(".seldon-object-tile__maker .pah-html-parser").first().text(),
      );
      const description = this.fieldText(
        tile,
        ".seldon-object-tile__description",
      );
      const date = this.fieldText(tile, ".seldon-object-tile__date");
      const medium = this.fieldText(tile, ".seldon-object-tile__medium");
      const signature = this.fieldText(tile, ".seldon-object-tile__signature");
      const estimateText =
        this.normalize(
          tile
            .find(
              ".seldon-object-tile__estimate .seldon-detail__value [data-testid='text'].seldon-text--labelSmall",
            )
            .first()
            .text(),
        ) ||
        this.normalize(
          tile
            .find(
              ".seldon-object-tile__estimate [data-testid='text'].seldon-text--bodySmall",
            )
            .first()
            .text(),
        );
      const estimate = this.parseEstimate(estimateText);
      const pricing = this.toEditablePricing(estimate);
      const sourceLotUrl = this.absoluteSourceUrl(tile.attr("href"), canonical);
      const image = tile.find("[data-testid='seldon-image-img']").first();
      const sourceImageUrl = this.absoluteImageUrl(
        this.pickLargestImageUrl(image.attr("srcset"), image.attr("src")),
        canonical,
      );
      const artwork: AutomaticUploadEditableArtworkInput = {
        title,
        artist,
        description,
        date,
        signature: signature || undefined,
        medium: medium || undefined,
        isAuction: true,
        price: pricing.price,
        maxPrice: pricing.maxPrice,
        shouldDisplayPrice: false,
        useForTaster: true,
        isPrivate: false,
        endDate: schemaEvent.endDate,
        tags: ["phillips"],
      };
      const draftIssues = this.buildIssues(
        artwork,
        lotNumber,
        sourceLotUrl,
        sourceImageUrl,
        estimate,
      );
      return {
        draftId: this.draftId(auctionCode, lotNumber, index),
        source: {
          identity: {
            provider: "phillips" as const,
            sourceAuctionUrl: canonical,
            sourceLotNumber: lotNumber,
            sourceLotUrl,
          },
          sourceImageUrl,
          originalEstimateText: estimate.text,
          originalEstimateCurrency: estimate.currency,
          originalEstimateLow: estimate.low,
          originalEstimateHigh: estimate.high,
          pricingConversionStatus: pricing.status,
        },
        artwork,
        included: true,
        issues: draftIssues,
      };
    });

    return {
      provider: "phillips",
      source: {
        provider: "phillips",
        sourceAuctionUrl: canonical,
        auctionCode,
        auctionTitle,
        location: schemaEvent.location,
        startsAt: schemaEvent.startDate,
        endsAt: schemaEvent.endDate,
      },
      drafts,
      issues,
    };
  }

  private extractSchemaEvent($: ReturnType<typeof load>): SchemaEvent {
    const candidates: unknown[] = [];
    $("script[type='application/ld+json']").each((_index, element) => {
      try {
        candidates.push(JSON.parse($(element).text()) as unknown);
      } catch {
        // Invalid third-party JSON-LD is ignored; other page data still parses.
      }
    });
    const event = candidates
      .flatMap((candidate) => this.flattenJsonLd(candidate))
      .find((candidate) => this.isSchemaEvent(candidate));
    if (!event || !this.isRecord(event)) return {};
    const location = this.isRecord(event.location)
      ? this.optionalString(event.location.name)
      : this.optionalString(event.location);
    return {
      name: this.optionalString(event.name),
      url: this.optionalString(event.url),
      startDate: this.optionalIsoDate(event.startDate),
      endDate: this.optionalIsoDate(event.endDate),
      location,
    };
  }

  private flattenJsonLd(value: unknown): unknown[] {
    if (Array.isArray(value))
      return value.flatMap((item) => this.flattenJsonLd(item));
    if (!this.isRecord(value)) return [];
    const graph = value["@graph"];
    return [
      value,
      ...(Array.isArray(graph)
        ? graph.flatMap((item) => this.flattenJsonLd(item))
        : []),
    ];
  }

  private isSchemaEvent(value: unknown): boolean {
    if (!this.isRecord(value)) return false;
    const type = value["@type"];
    return type === "Event" || (Array.isArray(type) && type.includes("Event"));
  }

  private parseEstimate(value: string): ParsedEstimate {
    const text = this.normalize(value).replace(/\u00a0/g, " ");
    if (!text) return {};
    const upper = text.toUpperCase();
    const currency =
      upper.includes("GBP") || text.includes("£")
        ? "GBP"
        : upper.includes("EUR") || text.includes("€")
          ? "EUR"
          : upper.includes("USD") || upper.includes("US$") || text.includes("$")
            ? "USD"
            : upper.match(/\b([A-Z]{3})\b/)?.[1];
    const values = text
      .replace(/,/g, "")
      .match(/\d+(?:\.\d+)?/g)
      ?.map(Number)
      .filter(Number.isFinite);
    return {
      text,
      currency,
      low: values?.[0],
      high: values?.[1] ?? values?.[0],
    };
  }

  private toEditablePricing(estimate: ParsedEstimate): {
    price?: number;
    maxPrice?: number;
    status: AutomaticUploadPricingConversionStatus;
  } {
    if (estimate.currency === "USD" && estimate.low !== undefined) {
      return {
        price: Math.min(estimate.low, estimate.high ?? estimate.low),
        maxPrice: Math.max(estimate.low, estimate.high ?? estimate.low),
        status: "not_required",
      };
    }
    if (estimate.currency && estimate.low !== undefined) {
      return { status: "not_attempted" };
    }
    return { status: "unavailable" };
  }

  private buildIssues(
    artwork: AutomaticUploadEditableArtworkInput,
    lotNumber: string,
    sourceLotUrl: string | undefined,
    sourceImageUrl: string | undefined,
    estimate: ParsedEstimate,
  ): AutomaticUploadArtworkDraftIssue[] {
    const issues: AutomaticUploadArtworkDraftIssue[] = [];
    const fieldIssue = (
      field: keyof AutomaticUploadEditableArtworkInput,
      code: string,
      message: string,
      severity: "error" | "warning" | "info",
      blocking: boolean,
    ) =>
      issues.push({ scope: "field", field, code, message, severity, blocking });
    if (!artwork.title)
      fieldIssue(
        "title",
        "missing_title",
        "Title is required before upload.",
        "error",
        true,
      );
    if (!artwork.artist)
      fieldIssue(
        "artist",
        "missing_artist",
        "Artist is required before upload.",
        "error",
        true,
      );
    if (!artwork.endDate)
      fieldIssue(
        "endDate",
        "missing_end_date",
        "Auction end date is required before upload.",
        "error",
        true,
      );
    if (!artwork.description)
      fieldIssue(
        "description",
        "missing_description",
        "Description was not provided by Phillips.",
        "warning",
        false,
      );
    if (!artwork.date)
      fieldIssue(
        "date",
        "missing_date",
        "Artwork date was not provided by Phillips.",
        "warning",
        false,
      );
    if (!artwork.medium)
      fieldIssue(
        "medium",
        "missing_medium",
        "Medium was not provided by Phillips.",
        "warning",
        false,
      );
    if (!artwork.signature)
      fieldIssue(
        "signature",
        "missing_signature",
        "Signature details were not provided by Phillips.",
        "info",
        false,
      );
    if (!estimate.text)
      fieldIssue(
        "price",
        "missing_estimate",
        "Estimate was not provided by Phillips.",
        "warning",
        false,
      );
    else if (estimate.currency !== "USD")
      fieldIssue(
        "price",
        "price_not_converted",
        "The original non-USD estimate was preserved; enter USD pricing before upload if needed.",
        "warning",
        false,
      );
    if (!lotNumber)
      issues.push({
        scope: "draft",
        code: "missing_lot_number",
        message: "Phillips lot number is required for source tracking.",
        severity: "error",
        blocking: true,
      });
    if (!sourceLotUrl)
      issues.push({
        scope: "draft",
        code: "missing_lot_url",
        message: "Phillips lot URL is missing or invalid.",
        severity: "warning",
        blocking: false,
      });
    if (!sourceImageUrl)
      issues.push({
        scope: "draft",
        code: "missing_image",
        message: "A supported Phillips image is required before upload.",
        severity: "error",
        blocking: true,
      });
    return issues;
  }

  private fieldText(
    tile: ReturnType<ReturnType<typeof load>>,
    selector: string,
  ): string {
    return this.normalize(
      tile.find(`${selector} .pah-html-parser`).first().text() ||
        tile.find(selector).first().text(),
    );
  }

  private pickLargestImageUrl(
    ...candidates: Array<string | undefined>
  ): string {
    const entries = candidates
      .flatMap((candidate) =>
        (candidate ?? "").split(",").map((part) => {
          const [url = "", descriptor = ""] = this.normalize(part).split(/\s+/);
          return { url, width: Number(descriptor.replace(/[^\d]/g, "")) || 0 };
        }),
      )
      .filter((entry) => entry.url);
    return (
      entries.sort((left, right) => right.width - left.width)[0]?.url ?? ""
    );
  }

  private absoluteSourceUrl(
    value: string | undefined,
    base: string,
  ): string | undefined {
    if (!value) return undefined;
    try {
      const url = new URL(value, base);
      return SOURCE_HOSTS.has(url.hostname.toLowerCase()) &&
        url.protocol === "https:" &&
        !url.port
        ? url.toString()
        : undefined;
    } catch {
      return undefined;
    }
  }

  private absoluteImageUrl(value: string, base: string): string | undefined {
    if (!value) return undefined;
    try {
      const url = new URL(value, base);
      return IMAGE_HOSTS.has(url.hostname.toLowerCase()) &&
        url.protocol === "https:" &&
        !url.port
        ? url.toString()
        : undefined;
    } catch {
      return undefined;
    }
  }

  private allowedSourceUrl(value: string | undefined): string | undefined {
    return value
      ? this.absoluteSourceUrl(value, "https://www.phillips.com")
      : undefined;
  }

  private extractAuctionCode(url: string, html: string): string | undefined {
    return (
      new URL(url).pathname
        .match(/\/auctions?\/([A-Za-z0-9_-]+)/i)?.[1]
        ?.toUpperCase() ??
      html.match(/\/auctions?\/([A-Za-z0-9_-]+)/i)?.[1]?.toUpperCase()
    );
  }

  private draftId(
    auctionCode: string | undefined,
    lotNumber: string,
    index: number,
  ): string {
    const token = `${auctionCode ?? "auction"}-${lotNumber || index + 1}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    return `phillips-${token}-${index + 1}`;
  }

  private optionalString(value: unknown): string | undefined {
    return typeof value === "string" && this.normalize(value)
      ? this.normalize(value)
      : undefined;
  }

  private optionalIsoDate(value: unknown): string | undefined {
    const text = this.optionalString(value);
    return text && Number.isFinite(Date.parse(text)) ? text : undefined;
  }

  private normalize(value: string | undefined): string {
    return (value ?? "").replace(/\s+/g, " ").trim();
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
}
