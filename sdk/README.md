# @jarvis-tax/sdk

Official SDK for the **Jarvis Tax Assistant** API.

## Install

```bash
npm install @jarvis-tax/sdk
```

## Quick Start

```typescript
import { JarvisClient } from '@jarvis-tax/sdk';

const client = new JarvisClient({
  baseUrl: 'http://localhost:3001',
  apiKey: 'jrv_your_api_key_here',
});

// Ask a tax question
const answer = await client.taxChat({
  query: 'What is the TDS rate on professional fees?',
  domain: 'income-tax',
});
console.log(answer.answer);
console.log(answer.references);

// Get compliance deadlines
const calendar = await client.getComplianceCalendar({ month: 3, year: 2026 });
console.log(calendar.deadlines);

// Look up customs tariff
const tariff = await client.tariffLookup({ hsn: '8471' });
console.log(tariff.results);

// Check subscription usage
const usage = await client.getUsage();
console.log(usage);
```

## Authentication

Two methods supported:

```typescript
// Method 1: API Key (recommended for server-to-server)
const client = new JarvisClient({
  baseUrl: 'https://your-jarvis.com',
  apiKey: 'jrv_...',
});

// Method 2: JWT Token (for user sessions)
const client = new JarvisClient({
  baseUrl: 'https://your-jarvis.com',
  accessToken: 'eyJ...',
  onTokenExpired: async () => {
    // Refresh token logic
    return 'new_token';
  },
});

// Login to get tokens
const { accessToken } = await client.login('user@example.com', 'password');
```

## API Methods

| Method | Description |
|--------|-------------|
| `taxChat(params)` | Ask a tax question with legal citations |
| `getComplianceCalendar(params?)` | Get filing deadlines by month/category |
| `tariffLookup(params)` | Search customs tariff by HSN/description |
| `analyzeDocument(params)` | Analyze uploaded tax documents |
| `getSubscription()` | Get current subscription details |
| `getUsage()` | Get daily usage statistics |
| `getPlans()` | List subscription plans |
| `getPlugins()` | List installed plugins |
| `health()` | Health check |
| `login(email, password)` | Authenticate and get tokens |
| `register(data)` | Register new user |

## License

MIT
