import fitz
import os
import re
import json
from io import BytesIO
from PIL import Image, ImageFilter
from glob import glob

# INPUT_PDF = ["Preview_NADA_Miami_2025_Polina_Berlin_Gallery", "MSNADA25NP", "Amanita_NADA_Miami_Preview", "GhebalyABMB2025", "KarmaArt-Basel-Miami-Beach2025Preview", "Preview_NADA_Miami_2025_Polina_Berlin_Gallery", "251103_MarinaPerezSimao_TomieOhtake_TY_ExhPacket_[79]", "Preview_Loral_Raphael_Polina_Berlin_Gallery"]
INPUT_PDF = ["Preview_NADA_Miami_2025_Polina_Berlin_Gallery"] # for testing a single PDF
OUTPUT_DIR = "./TasteMatcherTestContent"
os.makedirs(OUTPUT_DIR, exist_ok=True)

SCALE = float(os.environ.get("RENDER_SCALE", "2.0"))  # rendering scale factor for higher-resolution crops
MIN_AREA_FRACTION = float(os.environ.get("MIN_AREA_FRACTION", "0.10"))  # min non-white area to accept heuristic bbox
WHITE_THRESHOLD = int(os.environ.get("WHITE_THRESHOLD", "250"))  # threshold for near-white detection (0-255)


def slugify(text):
    return re.sub(r"[^a-z0-9]+", "_", text.lower()).strip("_")


def extract_metadata(text):
    lines = [l.strip() for l in text.splitlines() if l.strip()]
    if len(lines) < 2:
        return None
    artist = lines[0]
    title, date = "", ""
    for line in lines:
        m = re.search(r"(.+?)\s+(c\.\s*\d{4}|\b(18|19|20)\d{2}\b)", line)
        if m:
            title = m.group(1).strip()
            date = m.group(2).strip()
            break
    if not title:
        return None
    description = " ".join(lines[1:])
    return {
        "title": title,
        "artist": artist,
        "description": description,
        "category": "artwork",
        "classification": "contemporary",
        "department": "inventory gallery",
        "country": "unknown",
        "date": date,
        "tags": []
    }


def _pix_to_png_bytes(pix):
    try:
        return pix.tobytes(output="png")
    except TypeError:
        # Older PyMuPDF versions
        try:
            return pix.getPNGData()
        except Exception:
            return None


