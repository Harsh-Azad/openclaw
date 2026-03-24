---
name: tax-dashboard
description: "Interactive tax dashboard rendered via OpenClaw Canvas. Shows compliance status, recent queries, tariff lookups, and subscription usage in a visual dashboard. Use command /dashboard to open."
user-invocable: true
metadata: { "openclaw": { "emoji": "📊", "category": "ui" } }
---

# Tax Dashboard (Canvas)

Renders an interactive tax dashboard using the OpenClaw Canvas system.

## Trigger

User types `/dashboard` or asks "show me my dashboard".

## What to Render

Use the `canvas` tool to render an HTML dashboard with A2UI interactive elements:

```html
<div a2ui-component="jarvis-dashboard" style="font-family:system-ui;padding:20px;max-width:900px;">
  <h1 style="color:#1a56db;">Jarvis Tax Dashboard</h1>

  <!-- Compliance Status -->
  <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px;margin:12px 0;">
    <h2>Upcoming Deadlines</h2>
    <div id="deadlines">Loading...</div>
    <button a2ui-action="refresh-deadlines" style="margin-top:8px;padding:6px 14px;background:#1a56db;color:white;border:none;border-radius:6px;cursor:pointer;">
      Refresh
    </button>
  </div>

  <!-- Quick Tax Query -->
  <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px;margin:12px 0;">
    <h2>Quick Tax Query</h2>
    <div style="display:flex;gap:8px;">
      <button a2ui-action="query" a2ui-param-q="What are the TDS rates for FY 2026-27?" style="padding:8px 12px;border:1px solid #1a56db;border-radius:6px;cursor:pointer;">TDS Rates</button>
      <button a2ui-action="query" a2ui-param-q="What are the advance tax due dates?" style="padding:8px 12px;border:1px solid #1a56db;border-radius:6px;cursor:pointer;">Advance Tax</button>
      <button a2ui-action="query" a2ui-param-q="What is the GST rate on IT services?" style="padding:8px 12px;border:1px solid #1a56db;border-radius:6px;cursor:pointer;">GST on IT</button>
    </div>
  </div>

  <!-- Tariff Search -->
  <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px;margin:12px 0;">
    <h2>Tariff Lookup</h2>
    <div style="display:flex;gap:8px;">
      <button a2ui-action="tariff" a2ui-param-hsn="8471" style="padding:8px 12px;border:1px solid #1a56db;border-radius:6px;cursor:pointer;">HSN 8471 (Computers)</button>
      <button a2ui-action="tariff" a2ui-param-search="rice" style="padding:8px 12px;border:1px solid #1a56db;border-radius:6px;cursor:pointer;">Rice</button>
      <button a2ui-action="tariff" a2ui-param-search="steel" style="padding:8px 12px;border:1px solid #1a56db;border-radius:6px;cursor:pointer;">Steel</button>
    </div>
  </div>

  <!-- Usage Stats -->
  <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px;margin:12px 0;">
    <h2>Usage</h2>
    <button a2ui-action="check-usage" style="padding:6px 14px;background:#1a56db;color:white;border:none;border-radius:6px;cursor:pointer;">Check Usage</button>
  </div>
</div>
```

## A2UI Action Handlers

When user clicks a button:

- **refresh-deadlines**: Call `jarvis_compliance` for current month, re-render deadline section
- **query**: Call `jarvis_tax_chat` with the `q` parameter, display answer in a new section
- **tariff**: Call `jarvis_tariff` with hsn or search param, display results table
- **check-usage**: Call `jarvis_usage`, display usage stats

## Notes

- Canvas renders on port 18793 by default
- A2UI attributes make buttons interactive without JavaScript
- Dashboard state is per-session
- Works on both desktop WebChat and mobile companion apps
