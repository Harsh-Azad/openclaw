---
name: tax-notification-watcher
description: "Monitors incoming tax notifications via webhooks. When a new CBDT/CBIC notification or circular arrives, analyzes its impact and alerts the user with a summary."
metadata: { "openclaw": { "emoji": "📡", "category": "automation", "requires": { "config": ["hooks.enabled"] } } }
---

# Tax Notification Watcher

Receives real-time tax notifications via the OpenClaw webhook system and provides impact analysis.

## Webhook Endpoint

```
POST /hooks/tax-notification
Content-Type: application/json
Authorization: Bearer <hooks.token>

{
  "source": "cbdt|cbic|mca|rbi",
  "type": "notification|circular|press-release|order",
  "number": "Notification No. 15/2026",
  "date": "2026-03-24",
  "title": "Amendment to Section 194J TDS rates",
  "content": "Full text of the notification...",
  "url": "https://incometaxindia.gov.in/..."
}
```

## What the Agent Does

When a webhook arrives:

1. **Classify** the notification by domain (GST/IT/Customs/Company Law/FEMA)
2. **Summarize** the key changes in 3-5 bullet points
3. **Identify impact**: Who is affected? What changes? When effective?
4. **Check compliance calendar**: Does this change any upcoming deadlines?
5. **Alert user** via their preferred channel with a structured summary:

```
📢 NEW TAX NOTIFICATION

Source: CBDT
Number: Notification No. 15/2026 dated 24-Mar-2026
Title: Amendment to Section 194J TDS rates

Key Changes:
• TDS rate on professional fees reduced from 10% to 7.5% for FY 2026-27
• Effective from 01-Apr-2026
• Applies to payments exceeding Rs. 30,000 in aggregate

Impact:
• All deductors must update TDS rates from April 2026
• Q1 advance tax calculations may need revision

Link: https://incometaxindia.gov.in/...
```

6. **Ingest** into the RAG pipeline using `jarvis_rag_search` for future reference

## Data Sources to Connect

Government sources that can POST to this webhook:
1. CBDT (Income Tax): incometaxindia.gov.in RSS/API
2. CBIC (GST/Customs): cbic-gst.gov.in notifications
3. MCA (Company Law): mca.gov.in circulars
4. RBI (FEMA): rbi.org.in master directions

## Setup

Configure in `openclaw.json`:
```json
{
  "hooks": {
    "enabled": true,
    "token": "your-secret-token",
    "mappings": [
      {
        "match": { "path": "tax-notification" },
        "action": "agent",
        "agentId": "jarvis",
        "deliver": true
      }
    ]
  }
}
```
