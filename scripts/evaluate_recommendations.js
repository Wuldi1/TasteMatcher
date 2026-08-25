import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const common = require(path.join(REPO_ROOT, "common", "build", "index.js"));

const {
  buildRecommendationBehaviorProfile,
  cosineSimilarity,
  getAIRecommendationsEligibility,
  normalizeVector,
  scoreRecommendationCandidate,
} = common;

const DEFAULT_LIMIT = 20;
const DEFAULT_HOLDOUT_RATIO = 0.2;
const VECTOR_DIMENSIONS = 1024;

function usage() {
  return [
    "Usage:",
    "  node scripts/evaluate_recommendations.js --dataset ./recommendation-dataset.json",
    "  node scripts/evaluate_recommendations.js --users ./users.json --artworks ./artworks.json --preferences ./preferences.json",
    "",
    "Options:",
    "  --domain <domainId>        Restrict evaluation to one domain",
    "  --limit <n>                Ranking cutoff, default 20",
    "  --holdout-ratio <decimal>  Per-user holdout ratio, default 0.2",
    "  --json                     Print machine-readable JSON only",
    "",
    "Dataset shape:",
    "  { \"users\": [...], \"artworks\": [...], \"preferences\": [...] }",
  ].join("\n");
}

function parseArgs(argv) {
  const args = {
    limit: DEFAULT_LIMIT,
    holdoutRatio: DEFAULT_HOLDOUT_RATIO,
    json: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--") {
      continue;
    } else if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else if (arg === "--json") {
      args.json = true;
    } else if (arg === "--dataset") {
      args.dataset = next;
      index += 1;
    } else if (arg === "--users") {
      args.users = next;
      index += 1;
    } else if (arg === "--artworks") {
      args.artworks = next;
      index += 1;
    } else if (arg === "--preferences") {
      args.preferences = next;
      index += 1;
    } else if (arg === "--domain") {
      args.domainId = next;
      index += 1;
    } else if (arg === "--limit") {
      args.limit = Number.parseInt(next, 10);
      index += 1;
    } else if (arg === "--holdout-ratio") {
      args.holdoutRatio = Number.parseFloat(next);
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!Number.isInteger(args.limit) || args.limit < 1) {
    throw new Error("--limit must be a positive integer");
  }
  if (
    !Number.isFinite(args.holdoutRatio) ||
    args.holdoutRatio <= 0 ||
    args.holdoutRatio >= 1
  ) {
    throw new Error("--holdout-ratio must be greater than 0 and less than 1");
  }

  return args;
}

async function readJsonFile(filePath) {
  const absolutePath = path.resolve(process.cwd(), filePath);
  return JSON.parse(await fs.readFile(absolutePath, "utf8"));
}

async function loadDataset(args) {
  if (args.dataset) {
    const dataset = await readJsonFile(args.dataset);
    return {
      users: dataset.users ?? [],
      artworks: dataset.artworks ?? [],
      preferences: dataset.preferences ?? [],
    };
  }

  if (!args.users || !args.artworks || !args.preferences) {
    throw new Error("Provide either --dataset or all of --users, --artworks, and --preferences");
  }

  return {
    users: await readJsonFile(args.users),
    artworks: await readJsonFile(args.artworks),
    preferences: await readJsonFile(args.preferences),
  };
}

function isValidVector(vector) {
  return (
    Array.isArray(vector) &&
    vector.length === VECTOR_DIMENSIONS &&
    vector.some((value) => value !== 0)
  );
}

function preferenceSortValue(preference) {
  return preference.updatedAt ?? preference.createdAt ?? 0;
}

function splitPreferencesForUser(preferences, holdoutRatio) {
  const sorted = [...preferences]
    .filter((preference) => typeof preference.liked === "boolean")
    .sort((left, right) => {
      const timeDelta = preferenceSortValue(left) - preferenceSortValue(right);
      if (timeDelta !== 0) return timeDelta;
      return String(left.artworkId).localeCompare(String(right.artworkId));
    });
  const liked = sorted.filter((preference) => preference.liked === true);
  const disliked = sorted.filter((preference) => preference.liked === false);

  const holdoutCount = (items) =>
    items.length >= 2 ? Math.max(1, Math.ceil(items.length * holdoutRatio)) : 0;
  const likedHoldoutCount = holdoutCount(liked);
  const dislikedHoldoutCount = holdoutCount(disliked);
  const takeLast = (items, count) => (count > 0 ? items.slice(-count) : []);
  const holdoutIds = new Set([
    ...takeLast(liked, likedHoldoutCount).map(
      (preference) => preference.artworkId,
    ),
    ...takeLast(disliked, dislikedHoldoutCount).map(
      (preference) => preference.artworkId,
    ),
  ]);

  return {
    train: sorted.filter((preference) => !holdoutIds.has(preference.artworkId)),
    holdout: sorted.filter((preference) => holdoutIds.has(preference.artworkId)),
  };
}

