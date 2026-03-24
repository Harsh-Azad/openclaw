---
name: jarvis-bridge
description: "Bridge between the Jarvis Gateway and Cloud Backend. Enables the AI agent to call Jarvis Cloud APIs for tax chat, document analysis, compliance calendar, and customs tariff lookup. Use when: the agent needs structured tax data, compliance deadlines, or tariff rates. This skill is auto-loaded."
metadata: { "jarvis": { "emoji": "🔗", "category": "system", "autoload": true, "requires": { "env": ["JARVIS_CLOUD_URL"] } } }
---

# Jarvis Cloud Bridge

Connects the AI agent to the Jarvis Cloud Backend APIs.

## Configuration

Set the environment variable:
```
JARVIS_CLOUD_URL=http://localhost:3001
```

## Available Commands

### Tax Chat (for complex structured queries)

When a user asks a tax question and you need structured legal references:

```bash
curl -s -X POST "${JARVIS_CLOUD_URL}/api/v1/tax/chat" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${JARVIS_ACCESS_TOKEN}" \
  -d '{"query": "USER_QUESTION_HERE", "domain": "gst"}'
```

Domain options: `gst`, `income-tax`, `customs`, `company-law`, `fema`, `general`

### Compliance Calendar

When user asks about filing deadlines:

```bash
# Current month deadlines
curl -s "${JARVIS_CLOUD_URL}/api/v1/tax/compliance-calendar?month=MONTH&year=YEAR" \
  -H "Authorization: Bearer ${JARVIS_ACCESS_TOKEN}"

# Filter by category
curl -s "${JARVIS_CLOUD_URL}/api/v1/tax/compliance-calendar?month=3&year=2026&category=gst" \
  -H "Authorization: Bearer ${JARVIS_ACCESS_TOKEN}"
```

Categories: `gst`, `income-tax`, `tds`, `company-law`, `fema`

### Customs Tariff Lookup

When user asks about customs duty, HSN codes, or import/export rates:

```bash
# Search by HSN code
curl -s "${JARVIS_CLOUD_URL}/api/v1/upload/tariff-search?hsn=8471" \
  -H "Authorization: Bearer ${JARVIS_ACCESS_TOKEN}"

# Search by description
curl -s "${JARVIS_CLOUD_URL}/api/v1/upload/tariff-search?search=laptop&limit=10" \
  -H "Authorization: Bearer ${JARVIS_ACCESS_TOKEN}"

# Search by chapter
curl -s "${JARVIS_CLOUD_URL}/api/v1/upload/tariff-search?chapter=Chapter+85&limit=10" \
  -H "Authorization: Bearer ${JARVIS_ACCESS_TOKEN}"
```

### Usage Check

Before making API calls, check remaining quota:

```bash
curl -s "${JARVIS_CLOUD_URL}/api/v1/subscription/usage" \
  -H "Authorization: Bearer ${JARVIS_ACCESS_TOKEN}"
```

## When to Use

✅ **USE this skill when:**
- User asks about specific tax rates with legal citations needed
- User asks "what deadlines do I have this month?"
- User asks about customs duty on specific goods
- User needs HSN/SAC code lookup
- User asks about compliance status

## When NOT to Use

❌ **DON'T use this skill when:**
- User is having a general conversation
- User asks conceptual questions you can answer from training
- The cloud backend is not configured (JARVIS_CLOUD_URL not set)

## Response Handling

When you receive data from the cloud API:
1. Present it in a clear, formatted manner
2. Highlight critical items (overdue deadlines, high duty rates)
3. Add context from your own knowledge
4. Cite the legal references from the API response