def process_pdf_file(pdf_path: str):
    try:
        doc = fitz.open(pdf_path)
    except Exception as e:
        print(f"❌ Failed to open PDF {pdf_path}: {e}")
        return

    print(f"\n📄 Processing '{pdf_path}' ({len(doc)} pages)...")

    for page_index, page in enumerate(doc):
        try:
            # Extract text blocks for metadata
            blocks = page.get_text("blocks")
            text = "\n".join([b[4] for b in blocks if len(b[4].strip()) > 2])
            if not text:
                # skip pages without meaningful text
                continue

            meta = extract_metadata(text)
            if not meta:
                # skip pages if metadata cannot be determined
                continue

            folder_name = os.path.splitext(slugify(os.path.basename(pdf_path)))[0] + \
                          f"_Page_{page_index}_" + slugify(meta["title"])
            art_folder = os.path.join(OUTPUT_DIR, folder_name)
            os.makedirs(art_folder, exist_ok=True)

            # Save metadata
            with open(os.path.join(art_folder, "metadata.json"), "w", encoding="utf-8") as f:
                json.dump(meta, f, indent=2, ensure_ascii=False)

            # --- Image extraction: prefer image blocks, fallback to content-bbox heuristic ---
            page_dict = page.get_text("dict")
            image_blocks = [b for b in page_dict.get("blocks", []) if b.get("type") == 1]

            pix = None

            # 1) If explicit image blocks exist, crop to the largest one (by area)
            if image_blocks:
                img_block = max(
                    image_blocks,
                    key=lambda b: (b["bbox"][2] - b["bbox"][0]) * (b["bbox"][3] - b["bbox"][1]),
                )
                bbox = fitz.Rect(img_block["bbox"])
                try:
                    pix = page.get_pixmap(matrix=fitz.Matrix(SCALE, SCALE), clip=bbox)
                except Exception as e:
                    print(f"⚠️  Failed to render image block on page {page_index+1}: {e}")
                    pix = None

            # 2) Fallback: render full page and heuristically crop using a vertical-projection technique
            if pix is None:
                try:
                    full_pix = page.get_pixmap(matrix=fitz.Matrix(SCALE, SCALE))
                except Exception as e:
                    print(f"⚠️  Could not render page {page_index+1}, skipping. Error: {e}")
                    continue

                png_bytes = _pix_to_png_bytes(full_pix)
                if not png_bytes:
                    print(f"⚠️  Could not get PNG bytes for page {page_index+1}, skipping.")
                    continue

                try:
                    img = Image.open(BytesIO(png_bytes)).convert("RGB")
                except Exception as e:
                    print(f"⚠️  Pillow failed to open image for page {page_index+1}: {e}")
                    pix = full_pix
                else:
                    # Create a binary mask of "ink" (non-near-white pixels)
                    gray = img.convert("L")
                    threshold = WHITE_THRESHOLD  # near-white threshold
                    bw = gray.point(lambda p: 0 if p > threshold else 1, "1")  # 1 for ink, 0 for white

                    width, height = img.size
                    data = list(bw.getdata())  # flat list of 0/255 or 0/1 depending on Pillow; treat non-zero as ink

                    # Compute column sums (vertical projection)
                    col_sums = [0] * width
                    for idx, v in enumerate(data):
                        if v:
                            x = idx % width
                            col_sums[x] += 1

                    # Determine columns with significant ink density
                    col_density_threshold = max(1, int(0.01 * height))  # at least 1 px or 1% of height
                    runs = []
                    run_start = None
                    for x, s in enumerate(col_sums):
                        if s >= col_density_threshold:
                            if run_start is None:
                                run_start = x
                        else:
                            if run_start is not None:
                                runs.append((run_start, x - 1))
                                run_start = None
                    if run_start is not None:
                        runs.append((run_start, width - 1))

                    chosen_run = None
                    if runs:
                        # Choose the run with the largest ink "area" (sum of column ink in run)
                        best_score = -1
                        for (l, r) in runs:
                            score = sum(col_sums[l:r + 1])
                            # prefer wider runs if scores similar
                            score += (r - l) * 0.1
                            if score > best_score:
                                best_score = score
                                chosen_run = (l, r)

                    use_bbox = False
                    if chosen_run:
                        left_px, right_px = chosen_run
                        # Compute row sums limited to chosen columns to find top/bottom bounds
                        row_sums = [0] * height
                        for y in range(height):
                            row_total = 0
                            base = y * width
                            for x in range(left_px, right_px + 1):
                                if data[base + x]:
                                    row_total += 1
                            row_sums[y] = row_total

                        row_density_threshold = max(1, int(0.01 * (right_px - left_px + 1)))  # 1% of slice width
                        top = None
                        bottom = None
                        for y, s in enumerate(row_sums):
                            if s >= row_density_threshold:
                                top = y
                                break
                        for y in range(len(row_sums) - 1, -1, -1):
                            if row_sums[y] >= row_density_threshold:
                                bottom = y
                                break

                        if top is not None and bottom is not None and bottom > top:
                            # add padding (3% each side)
                            pad_x = int((right_px - left_px) * 0.03)
                            pad_y = int((bottom - top) * 0.03)
                            left_px = max(0, left_px - pad_x)
                            right_px = min(width, right_px + pad_x)
                            top = max(0, top - pad_y)
                            bottom = min(height, bottom + pad_y)

                            # convert pixel bbox back to PDF coordinates (divide by scale)
                            clip_rect = fitz.Rect(left_px / SCALE, top / SCALE, right_px / SCALE, bottom / SCALE)
                            try:
                                pix = page.get_pixmap(matrix=fitz.Matrix(SCALE, SCALE), clip=clip_rect)
                                use_bbox = True
                            except Exception as e:
                                print(f"⚠️  Failed to render clipped region for page {page_index+1}: {e}")
                                pix = full_pix

                    # If vertical-projection detection failed, fallback to previous overall bbox heuristic
                    if not use_bbox:
                        # previous heuristic: try global bbox from binary mask
                        bbox = bw.getbbox()
                        if bbox:
                            left, upper, right, lower = bbox
                            # pad slightly
                            pad_x = int((right - left) * 0.03)
                            pad_y = int((lower - upper) * 0.03)
                            left = max(0, left - pad_x)
                            upper = max(0, upper - pad_y)
                            right = min(width, right + pad_x)
                            lower = min(height, lower + pad_y)
                            clip_rect = fitz.Rect(left / SCALE, upper / SCALE, right / SCALE, lower / SCALE)
                            try:
                                pix = page.get_pixmap(matrix=fitz.Matrix(SCALE, SCALE), clip=clip_rect)
                            except Exception:
                                pix = full_pix
                        else:
                            pix = full_pix

            if pix is None or pix.width == 0 or pix.height == 0:
                print(f"⚠️  Empty image for page {page_index+1}, skipping.")
                continue

            # Save cropped or full page image
            image_path = os.path.join(art_folder, "image.png")
            try:
              pix.save(image_path)
              print(f"✅ Extracted: {meta['title']} (page {page_index+1}) -> saved image")
            except Exception as e:
              print(f"❌ Failed to save image for page {page_index+1}: {e}")
        except Exception as page_err:
            print(f"⚠️  Error processing page {page_index+1} of {pdf_path}: {page_err}")
            continue

    print(f"ℹ️  Finished processing '{pdf_path}'")
    doc.close()


def main():
    pdf_files = INPUT_PDF
    if not pdf_files:
        print("ℹ️  No PDF files found to process. Place PDFs in the current directory or set INPUT_PDF / INPUT_PDF_LIST.")
        return

    print(f"🗂️  Found {len(pdf_files)} PDF(s) to process:")
    for p in pdf_files:
        print(" -", p)

    for pdf in pdf_files:
        process_pdf_file(pdf + ".pdf")

    print("\nDone ✅")


if __name__ == "__main__":
    main()
