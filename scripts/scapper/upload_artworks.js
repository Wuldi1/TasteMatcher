import FormData from "form-data";
import fs from "fs-extra";
import fetch from "node-fetch";
import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";
import path from "path";
import { fileURLToPath } from "node:url";
import { login } from "./login.js";

const SCAPPER_ROOT = path.dirname(fileURLToPath(import.meta.url));

const INVENTORY_PROVIDER_ROOTS = {
  christies: path.join(SCAPPER_ROOT, "inventory", "parsed_christies"),
  philip: path.join(SCAPPER_ROOT, "inventory", "parsed_philips"),
};

const LEARNING_CONTENT_DIR = path.join(
  SCAPPER_ROOT,
  "learning",
  "TasteMatcherTestContent",
);

const INTER_UPLOAD_DELAY_MS = 300;
const INITIAL_RETRY_DELAY_MS = 2000;
const MAX_RETRY_DELAY_MS = 60000;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class UploadError extends Error {
  constructor(message, { retryable = true, status, kind } = {}) {
    super(message);
    this.name = "UploadError";
    this.retryable = retryable;
    this.status = status;
    this.kind = kind;
  }
}

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

async function readArtworkPayload(folderPath) {
  const metadataPath = path.join(folderPath, "metadata.json");
  if (!(await fs.pathExists(metadataPath))) {
    throw new UploadError(`No metadata.json in ${folderPath}`, {
      retryable: false,
      kind: "missing_metadata",
    });
  }

  const metadata = await fs.readJson(metadataPath);
  const files = await fs.readdir(folderPath);
  const imageFile = files.find((f) => f.startsWith("image."));

  if (!imageFile) {
    throw new UploadError(`No image file in ${folderPath}`, {
      retryable: false,
      kind: "missing_image",
    });
  }

  return {
    metadata,
    imagePath: path.join(folderPath, imageFile),
  };
}

async function uploadArtworkOnce(item, token, domainId, apiBaseUrl) {
  const { metadata, imagePath } = await readArtworkPayload(item.folderPath);

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
    throw new UploadError(
      `Upload failed (${res.status} ${res.statusText}) ${metadata.title || item.artworkFolder}: ${errorText}`,
      {
        retryable: true,
        status: res.status,
        kind: "http_error",
      },
    );
  }

  return {
    metadata,
    response: await res.json().catch(() => ({})),
  };
}

async function askChoice(
  rl,
  promptText,
  options,
  envKeys = [],
  defaultIndex = 0,
) {
  console.log(promptText);
  options.forEach((opt, i) => {
    console.log(`  [${i + 1}] ${opt.label}`);
  });

  for (const key of envKeys) {
    const envOverride = process.env[key];
    if (!envOverride) continue;
    const found = options.find(
      (o) =>
        String(o.value).toLowerCase() === String(envOverride).toLowerCase(),
    );
    if (found) return found.value;
  }

  const raw = (
    await rl.question(`Choose an option [${defaultIndex + 1}]: `)
  ).trim();

  const idx =
    raw === ""
      ? defaultIndex
      : Math.max(0, Math.min(options.length - 1, (parseInt(raw, 10) || 1) - 1));

  return options[idx].value;
}

async function askMultiChoice(
  rl,
  promptText,
  options,
  envKey,
  defaultIndices = [0],
) {
  console.log(promptText);
  options.forEach((opt, i) => {
    console.log(`  [${i + 1}] ${opt.label}`);
  });

  const envRaw = process.env[envKey];
  if (envRaw) {
    const selectedValues = envRaw
      .split(",")
      .map((x) => x.trim().toLowerCase())
      .filter(Boolean);
    const matched = options
      .filter((o) => selectedValues.includes(String(o.value).toLowerCase()))
      .map((o) => o.value);
    if (matched.length > 0) {
      return [...new Set(matched)];
    }
  }

  const defaultText = defaultIndices.map((i) => i + 1).join(",");
  const raw = (
    await rl.question(
      `Choose one or more options (comma-separated) [${defaultText}]: `,
    )
  ).trim();

  const indices =
    raw === ""
      ? defaultIndices
      : raw
          .split(",")
          .map((x) => parseInt(x.trim(), 10) - 1)
          .filter((n) => Number.isInteger(n) && n >= 0 && n < options.length);

  const selected = [...new Set(indices)].map((i) => options[i].value);
  if (selected.length === 0) {
    return defaultIndices.map((i) => options[i].value);
  }
  return selected;
}

