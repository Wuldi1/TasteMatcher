/**
 * Parse the Philips auction HTML (philip_auction.html) into structured artwork folders.
 * - Creates inventory/TasterMatcherPhilipAuction/<sanitized_title>/image.<ext> + metadata.json
 * - Extracts title, artist, estimate range -> price (low) and maxPrice (high)
 * - Marks isAuction = true
 * - Converts € and £ estimates to USD using static FX rates below
 *
 * Usage:
 *   pnpm add cheerio node-fetch@2 fs-extra
 *   node scripts/scapper/inventory/process_philip_auction.js
 */

import fs from "fs-extra";
import path from "path";
import fetch from "node-fetch";
import { load } from "cheerio";

const __dirname = path.dirname(new URL(import.meta.url).pathname);
const INPUT_HTML = path.join(__dirname, "inventory", "philip_auction.html");
const OUTPUT_ROOT = path.join(
  __dirname,
  "inventory",
  "TasterMatcherPhilipAuction"
);

const EUR_TO_USD = 1.1; // static FX
const GBP_TO_USD = 1.27;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const sanitizeFolderName = (name) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

function parseMoneyToUSD(text) {
  if (!text) return { price: undefined, maxPrice: undefined };
  const cleaned = text.replace(/\s+/g, "").replace(/,/g, "");
  const isEuro = cleaned.includes("€");
  const isGbp = cleaned.includes("£");
  const currency = isEuro ? "EUR" : isGbp ? "GBP" : "USD";
  const parts = cleaned
    .replace(/[^\d.-]/g, "-")
    .split("-")
    .filter(Boolean);
  const nums = parts.map((p) => Number(p)).filter((n) => !Number.isNaN(n));
  if (nums.length === 0) return { price: undefined, maxPrice: undefined };
  const low = nums[0];
  const high = nums[1] ?? nums[0];
  const rate =
    currency === "EUR" ? EUR_TO_USD : currency === "GBP" ? GBP_TO_USD : 1;
  return { price: Math.round(low * rate), maxPrice: Math.round(high * rate) };
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
  if (!res.ok)
    throw new Error(
      `Failed to download ${url}: ${res.status} ${res.statusText}`
    );
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
  $("[data-testid='grid-item']").each((_, el) => {
    const title = $(el)
      .find(".seldon-object-tile__title .pah-html-parser")
      .text()
      .trim();
    const artist = $(el)
      .find(".seldon-object-tile__maker .pah-html-parser")
      .text()
      .trim();
    const estimateText = $(el)
      .find(
        ".seldon-object-tile__estimate [data-testid='text'].seldon-text--bodySmall"
      )
      .text()
      .trim();
    const { price, maxPrice } = parseMoneyToUSD(estimateText);

    const img = $(el).find("[data-testid='seldon-image-img']");
    const srcset = img.attr("srcset") || "";
    const src = img.attr("src") || "";
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
          isAuction: true,
          endDate: "2026-01-22T23:59",
          sourceImage: item.imageUrl,
        },
        { spaces: 2 }
      );
      console.log(`✔ Saved ${item.title}`);
      await sleep(200); // avoid hammering the source
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
