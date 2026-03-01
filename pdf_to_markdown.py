#!/usr/bin/env python3
"""Convert a PDF file to Markdown."""

import argparse
import re
import sys
from pathlib import Path

import fitz  # PyMuPDF


def extract_text_blocks(page):
    """Extract text blocks from a page with position info."""
    blocks = page.get_text("dict", flags=fitz.TEXT_PRESERVE_WHITESPACE)["blocks"]
    result = []
    for block in blocks:
        if block["type"] != 0:  # skip images
            continue
        for line in block["lines"]:
            spans = line["spans"]
            if not spans:
                continue
            text = "".join(s["text"] for s in spans)
            if not text.strip():
                continue
            max_size = max(s["size"] for s in spans)
            is_bold = any("bold" in s["font"].lower() for s in spans)
            is_italic = any("italic" in s["font"].lower() or "oblique" in s["font"].lower() for s in spans)
            result.append({
                "text": text.strip(),
                "size": max_size,
                "bold": is_bold,
                "italic": is_italic,
                "y": line["bbox"][1],
                "x": line["bbox"][0],
            })
    return result


def classify_heading(size, median_size, is_bold):
    """Determine heading level based on font size relative to body text."""
    ratio = size / median_size if median_size else 1
    if ratio >= 1.8:
        return 1
    if ratio >= 1.4:
        return 2
    if ratio >= 1.15:
        return 3
    if is_bold and ratio >= 1.05:
        return 4
    return 0


def blocks_to_markdown(all_blocks):
    """Convert extracted text blocks to markdown lines."""
    if not all_blocks:
        return ""

    # Find the median font size (likely body text)
    sizes = [b["size"] for b in all_blocks]
    sizes.sort()
    median_size = sizes[len(sizes) // 2]

    lines = []
    prev_y = None

    for block in all_blocks:
        text = block["text"]
        heading = classify_heading(block["size"], median_size, block["bold"])

        # Add blank line for vertical gaps (paragraph breaks)
        if prev_y is not None and block["y"] - prev_y > block["size"] * 1.8:
            lines.append("")

        if heading > 0:
            lines.append("")
            lines.append(f"{'#' * heading} {text}")
            lines.append("")
        elif block["bold"] and not block["italic"]:
            lines.append(f"**{text}**")
        elif block["italic"] and not block["bold"]:
            lines.append(f"*{text}*")
        elif block["bold"] and block["italic"]:
            lines.append(f"***{text}***")
        else:
            lines.append(text)

        prev_y = block["y"]

    return lines


def clean_markdown(text):
    """Clean up common artifacts in the generated markdown."""
    # Collapse 3+ blank lines into 2
    text = re.sub(r"\n{4,}", "\n\n\n", text)
    # Strip trailing whitespace on each line
    text = "\n".join(line.rstrip() for line in text.splitlines())
    return text.strip() + "\n"


def pdf_to_markdown(pdf_path):
    """Convert a PDF file to a markdown string."""
    doc = fitz.open(pdf_path)
    all_lines = []

    for page_num in range(len(doc)):
        page = doc[page_num]
        blocks = extract_text_blocks(page)
        page_lines = blocks_to_markdown(blocks)
        if page_lines:
            if all_lines:
                all_lines.append("")
                all_lines.append("---")
                all_lines.append("")
            all_lines.extend(page_lines)

    doc.close()
    return clean_markdown("\n".join(all_lines))


def main():
    parser = argparse.ArgumentParser(description="Convert a PDF file to Markdown.")
    parser.add_argument("pdf", help="Path to the input PDF file")
    parser.add_argument(
        "-o", "--output",
        help="Output markdown file path (default: same name with .md extension)",
    )
    parser.add_argument(
        "--stdout",
        action="store_true",
        help="Print output to stdout instead of writing to a file",
    )
    args = parser.parse_args()

    pdf_path = Path(args.pdf)
    if not pdf_path.exists():
        print(f"Error: file not found: {pdf_path}", file=sys.stderr)
        sys.exit(1)
    if not pdf_path.suffix.lower() == ".pdf":
        print(f"Warning: file does not have .pdf extension: {pdf_path}", file=sys.stderr)

    markdown = pdf_to_markdown(str(pdf_path))

    if args.stdout:
        print(markdown)
    else:
        out_path = Path(args.output) if args.output else pdf_path.with_suffix(".md")
        out_path.write_text(markdown, encoding="utf-8")
        print(f"Written to {out_path}")


if __name__ == "__main__":
    main()