async function discoverArtworkFoldersFromRoot(rootPath, provider) {
  const discovered = [];

  async function walk(currentPath) {
    const dirEntries = await fs.readdir(currentPath, { withFileTypes: true });
    const fileNames = dirEntries.filter((d) => d.isFile()).map((d) => d.name);

    const hasMetadata = fileNames.includes("metadata.json");
    const hasImage = fileNames.some((name) => name.startsWith("image."));

    if (hasMetadata && hasImage) {
      const relativePath = path.relative(rootPath, currentPath);
      const pathParts = relativePath.split(path.sep).filter(Boolean);
      const auction = pathParts.length >= 2 ? pathParts[0] : "(root)";
      discovered.push({
        provider,
        rootPath,
        folderPath: currentPath,
        relativePath,
        auction,
        artworkFolder: path.basename(currentPath),
      });
      return;
    }

    for (const entry of dirEntries) {
      if (!entry.isDirectory()) continue;
      await walk(path.join(currentPath, entry.name));
    }
  }

  await walk(rootPath);
  return discovered;
}

function providerLabel(provider) {
  if (provider === "christies") return "Christies";
  if (provider === "philip") return "Philip";
  return provider;
}

function buildItemLabel(item) {
  return `${providerLabel(item.provider)} / ${item.auction} / ${item.artworkFolder}`;
}

async function uploadWithRetryUntilSuccess({
  item,
  getToken,
  setToken,
  domainId,
  apiBaseUrl,
  email,
}) {
  let attempt = 0;
  let retryDelayMs = INITIAL_RETRY_DELAY_MS;
  let retryCount = 0;

  while (true) {
    attempt += 1;
    try {
      const token = getToken();
      const result = await uploadArtworkOnce(item, token, domainId, apiBaseUrl);
      return {
        success: true,
        metadata: result.metadata,
        attempts: attempt,
        retries: retryCount,
      };
    } catch (err) {
      const normalizedErr =
        err instanceof UploadError
          ? err
          : new UploadError(err?.message || String(err), {
              retryable: true,
              kind: "network_error",
            });

      if (!normalizedErr.retryable) {
        return {
          success: false,
          attempts: attempt,
          retries: retryCount,
          terminal: true,
          error: normalizedErr.message,
          kind: normalizedErr.kind,
        };
      }

      retryCount += 1;

      if (normalizedErr.status === 401 || normalizedErr.status === 403) {
        console.log("    auth issue detected, refreshing token...");
        try {
          const refreshed = await login(apiBaseUrl, email);
          setToken(refreshed);
          console.log("    token refreshed, retrying upload.");
        } catch (refreshErr) {
          console.log(`    token refresh failed: ${refreshErr.message}`);
        }
      }

      console.log(
        `    upload failed (attempt ${attempt}): ${normalizedErr.message}`,
      );
      console.log(`    retrying in ${retryDelayMs}ms...`);

      await delay(retryDelayMs);
      retryDelayMs = Math.min(
        Math.round(retryDelayMs * 1.5),
        MAX_RETRY_DELAY_MS,
      );
    }
  }
}

