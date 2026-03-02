---
name: upload-expense-image
description: Upload a receipt image to the Timesheet Manager expense attachment API via HTTP POST. Use after creating an expense via the Timesheet Manager MCP tools when the user shared a receipt image.
---

## When to use

After calling the `create_expense` MCP tool, the response includes an **attachment upload path** (e.g. `/api/expenses/{id}/attachments`). If the user shared a receipt image in the conversation, use this skill to upload it.

## Steps

1. **Save the image** the user shared to a temporary file (e.g. `/tmp/receipt.jpg`).
2. **Build the full upload URL** by combining the MCP server host with the attachment path from the `create_expense` response. For example, if your MCP server is `https://ts.example.com` and the path is `/api/expenses/abc123/attachments`, the URL is `https://ts.example.com/api/expenses/abc123/attachments`.
3. **Run the upload script:**

```bash
python3 /path/to/upload-expense-image/scripts/upload_receipt.py /tmp/receipt.jpg "https://ts.example.com/api/expenses/abc123/attachments"
```

4. Report the result to the user.

## Notes

- The upload endpoint accepts multipart form data with a `files` field.
- Supported image types: JPEG, PNG, GIF, WebP, PDF.
- The server generates thumbnails automatically for image files.
- If the script is not available or Python is not installed, you can use `curl` directly:

```bash
curl -X POST -F "files=@/tmp/receipt.jpg" "https://ts.example.com/api/expenses/abc123/attachments"
```
