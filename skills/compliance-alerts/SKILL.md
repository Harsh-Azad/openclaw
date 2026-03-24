---
name: compliance-alerts
description: "Proactive compliance deadline alerts. Runs daily via cron to check upcoming deadlines and send reminders to connected channels. Warns about deadlines due within 3 days (high priority) and 7 days (medium priority)."
metadata: { "openclaw": { "emoji": "🔔", "category": "automation", "requires": { "config": ["cron.enabled"] } } }
---

# Compliance Alerts (Cron Skill)

This skill is triggered by the OpenClaw cron system to send proactive compliance deadline alerts.

## Trigger

Runs daily at 9:00 AM IST via cron configuration.

## What It Does

1. Calls `jarvis_compliance` tool to get this month's deadlines
2. Filters for deadlines due within the next 7 days
3. Categorizes by priority:
   - **HIGH** (due in 1-3 days): Send urgent alert
   - **MEDIUM** (due in 4-7 days): Send reminder
4. Formats a summary message
5. Sends via `message` tool to the user's last active channel

## Message Format

```
📋 JARVIS COMPLIANCE ALERT - [DATE]

🔴 URGENT (due within 3 days):
- GSTR-3B: Due 20-Mar-2026 | Penalty: Rs. 50/day + 18% interest
- TDS Deposit: Due 07-Mar-2026 | Penalty: 1.5% per month

🟡 UPCOMING (due within 7 days):
- GSTR-1: Due 11-Mar-2026 | Penalty: Rs. 50/day

Total: 3 deadlines this week
```

## Cron Configuration

Add to `openclaw.json`:
```json
{
  "cron": {
    "enabled": true,
    "jobs": [
      {
        "id": "compliance-alert-daily",
        "schedule": "0 9 * * *",
        "skill": "compliance-alerts",
        "prompt": "Check today's compliance deadlines and send alerts for anything due within 7 days."
      }
    ]
  }
}
```

## When NOT to Alert

- Do not alert for deadlines already past (status: overdue) -- those need a separate "missed deadline" workflow
- Do not alert if user has explicitly snoozed a deadline
- Do not send more than 1 alert per day per deadline
