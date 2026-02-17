import fs from "node:fs/promises";
import path from "node:path";

const __dirname = path.dirname(new URL(import.meta.url).pathname);

const INPUT_HTML = path.join(
  __dirname,
  "inventory",
  "christies_ post_war_to_present_31032.html",
);
const OUTPUT_ROOT = path.join(
  __dirname,
  "inventory",
  "TasterMatcherChristiesPostWarToPresent_31032",
);

const SOURCE_NAME = "Christie's Post-War to Present (Sale 31032)";
const END_DATE = process.env.END_DATE ?? "2026-02-27T23:59";
const DOWNLOAD_IMAGES = process.env.DOWNLOAD_IMAGES !== "false";
const DRY_RUN = process.env.DRY_RUN === "true";
const SLEEP_MS = Number(process.env.SLEEP_MS ?? 120);

const DIMENSIONS_RE =
  /(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)(?:\s*x\s*(\d+(?:\.\d+)?))?/i;
const DATE_HINT_RE =
  /\b(executed|painted|conceived|created|dated|circa|ca\.|c\.)\b/i;
const SIGNATURE_HINT_RE =
  /\b(signed|inscribed|numbered|stamped|incised|initialed|dedicated)\b/i;
const MEDIUM_HINT_RE =
  /\b(oil|acrylic|watercolor|watercolour|graphite|ink|bronze|steel|aluminum|wood|paper|canvas|masonite|mixed media|gouache|crayon|photograph|photographic|gelatin silver|screenprint|lithograph|charcoal|ceramic|cotton|enamel|neon)\b/i;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const ENTITY_MAP = {
  "&amp;": "&",
  "&quot;": '"',
  "&#39;": "'",
  "&lt;": "<",
  "&gt;": ">",
  "&nbsp;": " ",
};

const normalize = (text) => (text || "").replace(/\s+/g, " ").trim();

const sanitizeSlug = (text) =>
  normalize(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

const decodeEntities = (text) =>
  (text || "").replace(
    /&amp;|&quot;|&#39;|&lt;|&gt;|&nbsp;/g,
    (m) => ENTITY_MAP[m] || m,
  );

function extractFirst(html, regex) {
  const match = html.match(regex);
  return match ? decodeEntities(match[1]) : "";
}

function stripTags(rawHtml) {
  return normalize(decodeEntities((rawHtml || "").replace(/<[^>]+>/g, " ")));
}

function parseMoneyRange(estimateText) {
  const clean = normalize(estimateText).replace(/\u00a0/g, " ");
  if (!clean) return {};
  const currency = clean.match(/\b(USD|EUR|GBP)\b/i)?.[1]?.toUpperCase();
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
    price: Math.round(nums[0]),
    maxPrice: Math.round(nums[1] ?? nums[0]),
  };
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

function parseDetailLines(contentZoneHtml) {
  if (!contentZoneHtml) return [];
  return decodeEntities(contentZoneHtml)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?i>/gi, "")
    .replace(/<[^>]+>/g, "")
    .split("\n")
    .map((line) => normalize(line))
    .filter(Boolean);
}

function parseDimensions(line) {
  if (!line) return {};
  const cmPart = line.match(/\(([^)]*cm\.[^)]*)\)/i)?.[1] || "";
  const target = cmPart || line;
  const match = target.match(DIMENSIONS_RE);
  if (!match) return {};

  const width = Number(match[1]);
  const height = Number(match[2]);
  const depth = match[3] ? Number(match[3]) : undefined;
  if ([width, height, depth].some((n) => Number.isNaN(n))) return {};
  return { width, height, depth };
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

    if (!signature && SIGNATURE_HINT_RE.test(line)) {
      signature = line;
      continue;
    }
    if (!dimensionsText && /x/i.test(line) && /(in\.|cm\.)/i.test(line)) {
      dimensionsText = line;
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
  return filePath;
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
    "currency",
    "estimateText",
    "source",
    "sourceUrl",
    "sourceLotId",
    "provenance",
    "exhibited",
    "literature",
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
  const matches = html.match(/<li class="col-12 px-0">[\s\S]*?<\/li>/g);
  return matches || [];
}

function parseLotBlock(block, index) {
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

  const sourceUrl = normalize(
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
  const estimate = parseMoneyRange(estimateText);

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
    price: estimate.price,
    maxPrice: estimate.maxPrice,
    currency: estimate.currency,
    estimateText: estimate.estimateText,
    source: SOURCE_NAME,
    sourceUrl,
    sourceImage,
    sourceLotId,
    sourceLotNumber: lotNumber || undefined,
    provenance: detailFields.provenance,
    exhibited: detailFields.exhibited,
    literature: detailFields.literature,
    tags: [consigner].filter(Boolean),
    isAuction: true,
    endDate: END_DATE || undefined,
    useForTaster: true,
    isPrivate: false,
    ambiguousDetails: detailFields.ambiguousDetails,
  };
}

async function main() {
  const html = await fs.readFile(INPUT_HTML, "utf8");
  const lotBlocks = extractLotBlocks(html);
  const records = lotBlocks.map((block, i) => parseLotBlock(block, i));
  const usable = records.filter(
    (item) => item.title && item.artist && item.sourceImage,
  );
  const skipped = records.length - usable.length;

  if (!DRY_RUN) {
    await fs.mkdir(OUTPUT_ROOT, { recursive: true });
    const seen = new Map();
    const total = usable.length;
    console.log(`Starting export of ${total} artworks...`);

    for (let i = 0; i < usable.length; i += 1) {
      const item = usable[i];
      console.log(`[${i + 1}/${total}] Processing: ${item.title} — ${item.artist}`);
      const dupCount = seen.get(item.folderSlug) || 0;
      seen.set(item.folderSlug, dupCount + 1);
      const suffix = dupCount > 0 ? `_${dupCount + 1}` : "";
      const folderPath = path.join(OUTPUT_ROOT, `${item.folderSlug}${suffix}`);
      await fs.mkdir(folderPath, { recursive: true });

      if (DOWNLOAD_IMAGES) {
        try {
          await downloadImage(item.sourceImage, folderPath);
        } catch (err) {
          console.error(
            `✖ Image download failed for "${item.title}": ${err.message}`,
          );
        }
      }

      await fs.writeFile(
        path.join(folderPath, "metadata.json"),
        `${JSON.stringify(item, null, 2)}\n`,
      );

      if (SLEEP_MS > 0 && DOWNLOAD_IMAGES) await sleep(SLEEP_MS);
    }
  }

  const coverage = coverageSummary(usable);
  console.log(`Total lot tiles: ${records.length}`);
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
