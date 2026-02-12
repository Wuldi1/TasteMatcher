import FormData from "form-data";
import fs from "fs-extra";
import fetch from "node-fetch";
import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";
import path from "path";
import { login } from "./login.js";

let CONTENT_DIR;
// Helper to delay execution
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Helper to decode JWT and extract domainId
function getDomainIdFromToken(token) {
  try {
    const payload = JSON.parse(
      Buffer.from(token.split(".")[1], "base64").toString(),
    );
    return payload.domainId;
  } catch (err) {
    throw new Error(`Failed to decode token: ${err.message}`);
  }
}

async function uploadArtwork(folderPath, token, domainId, apiBaseUrl) {
  const metadataPath = path.join(folderPath, "metadata.json");

  if (!(await fs.pathExists(metadataPath))) {
    console.warn(`⚠️  No metadata.json in ${folderPath}`);
    return false;
  }

  const metadata = await fs.readJson(metadataPath);

  // Find image file
  const files = await fs.readdir(folderPath);
  const imageFile = files.find((f) => f.startsWith("image."));

  if (!imageFile) {
    console.warn(`⚠️  No image file in ${folderPath}`);
    return false;
  }

  const imagePath = path.join(folderPath, imageFile);

  // Prepare upload data
  const formData = new FormData();
  formData.append("file", fs.createReadStream(imagePath));
  formData.append("title", metadata.title || "");
  formData.append("artist", metadata.artist || "");
  formData.append("signature", metadata.signature ?? "");
  formData.append("medium", metadata.medium ?? "");
  formData.append("width", metadata.width ?? "");
  formData.append("height", metadata.height ?? "");
  formData.append("depth", metadata.depth ?? "");
  formData.append("date", metadata.date ?? "");
  formData.append("endDate", metadata.endDate ?? "");
  formData.append("price", metadata.price ?? "");
  formData.append("maxPrice", metadata.maxPrice ?? "");
  formData.append("isAuction", metadata.isAuction ? "true" : "false");
  formData.append("description", metadata.description ?? "");
  formData.append("useForTaster", metadata.useForTaster ? "true" : "false");
  formData.append("tags", JSON.stringify(metadata.tags || []));
  formData.append("metadata", JSON.stringify(metadata));

  // Upload to API with domainId
  const res = await fetch(`${apiBaseUrl}/domains/${domainId}/uploads`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      ...formData.getHeaders(),
    },
    body: formData,
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => "");
    throw new Error(
      `Upload failed for ${metadata.title}: ${res.statusText} - ${errorText}`,
    );
  }

  var result = await res.json();

  console.log(
    `✅ Artwork ${metadata.title} by ${metadata.artist} uploaded successfuly`,
  );

  return true;
}

