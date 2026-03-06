import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const INPUT_HTML_DIR = path.join(__dirname, "inventory", "christies");
const OUTPUT_ROOT = path.join(__dirname, "inventory", "parsed_christies");

const END_DATE = process.env.END_DATE ?? "2026-03-11T23:59";
const SLEEP_MS = 120;
if (!END_DATE) {
  throw new Error(
    'END_DATE is required. Example: END_DATE="2026-03-27T23:59" node scripts/scapper/parse_christies.js',
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

const DIMENSIONS_RE =
  /(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)(?:\s*x\s*(\d+(?:\.\d+)?))?/i;
const DATE_HINT_RE =
  /\b(executed|conceived|created|dated|circa|ca\.|c\.)\b|^painted\s+in\b/i;
const SIGNATURE_HINT_RE =
  /\b(signature|signed|inscribed|numbered|stamped|incised|initialed|dedicated|bears)\b/i;
const MEDIUM_HINT_RE =
  /\b(oil|acrylic|watercolor|watercolour|graphite|ink|bronze|steel|aluminum|wood|paper|canvas|masonite|mixed media|gouache|crayon|photograph|photographic|gelatin silver|screenprint|lithograph|charcoal|ceramic|cotton|enamel|neon|earthenware|patina|assemblage|cardboard|panel)\b/i;

const ENTITY_MAP = {
  "&amp;": "&",
  "&quot;": '"',
  "&#39;": "'",
  "&lt;": "<",
  "&gt;": ">",
  "&nbsp;": " ",
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

const decodeEntities = (text) =>
  (text || "").replace(
    /&amp;|&quot;|&#39;|&lt;|&gt;|&nbsp;/g,
    (m) => ENTITY_MAP[m] || m,
  );

function printUsage() {
  console.log(`
Parse Christie's HTML files into upload-ready inventory folders.

Usage:
  node scripts/scapper/parse_christies.js [--test]

Behavior:
  - Always reads all *.html files from: scripts/scapper/inventory/christies
  - Always outputs to: scripts/scapper/inventory/parsed_christies
  - Always downloads images
  - Always sleeps 120ms between artworks
  - Only configurable env var: END_DATE

Options:
  --test   Parse only the first artwork from each HTML file
`);
}

function extractFirst(text, regex) {
  const match = (text || "").match(regex);
  return match ? decodeEntities(match[1]) : "";
}

function stripTags(rawHtml) {
  return normalize(decodeEntities((rawHtml || "").replace(/<[^>]+>/g, " ")));
}

function toAbsoluteChristiesUrl(url) {
  const clean = normalize(url);
  if (!clean) return "";
  if (clean.startsWith("http://") || clean.startsWith("https://")) return clean;
  if (clean.startsWith("//")) return `https:${clean}`;
  if (clean.startsWith("/")) return `https://www.christies.com${clean}`;
  return `https://www.christies.com/${clean}`;
}

function parseMoneyRange(estimateText) {
  const clean = normalize(estimateText).replace(/\u00a0/g, " ");
  if (!clean) return { estimateText: "" };

  const currency = clean.match(/\b([A-Z]{3})\b/i)?.[1]?.toUpperCase();
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
    sourceCurrency: currency,
    sourceLow: low,
    sourceHigh: high,
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
      urls.push({ url: decodeEntities(urlPart), width });
    }
  }

  if (urls.length === 0) return "";
  return urls.sort((a, b) => b.width - a.width)[0].url;
}

function mergeWrappedLines(lines) {
  const merged = [];
  const continuationStartRe =
    /^(\(|'|"|and\b|or\b|of\b|on\b|to\b|for\b|in\b|with\b|dated\b|executed\b|conceived\b|inscribed\b|signed\b|titled\b|numbered\b|stamped\b|incised\b|initialed\b|bears\b|height\b|width\b|depth\b)/i;
  const previousEndsOpenRe =
    /(and|or|of|on|to|for|with|again|dated|inscribed|signed|titled|numbered|stamped|incised|initialed)$/i;

  for (const line of lines) {
    if (merged.length === 0) {
      merged.push(line);
      continue;
    }

    const prev = merged[merged.length - 1];
    if (
      continuationStartRe.test(line) ||
      previousEndsOpenRe.test(prev) ||
      /^[a-z]/.test(line)
    ) {
      merged[merged.length - 1] = normalize(`${prev} ${line}`);
      continue;
    }

    merged.push(line);
  }

  return merged;
}

function parseDetailLines(contentZoneHtml) {
  if (!contentZoneHtml) return [];

  const roughLines = decodeEntities(contentZoneHtml)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/?i>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .split("\n")
    .map((line) => normalize(line))
    .filter(Boolean);

  return mergeWrappedLines(roughLines);
}

function parseDimensions(line) {
  if (!line) return {};

  const cmPart = line.match(/\(([^)]*cm\.?[^)]*)\)/i)?.[1] || "";
  const target = cmPart || line;

  const explicit = target.match(DIMENSIONS_RE);
  if (explicit) {
    const width = Number(explicit[1]);
    const height = Number(explicit[2]);
    const depth = explicit[3] ? Number(explicit[3]) : undefined;
    if (![width, height, depth].some((n) => Number.isNaN(n))) {
      return { width, height, depth };
    }
  }

  const nums = target
    .replace(/,/g, "")
    .match(/\d+(?:\.\d+)?/g)
    ?.map((n) => Number(n))
    .filter((n) => !Number.isNaN(n));

  if (!nums || nums.length === 0) return {};

  if (/height\s*:/i.test(target) && nums.length >= 1) {
    return { height: nums[0] };
  }

  if (nums.length >= 3) {
    return { width: nums[0], height: nums[1], depth: nums[2] };
  }

  if (nums.length >= 2) {
    return { width: nums[0], height: nums[1] };
  }

  return {};
}

function parseDetailFields(detailLines, artist, title) {
  const lines = detailLines.filter((line) => {
    const lower = line.toLowerCase();
    return (
      lower !== normalize(artist).toLowerCase() &&
      lower !== normalize(title).toLowerCase()
    );
  });

  let signature = "";
  let medium = "";
  let date = "";
  let dimensionsText = "";
  const provenance = [];
  const exhibited = [];
  const literature = [];
  const ambiguous = [];

  let section = "main";
  for (const line of lines) {
    if (/^provenance:?$/i.test(line)) {
      section = "provenance";
      continue;
    }
    if (/^exhibited:?$/i.test(line)) {
      section = "exhibited";
      continue;
    }
    if (/^literature:?$/i.test(line)) {
      section = "literature";
      continue;
    }

    if (section === "provenance") {
      provenance.push(line);
      continue;
    }
    if (section === "exhibited") {
      exhibited.push(line);
      continue;
    }
    if (section === "literature") {
      literature.push(line);
      continue;
    }

    const hasDimensionsPattern =
      /(x|height\s*:|width\s*:|depth\s*:)/i.test(line) &&
      /(in\.|cm\.?|cm\))/i.test(line);

    if (!dimensionsText && hasDimensionsPattern) {
      dimensionsText = line;
      continue;
    }

    if (!signature && SIGNATURE_HINT_RE.test(line)) {
      signature = line;
      continue;
    }

    if (!date && DATE_HINT_RE.test(line)) {
      date = line;
      continue;
    }

    if (!medium && MEDIUM_HINT_RE.test(line)) {
      medium = line;
      continue;
    }

    ambiguous.push(line);
  }

  return {
    description: lines.join("\n"),
    medium,
    signature,
    date,
    dimensionsText,
    provenance: provenance.length ? provenance : undefined,
    exhibited: exhibited.length ? exhibited : undefined,
    literature: literature.length ? literature : undefined,
    ambiguousDetails: ambiguous.length ? ambiguous : undefined,
  };
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

function extractSaleTitle(html) {
  const og = extractFirst(
    html,
    /<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i,
  );
  const titleTag = extractFirst(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
  return normalize(og || titleTag).replace(/\s*\|\s*Christie'?s.*$/i, "");
}

function extractAuctionUrl(html) {
  const canonical = extractFirst(
    html,
    /<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["']/i,
  );
  const ogUrl = extractFirst(
    html,
    /<meta[^>]*property=["']og:url["'][^>]*content=["']([^"']+)["']/i,
  );
  return toAbsoluteChristiesUrl(canonical || ogUrl);
}

function extractSaleId(sourceToken, html) {
  const fromSource = normalize(sourceToken).match(
    /-(\d{4,})(?:[/?#._-]|$)/,
  )?.[1];
  if (fromSource) return fromSource;

  const fromHtml = extractFirst(
    html,
    /\bSale\s*(?:No\.?|Number)?\s*[:#]?\s*(\d{4,})\b/i,
  );
  return normalize(fromHtml);
}

function coverageSummary(items) {
  const fields = [
    "title",
    "artist",
    "sourceImage",
    "description",
    "medium",
    "signature",
    "date",
    "width",
    "height",
    "depth",
    "price",
    "maxPrice",
    "tags",
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

function extractLotBlocks(html) {
  const matches = (html || "").match(
    /<li[^>]*class="[^"]*\bcol-12\b[^"]*\bpx-0\b[^"]*"[\s\S]*?<\/li>/gi,
  );
  return matches || [];
}

function parseLotBlock(block, index, context) {
  const lotNumber = stripTags(
    extractFirst(
      block,
      /<span class="chr-lot-tile__number">([\s\S]*?)<\/span>/i,
    ),
  );

  const consigner = stripTags(
    extractFirst(
      block,
      /<p class="chr-lot-tile__consigner-information">([\s\S]*?)<\/p>/i,
    ),
  );

  const artist = stripTags(
    extractFirst(
      block,
      /<h2 class="chr-lot-tile__primary-title[\s\S]*?">([\s\S]*?)<\/h2>/i,
    ),
  );

  const title = stripTags(
    extractFirst(
      block,
      /<p class="chr-lot-tile__secondary-title[\s\S]*?">([\s\S]*?)<\/p>/i,
    ),
  );

  const sourceUrl = toAbsoluteChristiesUrl(
    extractFirst(block, /class="chr-lot-tile__link"[^>]*href="([^"]+)"/i),
  );
  const sourceLotId = sourceUrl.match(/lot-(\d+)/i)?.[1] || "";

  const contentZoneHtml = extractFirst(
    block,
    /<div class="content-zone">([\s\S]*?)<\/div>/i,
  );
  const detailLines = parseDetailLines(contentZoneHtml);
  const detailFields = parseDetailFields(detailLines, artist, title);
  const dimensions = parseDimensions(detailFields.dimensionsText);

  const estimateText = stripTags(
    extractFirst(
      block,
      /<span class="chr-lot-tile__price-value">([\s\S]*?)<\/span>/i,
    ),
  );
  const parsedEstimate = parseMoneyRange(estimateText);
  const normalizedEstimate = toUsdEstimate(parsedEstimate);

  const imgTag = extractFirst(
    block,
    /(<img[\s\S]*?class="[^"]*\bchr-img\b[^"]*"[\s\S]*?>)/i,
  );
  const sourceImage = pickLargestImageUrl(
    extractFirst(imgTag, /data-srcset="([^"]+)"/i),
    extractFirst(imgTag, /srcset="([^"]+)"/i),
    extractFirst(imgTag, /data-src="([^"]+)"/i),
    extractFirst(imgTag, /src="([^"]+)"/i),
  );

  const folderSlug = sanitizeSlug(
    `${lotNumber || `lot_${index + 1}`}_${title || "untitled"}`,
  );

  return {
    folderSlug: folderSlug || `lot_${index + 1}`,
    title,
    artist,
    description: detailFields.description,
    medium: detailFields.medium,
    signature: detailFields.signature,
    date: detailFields.date,
    width: dimensions.width,
    height: dimensions.height,
    depth: dimensions.depth,
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
    sourceHtmlFile: context.sourceHtmlFile || undefined,
    sourceImage,
    sourceLotId,
    sourceLotNumber: lotNumber || undefined,
    provenance: detailFields.provenance,
    exhibited: detailFields.exhibited,
    literature: detailFields.literature,
    tags: ["christies", consigner].filter(Boolean),
    isAuction: true,
    endDate: context.endDate ?? null,
    useForTaster: true,
    isPrivate: false,
    ambiguousDetails: detailFields.ambiguousDetails,
  };
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

async function listInputHtmlFiles() {
  const entries = await fs.readdir(INPUT_HTML_DIR, { withFileTypes: true });
  return entries
    .filter(
      (entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".html"),
    )
    .map((entry) => path.join(INPUT_HTML_DIR, entry.name))
    .sort((a, b) => a.localeCompare(b));
}

function buildAuctionSlug(htmlPath, saleTitle, saleId, index) {
  const fileToken = sanitizeSlug(path.parse(htmlPath).name || "");
  const titleToken = sanitizeSlug(saleTitle || "");
  const saleToken = sanitizeSlug(saleId || "");
  return (
    [titleToken, saleToken, fileToken].filter(Boolean).join("_") ||
    `christies_auction_${index + 1}`
  );
}

async function processHtmlFile(htmlPath, index, totalFiles) {
  const basename = path.basename(htmlPath);
  console.log(`\n[${index + 1}/${totalFiles}] Parsing ${basename}`);

  const html = await fs.readFile(htmlPath, "utf8");
  const auctionUrl = extractAuctionUrl(html);
  const saleTitle = extractSaleTitle(html);
  const saleId = extractSaleId(auctionUrl || basename, html);
  const sourceName =
    saleTitle || (saleId ? `Christie's Sale ${saleId}` : "Christie's Auction");

  const auctionSlug = buildAuctionSlug(htmlPath, saleTitle, saleId, index);
  const auctionOutputDir = path.join(OUTPUT_ROOT, auctionSlug);

  const lotBlocks = extractLotBlocks(html);
  const parsed = lotBlocks.map((block, lotIndex) =>
    parseLotBlock(block, lotIndex, {
      sourceName,
      endDate: END_DATE,
      auctionUrl,
      sourceHtmlFile: path.relative(process.cwd(), htmlPath),
    }),
  );

  const usable = parsed.filter(
    (item) => item.title && item.artist && item.sourceImage,
  );
  const skipped = parsed.length - usable.length;

  console.log(`  Source name: ${sourceName}`);
  console.log(`  Auction URL: ${auctionUrl || "(not found in html)"}`);
  console.log(`  Lot tiles found: ${parsed.length}`);
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
  console.log("Starting Christie's parse run...");
  console.log(`Input HTML directory: ${INPUT_HTML_DIR}`);
  console.log(`Output directory: ${OUTPUT_ROOT}`);
  console.log(`END_DATE: ${END_DATE || "(empty)"}`);
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
  console.log(`Total lot tiles: ${totals.totalLots}`);
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
