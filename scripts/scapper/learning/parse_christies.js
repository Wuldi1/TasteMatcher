import fs from "fs";
import path from "path";
import fetch from "node-fetch"; // if using Node 18+, you can skip this import
import { load } from "cheerio";

// Utility to clean folder names
function cleanName(name) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Download image using fetch and fs.writeFile
async function downloadImage(url, filepath) {
  const cleanUrl = url.split("?")[0]; // Remove query params for cleaner filenames
  console.log(`Downloading image from: ${cleanUrl}`);
  const headers = {
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Encoding": "gzip, deflate, br",
    "Accept-Language": "en-GB,en-US;q=0.9,en;q=0.8",
    Connection: "keep-alive",
    Cookie:
      "bm_sv=5D1052C661762A5CF9C6D4E20884E252~YAAQX7YkF2ioSamaAQAAIUHuxh0/or0JzSLQHqvBsyObz9u//Diy7G2cjV0jUmgtbvvMau8I9Jf3fduHgw4S2jxgwO8mBi5evDFNRuh9y4AVypn23FyJKa/BUMiZQRS3QfCfNaFT/LqhWdRyT3awIZqYP/3nRPb1pw+WcfrR/zSbGMzo2+mPtLk2Ka6BfHdRpT3uiUra8c3Lp0dhEzpKHH4ds8CYZitplYFmxv5JExFBDzN84UFUt+WMroXA8HhT/yhOzw==~1; CurrentLanguage=en; OptanonConsent=isGpcEnabled=0&datestamp=Thu+Nov+27+2025+22%3A07%3A53+GMT%2B0200+(Israel+Standard+Time)&version=202510.2.0&browserGpcFlag=0&isIABGlobal=false&hosts=&consentId=442428d5-1c2b-43e8-b741-f7a8eed6d635&interactionCount=1&isAnonUser=1&landingPath=NotLandingPage&groups=3%3A0%2C1%3A1%2C2%3A0%2C4%3A0&intType=2&geolocation=IL%3BTA&AwaitingReconsent=false; ASP.NET_SessionId=nqp0d3i0rss4uvjefjbm1aa1; SC_ANALYTICS_GLOBAL_COOKIE=3d86d5f81e6b421f8fc2de2b3260e271|False; discovery website#lang=en; shell#lang=en; sxa_site=Discovery Website; ARRAffinity=da1ccb1cdf439bb4d42742962f3f2d5dd6a2f9bdd3bbb443a5d6c38b4be7fa3a; ARRAffinitySameSite=da1ccb1cdf439bb4d42742962f3f2d5dd6a2f9bdd3bbb443a5d6c38b4be7fa3a; WebClientId=0; cba=; OptanonAlertBoxClosed=2025-11-27T19:37:31.189Z; ak_bmsc=5E25FEC64CC275499CC137394BC29003~000000000000000000000000000000~YAAQX7YkF1EBPKmaAQAA0xvSxh24jQvZ5k+COut/RjyMgOa8RG4RmNDGoY+x6uY35nWITfzcF705HiI5jpiF8GRIEGTNarAkU3jZtZwwQVqM2Vd80xolBtZSLdOOPkt8ko2gDblugs4KD5k/lCqNeeEt6iAb11vm37eP+2ZXaH6tFIsraH/WNSpKKosJdoPqDCIiWyLS7wSedyCj65vJMGWt+RxT4nnOBq9X3KEJo9Ky8nUTNsXld6Gh+mAbYkYwMRjTRebhP8u1OSw/jg7qoVZOVbpqy5XVEo/cl0QN6DSI7PYCXyuAJalKZXCEBVtSbPQfCflWGxwKZAUGcSFkxx1ACUKv6EzkEEQJGQoq5vuT0f/ayweiWB7/KSbE6okv8tCN0c+/TspHY1lGlO/DuRGLvf6/u0PAzcGGYjjEYiEBdMZG5So+VeLe1BGfdGGzB1Mj",
    Priority: "u=0, i",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15",
  };

  const response = await fetch(cleanUrl, { headers });
  if (!response.ok) throw new Error(`Failed to fetch image: ${cleanUrl}`);

  const buffer = await response.arrayBuffer();
  fs.writeFileSync(filepath, Buffer.from(buffer));
  console.log(`  Image saved to: ${filepath}`);
}

// Parse and save one artwork from a <li> element
async function parseAndSaveArtwork(
  el,
  $,
  outputDir = "./TasteMatcherTestContent",
) {
  const tile = $(el);

  const primaryTitle = tile.find(".chr-lot-tile__primary-title").text().trim();
  const secondaryTitle = tile
    .find(".chr-lot-tile__secondary-title")
    .text()
    .trim();
  const content =
    tile.find(".chr-readmore-expander__content .content-zone").html() || "";
  const description = content
    .replace(/<br>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .trim();

  let price = 0;
  const priceText = tile
    .find(".chr-lot-tile__secondary-price-value")
    .text()
    .trim();
  if (priceText) {
    const match = priceText.replace(/,/g, "").match(/USD (\d+)/);
    if (match) price = parseInt(match[1], 10);
  }

  const imgEl = tile.find(".chr-img__wrapper img").first();
  const imgUrl = imgEl.attr("src");

  const artwork = {
    title: secondaryTitle,
    description,
    artist: primaryTitle,
    category: "",
    classification: "",
    department: "",
    country: "",
    date: "",
    dominions: [],
    tags: [],
    price,
    imageUrl: imgUrl,
  };

  const folderName = cleanName(artwork.title || "untitled");
  const folderPath = path.join(outputDir, folderName);
  if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath, { recursive: true });

  console.log(`\nProcessing artwork: "${artwork.title}"`);
  console.log(`  Folder: ${folderPath}`);

  // Save metadata
  const metadataPath = path.join(folderPath, "metadata.json");
  const { imageUrl, ...metadata } = artwork;
  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
  console.log(`  Metadata saved to: ${metadataPath}`);

  // Download image
  if (artwork.imageUrl) {
    const ext = artwork.imageUrl.includes(".png") ? "png" : "jpeg";
    const imagePath = path.join(folderPath, `Image.${ext}`);
    await downloadImage(artwork.imageUrl, imagePath);
  }

  console.log(`Finished processing artwork: "${artwork.title}"`);
}

// Main sequential flow
async function main() {
  console.log("Reading HTML file: christies-1.html");
  const html = fs.readFileSync("./christies-1.html", "utf-8");
  const $ = load(html);

  const artworkElements = $("li.col-12.px-0 chr-lot-tile");
  console.log(`Found ${artworkElements.length} artworks.`);

  for (let i = 0; i < artworkElements.length; i++) {
    console.log(`\n=== Artwork ${i + 1} of ${artworkElements.length} ===`);
    await parseAndSaveArtwork(artworkElements[i], $);
  }

  console.log("\nAll artworks processed!");
}

main().catch(console.error);
