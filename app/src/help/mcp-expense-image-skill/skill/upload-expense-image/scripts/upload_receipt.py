#!/usr/bin/env python3
"""Upload a receipt image to the Timesheet Manager expense attachment API."""

import mimetypes
import sys
from pathlib import Path

try:
    import requests
except ImportError:
    print("Error: 'requests' library is required. Install with: pip install requests", file=sys.stderr)
    sys.exit(1)


def main():
    if len(sys.argv) != 3:
        print(f"Usage: {sys.argv[0]} <image_path> <upload_url>", file=sys.stderr)
        sys.exit(1)

    image_path = Path(sys.argv[1])
    upload_url = sys.argv[2]

    if not image_path.exists():
        print(f"Error: File not found: {image_path}", file=sys.stderr)
        sys.exit(1)

    mime_type, _ = mimetypes.guess_type(str(image_path))
    if not mime_type:
        mime_type = "application/octet-stream"

    with open(image_path, "rb") as f:
        files = {"files": (image_path.name, f, mime_type)}
        resp = requests.post(upload_url, files=files, timeout=30)

    if resp.ok:
        data = resp.json()
        count = len(data) if isinstance(data, list) else 1
        print(f"Success: {count} file(s) uploaded to expense.")
    else:
        print(f"Error: Upload failed with status {resp.status_code}: {resp.text}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
