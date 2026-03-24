# Jarvis - AI Tax & Compliance Assistant

**The open-source, enterprise-ready AI tax assistant for India.**

Built for Chartered Accountants, Lawyers, Company Secretaries, Tax Consultants, and enterprises. One platform for GST, Income Tax, Customs, Company Law, FEMA -- with document analysis, compliance tracking, and an extensible plugin system.

## Why Jarvis?

| Feature | TaxSrishti | EY AI Tax Hub | ClearTax | **Jarvis** |
|---------|-----------|---------------|----------|------------|
| AI Tax Chat (all domains) | Partial | Yes (enterprise) | No | **Yes** |
| GST + Income Tax + Customs + Company Law + FEMA | No | Partial | No | **Yes** |
| Document Analysis (Excel/PDF/Word) | No | No | No | **Yes** |
| Compliance Calendar (all domains) | No | No | No | **Yes** |
| Plugin Architecture | No | No | No | **Yes** |
| Open Source | No | No | No | **Yes (AGPL)** |
| Desktop + Local-first | No | No | No | **Yes** |
| Affordable for individual CAs | Yes | No | Yes | **Yes** |
| Enterprise-ready (RBAC, Audit, SSO) | No | Yes | No | **Yes** |
| SDK / API-first | No | No | No | **Yes** |

## Quick Start

