from pathlib import Path


def escape(text: str) -> str:
    return text.replace('\\', r'\\').replace('(', r'\(').replace(')', r'\)')


def build_pdf_bytes(lines: list[str]) -> bytes:
    content_lines = [
        "BT",
        "/F1 16 Tf",
        "1 0 0 1 72 760 Tm",
        f"({escape(lines[0])}) Tj",
        "/F1 11 Tf",
    ]
    y = 735
    for line in lines[1:]:
        content_lines.append(f"1 0 0 1 72 {y} Tm")
        content_lines.append(f"({escape(line) if line else ' '}) Tj")
        y -= 16
    content_lines.append("ET")
    content_stream = "\n".join(content_lines).encode("utf-8")

    objects: list[bytes] = []
    objects.append(b"1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n")
    objects.append(b"2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n")
    page_obj = (
        "3 0 obj\n"
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
        "/Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\n"
        "endobj\n"
    ).encode("utf-8")
    objects.append(page_obj)
    objects.append(
        f"4 0 obj\n<< /Length {len(content_stream)} >>\nstream\n".encode("utf-8")
        + content_stream
        + b"\nendstream\nendobj\n"
    )
    objects.append(b"5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n")

    pdf_bytes = bytearray()
    pdf_bytes.extend(b"%PDF-1.4\n%\xff\xff\xff\xff\n")
    offsets = [0]
    for obj in objects:
        offsets.append(len(pdf_bytes))
        pdf_bytes.extend(obj)

    xref_offset = len(pdf_bytes)
    count = len(objects) + 1
    xref = ["xref\n0 {}\n".format(count), "0000000000 65535 f \n"]
    for offset in offsets[1:]:
        xref.append(f"{offset:010d} 00000 n \n")
    pdf_bytes.extend("".join(xref).encode("utf-8"))
    trailer = (
        f"trailer\n<< /Size {count} /Root 1 0 R >>\nstartxref\n{xref_offset}\n%%EOF"
    ).encode("utf-8")
    pdf_bytes.extend(trailer)
    return bytes(pdf_bytes)


def main() -> None:
    lines = [
        "Trend Video Frontend Architecture",
        "",
        "Overview",
        "- Single-page Next.js 16 (App Router) with React 19 + TypeScript.",
        "- Tailwind CSS v4 beta styling and custom gradients.",
        "- Local storage persists filter presets (trend-video-filters).",
        "",
        "Server Routes",
        "- POST /api/search proxies YouTube Data API, filters, enriches stats.",
        "- POST /api/pipeline fetches captions, builds prompt bundle for LLM tools.",
        "",
        "Client Behaviour",
        "- Home component manages filters, selection grid, and automation actions.",
        "- Memoised views maintain responsiveness across large result sets.",
        "- pushLog keeps a 50-line activity feed of API calls.",
        "",
        "Data Flow",
        "1. Operator tunes filters and triggers fetch.",
        "2. Browser posts payload to /api/search (requires YOUTUBE_API_KEY).",
        "3. Results populate grid; selected items post to /api/pipeline.",
        "4. Pipeline response opens GPT/Gemini/Claude/Groq tabs with prompts.",
        "",
        "Notes",
        "- Default YouTube query: \"korea trending\" (adjust in search route).",
        "- Duration filter uses API seconds or ISO 8601 parsing.",
    ]

    output_path = Path("docs/architecture-overview.pdf")
    output_path.write_bytes(build_pdf_bytes(lines))


if __name__ == "__main__":
    main()
