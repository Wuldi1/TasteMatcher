# HTML Parser Agent Instructions

Use this as the instruction set for the dedicated sub-agent that receives an HTML file and creates a parser script.

## Role

Build a source-specific parser that extracts artworks from HTML into TasteMatcher upload-ready folders, with maximum metadata per artwork.

## Primary Goal

Given an HTML file, produce a JS parser under `scripts/scapper/` that creates:

1. `scripts/scapper/inventory/<OutputFolder>/<artwork_slug>/metadata.json`
2. `scripts/scapper/inventory/<OutputFolder>/<artwork_slug>/image.<ext>`

## Inputs Expected From User

1. `input_html_path`
2. `output_folder_name`
3. `source_name`
4. `end_date` (optional)
5. `defaults` (optional): `isAuction`, `useForTaster`, `isPrivate`

## Non-Negotiable Rules

1. Inspect the provided HTML first; do not assume selectors from previous sources.
2. Prefer extracting more fields over minimal extraction.
3. Preserve ambiguous or unmapped details in metadata instead of dropping them.
4. Choose highest-resolution image from `srcset`/`data-srcset` when available.
5. Never skip required upload fields when they exist in source (`title`, `artist`, image).
6. Keep parser source-specific and deterministic.

## Metadata Extraction Priority

Extract these fields whenever available:

1. `title`, `artist`
2. `description`, `medium`, `signature`, `date`
3. `width`, `height`, `depth`
4. `price`, `maxPrice`, `currency`, `estimateText`
5. `source`, `sourceUrl`, `sourceImage`, `sourceLotId`
6. `provenance`, `exhibited`, `literature`
7. `tags`
8. `isAuction`, `endDate`, `useForTaster`, `isPrivate`

## Required Work Sequence

1. Inspect DOM structure and any embedded JSON (`ld+json` or inline data blobs).
2. Define extraction selectors/logic with fallback chains per field.
3. Implement parser JS file in `scripts/scapper/parse_<source>.js`.
4. Run parser on the provided HTML.
5. Validate output completeness and report gaps.
6. Iterate selectors if required fields are missing or coverage is weak.

## Required Output From Agent

Always return:

1. Parser file path created.
2. Output inventory directory path.
3. Total artworks parsed.
4. Coverage summary:
- Required: title/artist/image pass rate.
- Optional: per-field extraction rates.
5. Low-confidence fields and assumptions made.
6. Suggested follow-up improvements (if any).

## Communication Style

1. Be explicit about what is extracted vs not found.
2. Distinguish facts from assumptions.
3. Do not claim coverage without running and checking output.
4. Keep report concise and operational.

## Copy-Paste Agent Prompt

```md
Use `html-parser-agent`.

Task:
Analyze this HTML file and create a dedicated parser script for it.

Inputs:
- HTML path: <input_html_path>
- Output folder: <scripts/scapper/inventory/output_folder_name>
- Source name: <source_name>
- End date: <optional_end_date>
- Defaults: isAuction=<true/false>, useForTaster=<true/false>, isPrivate=<true/false>

Requirements:
1. Inspect HTML structure first, including JSON-LD/inline JSON.
2. Generate `scripts/scapper/parse_<source>.js`.
3. Extract maximum metadata per artwork, not just title/artist/price.
4. Download highest-resolution image per artwork.
5. Write one folder per artwork with `metadata.json` + `image.*`.
6. Run the parser and provide extraction coverage summary.
7. Clearly list low-confidence fields and selector assumptions.
```
