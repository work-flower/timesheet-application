---
title: Upload Expense Image Skill
description: Claude.ai skill for automatic receipt image upload after expense creation
tags: [mcp, skill, expenses, receipts, claude]
---

## What This Skill Does

When you create an expense via the **Timesheet Manager MCP tools** in Claude.ai and share a receipt image, the `create_expense` tool returns an attachment upload path. Claude then needs a way to upload that image to the server — but passing base64-encoded images through the MCP conversation context causes context overflow.

The **Upload Expense Image Skill** solves this by giving Claude the ability to save the image to a temporary file and upload it via HTTP POST directly to the server, bypassing the conversation context entirely.

---

## Prerequisites

- **Claude.ai Pro, Max, Team, or Enterprise** plan (skills require a paid plan)
- **Network access** enabled in Claude.ai settings (the skill makes an outbound HTTP request)
- **MCP server reachable** from Claude's execution environment (the server must be accessible via a public URL or tunnel)

---

## How to Install

1. **Download the skill:** [Download upload-expense-image.zip](/api/help/skills/upload-expense-image/download)
2. Unzip the downloaded file — you should see an `upload-expense-image/` folder containing `SKILL.md` and a `scripts/` subfolder
3. In **Claude.ai**, go to **Settings** > **Features** > **Skills**
4. Upload the `upload-expense-image/` folder
5. The skill should now appear in your skills list

---

## How It Works

Here is the runtime flow when you share a receipt image while creating an expense:

1. You share a receipt image and ask Claude to log an expense
2. Claude reads the image to extract date, amount, VAT, description, and expense type
3. Claude calls `create_expense` via the MCP tools — the response includes an **attachment upload path**
4. Claude activates the **Upload Expense Image Skill**
5. The skill saves the shared image to a temporary file
6. The skill runs `upload_receipt.py` to POST the image to the attachment endpoint
7. The receipt is now attached to the expense with a server-generated thumbnail

---

## Troubleshooting

### Skill not triggering after expense creation

- Ensure the skill is installed and visible in **Settings > Features > Skills**
- Check that you shared an image in the same conversation before creating the expense

### Upload fails with a network error

- Go to **Claude.ai Settings > Features** and ensure **Network access** is enabled
- Verify your MCP server is accessible from the public internet (e.g. via Cloudflare Tunnel)

### Upload fails with "requests library not found"

The upload script requires Python's `requests` library. If it's not available in Claude's execution environment, the skill instructions include a `curl` fallback command that Claude will use automatically.

### Server returns 404

- Verify the expense was created successfully and the expense ID in the upload URL is valid
- Check that the MCP server is running and the `/api/expenses/:id/attachments` endpoint is accessible