```bash
# Install
npm install -g jarvis-tax-assistant@latest
jarvis onboard --install-daemon

# Or from source
git clone https://github.com/jarvis-tax/jarvis.git
cd jarvis
pnpm install && pnpm build

# Start cloud backend
cd cloud && npm install && npm run dev

# Start gateway
node jarvis.mjs gateway
```

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                  Jarvis Desktop App                  │
│            (Gateway ws://127.0.0.1:18789)            │
│                                                     │
│  ┌──────────┐ ┌────────────┐ ┌───────────────────┐ │
│  │ Tax Chat │ │Doc Analyzer│ │Compliance Calendar│ │
│  └──────────┘ └────────────┘ └───────────────────┘ │
│  ┌───────────────┐ ┌────────────────────────────┐  │
│  │Customs Tariff │ │  Custom Plugins (EY/PwC)   │  │
│  └───────────────┘ └────────────────────────────┘  │
│         │                    │                      │
│  ┌──────────────────────────────────────────────┐  │
│  │          Plugin Registry & Router             │  │
│  └───────────────────┬──────────────────────────┘  │
└──────────────────────┼──────────────────────────────┘
                       │
       ┌───────────────┴───────────────┐
       │      Jarvis Cloud Backend     │
       │  ┌─────┐ ┌──────┐ ┌───────┐  │
       │  │Auth │ │ Sub  │ │Tax API│  │
       │  │RBAC │ │Billing│ │Gateway│  │
       │  │SSO  │ │Usage │ │       │  │
       │  └─────┘ └──────┘ └───────┘  │
       │  ┌─────────────────────────┐  │
       │  │   Enterprise Features   │  │
       │  │ Audit Logs | API Keys   │  │
       │  │ RBAC | SSO | Plugins    │  │
       │  └─────────────────────────┘  │
       └───────────────────────────────┘
```

## Core Features

### Tax Chat
AI-powered consultation across all Indian tax domains:
- **GST**: Rates, ITC, returns, e-way bills, reverse charge
- **Income Tax**: Deductions, TDS/TCS, capital gains, assessments
- **Customs**: Tariff rates, HSN lookup, import/export policies
- **Company Law**: ROC filings, board meetings, director KYC
- **FEMA**: Foreign exchange, FDI, ECB, LRS

### Document Analyzer
Analyze, compare, and validate tax documents:
- Excel comparison (financial statements, tariff data, GST returns)
- PDF extraction (Form 16, ITR, assessment orders)
- Automated validation against tax rules

### Compliance Calendar
Track every deadline across all tax domains:
- GST returns (GSTR-1, GSTR-3B, GSTR-9)
- TDS/TCS deposits and returns
- Income Tax (advance tax, ITR filing, audit reports)
- Company Law (AGM, ROC filings, DIR-3 KYC)
- FEMA reporting

### Customs Tariff Lookup
Structured tariff data with instant lookup:
- HSN/SAC code search
- BCD, IGST, SWS, NCCD rates
- Import/Export policy status
- Notification-based exemptions

## For Enterprise (EY, PwC, Deloitte, KPMG)

Jarvis is designed to be adopted by consulting firms:

### Plugin System
Build custom modules without modifying core:
```typescript
import { JarvisPlugin, ChatRequest, ChatResponse } from '@jarvis-tax/sdk';

const myPlugin: JarvisPlugin = {
  manifest: {
    id: 'ey-transfer-pricing',
    name: 'EY Transfer Pricing Module',
    version: '1.0.0',
    domains: ['transfer-pricing', 'international-tax'],
    capabilities: ['chat', 'document-analysis'],
  },
  async onChat(request: ChatRequest): Promise<ChatResponse> {
    // Custom transfer pricing logic
  },
};
```

### SDK & API
Integrate Jarvis into existing enterprise tools:
```typescript
import { JarvisClient } from '@jarvis-tax/sdk';

const client = new JarvisClient({
  baseUrl: 'https://your-jarvis-instance.com',
  apiKey: 'jrv_...',
});

const answer = await client.taxChat({
  query: 'TDS rate on professional fees for NRI?',
  domain: 'income-tax',
});
```

### Enterprise Features (Commercial License)
- **RBAC**: 8 roles from super_admin to client_viewer with granular permissions
- **Audit Logs**: Full audit trail for SOC 2 / ISO 27001 compliance
- **SSO**: SAML 2.0 / OIDC (Azure AD, Okta, Google Workspace)
- **Multi-tenancy**: Client isolation per firm (Phase 2)
- **White-labeling**: Custom branding (Phase 2)
- **API Keys**: Per-service authentication with rate limits

## Licensing

**Dual Licensed:**

- **AGPL v3** (Open Source): Free for open-source use. Modifications must be released under AGPL if distributed or offered as a network service.
- **Commercial License**: For proprietary modifications, white-labeling, SSO, multi-tenancy, and enterprise support.

See [LICENSE](LICENSE) and [LICENSE-COMMERCIAL.md](LICENSE-COMMERCIAL.md).

## Subscription Tiers

| Tier | Price (INR) | Queries/Day | Documents/Day | Features |
|------|-------------|-------------|---------------|----------|
| Free | 0 | 10 | 2 | Tax Chat, Compliance Calendar |
| Professional | 2,999/mo | 200 | 50 | All features |
| Enterprise | 9,999/mo | Unlimited | Unlimited | All + RBAC, Audit, API, Plugins |

## Project Structure

```
jarvis/
├── src/                          # Core Gateway (OpenClaw fork)
├── skills/
│   ├── tax-chat/                 # Tax consultation skill
│   ├── doc-analyzer/             # Document analysis skill
│   ├── compliance-calendar/      # Deadline tracking skill
│   └── customs-tariff/           # Tariff lookup skill
├── cloud/
│   ├── src/
│   │   ├── routes/               # API endpoints
│   │   ├── middleware/            # Auth, subscription checks
│   │   ├── plugins/              # Plugin system
│   │   ├── enterprise/           # RBAC, audit, SSO
│   │   ├── sdk/                  # Client SDK
│   │   └── db/                   # Migrations & connection
│   └── package.json
├── ui/                           # WebChat UI
├── jarvis.mjs                    # Entry point
├── jarvis.json                   # Configuration
├── JARVIS_AGENTS.md              # AI personality & behavior
├── LICENSE                       # AGPL v3
└── LICENSE-COMMERCIAL.md         # Commercial license info
```

## Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md).

AI-assisted PRs welcome. Please ensure all tax references are accurate and cite specific sections/rules.

## Contact

- **Open Source**: GitHub Issues
- **Enterprise Licensing**: licensing@jarvis-tax.ai
- **Partnerships**: partners@jarvis-tax.ai
