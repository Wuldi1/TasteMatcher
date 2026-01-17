import fs from "fs-extra";
import path from "path";
import fetch from "node-fetch";
import { login } from "./login.js";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const CONTENT_DIR = path.resolve("JaclynContent");

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

async function fetchArtworksPage({
  apiBaseUrl,
  domainId,
  token,
  continuationToken,
  limit = 50,
}) {
  const params = new URLSearchParams();
  params.set("limit", String(limit));
  if (continuationToken) {
    params.set("continuationToken", continuationToken);
  }

  const res = await fetch(
    `${apiBaseUrl}/domains/${domainId}/artworks?${params.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );

  if (!res.ok) {
    const errorText = await res.text().catch(() => "");
    throw new Error(
      `Failed to fetch artworks: ${res.statusText} - ${errorText}`,
    );
  }

  return res.json();
}

async function downloadImage(url, targetPath) {
  const res = await fetch(url);
  if (!res.ok) {
    const errorText = await res.text().catch(() => "");
    throw new Error(`Image download failed: ${res.statusText} - ${errorText}`);
  }

  const buffer = await res.buffer();
  await fs.writeFile(targetPath, buffer);
}

async function main() {
  const rl = createInterface({ input, output });

  async function askChoice(promptText, options, defaultIndex = 0) {
    console.log(promptText);
    options.forEach((opt, i) => {
      console.log(`  [${i + 1}] ${opt.label}`);
    });

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
        ? process.env.API_BASE_URL_PROD || "https://tastematcher.art"
        : process.env.API_BASE_URL_DEV || "http://localhost:8080";

    const mode = await askChoice(
      "Select mode:",
      [
        { label: "Inventory", value: "inventory" },
        { label: "Learning", value: "learning" },
      ],
      0,
    );

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

    const verificationCode =
      process.env.TM_VERIFICATION_CODE ||
      (await rl.question("Verification code [000000]: ")) ||
      "000000";

    rl.close();

    console.log(`Using environment: ${env}`);
    console.log(`API base URL: ${apiBaseUrl}`);
    console.log(`Mode: ${mode}`);
    console.log(`Owner: ${ownerChoice} (${email})`);
    console.log(`Output directory: ${CONTENT_DIR}`);

    const token = await login(apiBaseUrl, email, verificationCode);

    let domainId;
    if (mode === "learning") {
      domainId = "00000000-0000-0000-0000-000000000000";
      console.log(`Learning mode: using fixed domainId ${domainId}`);
    } else {
      domainId = getDomainIdFromToken(token);
      console.log(`Extracted domainId from token: ${domainId}`);
    }

    await fs.ensureDir(CONTENT_DIR);

    let continuationToken;
    let total = 0;
    let page = 1;

    console.log(`\n⬇️  Downloading artworks into ${CONTENT_DIR}...\n`);

    while (true) {
      const pageData = await fetchArtworksPage({
        apiBaseUrl,
        domainId,
        token,
        continuationToken,
      });

      const items = Array.isArray(pageData.items) ? pageData.items : [];
      continuationToken = pageData.continuationToken || undefined;

      for (const artwork of items) {
        if (!artwork?.id) {
          continue;
        }

        const folderPath = path.join(CONTENT_DIR, artwork.id);
        await fs.ensureDir(folderPath);

        const metadataPath = path.join(folderPath, "metadata.json");
        await fs.writeJson(metadataPath, artwork, { spaces: 2 });

        const imageUrl = artwork.filename;
        if (typeof imageUrl === "string" && imageUrl.length > 0) {
          const parsedUrl = new URL(imageUrl);
          const ext = path.extname(parsedUrl.pathname) || ".jpg";
          const imagePath = path.join(folderPath, `image${ext}`);
          try {
            await downloadImage(imageUrl, imagePath);
          } catch (err) {
            console.error(
              `⚠️  Failed to download image for ${artwork.id}: ${err.message || err}`,
            );
          }
        } else {
          console.warn(`⚠️  Missing image URL for ${artwork.id}`);
        }

        total += 1;
        console.log(`✅ Saved artwork ${artwork.id}`);
        await delay(100);
      }

      console.log(
        `Page ${page} complete. Total downloaded: ${total}${
          continuationToken ? "" : " (done)"
        }`,
      );
      page += 1;

      if (!continuationToken) break;
    }

    console.log(`\n🎉 Download complete! ${total} artworks saved.`);
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
