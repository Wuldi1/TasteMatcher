import { load } from "cheerio";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const INPUT_HTML_DIR = path.join(__dirname, "inventory", "philips");
const OUTPUT_ROOT = path.join(__dirname, "inventory", "parsed_philips");

const END_DATE = process.env.END_DATE || "2026-05-30T23:59";
const SLEEP_MS = 120;
if (!END_DATE) {
  throw new Error(
    'END_DATE is required. Example: END_DATE="2026-03-27T23:59" node scripts/scapper/parse_philip.js',
  );
}

const args = process.argv.slice(2);
if (args.length > 1 || (args.length === 1 && args[0] !== "--test")) {
  printUsage();
  throw new Error("Only one optional argument is supported: --test");
}
const TEST_RUN = args.includes("--test");

const IMAGE_HEADERS = {
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  accept: "image/*,*/*;q=0.8",
};

const USD_TO_USD = 1;
const GBP_TO_USD = 1.27;
const EUR_TO_USD = 1.1;
const FX_RATES = {
  USD: USD_TO_USD,
  GBP: GBP_TO_USD,
  EUR: EUR_TO_USD,
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const normalize = (text) => (text || "").replace(/\s+/g, " ").trim();

const sanitizeSlug = (text) =>
  normalize(text)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

function printUsage() {
  console.log(`
Parse Phillips HTML files into upload-ready inventory folders.

Usage:
  node scripts/scapper/parse_philip.js [--test]

Behavior:
  - Always reads all *.html files from: scripts/scapper/inventory/philips
  - Always outputs to: scripts/scapper/inventory/parsed_philips
  - Always downloads images
  - Always sleeps 120ms between artworks
  - Only configurable env var: END_DATE

Options:
  --test   Parse only the first artwork from each HTML file
`);
}

function pickLargestImageUrl(...srcsetCandidates) {
  const urls = [];

  for (const srcset of srcsetCandidates) {
    if (!srcset) continue;

    const entries = srcset
      .split(",")
      .map((part) => normalize(part))
      .filter(Boolean);

    for (const entry of entries) {
      const [urlPart, sizePart] = entry.split(/\s+/);
      if (!urlPart) continue;
      const width = Number((sizePart || "").replace(/[^\d]/g, "")) || 0;
      urls.push({ url: urlPart, width });
    }
  }

  if (urls.length === 0) return "";
  return urls.sort((a, b) => b.width - a.width)[0].url;
}

function parseMoneyRange(estimateText) {
  const clean = normalize(estimateText).replace(/\u00a0/g, " ");
  if (!clean) return { estimateText: "" };

  const upper = clean.toUpperCase();
  let currency = "";
  if (upper.includes("GBP") || clean.includes("£")) currency = "GBP";
  else if (upper.includes("EUR") || clean.includes("€")) currency = "EUR";
  else if (
    upper.includes("USD") ||
    clean.includes("$") ||
    upper.includes("US$")
  ) {
    currency = "USD";
  } else {
    currency = clean.match(/\b([A-Z]{3})\b/i)?.[1]?.toUpperCase() || "";
  }

  const nums = clean
    .replace(/,/g, "")
    .match(/\d+(?:\.\d+)?/g)
    ?.map((v) => Number(v))
    .filter((n) => !Number.isNaN(n));

  if (!nums || nums.length === 0) {
    return { currency, estimateText: clean };
  }

  return {
    currency,
    estimateText: clean,
    low: nums[0],
    high: nums[1] ?? nums[0],
  };
}

function toUsdEstimate(parsedEstimate) {
  const estimateText = parsedEstimate?.estimateText || "";
  const currency = parsedEstimate?.currency || "";
  const low = parsedEstimate?.low;
  const high = parsedEstimate?.high;

  if (!estimateText) {
    return {
      price: null,
      maxPrice: null,
      estimateText: undefined,
      status: "missing_estimate",
    };
  }

  if (low === undefined || high === undefined) {
    return {
      price: null,
      maxPrice: null,
      estimateText: undefined,
      status: "missing_numeric",
    };
  }

  if (!currency) {
    return {
      price: null,
      maxPrice: null,
      estimateText: undefined,
      status: "missing_currency",
    };
  }

  const rate = FX_RATES[currency];
  if (!rate) {
    return {
      price: null,
      maxPrice: null,
      estimateText: undefined,
      status: "unsupported_currency",
    };
  }

  const convertedLow = Math.round(low * rate);
  const convertedHigh = Math.round(high * rate);
  const price = Math.min(convertedLow, convertedHigh);
  const maxPrice = Math.max(convertedLow, convertedHigh);
  const usdEstimateText =
    price === maxPrice ? `USD ${price}` : `USD ${price} - ${maxPrice}`;
  const status = currency === "USD" ? "usd" : "converted";

  return {
    price,
    maxPrice,
    estimateText: usdEstimateText,
    status,
  };
}

function logPricingDecision(item, lotLabel) {
  const status = item.pricingStatus;
  if (status === "converted") {
    console.log(
      `      [fx] ${lotLabel} ${item.rawEstimateCurrency} ${item.rawEstimateLow}-${item.rawEstimateHigh} -> USD ${item.price}-${item.maxPrice}`,
    );
    return;
  }

  if (
    status === "missing_estimate" ||
    status === "missing_numeric" ||
    status === "missing_currency"
  ) {
    console.log(
      `      [price-missing] ${lotLabel} raw estimate: "${item.rawEstimateText || "(empty)"}"`,
    );
    return;
  }

  if (status === "unsupported_currency") {
    console.warn(
      `      [price-unsupported-currency] ${lotLabel} currency="${item.rawEstimateCurrency || "(missing)"}" raw estimate: "${item.rawEstimateText || "(empty)"}"`,
    );
  }
}

function toOutputMetadata(item) {
  const {
    rawEstimateText,
    rawEstimateCurrency,
    rawEstimateLow,
    rawEstimateHigh,
    pricingStatus,
    ...metadata
  } = item;

  if (!metadata.estimateText) {
    delete metadata.estimateText;
  }

  return metadata;
}

function inferImageExtension(url, contentType) {
  if (contentType?.includes("png")) return "png";
  if (contentType?.includes("webp")) return "webp";
  if (contentType?.includes("gif")) return "gif";

  const cleaned = (url || "").split("?")[0].toLowerCase();
  if (cleaned.endsWith(".png")) return "png";
  if (cleaned.endsWith(".webp")) return "webp";
  if (cleaned.endsWith(".gif")) return "gif";

  return "jpg";
}

function shouldRetryError(err) {
  const message = String(err?.message || "");
  return /ENOTFOUND|ECONNRESET|ETIMEDOUT|EAI_AGAIN|fetch failed|network/i.test(
    message,
  );
}

async function downloadImageWithRetry(url, folderPath, label) {
  let attempt = 0;
  let waitMs = 2000;

  while (true) {
    attempt += 1;
    try {
      const res = await fetch(url, { headers: IMAGE_HEADERS });

      if (res.ok) {
        const ext = inferImageExtension(
          url,
          res.headers.get("content-type") || "",
        );
        const filePath = path.join(folderPath, `image.${ext}`);
        const buffer = Buffer.from(await res.arrayBuffer());
        await fs.writeFile(filePath, buffer);

        if (attempt > 1) {
          console.log(
            `      [retry-recovered] ${label} downloaded on attempt ${attempt}`,
          );
        }

        return filePath;
      }

      const retryableStatus = [429, 500, 502, 503, 504].includes(res.status);
      if (retryableStatus) {
        const retryAfterHeader = Number(res.headers.get("retry-after") || "");
        const retryAfterMs = Number.isFinite(retryAfterHeader)
          ? Math.max(1000, Math.round(retryAfterHeader * 1000))
          : waitMs;

        console.log(
          `      [retry] ${label} HTTP ${res.status}; attempt ${attempt}; waiting ${retryAfterMs}ms`,
        );
        await sleep(retryAfterMs);
        waitMs = Math.min(Math.round(waitMs * 1.5), 60000);
        continue;
      }

      const snippet = (await res.text().catch(() => "")).slice(0, 180);
      throw new Error(
        `Non-retryable image error ${res.status} ${res.statusText} for ${label}: ${snippet}`,
      );
    } catch (err) {
      if (shouldRetryError(err)) {
        console.log(
          `      [retry] ${label} network error on attempt ${attempt}: ${err.message}. waiting ${waitMs}ms`,
        );
        await sleep(waitMs);
        waitMs = Math.min(Math.round(waitMs * 1.5), 60000);
        continue;
      }

      throw err;
    }
  }
}

function extractSaleTitle($, html) {
  const heading = normalize($("h1").first().text());
  if (heading) return heading;

  const titleTag = normalize($("title").first().text());
  if (titleTag) {
    return titleTag.replace(/\s*\|\s*Phillips.*$/i, "");
  }

  const ogTitle =
    html.match(
      /<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i,
    )?.[1] || "";
  return normalize(ogTitle).replace(/\s*\|\s*Phillips.*$/i, "");
}

function extractSaleCode(htmlPath, html) {
  const fromHtml = html.match(/\/auctions\/([A-Z]{2}\d{6})\//)?.[1];
  if (fromHtml) return fromHtml;

  const fileBase = path.parse(htmlPath).name.toUpperCase();
  const fromFile = fileBase.match(/([A-Z]{2}\d{6})/)?.[1];
  return fromFile || "";
}

function extractAuctionUrl($, html) {
  const canonical = normalize($("link[rel='canonical']").attr("href") || "");
  if (canonical) return canonical;

  const ogUrl =
    html.match(
      /<meta[^>]*property=["']og:url["'][^>]*content=["']([^"']+)["']/i,
    )?.[1] || "";
  return normalize(ogUrl);
}

function toAbsolutePhillipsUrl(url) {
  const clean = normalize(url);
  if (!clean) return "";
  if (clean.startsWith("http://") || clean.startsWith("https://")) return clean;
  if (clean.startsWith("//")) return `https:${clean}`;
  if (clean.startsWith("/")) return `https://www.phillips.com${clean}`;
  return `https://www.phillips.com/${clean}`;
}

function coverageSummary(items) {
  const fields = [
    "title",
    "artist",
    "sourceImage",
    "price",
    "maxPrice",
    "estimateText",
    "sourceUrl",
    "sourceLotNumber",
  ];

  const counts = {};
  for (const field of fields) {
    counts[field] = items.filter((item) => {
      const value = item[field];
      if (Array.isArray(value)) return value.length > 0;
      return (
        value !== undefined && value !== null && String(value).trim() !== ""
      );
    }).length;
  }

  return { total: items.length, counts };
}

function parseLotCard(tile, index, context) {
  const lotNumber = normalize(
    tile.find(".seldon-object-tile__lot-number").text(),
  );
  const title = normalize(
    tile.find(".seldon-object-tile__title .pah-html-parser").text(),
  );
  const artist = normalize(
    tile.find(".seldon-object-tile__maker .pah-html-parser").text(),
  );

  const estimateText = normalize(
    tile
      .find(
        ".seldon-object-tile__estimate [data-testid='text'].seldon-text--bodySmall",
      )
      .first()
      .text(),
  );

  const parsedEstimate = parseMoneyRange(estimateText);
  const normalizedEstimate = toUsdEstimate(parsedEstimate);

  const href = tile.attr("href") || "";
  const sourceUrl = toAbsolutePhillipsUrl(href);
  const sourceLotId =
    normalize(tile.attr("data-testid") || "").match(/lot-(\d+)-/i)?.[1] ||
    normalize(tile.attr("id") || "").match(/\/(\d+)(?:-remix)?$/)?.[1] ||
    "";

  const img = tile.find("[data-testid='seldon-image-img']").first();
  const sourceImage = pickLargestImageUrl(
    img.attr("srcset") || "",
    img.attr("src") || "",
  );

  const folderSlug = sanitizeSlug(
    `${lotNumber || `lot_${index + 1}`}_${title || "untitled"}`,
  );

  return {
    folderSlug: folderSlug || `lot_${index + 1}`,
    title,
    artist,
    description: "",
    date: "",
    medium: "",
    signature: "",
    price: normalizedEstimate.price,
    maxPrice: normalizedEstimate.maxPrice,
    estimateText: normalizedEstimate.estimateText,
    rawEstimateText: parsedEstimate.estimateText || "",
    rawEstimateCurrency: parsedEstimate.currency || "",
    rawEstimateLow: parsedEstimate.low,
    rawEstimateHigh: parsedEstimate.high,
    pricingStatus: normalizedEstimate.status,
    source: context.sourceName,
    sourceUrl,
    sourceAuctionUrl: context.auctionUrl || undefined,
    sourceHtmlFile: context.sourceHtmlFile,
    sourceImage,
    sourceLotId,
    sourceLotNumber: lotNumber || undefined,
    tags: ["phillips"],
    isAuction: true,
    endDate: context.endDate,
    useForTaster: true,
    isPrivate: false,
  };
}

async function listInputHtmlFiles() {
  await fs.mkdir(INPUT_HTML_DIR, { recursive: true });
  const entries = await fs.readdir(INPUT_HTML_DIR, { withFileTypes: true });
  return entries
    .filter(
      (entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".html"),
    )
    .map((entry) => path.join(INPUT_HTML_DIR, entry.name))
    .sort((a, b) => a.localeCompare(b));
}

function buildAuctionSlug(htmlPath, saleTitle, saleCode, index) {
  const fileToken = sanitizeSlug(path.parse(htmlPath).name || "");
  const titleToken = sanitizeSlug(saleTitle || "");
  const codeToken = sanitizeSlug(saleCode || "");
  return (
    [codeToken, titleToken, fileToken].filter(Boolean).join("_") ||
    `phillips_auction_${index + 1}`
  );
}

async function processHtmlFile(htmlPath, index, totalFiles) {
  const basename = path.basename(htmlPath);
  console.log(`\n[${index + 1}/${totalFiles}] Parsing ${basename}`);

  const html = await fs.readFile(htmlPath, "utf8");
  const $ = load(html);

  const saleTitle = extractSaleTitle($, html);
  const saleCode = extractSaleCode(htmlPath, html);
  const auctionUrl = extractAuctionUrl($, html);
  const sourceName =
    saleTitle || (saleCode ? `Phillips Sale ${saleCode}` : "Phillips Auction");

  const auctionSlug = buildAuctionSlug(htmlPath, saleTitle, saleCode, index);
  const auctionOutputDir = path.join(OUTPUT_ROOT, auctionSlug);

  const cards = $("a.seldon-object-tile.pah-lot-object-tile").toArray();
  const parsed = cards.map((el, lotIndex) =>
    parseLotCard($(el), lotIndex, {
      sourceName,
      auctionUrl,
      sourceHtmlFile: path.relative(process.cwd(), htmlPath),
      endDate: END_DATE,
    }),
  );

  const usable = parsed.filter(
    (item) => item.title && item.artist && item.sourceImage,
  );
  const skipped = parsed.length - usable.length;

  console.log(`  Source name: ${sourceName}`);
  console.log(`  Sale code: ${saleCode || "(not found)"}`);
  console.log(`  Auction URL: ${auctionUrl || "(not found in html)"}`);
  console.log(`  Lot cards found: ${parsed.length}`);
  console.log(`  Usable lots: ${usable.length}`);
  console.log(`  Skipped lots: ${skipped}`);

  const toProcess = TEST_RUN ? usable.slice(0, 1) : usable;
  if (TEST_RUN) {
    console.log(
      "  TEST MODE ON: only first artwork will be processed for this file.",
    );
  }

  await fs.mkdir(auctionOutputDir, { recursive: true });
  const seen = new Map();

  for (let i = 0; i < toProcess.length; i += 1) {
    const item = toProcess[i];
    const duplicateCount = seen.get(item.folderSlug) || 0;
    seen.set(item.folderSlug, duplicateCount + 1);

    const suffix = duplicateCount > 0 ? `_${duplicateCount + 1}` : "";
    const folderPath = path.join(
      auctionOutputDir,
      `${item.folderSlug}${suffix}`,
    );
    await fs.mkdir(folderPath, { recursive: true });

    const lotLabel = `${item.sourceLotNumber || `lot_${i + 1}`} | ${item.title}`;
    console.log(`    [${i + 1}/${toProcess.length}] ${lotLabel}`);
    logPricingDecision(item, lotLabel);

    await downloadImageWithRetry(item.sourceImage, folderPath, lotLabel);

    const metadata = toOutputMetadata(item);
    await fs.writeFile(
      path.join(folderPath, "metadata.json"),
      `${JSON.stringify(metadata, null, 2)}\n`,
    );

    await sleep(SLEEP_MS);
  }

  const coverage = coverageSummary(usable);
  const pct = (count) =>
    coverage.total ? `${((count / coverage.total) * 100).toFixed(1)}%` : "0.0%";

  console.log("  Coverage summary:");
  console.log(
    `    title: ${coverage.counts.title}/${coverage.total} (${pct(coverage.counts.title)})`,
  );
  console.log(
    `    artist: ${coverage.counts.artist}/${coverage.total} (${pct(coverage.counts.artist)})`,
  );
  console.log(
    `    sourceImage: ${coverage.counts.sourceImage}/${coverage.total} (${pct(coverage.counts.sourceImage)})`,
  );
  console.log(`  Output dir: ${auctionOutputDir}`);

  return {
    htmlPath,
    sourceName,
    outputDir: auctionOutputDir,
    totalLots: parsed.length,
    usableLots: usable.length,
    skippedLots: skipped,
    processedLots: toProcess.length,
    failed: false,
  };
}

async function main() {
  console.log("Starting Phillips parse run...");
  console.log(`Input HTML directory: ${INPUT_HTML_DIR}`);
  console.log(`Output directory: ${OUTPUT_ROOT}`);
  console.log(`END_DATE: ${END_DATE}`);
  console.log(`TEST MODE: ${TEST_RUN ? "ON" : "OFF"}`);

  await fs.mkdir(OUTPUT_ROOT, { recursive: true });

  const htmlFiles = await listInputHtmlFiles();
  if (htmlFiles.length === 0) {
    throw new Error(`No HTML files found in ${INPUT_HTML_DIR}`);
  }

  console.log(`Discovered ${htmlFiles.length} HTML file(s).`);

  const results = [];
  for (let i = 0; i < htmlFiles.length; i += 1) {
    const htmlPath = htmlFiles[i];
    try {
      const result = await processHtmlFile(htmlPath, i, htmlFiles.length);
      results.push(result);
    } catch (err) {
      const basename = path.basename(htmlPath);
      console.error(`\n[ERROR] Failed processing ${basename}: ${err.message}`);
      results.push({
        htmlPath,
        failed: true,
        error: err.message,
        totalLots: 0,
        usableLots: 0,
        skippedLots: 0,
        processedLots: 0,
      });
    }
  }

  const totals = results.reduce(
    (acc, item) => {
      acc.files += 1;
      acc.failedFiles += item.failed ? 1 : 0;
      acc.totalLots += item.totalLots || 0;
      acc.usableLots += item.usableLots || 0;
      acc.skippedLots += item.skippedLots || 0;
      acc.processedLots += item.processedLots || 0;
      return acc;
    },
    {
      files: 0,
      failedFiles: 0,
      totalLots: 0,
      usableLots: 0,
      skippedLots: 0,
      processedLots: 0,
    },
  );

  console.log("\nRun completed.");
  console.log(`Files processed: ${totals.files}`);
  console.log(`Files failed: ${totals.failedFiles}`);
  console.log(`Total lot cards: ${totals.totalLots}`);
  console.log(`Total usable lots: ${totals.usableLots}`);
  console.log(`Total skipped lots: ${totals.skippedLots}`);
  console.log(`Total lots exported: ${totals.processedLots}`);

  if (totals.failedFiles > 0) {
    console.log("\nFailed files:");
    for (const item of results.filter((r) => r.failed)) {
      console.log(`- ${path.basename(item.htmlPath)}: ${item.error}`);
    }
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
