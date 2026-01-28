/**
 * Parse the Wright20 auction HTML (wright20_auction.html) into structured artwork folders.
 * - Creates inventory/TasterMatcherWright20Auction_20260204/<sanitized_title>/image.<ext> + metadata.json
 * - Extracts title, artist, estimate range -> price (low) and maxPrice (high)
 * - Marks isAuction = true, useForTaster = true, isPrivate = false
 *
 * Usage:
 *   pnpm add cheerio node-fetch@2 fs-extra
 *   node scripts/scapper/parse_wright20_auction.js
 */

import { load } from "cheerio";
import fs from "fs-extra";
import fetch from "node-fetch";
import path from "path";

const __dirname = path.dirname(new URL(import.meta.url).pathname);
const INPUT_HTML = path.join(__dirname, "inventory", "wright20_auction.html");
const OUTPUT_ROOT = path.join(
  __dirname,
  "inventory",
  "TasterMatcherWright20Auction_20260204",
);

const END_DATE = "2026-02-04T17:00";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const sanitizeFolderName = (name) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

function parseMoneyToUSD(text) {
  if (!text) return { price: undefined, maxPrice: undefined };
  const cleaned = text.replace(/\s+/g, "").replace(/,/g, "");
  const parts = cleaned
    .replace(/[^\d.-]/g, "-")
    .split("-")
    .filter(Boolean);
  const nums = parts.map((p) => Number(p)).filter((n) => !Number.isNaN(n));
  if (nums.length === 0) return { price: undefined, maxPrice: undefined };
  const low = nums[0];
  const high = nums[1] ?? nums[0];
  return { price: Math.round(low), maxPrice: Math.round(high) };
}

function pickLargestImageUrl(srcset, fallback) {
  if (srcset) {
    const entries = srcset
      .split(",")
      .map((s) => s.trim())
      .map((s) => {
        const [url, size] = s.split(/\s+/);
        const width = size ? parseInt(size.replace(/[^\d]/g, ""), 10) : 0;
        return { url, width };
      })
      .filter((e) => e.url);
    const best = entries.sort((a, b) => b.width - a.width)[0];
    if (best) return best.url;
  }
  return fallback;
}

async function downloadImage(url, destPath) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `Failed to download ${url}: ${res.status} ${res.statusText}`,
    );
  }
  await fs.ensureDir(path.dirname(destPath));
  const stream = fs.createWriteStream(destPath);
  await new Promise((resolve, reject) => {
    res.body.pipe(stream);
    res.body.on("error", reject);
    stream.on("finish", resolve);
  });
}

async function main() {
  const html = await fs.readFile(INPUT_HTML, "utf8");
  const $ = load(html);

  const items = [];
  $("div.___item").each((_, el) => {
    const title = $(el).find(".title span").first().text().trim();
    const artist = $(el).find(".artist .name").first().text().trim();
    let estimateText = $(el).find(".estimate span").first().text().trim();
    if (!estimateText) {
      const dataEstimate = $(el).attr("data-estimate");
      if (dataEstimate) estimateText = `$${dataEstimate}`;
    }
    const { price, maxPrice } = parseMoneyToUSD(estimateText);

    const img = $(el).find("img").first();
    const srcset = img.attr("data-srcset") || img.attr("srcset") || "";
    const src = img.attr("data-src") || img.attr("src") || "";
    const imageUrl = pickLargestImageUrl(srcset, src);

    if (!title || !artist || !imageUrl) return;
    items.push({ title, artist, price, maxPrice, imageUrl });
  });

  console.log(`Found ${items.length} artworks`);
  await fs.ensureDir(OUTPUT_ROOT);

  for (const item of items) {
    const folder = path.join(OUTPUT_ROOT, sanitizeFolderName(item.title));
    await fs.ensureDir(folder);

    const extMatch = item.imageUrl.split(".").pop()?.split("?")[0] || "jpg";
    const ext = extMatch.toLowerCase().includes("png") ? "png" : "jpg";
    const imagePath = path.join(folder, `image.${ext}`);

    try {
      await downloadImage(item.imageUrl, imagePath);
      await fs.writeJson(
        path.join(folder, "metadata.json"),
        {
          title: item.title,
          artist: item.artist,
          price: item.price,
          maxPrice: item.maxPrice ?? item.price,
          useForTaster: true,
          isPrivate: false,
          isAuction: true,
          endDate: END_DATE,
          sourceImage: item.imageUrl,
        },
        { spaces: 2 },
      );
      console.log(`✔ Saved ${item.title}`);
      await sleep(200);
    } catch (err) {
      console.error(`✖ Failed ${item.title}: ${err.message}`);
    }
  }

  console.log(`\nDone. Output at ${OUTPUT_ROOT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
