import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const allowedFunctions = [
  "ProcessImagesFromBlob",
  "NotifyUsersNewArtwork",
  "DailyDomainOwnerSummary",
];
const selectedFunction = process.argv[2];

if (!allowedFunctions.includes(selectedFunction)) {
  console.error(
    `Select exactly one function: ${allowedFunctions.join(", ")}.`,
  );
  process.exit(1);
}

let settings;
try {
  settings = JSON.parse(readFileSync("local.settings.json", "utf8")).Values;
} catch {
  console.error(
    "Missing or invalid ignored local.settings.json. Run the production-config sync first.",
  );
  process.exit(1);
}

if (!settings || typeof settings !== "object") {
  console.error("Invalid local.settings.json: Values must be an object.");
  process.exit(1);
}

if (
  settings.TASTEMATCHER_RUNTIME_MODE !== "local-production" ||
  settings.TASTEMATCHER_DATA_ENV !== "prd" ||
  settings.TASTEMATCHER_LOCAL_PROD_ACK !==
    "I_UNDERSTAND_THIS_USES_PRODUCTION_DATA" ||
  ["prd", "production"].includes(settings.NODE_ENV)
) {
  console.error(
    "Refusing unsafe local-production mode. Data must explicitly target prd, the acknowledgement must match, and NODE_ENV must remain development.",
  );
  process.exit(1);
}

for (const functionName of allowedFunctions) {
  const key = `AzureWebJobs.${functionName}.Disabled`;
  if (settings[key] !== "true") {
    console.error(
      `Refusing trigger configuration: ${key} must remain true in local.settings.json. No functions were started.`,
    );
    process.exit(1);
  }
}

console.warn(
  `Starting only ${selectedFunction} against production-backed data. This can mutate production data or consume live messages.`,
);
const result = spawnSync("func", ["start", "--functions", selectedFunction], {
  stdio: "inherit",
  env: {
    ...process.env,
    [`AzureWebJobs.${selectedFunction}.Disabled`]: "false",
  },
});

if (result.error) {
  console.error("Azure Functions Core Tools failed to start.");
  process.exit(1);
}
process.exit(result.status ?? 1);
