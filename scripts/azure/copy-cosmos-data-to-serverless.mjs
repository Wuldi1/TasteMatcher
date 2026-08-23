#!/usr/bin/env node
import { CosmosClient } from "@azure/cosmos";
import { execFileSync } from "node:child_process";

const SUBSCRIPTION_ID = "e105e38a-7820-4c7e-b1da-de05227d6355";
const RESOURCE_GROUP = "tastematcher-prd-rg";
const SOURCE_COSMOS_ACCOUNT = "tastematcher-prd-cosmos";
const TARGET_COSMOS_ACCOUNT = "tastematcher-prd-cosmos-sls";
const COSMOS_DATABASE = "tastematcher";
const CONTAINERS = ["Core", "Artworks", "Proposals"];
const MODE = process.argv[2] ?? "preflight";
const CONCURRENCY = 12;

if (MODE !== "preflight" && MODE !== "--apply") {
  console.error("Usage: scripts/azure/copy-cosmos-data-to-serverless.mjs [--apply]");
  process.exit(1);
}

function az(args) {
  return execFileSync("az", args, { encoding: "utf8" }).trim();
}

function requireAzureContext() {
  const activeSubscription = az(["account", "show", "--query", "id", "-o", "tsv"]);
  if (activeSubscription !== SUBSCRIPTION_ID) {
    throw new Error(`Unexpected Azure subscription: ${activeSubscription}`);
  }

  az(["group", "show", "--name", RESOURCE_GROUP, "--query", "name", "-o", "tsv"]);
  az(["cosmosdb", "show", "--name", SOURCE_COSMOS_ACCOUNT, "--resource-group", RESOURCE_GROUP, "-o", "none"]);
  az(["cosmosdb", "show", "--name", TARGET_COSMOS_ACCOUNT, "--resource-group", RESOURCE_GROUP, "-o", "none"]);
}

function cosmosKey(accountName) {
  return az([
    "cosmosdb",
    "keys",
    "list",
    "--name",
    accountName,
    "--resource-group",
    RESOURCE_GROUP,
    "--query",
    "primaryMasterKey",
    "-o",
    "tsv",
  ]);
}

function clientFor(accountName) {
  return new CosmosClient({
    endpoint: `https://${accountName}.documents.azure.com:443/`,
    key: cosmosKey(accountName),
  });
}

function stripSystemProperties(item) {
  const {
    _rid: _rid,
    _self: _self,
    _etag: _etag,
    _attachments: _attachments,
    _ts: _ts,
    ...clean
  } = item;

  void _rid;
  void _self;
  void _etag;
  void _attachments;
  void _ts;

  return clean;
}

async function fetchAll(container) {
  const { resources } = await container.items
    .query("SELECT * FROM c", { maxItemCount: 100 })
    .fetchAll();
  return resources.map(stripSystemProperties);
}

async function count(container) {
  const { resources } = await container.items
    .query("SELECT VALUE COUNT(1) FROM c")
    .fetchAll();
  return resources[0] ?? 0;
}

async function upsertAll(container, items) {
  let index = 0;
  let copied = 0;

  async function worker() {
    while (index < items.length) {
      const item = items[index];
      index += 1;
      await container.items.upsert(item);
      copied += 1;
    }
  }

  const workers = Array.from(
    { length: Math.min(CONCURRENCY, Math.max(items.length, 1)) },
    () => worker(),
  );
  await Promise.all(workers);
  return copied;
}

async function main() {
  requireAzureContext();

  const source = clientFor(SOURCE_COSMOS_ACCOUNT).database(COSMOS_DATABASE);
  const target = clientFor(TARGET_COSMOS_ACCOUNT).database(COSMOS_DATABASE);

  console.log("Cosmos copy baseline:");
  for (const containerName of CONTAINERS) {
    const sourceContainer = source.container(containerName);
    const targetContainer = target.container(containerName);
    const sourceCount = await count(sourceContainer);
    const targetCount = await count(targetContainer);
    console.log(`${containerName}: source=${sourceCount} target=${targetCount}`);
  }

  if (MODE === "preflight") {
    console.log("No documents were copied. Run with --apply to upsert source documents into the serverless account.");
    return;
  }

  for (const containerName of CONTAINERS) {
    const sourceContainer = source.container(containerName);
    const targetContainer = target.container(containerName);
    const items = await fetchAll(sourceContainer);
    const copied = await upsertAll(targetContainer, items);
    console.log(`${containerName}: copied=${copied}`);
  }

  console.log("Cosmos data copy completed without printing secret values.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
