# Jarvis Tax Assistant - Product Requirements Document (PRD)

**Version**: 1.1
**Last Updated**: 2026-03-24
**Status**: MVP Complete (Phase 1+2 Backend)
**Owner**: Product Team

---

## 1. Executive Summary

Jarvis is a personal AI-powered tax and compliance assistant designed for Indian tax professionals (CAs, Lawyers, CS, CMAs) and enterprises (Big 4, mid-tier firms). It is built as an open-source (AGPL v3) platform with commercial licensing for enterprise features, forked from OpenClaw and customized for the Indian tax domain.

**Vision**: Democratize access to professional-grade tax intelligence that was previously only available through expensive Big 4 consulting engagements.

**Mission**: Build the world's most comprehensive, accurate, and extensible AI tax assistant platform.

---

## 2. Problem Statement

### For Individual Professionals (CAs, Lawyers)
- Tax law spans 50+ Acts, 1000s of notifications, circulars, and case laws
- Manual research takes 2-4 hours per complex query
- No single tool covers GST + Income Tax + Customs + Company Law + FEMA
- Existing tools are either too expensive (EY: lakhs/year) or too narrow (TaxSrishti: chat only)
- Document comparison and analysis is manual and error-prone

### For Enterprises (EY, PwC, Deloitte, KPMG)
- Each firm builds proprietary tools in silos
- No standard platform to build custom tax modules on
- Client data security concerns with cloud-only tools
- Difficulty scaling knowledge across teams of 100s of associates
- Compliance tracking across clients is fragmented

---

## 3. Target Users

### Primary Users
| Persona | Description | Key Need |
|---------|------------|----------|
| **CA Practitioner** | Individual or small firm CA handling 50-200 clients | Fast tax answers with citations, compliance tracking |
| **Tax Lawyer** | Advocate handling tax litigation, notices, appeals | Case law research, notice drafting support, ITAT/HC/SC precedents |
| **CS (Company Secretary)** | Handles company law compliance for 10-50 companies | ROC filing deadlines, board meeting requirements, annual compliance |
| **Big 4 Associate** | Junior staff at EY/PwC/Deloitte/KPMG | Quick research during client engagements, document analysis |
| **Big 4 Partner** | Senior leader at consulting firms | Platform to deploy across team, white-label for clients |

### Secondary Users
- Corporate tax departments (CFOs, tax heads)
- Government tax departments (for policy analysis)
- Tax law students and researchers

---

## 4. Product Features (Prioritized)

### P0 - Must Have (MVP) -- ALL IMPLEMENTED

#### 4.1 Tax Chat Engine [DONE]
- **What**: Conversational AI that answers any Indian tax question
- **Domains**: GST, Income Tax, Customs, Company Law, FEMA
- **Requirements**:
  - Accept natural language queries
  - Return answers with legal citations (Section, Rule, Notification, Circular)
  - Include effective dates and amendment history
  - Flag penalties for non-compliance
  - Confidence score per response
  - Session-based context (multi-turn conversations)
