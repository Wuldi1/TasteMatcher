#!/usr/bin/env python3
"""Convert a layout-based PDF price list into a TasteMatcher import JSON file.

This helper is intentionally conservative. It targets the current PhillipsX
price-list layout: artwork images above text blocks, repeated across columns.
Unknown PDF structures should be reviewed manually before using the output.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import io
import json
import re
import sys
from pathlib import Path
from typing import Any

try:
    import fitz  # PyMuPDF
except ImportError as exc:  # pragma: no cover - environment guard
    raise SystemExit("PyMuPDF is required: python3 -m pip install pymupdf") from exc

try:
    from PIL import Image
except ImportError as exc:  # pragma: no cover - environment guard
    raise SystemExit("Pillow is required: python3 -m pip install pillow") from exc


EUR_PER_USD = 0.92
MAX_IMAGE_SIDE = 520
JPEG_QUALITY = 74
PRICE_RE = re.compile(r"(?P<amount>[0-9][0-9,]*)\s*\u20ac")
YEAR_RE = re.compile(r"(?:Executed|Painted) in (\d{4}(?:-\d{4})?)", re.I)


def main() -> int:
    args = parse_args()
    pdf_path = args.pdf.resolve()
    if not pdf_path.exists():
        raise SystemExit(f"PDF not found: {pdf_path}")

    package, summary = convert_pdf(
        pdf_path=pdf_path,
        source_id=args.source_id,
        auction_title=args.auction_title,
        auction_code=args.auction_code,
        location=args.location,
        starts_at=args.starts_at,
        ends_at=args.ends_at,
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(package, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(json.dumps({**summary, "output": str(args.output)}, ensure_ascii=False))
    return 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Convert a PhillipsX-style PDF price list into auction-import.json.",
    )
    parser.add_argument("pdf", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--source-id")
    parser.add_argument("--auction-title")
    parser.add_argument("--auction-code")
    parser.add_argument("--location")
    parser.add_argument("--starts-at")
    parser.add_argument("--ends-at")
    return parser.parse_args()


def convert_pdf(
    *,
    pdf_path: Path,
    source_id: str | None,
    auction_title: str | None,
    auction_code: str | None,
    location: str | None,
    starts_at: str | None,
    ends_at: str | None,
) -> tuple[dict[str, Any], dict[str, Any]]:
    source = source_id or f"import-file:{short_hash(pdf_path)}"
    doc = fitz.open(pdf_path)
    drafts: list[dict[str, Any]] = []
    lot_number = 1

    for page_index in range(doc.page_count):
        page = doc[page_index]
        image_blocks = extract_image_blocks(page)
        if not image_blocks:
            continue
        text_blocks = extract_text_blocks(page)
        for image_block in image_blocks:
            column_texts = column_text_for_image(image_block, text_blocks)
            if len(column_texts) < 3:
                continue
            draft = build_draft(
                source_id=source,
                lot_number=lot_number,
                image_bytes=image_block["image"],
                column_texts=column_texts,
                ends_at=ends_at,
            )
            drafts.append(draft)
            lot_number += 1

    package = {
        "version": 1,
        "source": {
            "sourceAuctionUrl": source,
            "auctionTitle": auction_title or pdf_path.stem.replace("-", " "),
            "auctionCode": auction_code,
            "location": location,
            "startsAt": starts_at,
            "endsAt": ends_at,
        },
        "drafts": drafts,
    }
    package["source"] = {
        key: value for key, value in package["source"].items() if value
    }
    summary = summarize_package(package)
    return package, summary


def extract_image_blocks(page: fitz.Page) -> list[dict[str, Any]]:
    blocks = []
    for block in page.get_text("dict")["blocks"]:
        if block["type"] != 1 or block["bbox"][1] >= 340:
            continue
        image = block.get("image")
        if not image:
            continue
        blocks.append(block)
    return sorted(blocks, key=lambda block: block["bbox"][0])


def extract_text_blocks(page: fitz.Page) -> list[tuple[float, float, str]]:
    blocks = []
    for block in page.get_text("blocks"):
        x0, y0, _x1, _y1, text, *_rest = block
        if y0 <= 340:
            continue
        value = clean_text(text)
        if not value or "PHILLIPS" in value:
            continue
        blocks.append((float(x0), float(y0), value))
    return blocks


def column_text_for_image(
    image_block: dict[str, Any],
    text_blocks: list[tuple[float, float, str]],
) -> list[str]:
    x = float(image_block["bbox"][0])
    column = [(y, text) for x0, y, text in text_blocks if abs(x0 - x) < 35]
    return [text for _y, text in sorted(column, key=lambda item: item[0])]


def build_draft(
    *,
    source_id: str,
    lot_number: int,
    image_bytes: bytes,
    column_texts: list[str],
    ends_at: str | None,
) -> dict[str, Any]:
    artist = normalize_artist(column_texts[0])
    title = column_texts[1]
    remaining = column_texts[2:]
    price_text = ""
    if remaining and ("\u20ac" in remaining[-1] or remaining[-1].upper() in {"SOLD", "ON LOAN"}):
        price_text = remaining[-1]
        description_parts = remaining[:-1]
    else:
        description_parts = remaining
    description = clean_text(" | ".join(description_parts))
    source_price, conversion_status, price_value = parse_price(price_text)
    issues = build_issues(price_text, conversion_status)
    artwork: dict[str, Any] = {
        "title": title,
        "description": description,
        "artist": artist,
        "isAuction": True,
        "shouldDisplayPrice": False,
        "useForTaster": True,
        "isPrivate": False,
        "tags": ["pdf-import"],
    }
    if ends_at:
        artwork["endDate"] = ends_at
    date = artwork_date(description)
    if date:
        artwork["date"] = date
    medium = medium_from_description(description)
    if medium:
        artwork["medium"] = medium
    if price_value is not None:
        artwork["price"] = price_value
        artwork["maxPrice"] = price_value

    return {
        "draftId": f"{slug(source_id)}-lot-{lot_number:03d}",
        "source": {
            "identity": {
                "provider": "import_file",
                "sourceAuctionUrl": source_id,
                "sourceLotNumber": str(lot_number),
            },
            "sourceImageDataUrl": image_data_url(image_bytes),
            **source_price,
            "pricingConversionStatus": conversion_status,
        },
        "artwork": artwork,
        "included": clean_text(price_text).upper() not in {"SOLD", "ON LOAN"},
        "issues": issues,
    }


def parse_price(price_text: str) -> tuple[dict[str, Any], str, int | None]:
    text = clean_text(price_text)
    match = PRICE_RE.search(text)
    if not match:
        source = {"originalEstimateText": text} if text else {}
        return source, "unavailable", None
    eur = int(match.group("amount").replace(",", ""))
    usd = round(eur / EUR_PER_USD)
    return (
        {
            "originalEstimateText": text,
            "originalEstimateCurrency": "EUR",
            "originalEstimateLow": eur,
            "originalEstimateHigh": eur,
        },
        "converted",
        usd,
    )


def build_issues(price_text: str, conversion_status: str) -> list[dict[str, Any]]:
    text = clean_text(price_text)
    if conversion_status == "converted":
        return [
            {
                "scope": "field",
                "field": "price",
                "code": "eur_price_converted",
                "message": (
                    "The EUR price was converted to USD using TasteMatcher "
                    "reference rate 1 USD = 0.92 EUR. Review before upload."
                ),
                "severity": "warning",
                "blocking": False,
            }
        ]
    if text.upper() in {"SOLD", "ON LOAN"}:
        return [
            {
                "scope": "draft",
                "code": "not_available_for_purchase",
                "message": (
                    f'The source price is "{text}". Exclude this item unless '
                    "it should still be imported for records."
                ),
                "severity": "warning",
                "blocking": False,
            }
        ]
    return []


def image_data_url(image_bytes: bytes) -> str:
    image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    image.thumbnail((MAX_IMAGE_SIDE, MAX_IMAGE_SIDE), Image.Resampling.LANCZOS)
    output = io.BytesIO()
    image.save(output, format="JPEG", quality=JPEG_QUALITY, optimize=True)
    encoded = base64.b64encode(output.getvalue()).decode("ascii")
    return f"data:image/jpeg;base64,{encoded}"


def summarize_package(package: dict[str, Any]) -> dict[str, Any]:
    drafts = package["drafts"]
    missing = {
        "title": sum(1 for draft in drafts if not draft["artwork"].get("title")),
        "artist": sum(1 for draft in drafts if not draft["artwork"].get("artist")),
        "price": sum(1 for draft in drafts if "price" not in draft["artwork"]),
        "endDate": sum(1 for draft in drafts if not draft["artwork"].get("endDate")),
        "image": sum(1 for draft in drafts if not draft["source"].get("sourceImageDataUrl")),
    }
    return {
        "artworkCount": len(drafts),
        "includedCount": sum(1 for draft in drafts if draft.get("included")),
        "excludedCount": sum(1 for draft in drafts if not draft.get("included")),
        "missing": missing,
        "warningCount": sum(len(draft.get("issues", [])) for draft in drafts),
    }


def clean_text(text: str) -> str:
    replacements = {
        "\u2018": "'",
        "\u2019": "'",
        "\u201c": '"',
        "\u201d": '"',
        "\u00a0": " ",
    }
    for before, after in replacements.items():
        text = text.replace(before, after)
    return re.sub(r"\s+", " ", text).strip()


def normalize_artist(text: str) -> str:
    text = clean_text(text)
    text = re.sub(r"\s+b\.\s*\d{4}\s*$", "", text)
    text = re.sub(r"\s+\d{4}-\d{4}(?:\s+and\s+\d{4}-\d{4})?\s*$", "", text)
    return text.title() if text.isupper() else text


def artwork_date(description: str) -> str | None:
    match = YEAR_RE.search(description)
    return match.group(1) if match else None


def medium_from_description(description: str) -> str | None:
    lines = [part.strip(" .") for part in description.split(" | ") if part.strip()]
    skip_tokens = [
        " cm ",
        " cm (",
        "executed",
        "painted",
        "edition",
        "registered",
        "signed",
        "incised",
        "numbered",
        "titled",
        "dated",
    ]
    for line in lines:
        lower = line.lower()
        if any(token in lower for token in skip_tokens):
            continue
        if len(line) <= 120:
            return line
    return None


def slug(value: str) -> str:
    value = value.removeprefix("import-file:")
    value = re.sub(r"[^a-zA-Z0-9]+", "-", value).strip("-").lower()
    return value or "import-file"


def short_hash(path: Path) -> str:
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    return digest[:12]


if __name__ == "__main__":
    raise SystemExit(main())
