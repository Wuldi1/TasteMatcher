# Recommendation Evaluation

Use `scripts/evaluate_recommendations.js` to compare image-only vector ranking
against the current hybrid reranker on exported data.

## Algorithm Memory

Keep this section synchronized every time the recommendation algorithm changes.
When weights, score categories, vector sources, questionnaire signals, metadata
signals, behavior boosts, or customer/owner visibility rules change, update this
doc and the owner-facing score tooltip in
`frontend/src/pages/AISuggestions/AISuggestionsPage.tsx`.

Current owner-facing score categories:

- `imageSimilarity`: visual similarity to the customer's taste vectors. This
  combines the overall preference vector with liked/disliked directional vectors
  when those vectors are available.
- `intentScore`: match to the customer's questionnaire buying interest, such as
  paintings, prints, sculptures, or photographs.
- `metadataScore`: overlap with artists, medium terms, and tags learned from
  prior liked and disliked artworks.
- `behaviorScore`: small operational adjustments for recency and auction status,
  including boosts for recently added works and active auctions, and a penalty
  for ended auctions.

Current weights:

- `imageSimilarity`: 60%
- `intentScore`: 20%
- `metadataScore`: 15%
- `behaviorScore`: 5%

Score reasoning is owner-only. API responses may include `recommendationScore`
for `dealer`, `domain_owner`, and `global_admin`; customer responses must not
expose it.

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
