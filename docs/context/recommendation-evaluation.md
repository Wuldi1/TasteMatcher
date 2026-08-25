# Recommendation Evaluation

Use `scripts/evaluate_recommendations.js` to compare image-only vector ranking
against the current hybrid reranker on exported data.

## Input

Provide one dataset JSON file:

```json
{
  "users": [],
  "artworks": [],
  "preferences": []
}
```

Or provide the three arrays separately:

```bash
node scripts/evaluate_recommendations.js \
  --users ./users.json \
  --artworks ./artworks.json \
  --preferences ./preferences.json
```

The records should match the app's Cosmos documents. The evaluator requires
1024-dimensional artwork and user vectors and ignores users who are not eligible
for AI recommendations.

## Run

Build common first, then run the evaluator:

```bash
pnpm run eval:recommendations -- --dataset ./recommendation-dataset.json
```

Useful options:

```bash
pnpm run eval:recommendations -- \
  --dataset ./recommendation-dataset.json \
  --domain <domain-id> \
  --limit 20 \
  --holdout-ratio 0.2
```

Use `--json` for machine-readable output.

## Metrics

- `hitRate@K`: held-out liked works found in the top K results.
- `MAP@K`: mean average precision for held-out likes.
- `NDCG@K`: ranking quality for held-out likes.
- `pairwiseAccuracy`: how often held-out likes rank above held-out dislikes.
- `averageLikedRank`: lower is better.

Run this before changing model weights, vector sources, or text embedding logic.
