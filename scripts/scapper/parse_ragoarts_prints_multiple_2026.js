import fs from "node:fs/promises";
import path from "node:path";

const __dirname = path.dirname(new URL(import.meta.url).pathname);

const INPUT_HTML = path.join(
  __dirname,
  "inventory",
  "ragoarts_prints_multiple_2026.html",
);
const OUTPUT_ROOT = path.join(
  __dirname,
  "inventory",
  "TasterMatcherRagoArtsPrintsMultiples_2026",
);

const SOURCE_NAME = "Rago Arts Prints & Multiples February 2026";
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

function parseEstimateRange(text) {
  const clean = normalize(text).replace(/[$,]/g, "");
  const nums = clean
    .match(/\d+(?:\.\d+)?/g)
    ?.map((n) => Number(n))
    .filter((n) => !Number.isNaN(n));
  if (!nums || nums.length === 0) return {};
  return {
    currency: "USD",
    price: Math.round(nums[0]),
    maxPrice: Math.round(nums[1] ?? nums[0]),
    estimateText: normalize(text),
  };
}

function parseBidValue(text) {
  const clean = normalize(text).replace(/[$,]/g, "");
  const num = Number(clean.match(/\d+(?:\.\d+)?/)?.[0]);
  return Number.isNaN(num) ? undefined : Math.round(num);
}

function parseDataSearchDetails(dataSearch, lotNo, title, artist) {
  const raw = normalize(dataSearch);
  if (!raw) return {};

  const lower = raw.toLowerCase();
  const titleIdx = title ? lower.indexOf(title.toLowerCase()) : -1;
  const artistIdx = artist ? lower.indexOf(artist.toLowerCase()) : -1;

  let medium = "";
  if (titleIdx !== -1 && artistIdx !== -1 && artistIdx > titleIdx) {
    const tail = raw.slice(artistIdx + artist.length).trim();
    const parts = tail
      .split(/\s{2,}/)
      .map((p) => normalize(p))
      .filter(Boolean);
    medium = parts[0] || "";
  }

  const countryMatch = raw.match(
    /\b(usa|united states|france|japan|united kingdom|uk|germany|italy|spain|mexico|canada)\b/i,
  );
  const country = countryMatch ? normalize(countryMatch[1]) : "";

  return {
    medium: medium || undefined,
    country: country || undefined,
    searchText: raw || undefined,
    sourceLotNumber: lotNo || undefined,
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

function extractItemBlocks(html) {
  const blocks = [];
  const startRe = /<div[^>]*data-type="item"[^>]*class="___item"[^>]*>/g;
  let match;

  while ((match = startRe.exec(html)) !== null) {
    let i = match.index;
    let depth = 0;
    let end = -1;

    while (i < html.length) {
      const nextOpen = html.indexOf("<div", i);
      const nextClose = html.indexOf("</div>", i);

      if (nextOpen !== -1 && nextOpen < nextClose) {
        depth += 1;
        i = nextOpen + 4;
        continue;
      }

      if (nextClose !== -1) {
        depth -= 1;
        i = nextClose + 6;
        if (depth === 0) {
          end = i;
          break;
        }
        continue;
      }

      break;
    }

    if (end > match.index) {
      blocks.push(html.slice(match.index, end));
      startRe.lastIndex = end;
    }
  }

  return blocks;
}

function parseLotItem(block, index) {
  const lotNo = normalize(extractFirst(block, /data-lot="([^"]+)"/i));
  const sourceUrl = normalize(
    extractFirst(
      block,
      /href="(https:\/\/www\.ragoarts\.com\/auctions\/[^"]+)"/i,
    ),
  );
  const sourceLotId = normalize(extractFirst(block, /data-fdkey="([^"]+)"/i));
  const location = normalize(extractFirst(block, /data-location="([^"]+)"/i));

  const artist = stripTags(
    extractFirst(block, /<span class="name">([\s\S]*?)<\/span>/i),
  );
  const title = stripTags(
    extractFirst(block, /<div class="title">[\s\S]*?<span>([\s\S]*?)<\/span>/i),
  );
  const estimateText = stripTags(
    extractFirst(
      block,
      /<div class="estimate">[\s\S]*?<span>([\s\S]*?)<\/span>/i,
    ),
  );
  const bidText = stripTags(
    extractFirst(
      block,
      /class="bid-amount[^"]*"[\s\S]*?>\s*([^<]+)\s*<\/span/i,
    ),
  );

  const imgTag = extractFirst(block, /(<img[\s\S]*?>)/i);
  const sourceImage = pickLargestImageUrl(
    extractFirst(imgTag, /data-srcset="([^"]+)"/i),
    extractFirst(imgTag, /srcset="([^"]+)"/i),
    extractFirst(imgTag, /data-src="([^"]+)"/i),
    extractFirst(imgTag, /src="([^"]+)"/i),
  );

  const estimate = parseEstimateRange(estimateText);
  const currentBid = parseBidValue(bidText);
  const details = parseDataSearchDetails(
    extractFirst(block, /data-search="([^"]+)"/i),
    lotNo,
    title,
    artist,
  );

  return {
    folderSlug:
      sanitizeSlug(
        `${lotNo || index + 1}_${artist || "unknown"}_${title || "untitled"}`,
      ) || `lot_${index + 1}`,
    metadata: {
      title,
      artist,
      medium: details.medium,
      country: details.country,
      price: estimate.price,
      maxPrice: estimate.maxPrice,
      currency: estimate.currency,
      estimateText: estimate.estimateText,
      currentBid,
      currentBidText: bidText || undefined,
      source: SOURCE_NAME,
      sourceUrl: sourceUrl || undefined,
      sourceImage: sourceImage || undefined,
      sourceLotId: sourceLotId || undefined,
      sourceLotNumber: lotNo || undefined,
      sourceLocation: location || undefined,
      sourceSearchText: details.searchText,
      isAuction: true,
      endDate: END_DATE || undefined,
      useForTaster: true,
      isPrivate: false,
      tags: ["prints", "multiples", "ragoarts"],
    },
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
    "medium",
    "country",
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
  const lotBlocks = extractItemBlocks(html);

  const parsed = lotBlocks.map((block, i) => parseLotItem(block, i));
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
  console.log(`Total lot items: ${parsed.length}`);
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