- **Integration**: External Tax AI API (user's existing chatbot)
- **Accuracy Target**: >95% for standard queries, >85% for complex interpretations

#### 4.2 Document Analyzer [DONE]
- **What**: Upload and analyze tax documents
- **Supported formats**: Excel (.xlsx), PDF, Word (.docx), CSV
- **Capabilities**:
  - File comparison (cell-by-cell diff with smart matching)
  - Financial statement analysis (ratio analysis, trend detection)
  - GST return validation (ITC matching, rate verification)
  - Tax computation review (deduction limits, rate accuracy)
  - Customs tariff comparison (like our V4 vs 3-1 analysis)
- **Output**: Executive summary + detailed findings + recommendations

#### 4.3 Compliance Calendar [DONE]
- **What**: Track all Indian tax deadlines
- **Coverage**:
  - GST: GSTR-1, GSTR-3B, GSTR-9, CMP-08, GSTR-8, IFF
  - Income Tax: Advance tax (Q1-Q4), ITR filing, Tax audit, Belated return
  - TDS/TCS: Monthly deposits, quarterly returns, Form 16/16A
  - Company Law: AGM, AOC-4, MGT-7, ADT-1, DIR-3 KYC, DPT-3, MSME-1
  - FEMA: FC-GPR, FC-TRS, FLA Return, ECB-2
- **Features**:
  - Penalty information per deadline
  - Government extension notifications
  - Configurable reminders
  - Export to calendar (iCal/Google Calendar)

#### 4.4 Customs Tariff Lookup [DONE]
- **What**: Structured tariff data search
- **Data**: All 98+ Chapters + Chapter 99 (Services)
- **Fields**: HSN/SAC, Description, BCD, Effective Rate, IGST, SWS, NCCD, Import/Export Policy
- **Features**:
  - Search by HSN code, description keyword, chapter
  - Rate comparison between codes
  - Notification-based exemption tracking
  - Historical rate changes

#### 4.5 Authentication & Subscription [DONE]
- **Auth**: Email/password with JWT tokens
- **Tiers**: Free (10 queries/day), Professional (200/day, Rs.2999/mo), Enterprise (unlimited, Rs.9999/mo)
- **Payment**: Razorpay (India) / Stripe (global)
- **Usage tracking**: Per-user daily limits

### P1 - Should Have (Phase 2) -- ALL IMPLEMENTED

#### 4.6 Plugin System [DONE]
- Third-party plugin architecture
- Plugin manifest, lifecycle management, domain routing
- Plugin marketplace (JarvisHub)

#### 4.7 Enterprise RBAC [DONE]
- 8 roles with 30+ permissions
- Role assignment per user
- Permission checking on every API call

#### 4.8 Audit Logging [DONE]
- Every action logged (auth, queries, document access, settings changes)
- Queryable audit trail
- Export for compliance reporting

#### 4.9 SDK & API [DONE]
- TypeScript/JavaScript SDK
- REST API with OpenAPI spec
- API key management with rate limits

### P2 - Nice to Have (Phase 3) -- SCAFFOLDED

#### 4.10 SSO Integration [SCAFFOLD]
- SAML 2.0, OIDC
- Azure AD, Okta, Google Workspace

#### 4.11 Multi-tenancy
- Client isolation per firm
- Per-tenant configuration and branding

#### 4.12 White-labeling
- Custom logos, colors, domain
- Branded experience for enterprise clients

#### 4.13 Mobile Companion
- iOS and Android apps
- Voice query support

#### 4.14 RAG Pipeline [SCAFFOLD]
- Scrape government notifications, circulars, case laws
- Vector database for semantic search
- Auto-update knowledge base

---

## 5. Technical Requirements

### Architecture
- **Desktop Gateway**: OpenClaw fork, TypeScript, WebSocket server (port 18789)
- **Cloud Backend**: Node.js + Express + PostgreSQL
- **Frontend**: WebChat UI served by Gateway
- **Skills**: Markdown-based skill files the AI agent follows
- **Plugins**: TypeScript modules implementing JarvisPlugin interface

### Performance
- Tax chat response: <3 seconds for standard queries
- Document analysis: <30 seconds for files up to 50MB
- Compliance calendar: <1 second load time
- Tariff lookup: <500ms per query
- API availability: 99.9% uptime target

### Security
- All data encrypted at rest and in transit (AES-256, TLS 1.3)
- JWT tokens with short expiry (7 days) + refresh tokens (30 days)
- Password hashing with bcrypt (12 rounds)
- Rate limiting (100 requests / 15 minutes)
- Audit trail for all actions
- No client data stored in logs
- GDPR, DPDP Act 2023 compliance

### Scalability
- Single-user desktop mode (Phase 1)
- Multi-user cloud mode (Phase 2)
- Horizontal scaling via load balancer (Phase 3)

---

## 6. Success Metrics

| Metric | Target (6 months) | Target (12 months) |
|--------|-------------------|---------------------|
| Registered users | 1,000 | 10,000 |
| Paid subscribers | 100 | 1,500 |
| Enterprise clients | 2 | 10 |
| Daily active users | 200 | 3,000 |
| Query accuracy | >95% | >97% |
| NPS score | >40 | >60 |
| MRR (Monthly Recurring Revenue) | Rs. 5L | Rs. 50L |
| GitHub stars | 500 | 5,000 |

---

## 7. Release Plan

| Phase | Timeline | Deliverables |
|-------|----------|-------------|
| **Phase 1: MVP** | Month 1-2 | Tax chat, doc analyzer, compliance calendar, customs tariff, auth, subscription, basic UI | **COMPLETE** |
| **Phase 2: Enterprise** | Month 3-4 | Plugin system, RBAC, audit logs, SDK, API keys, multi-user | **COMPLETE (backend)** |
| **Phase 3: Scale** | Month 5-6 | SSO, multi-tenancy, white-labeling, RAG pipeline, mobile apps |
| **Phase 4: Market** | Month 7-12 | Enterprise sales (Big 4), marketplace, international expansion |

---

## 8. Dependencies & Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Tax AI API quality/availability | High | Build fallback with direct LLM + RAG |
| Legal accuracy of AI responses | High | Always cite sources, add disclaimers, human review for complex queries |
| Competition from TaxSrishti/EY | Medium | Differentiate on open-source, plugin system, all-domain coverage |
| Regulatory changes breaking compliance data | Medium | Automated notification scraping, hourly updates |
| Enterprise sales cycle length | Medium | Freemium + self-serve for individuals, enterprise sales in parallel |
| PostgreSQL scaling limits | Low | Migrate to distributed DB when needed |

---

## 9. Open Questions

1. Should Jarvis support regional languages (Hindi, Tamil, etc.) for wider adoption?
2. Should we build a browser extension for portal integration (GST portal, ITR portal)?
3. Should we integrate with Tally/Busy for accounting data import?
4. What is the go-to-market strategy for Big 4 firms?
5. Should we pursue government partnerships (GSTN, CBDT)?

---

## Appendix A: Competitive Analysis Summary

See `/docs/competitive-analysis.md` for detailed competitor breakdown.

## Appendix B: User Research

Pending -- plan user interviews with 10 CAs, 5 lawyers, 3 enterprise tax teams.
