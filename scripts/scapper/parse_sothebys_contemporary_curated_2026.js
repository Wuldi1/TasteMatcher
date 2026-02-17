import fs from "node:fs/promises";
import path from "node:path";

const __dirname = path.dirname(new URL(import.meta.url).pathname);

const INPUT_HTML = path.join(
  __dirname,
  "inventory",
  "sothebys_ contemporary_curated_2026.html",
);
const OUTPUT_ROOT = path.join(
  __dirname,
  "inventory",
  "TasterMatcherSothebysContemporaryCurated_2026",
);

const SOURCE_NAME = "Sotheby's Contemporary Curated 2026";
const SOURCE_BASE_URL = "https://www.sothebys.com";
const END_DATE = process.env.END_DATE ?? "2026-02-26T23:59";
const DOWNLOAD_IMAGES = process.env.DOWNLOAD_IMAGES !== "false";
const DRY_RUN = process.env.DRY_RUN === "true";
const SLEEP_MS = Number(process.env.SLEEP_MS ?? 120);

const normalize = (text) => (text || "").replace(/\s+/g, " ").trim();

const sanitizeSlug = (text) =>
  normalize(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

function decodeEntities(text) {
  return (text || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

function stripTags(rawHtml) {
  return normalize(decodeEntities((rawHtml || "").replace(/<[^>]+>/g, " ")));
}

function extractFirst(text, regex) {
  const match = text.match(regex);
  return match ? decodeEntities(match[1]) : "";
}

function extractAll(text, regex) {
  return [...text.matchAll(regex)].map((m) => decodeEntities(m[1] || ""));
}

function pickLargestImageUrl(srcset, fallback) {
  if (!srcset) return fallback || "";
  const best = srcset
    .split(",")
    .map((part) => normalize(part))
    .filter(Boolean)
    .map((part) => {
      const [url, widthToken] = part.split(/\s+/);
      const width = Number((widthToken || "").replace(/[^\d]/g, "")) || 0;
      return { url, width };
    })
    .sort((a, b) => b.width - a.width)[0];
  return (best?.url || fallback || "").trim();
}

function parseMoney(text) {
  const clean = normalize(text).replace(/,/g, "");
  if (!clean) return {};

  const currency = clean.match(/\b(USD|EUR|GBP)\b/i)?.[1]?.toUpperCase();
  const nums = clean
    .match(/\d+(?:\.\d+)?/g)
    ?.map((n) => Number(n))
    .filter((n) => !Number.isNaN(n));

  if (!nums || nums.length === 0) return { currency };
  return {
    currency,
    value: Math.round(nums[0]),
    low: Math.round(nums[0]),
    high: Math.round(nums[1] ?? nums[0]),
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

async function downloadImage(url, folderPath) {
  const res = await fetch(url, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      accept: "image/*,*/*;q=0.8",
    },
  });
  if (!res.ok) {
    throw new Error(
      `Failed to download image (${res.status} ${res.statusText})`,
    );
  }
  const ext = inferImageExtension(url, res.headers.get("content-type") || "");
  const filePath = path.join(folderPath, `image.${ext}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  await fs.writeFile(filePath, buffer);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function toAbsoluteUrl(href) {
  if (!href) return "";
  if (href.startsWith("http://") || href.startsWith("https://")) return href;
  return `${SOURCE_BASE_URL}${href}`;
}

function parseLotCard(block, index) {
  const href = extractFirst(block, /href="([^"]+)"/i);
  const sourceUrl = toAbsoluteUrl(href);
  const ariaLabel = normalize(extractFirst(block, /aria-label="([^"]+)"/i));

  const lotTitleRaw = stripTags(
    extractFirst(block, /data-testid="lotTitle">([\s\S]*?)<\/p>/i),
  );
  const subtitle = stripTags(
    extractFirst(block, /data-testid="lotSubtitle">([\s\S]*?)<\/p>/i),
  );

  const lotMatch = lotTitleRaw.match(/^(\d+)\.\s*(.+)$/);
  const sourceLotNumber =
    lotMatch?.[1] || ariaLabel.match(/Lot\s*(\d+)/i)?.[1] || "";
  const artist = normalize(lotMatch?.[2] || lotTitleRaw);
  const title =
    subtitle || ariaLabel.split(".").slice(2).join(".").trim() || "Untitled";

  const sourceLotId = normalize(extractFirst(block, /data-testid="([^"]+)"/i));

  const estimateText = stripTags(
    extractFirst(block, /data-testid="([\d,\s.-]+(?:USD|EUR|GBP))"/i),
  );
  const currentBidCandidates = extractAll(
    block,
    /data-testid="currentBid"[^>]*>([\s\S]*?)<\/p>/gi,
  ).map((x) => stripTags(x));
  const currentBidText = currentBidCandidates.find(Boolean) || "";

  const estimate = parseMoney(estimateText);
  const currentBid = parseMoney(currentBidText);

  const imgTag = extractFirst(block, /(<img[\s\S]*?class="[^"]*"[\s\S]*?>)/i);
  const sourceImage = pickLargestImageUrl(
    extractFirst(imgTag, /srcset="([\s\S]*?)"/i),
    extractFirst(imgTag, /src="([^"]+)"/i),
  );

  const folderSlug = sanitizeSlug(
    `${sourceLotNumber || index + 1}_${artist || "unknown"}_${title || "untitled"}`,
  );

  const metadata = {
    title,
    artist,
    price: estimate.low,
    maxPrice: estimate.high,
    currency: estimate.currency,
    estimateText: estimateText || undefined,
    currentBid: currentBid.value,
    currentBidText: currentBidText || undefined,
    source: SOURCE_NAME,
    sourceUrl: sourceUrl || undefined,
    sourceImage: sourceImage || undefined,
    sourceLotId: sourceLotId || undefined,
    sourceLotNumber: sourceLotNumber || undefined,
    isAuction: true,
    endDate: END_DATE || undefined,
    useForTaster: true,
    isPrivate: false,
    tags: ["contemporary curated", "sothebys"],
  };

  return {
    folderSlug: folderSlug || `lot_${index + 1}`,
    metadata,
  };
}

function coverageSummary(items) {
  const fields = [
    "title",
    "artist",
    "sourceImage",
    "price",
    "maxPrice",
    "currency",
    "estimateText",
    "currentBid",
    "sourceUrl",
    "sourceLotId",
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

async function main() {
  const html = await fs.readFile(INPUT_HTML, "utf8");
  const blocks =
    html.match(/<a[\s\S]*?class="css-1ivophs"[\s\S]*?<\/a>/g) || [];
  const parsed = blocks.map((block, i) => parseLotCard(block, i));

  const usable = parsed.filter(
    (item) =>
      item.metadata.title && item.metadata.artist && item.metadata.sourceImage,
  );
  const skipped = parsed.length - usable.length;

  if (!DRY_RUN) {
    await fs.mkdir(OUTPUT_ROOT, { recursive: true });
    const seen = new Map();
    const total = usable.length;
    console.log(`Starting export of ${total} artworks...`);

    for (let i = 0; i < usable.length; i += 1) {
      const item = usable[i];
      console.log(
        `[${i + 1}/${total}] Processing: ${item.metadata.title} — ${item.metadata.artist}`,
      );
      const dup = seen.get(item.folderSlug) || 0;
      seen.set(item.folderSlug, dup + 1);
      const suffix = dup > 0 ? `_${dup + 1}` : "";
      const folderPath = path.join(OUTPUT_ROOT, `${item.folderSlug}${suffix}`);
      await fs.mkdir(folderPath, { recursive: true });

      if (DOWNLOAD_IMAGES) {
        try {
          await downloadImage(item.metadata.sourceImage, folderPath);
        } catch (err) {
          console.error(
            `✖ Image download failed for "${item.metadata.title}": ${err.message}`,
          );
        }
      }

      await fs.writeFile(
        path.join(folderPath, "metadata.json"),
        `${JSON.stringify(item.metadata, null, 2)}\n`,
      );

      if (SLEEP_MS > 0 && DOWNLOAD_IMAGES) await sleep(SLEEP_MS);
    }
  }

  const coverage = coverageSummary(usable.map((x) => x.metadata));
  console.log(`Total lot cards: ${parsed.length}`);
  console.log(`Parsed usable artworks: ${usable.length}`);
  console.log(`Skipped artworks (missing title/artist/image): ${skipped}`);
  console.log(
    `Mode: ${DRY_RUN ? "DRY_RUN" : "WRITE"} | Image download: ${DOWNLOAD_IMAGES && !DRY_RUN ? "ON" : "OFF"}`,
  );
  if (!DRY_RUN) console.log(`Output directory: ${OUTPUT_ROOT}`);

  console.log("\nCoverage:");
  for (const [field, count] of Object.entries(coverage.counts)) {
    const pct = coverage.total
      ? ((count / coverage.total) * 100).toFixed(1)
      : "0.0";
    console.log(`- ${field}: ${count}/${coverage.total} (${pct}%)`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