async function main() {
  const rl = createInterface({ input, output });

  try {
    const apiTarget = await askChoice(
      rl,
      "Select API target:",
      [
        { label: "Local API", value: "local" },
        { label: "Production API", value: "production" },
      ],
      ["TM_API_TARGET"],
      1,
    );

    const apiBaseUrl =
      apiTarget === "production"
        ? process.env.API_BASE_URL_PROD || "https://api.tastematcher.art"
        : process.env.API_BASE_URL_LOCAL || "http://localhost:8080";

    const mode = await askChoice(
      rl,
      "Select mode:",
      [
        { label: "Inventory", value: "inventory" },
        { label: "Learning", value: "learning" },
      ],
      ["TM_MODE"],
      0,
    );

    let ownerChoice = "gal";
    if (mode === "inventory") {
      ownerChoice = await askChoice(
        rl,
        "Select owner:",
        [
          { label: "Gal", value: "gal" },
          { label: "Jaclyn", value: "jaclyn" },
          { label: "Jaclyn Test", value: "jaclyntest" },
        ],
        ["TM_OWNER"],
        0,
      );
    } else {
      console.log("Learning mode selected. owner set to 'gal'.");
      ownerChoice = "gal";
    }

    let selectedProviders = [];
    if (mode === "inventory") {
      selectedProviders = await askMultiChoice(
        rl,
        "Select inventory provider(s):",
        [
          { label: "Christies", value: "christies" },
          { label: "Philip", value: "philip" },
        ],
        "TM_PROVIDERS",
        [0],
      );
    }

    rl.close();

    const emailMap = {
      gal: process.env.TM_EMAIL_GAL || "galrubin15@gmail.com",
      jaclyn: process.env.TM_EMAIL_JACLYN || "jaclynlavy@gmail.com",
      jaclyntest: process.env.TM_EMAIL_JACLYNTEST || "jaclyntest@gmail.com",
    };
    const email = emailMap[ownerChoice];

    let token = await login(apiBaseUrl, email);

    let domainId;
    if (mode === "learning") {
      domainId = "00000000-0000-0000-0000-000000000000";
      console.log(`Learning mode domainId: ${domainId}`);
    } else {
      domainId = getDomainIdFromToken(token);
      console.log(`Extracted domainId: ${domainId}`);
    }

    const discoveredItems = [];

    if (mode === "learning") {
      if (!(await fs.pathExists(LEARNING_CONTENT_DIR))) {
        throw new Error(
          `Learning content directory not found: ${LEARNING_CONTENT_DIR}`,
        );
      }

      const learningItems = await discoverArtworkFoldersFromRoot(
        LEARNING_CONTENT_DIR,
        "learning",
      );
      discoveredItems.push(...learningItems);
      console.log(
        `Discovered ${learningItems.length} artwork folder(s) in learning mode from ${LEARNING_CONTENT_DIR}`,
      );
    } else {
      console.log(`Selected providers: ${selectedProviders.join(", ")}`);

      for (const provider of selectedProviders) {
        const rootPath = INVENTORY_PROVIDER_ROOTS[provider];
        if (!rootPath) {
          console.log(`Skipping unknown provider: ${provider}`);
          continue;
        }

        if (!(await fs.pathExists(rootPath))) {
          console.log(
            `Provider root not found for ${providerLabel(provider)}: ${rootPath}`,
          );
          continue;
        }

        const providerItems = await discoverArtworkFoldersFromRoot(
          rootPath,
          provider,
        );

        const auctions = [...new Set(providerItems.map((x) => x.auction))];
        console.log(
          `Provider ${providerLabel(provider)}: discovered ${providerItems.length} artwork folder(s) across ${auctions.length} auction folder(s).`,
        );

        discoveredItems.push(...providerItems);
      }
    }

    if (discoveredItems.length === 0) {
      throw new Error("No upload-ready artwork folders found.");
    }

    console.log(
      `\nStarting upload for ${discoveredItems.length} artwork(s)...`,
    );
    console.log(`API target: ${apiTarget}`);
    console.log(`API base URL: ${apiBaseUrl}`);
    console.log(`Mode: ${mode}`);
    console.log(`Owner: ${ownerChoice} (${email})`);

    const summary = {
      totalDiscovered: discoveredItems.length,
      uploaded: 0,
      skippedInvalid: 0,
      failedTerminal: 0,
      totalAttempts: 0,
      totalRetries: 0,
      itemsWithRetries: 0,
    };

    for (let i = 0; i < discoveredItems.length; i += 1) {
      const item = discoveredItems[i];
      const itemLabel = buildItemLabel(item);
      console.log(
        `\n[${i + 1}/${discoveredItems.length}] Uploading ${itemLabel}`,
      );

      const outcome = await uploadWithRetryUntilSuccess({
        item,
        getToken: () => token,
        setToken: (newToken) => {
          token = newToken;
        },
        domainId,
        apiBaseUrl,
        email,
      });

      summary.totalAttempts += outcome.attempts;
      summary.totalRetries += outcome.retries;
      if (outcome.retries > 0) summary.itemsWithRetries += 1;

      if (outcome.success) {
        summary.uploaded += 1;
        const title = outcome.metadata?.title || item.artworkFolder;
        const artist = outcome.metadata?.artist || "Unknown";
        console.log(
          `  success: ${title} by ${artist} (attempts=${outcome.attempts}, retries=${outcome.retries})`,
        );
      } else if (outcome.terminal) {
        if (
          outcome.kind === "missing_metadata" ||
          outcome.kind === "missing_image"
        ) {
          summary.skippedInvalid += 1;
          console.log(`  skipped invalid folder: ${outcome.error}`);
        } else {
          summary.failedTerminal += 1;
          console.log(`  terminal failure: ${outcome.error}`);
        }
      }

      await delay(INTER_UPLOAD_DELAY_MS);
      console.log(
        `  progress: uploaded=${summary.uploaded}/${summary.totalDiscovered}, retries=${summary.totalRetries}`,
      );
    }

    console.log("\nUpload summary");
    console.log(`- Discovered: ${summary.totalDiscovered}`);
    console.log(`- Uploaded: ${summary.uploaded}`);
    console.log(`- Skipped invalid folders: ${summary.skippedInvalid}`);
    console.log(`- Terminal failures: ${summary.failedTerminal}`);
    console.log(`- Total attempts: ${summary.totalAttempts}`);
    console.log(`- Total retries: ${summary.totalRetries}`);
    console.log(`- Items with retries: ${summary.itemsWithRetries}`);

    if (summary.failedTerminal > 0) {
      process.exitCode = 1;
    }
  } catch (err) {
    console.error(`Fatal error: ${err.message || err}`);
    process.exit(1);
  } finally {
    try {
      rl.close();
    } catch {
      // noop
    }
  }
}

main();