async function main() {
  const rl = createInterface({ input, output });

  // small helper to prompt numbered choices
  async function askChoice(promptText, options, defaultIndex = 0) {
    // options: [{ label, value }, ...]
    console.log(promptText);
    options.forEach((opt, i) => {
      console.log(`  [${i + 1}] ${opt.label}`);
    });

    // Check for environment overrides that match option.value
    for (const key of ["TM_ENV", "TM_MODE", "TM_OWNER"]) {
      const envOverride = process.env[key];
      if (envOverride) {
        const found = options.find(
          (o) =>
            o.value &&
            String(envOverride).toLowerCase() === String(o.value).toLowerCase(),
        );
        if (found) return found.value;
      }
    }

    const raw = (
      await rl.question(`Choose an option [${defaultIndex + 1}]: `)
    ).trim();
    const idx =
      raw === ""
        ? defaultIndex
        : Math.max(
            0,
            Math.min(options.length - 1, (parseInt(raw, 10) || 1) - 1),
          );
    return options[idx].value;
  }

  try {
    // Environment choices: [1] Dev [2] Prod  (default Dev)
    const env = await askChoice(
      "Select environment:",
      [
        { label: "Dev", value: "dev" },
        { label: "Prod", value: "prd" },
      ],
      1,
    );
    const apiBaseUrl =
      env === "prd"
        ? process.env.API_BASE_URL_PROD || "https://api.tastematcher.art"
        : process.env.API_BASE_URL_DEV || "http://localhost:8080";

    // Mode choices: [1] Inventory [2] Learning  (default Inventory)
    const mode = await askChoice(
      "Select mode:",
      [
        { label: "Inventory", value: "inventory" },
        { label: "Learning", value: "learning" },
      ],
      0,
    );

    // Owner (only asked for inventory). [1] Gal [2] Jaclyn (default Gal)
    let ownerChoice = "gal";
    if (mode === "inventory") {
      ownerChoice = await askChoice(
        "Select owner:",
        [
          { label: "Gal", value: "gal" },
          { label: "Jaclyn", value: "jaclyn" },
          { label: "Jaclyn Test", value: "jaclyntest" },
        ],
        0,
      );
    } else {
      console.log("Learning mode selected — owner auto-set to 'gal'");
      ownerChoice = "gal";
    }

    const emailMap = {
      gal: process.env.TM_EMAIL_GAL || "galrubin15@gmail.com",
      jaclyn: process.env.TM_EMAIL_JACLYN || "jaclynlavy@gmail.com",
      jaclyntest: process.env.TM_EMAIL_JACLYNTEST || "jaclyntest@gmail.com",
    };
    const email = emailMap[ownerChoice];

    // compute content directory based on mode + owner (use requested folder names)
    if (mode === "learning") {
      CONTENT_DIR = path.resolve("learning", "TasteMatcherTestContent");
    } else {
      CONTENT_DIR = path.resolve(
        "inventory",
        "TasterMatcherPhilipAuction_NY010126",
      );
    }

    rl.close();

    console.log(`Using environment: ${env}`);
    console.log(`API base URL: ${apiBaseUrl}`);
    console.log(`Mode: ${mode}`);
    console.log(`Owner: ${ownerChoice} (${email})`);
    console.log(`Content directory: ${CONTENT_DIR}`);

    // Login first (login helper accepts apiBaseUrl, email)
    const token = await login(apiBaseUrl, email);

    // Determine domainId
    let domainId;
    if (mode === "learning") {
      domainId = "00000000-0000-0000-0000-000000000000";
      console.log(`Learning mode: using fixed domainId ${domainId}`);
    } else {
      domainId = getDomainIdFromToken(token);
      console.log(`Extracted domainId from token: ${domainId}`);
    }

    // Validate content dir exists
    if (!(await fs.pathExists(CONTENT_DIR))) {
      console.error(`❌ Content directory not found: ${CONTENT_DIR}`);
      process.exit(1);
    }

    // Get all artwork folders from chosen content dir
    const folders = await fs.readdir(CONTENT_DIR);
    let uploadCount = 0;

    console.log(
      `\n📤 Starting upload of ${folders.length} artworks from ${CONTENT_DIR}...\n`,
    );

    for (const folder of folders) {
      const folderPath = path.join(CONTENT_DIR, folder);
      let stat;
      try {
        stat = await fs.stat(folderPath);
      } catch {
        continue;
      }

      if (!stat.isDirectory()) continue;

      try {
        const success = await uploadArtwork(
          folderPath,
          token,
          domainId,
          apiBaseUrl,
        );
        if (success) {
          uploadCount++;
          console.log(`Progress: (${uploadCount}/${folders.length})`);
          // Add delay between uploads
          await delay(300);
        } else {
          console.warn(`⚠️  Skipped: ${folder}`);
        }
      } catch (err) {
        console.error(`❌ Error uploading ${folder}: ${err.message || err}`);
        // continue with next folder instead of exiting entirely
      }
    }

    console.log(
      `\n🎉 Upload complete! Successfully uploaded ${uploadCount} artworks.`,
    );
  } catch (err) {
    console.error("❌ Fatal error:", err);
    process.exit(1);
  } finally {
    try {
      rl.close();
    } catch {}
  }
}

main();