function averagePrecisionAtK(ranked, relevantIds, limit) {
  let hits = 0;
  let precisionSum = 0;
  ranked.slice(0, limit).forEach((item, index) => {
    if (relevantIds.has(item.artwork.id)) {
      hits += 1;
      precisionSum += hits / (index + 1);
    }
  });
  return relevantIds.size > 0 ? precisionSum / relevantIds.size : 0;
}

function ndcgAtK(ranked, holdoutByArtworkId, limit) {
  const dcg = ranked.slice(0, limit).reduce((sum, item, index) => {
    const preference = holdoutByArtworkId.get(item.artwork.id);
    const relevance = preference?.liked === true ? 1 : preference?.liked === false ? -1 : 0;
    return relevance > 0 ? sum + relevance / Math.log2(index + 2) : sum;
  }, 0);
  const idealLikes = Array.from(holdoutByArtworkId.values()).filter(
    (preference) => preference.liked === true,
  ).length;
  const idealDcg = Array.from({ length: Math.min(limit, idealLikes) }).reduce(
    (sum, _unused, index) => sum + 1 / Math.log2(index + 2),
    0,
  );
  return idealDcg > 0 ? dcg / idealDcg : 0;
}

function pairwiseAccuracy(ranked, holdoutByArtworkId) {
  const rankByArtworkId = new Map(
    ranked.map((item, index) => [item.artwork.id, index]),
  );
  const liked = Array.from(holdoutByArtworkId.values()).filter(
    (preference) => preference.liked === true,
  );
  const disliked = Array.from(holdoutByArtworkId.values()).filter(
    (preference) => preference.liked === false,
  );
  let wins = 0;
  let pairs = 0;

  for (const likedPreference of liked) {
    for (const dislikedPreference of disliked) {
      const likedRank = rankByArtworkId.get(likedPreference.artworkId);
      const dislikedRank = rankByArtworkId.get(dislikedPreference.artworkId);
      if (likedRank === undefined || dislikedRank === undefined) continue;
      pairs += 1;
      if (likedRank < dislikedRank) wins += 1;
    }
  }

  return pairs > 0 ? wins / pairs : undefined;
}

function averageLikedRank(ranked, relevantIds) {
  const ranks = ranked
    .map((item, index) => (relevantIds.has(item.artwork.id) ? index + 1 : undefined))
    .filter((value) => value !== undefined);
  if (ranks.length === 0) return undefined;
  return ranks.reduce((sum, rank) => sum + rank, 0) / ranks.length;
}

function rankVectorOnly({ user, candidates }) {
  const normalizedPreference = normalizeVector(user.preferenceVector);
  return candidates
    .map((artwork) => ({
      artwork,
      score: cosineSimilarity(normalizedPreference, artwork.vector),
    }))
    .sort((left, right) => right.score - left.score);
}

function rankHybrid({ user, candidates, trainPreferences, trainArtworks }) {
  const normalizedPreference = normalizeVector(user.preferenceVector);
  const normalizedLikedPreference = isValidVector(user.likedPreferenceVector)
    ? normalizeVector(user.likedPreferenceVector)
    : undefined;
  const normalizedDislikedPreference = isValidVector(user.dislikedPreferenceVector)
    ? normalizeVector(user.dislikedPreferenceVector)
    : undefined;
  const behaviorProfile = buildRecommendationBehaviorProfile(
    trainPreferences,
    trainArtworks,
  );

  return candidates
    .map((artwork) => ({
      artwork,
      score: scoreRecommendationCandidate({
        artwork,
        normalizedPreferenceVector: normalizedPreference,
        normalizedLikedPreferenceVector: normalizedLikedPreference,
        normalizedDislikedPreferenceVector: normalizedDislikedPreference,
        user,
        behaviorProfile,
      }).finalScore,
    }))
    .sort((left, right) => right.score - left.score);
}

function evaluateRanking(ranked, holdout, limit) {
  const holdoutByArtworkId = new Map(
    holdout.map((preference) => [preference.artworkId, preference]),
  );
  const relevantIds = new Set(
    holdout
      .filter((preference) => preference.liked === true)
      .map((preference) => preference.artworkId),
  );
  const topK = ranked.slice(0, limit);
  const hits = topK.filter((item) => relevantIds.has(item.artwork.id)).length;

  return {
    hitRateAtK: relevantIds.size > 0 ? hits / relevantIds.size : 0,
    mapAtK: averagePrecisionAtK(ranked, relevantIds, limit),
    ndcgAtK: ndcgAtK(ranked, holdoutByArtworkId, limit),
    pairwiseAccuracy: pairwiseAccuracy(ranked, holdoutByArtworkId),
    averageLikedRank: averageLikedRank(ranked, relevantIds),
  };
}

function mean(values) {
  const finite = values.filter((value) => Number.isFinite(value));
  if (finite.length === 0) return undefined;
  return finite.reduce((sum, value) => sum + value, 0) / finite.length;
}

function aggregate(results, key) {
  return mean(results.map((result) => result[key]));
}

function runEvaluation(dataset, args) {
  const users = dataset.users.filter(
    (user) =>
      (!args.domainId || user.domainId === args.domainId) &&
      isValidVector(user.preferenceVector) &&
      getAIRecommendationsEligibility(user).isEligible,
  );
  const artworks = dataset.artworks.filter(
    (artwork) =>
      (!args.domainId || artwork.domainId === args.domainId) &&
      isValidVector(artwork.vector),
  );
  const preferences = dataset.preferences.filter(
    (preference) => !args.domainId || preference.domainId === args.domainId,
  );
  const artworkById = new Map(artworks.map((artwork) => [artwork.id, artwork]));
  const preferencesByUserId = new Map();
  for (const preference of preferences) {
    if (!artworkById.has(preference.artworkId)) continue;
    const userPreferences = preferencesByUserId.get(preference.userId) ?? [];
    userPreferences.push(preference);
    preferencesByUserId.set(preference.userId, userPreferences);
  }

  const userResults = [];
  for (const user of users) {
    const userPreferences = preferencesByUserId.get(user.id) ?? [];
    const { train, holdout } = splitPreferencesForUser(
      userPreferences,
      args.holdoutRatio,
    );
    const holdoutLikes = holdout.filter((preference) => preference.liked === true);
    if (train.length === 0 || holdoutLikes.length === 0) continue;

    const excludedTrainingIds = new Set(
      train.map((preference) => preference.artworkId),
    );
    const candidates = artworks.filter(
      (artwork) =>
        artwork.domainId === user.domainId && !excludedTrainingIds.has(artwork.id),
    );
    const trainArtworks = train
      .map((preference) => artworkById.get(preference.artworkId))
      .filter(Boolean);

    const vectorOnly = evaluateRanking(
      rankVectorOnly({ user, candidates }),
      holdout,
      args.limit,
    );
    const hybrid = evaluateRanking(
      rankHybrid({ user, candidates, trainPreferences: train, trainArtworks }),
      holdout,
      args.limit,
    );

    userResults.push({
      userId: user.id,
      domainId: user.domainId,
      trainCount: train.length,
      holdoutCount: holdout.length,
      vectorOnly,
      hybrid,
    });
  }

  const summarize = (key) => ({
    hitRateAtK: aggregate(userResults.map((result) => result[key]), "hitRateAtK"),
    mapAtK: aggregate(userResults.map((result) => result[key]), "mapAtK"),
    ndcgAtK: aggregate(userResults.map((result) => result[key]), "ndcgAtK"),
    pairwiseAccuracy: aggregate(
      userResults.map((result) => result[key]),
      "pairwiseAccuracy",
    ),
    averageLikedRank: aggregate(
      userResults.map((result) => result[key]),
      "averageLikedRank",
    ),
  });

  return {
    evaluatedUsers: userResults.length,
    inputCounts: {
      users: dataset.users.length,
      artworks: dataset.artworks.length,
      preferences: dataset.preferences.length,
    },
    filteredCounts: {
      users: users.length,
      artworks: artworks.length,
      preferences: preferences.length,
    },
    limit: args.limit,
    holdoutRatio: args.holdoutRatio,
    vectorOnly: summarize("vectorOnly"),
    hybrid: summarize("hybrid"),
    perUser: userResults,
  };
}

function formatNumber(value) {
  return value === undefined ? "n/a" : value.toFixed(4);
}

function printSummary(result) {
  console.log(`Evaluated users: ${result.evaluatedUsers}`);
  console.log(`Cutoff: @${result.limit}`);
  console.log("");
  console.log("Metric                 vector-only   hybrid");
  console.log(
    `hitRate@K              ${formatNumber(result.vectorOnly.hitRateAtK).padEnd(12)} ${formatNumber(result.hybrid.hitRateAtK)}`,
  );
  console.log(
    `MAP@K                  ${formatNumber(result.vectorOnly.mapAtK).padEnd(12)} ${formatNumber(result.hybrid.mapAtK)}`,
  );
  console.log(
    `NDCG@K                 ${formatNumber(result.vectorOnly.ndcgAtK).padEnd(12)} ${formatNumber(result.hybrid.ndcgAtK)}`,
  );
  console.log(
    `pairwiseAccuracy       ${formatNumber(result.vectorOnly.pairwiseAccuracy).padEnd(12)} ${formatNumber(result.hybrid.pairwiseAccuracy)}`,
  );
  console.log(
    `averageLikedRank       ${formatNumber(result.vectorOnly.averageLikedRank).padEnd(12)} ${formatNumber(result.hybrid.averageLikedRank)}`,
  );
}

try {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    process.exit(0);
  }
  const dataset = await loadDataset(args);
  const result = runEvaluation(dataset, args);
  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printSummary(result);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  console.error("");
  console.error(usage());
  process.exit(1);
}
