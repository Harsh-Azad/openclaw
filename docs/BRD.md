# Jarvis Tax Assistant - Business Requirements Document (BRD)

**Version**: 1.1
**Last Updated**: 2026-03-24
**Status**: MVP Complete - Ready for Beta
**Owner**: Business Strategy

---

## 1. Business Objective

Build and monetize an open-source AI tax assistant platform that:
1. Captures the underserved market of 300,000+ CAs and 1.7M+ tax professionals in India
2. Positions as a white-label platform for Big 4 and mid-tier consulting firms
3. Creates a sustainable dual-revenue stream (SaaS subscriptions + enterprise licensing)

---

## 2. Market Analysis

### Total Addressable Market (TAM)
| Segment | Size (India) | Average Spend on Tax Tools | TAM |
|---------|-------------|---------------------------|-----|
| Chartered Accountants | 370,000+ (ICAI members) | Rs. 5,000-50,000/year | Rs. 500-1,000 Cr |
| Tax Lawyers/Advocates | 200,000+ | Rs. 3,000-30,000/year | Rs. 200-400 Cr |
| Company Secretaries | 65,000+ (ICSI) | Rs. 5,000-40,000/year | Rs. 50-150 Cr |
| Corporate Tax Departments | 50,000+ companies | Rs. 50,000-50,00,000/year | Rs. 500-2,000 Cr |
| Big 4 + Mid-tier Firms | 200+ firms | Rs. 10L-5Cr/year per firm | Rs. 200-500 Cr |
| **Total** | | | **Rs. 1,500-4,000 Cr** |

### Serviceable Addressable Market (SAM)
- Individual CAs + Lawyers willing to pay for AI tools: ~50,000 users
- Enterprise firms needing a platform: ~100 firms
- **SAM**: Rs. 100-300 Cr annually

### Serviceable Obtainable Market (SOM) - Year 1
- 1,500 paid individual subscribers @ Rs. 36,000/year avg = Rs. 5.4 Cr
- 10 enterprise clients @ Rs. 12L/year avg = Rs. 1.2 Cr
- **SOM Year 1**: Rs. 6.6 Cr (~$780K USD)

---

## 3. Revenue Model

### Stream 1: SaaS Subscriptions (Individual Professionals)

| Tier | Monthly | Annual | Target Users | Revenue/Year |
|------|---------|--------|-------------|-------------|
| Free | Rs. 0 | Rs. 0 | 8,000 | Rs. 0 (funnel) |
| Professional | Rs. 2,999 | Rs. 29,990 | 1,200 | Rs. 3.6 Cr |
| Enterprise (Individual) | Rs. 9,999 | Rs. 99,990 | 300 | Rs. 3.0 Cr |

### Stream 2: Enterprise Licensing (Firms)

| Tier | Annual License | Target Clients | Revenue/Year |
|------|---------------|----------------|-------------|
| Startup (<50 users) | Rs. 5L | 5 | Rs. 25L |
| Professional (<500 users) | Rs. 25L | 3 | Rs. 75L |
| Enterprise (unlimited) | Rs. 1Cr+ | 2 | Rs. 2Cr |

### Stream 3: Services (Future)
- Custom plugin development for enterprise clients
- Training and onboarding
- Premium support SLA
- Data migration services

### Projected Revenue

| Year | Subscriptions | Enterprise | Services | Total |
|------|-------------|-----------|---------|-------|
| Year 1 | Rs. 2 Cr | Rs. 1 Cr | Rs. 0.5 Cr | **Rs. 3.5 Cr** |
| Year 2 | Rs. 8 Cr | Rs. 5 Cr | Rs. 2 Cr | **Rs. 15 Cr** |
| Year 3 | Rs. 20 Cr | Rs. 15 Cr | Rs. 5 Cr | **Rs. 40 Cr** |

---

## 4. Competitive Positioning

### Against TaxSrishti AI (Direct Competitor)
| Factor | TaxSrishti | Jarvis | Advantage |
|--------|-----------|--------|-----------|
| Pricing | Rs. 499-1,499/mo | Rs. 0-9,999/mo | Jarvis has free tier + premium |
| Coverage | GST, IT, TDS | GST, IT, Customs, CompanyLaw, FEMA | Jarvis: 5 domains vs 3 |
| Doc Analysis | No | Yes | Jarvis unique |
| Open Source | No | Yes (AGPL) | Community + trust |
| Enterprise | No | Yes (Plugin, RBAC, Audit) | Jarvis wins enterprise |
| Desktop App | No | Yes | Privacy + offline |

### Against EY AI Tax Hub
| Factor | EY | Jarvis | Advantage |
|--------|-----|--------|-----------|
| Price | Lakhs/year (enterprise only) | Rs. 0-1.2L/year | 10-100x cheaper |
| Accessibility | Enterprise sales process | Self-serve signup | Instant access |
| Customization | EY proprietary | Open-source + plugins | Full control |
| Target | Fortune 500 CFOs | Individual CAs to Fortune 500 | Broader market |

### Moat Strategy
1. **Open-source community**: Contributors improve the platform for free
2. **Plugin ecosystem**: Network effects as more plugins are built
3. **Data advantage**: Aggregated (anonymized) query patterns improve AI
4. **Switching costs**: Custom plugins + integrations create lock-in
5. **Brand trust**: AGPL license = transparency = trust in regulated industry

---

## 5. Go-to-Market Strategy

### Phase 1: Community Launch (Month 1-3)
- Open-source release on GitHub
- Product Hunt launch
- Content marketing (tax season articles, LinkedIn, YouTube)
- Free tier drives adoption
- Target: 1,000 registrations, 100 paid users

### Phase 2: Professional Growth (Month 3-6)
- Partnerships with ICAI, ICSI, Bar Council chapters
- Webinars and workshops at CA conferences
- Referral program (1 month free per referral)
- Case studies from early adopters
- Target: 5,000 registrations, 500 paid users

### Phase 3: Enterprise Sales (Month 6-12)
- Direct outreach to Big 4 India technology teams
- Pilot programs (3-month free trial for enterprises)
- Joint go-to-market with tax technology partners
- SOC 2 Type II certification
- Target: 5 enterprise clients, 1,500 paid users

### Phase 4: International Expansion (Month 12+)
- UAE, UK, US tax modules via plugins
- Multi-language support
- Global partnership network

---

## 6. Cost Structure

### Fixed Costs (Monthly)

| Item | Cost (Rs.) |
|------|-----------|
| Cloud infrastructure (AWS/GCP) | 50,000 |
| AI API costs (LLM provider) | 2,00,000 |
| Domain, SSL, CDN | 5,000 |
| Legal & compliance | 25,000 |
| **Total Fixed** | **2,80,000/mo** |

### Variable Costs (Per User)

| Item | Cost per user/month |
|------|-------------------|
| AI API calls | Rs. 50-200 |
| Storage | Rs. 10 |
| Support | Rs. 20 |
| **Total Variable** | **Rs. 80-230/user** |

### Gross Margin
- Professional tier: Rs. 2,999 - Rs. 200 = Rs. 2,799 (93% margin)
- Enterprise tier: Rs. 9,999 - Rs. 230 = Rs. 9,769 (98% margin)
- Enterprise license: 95%+ margin

---

## 7. Key Business Requirements

### BR-001: Dual Licensing
- AGPL v3 for open-source
- Commercial license for enterprise
- Clear separation of open-source vs commercial features
- **Status**: DONE

### BR-002: Subscription Management
- Self-serve signup and payment
- Razorpay integration for India
- Stripe integration for global
- Auto-renewal, cancellation, upgrade/downgrade
- Usage-based billing enforcement
- **Status**: SCAFFOLD DONE, payment integration PENDING

### BR-003: Enterprise Sales Readiness
- SOC 2 audit trail capability
- RBAC with granular permissions
- SSO support (SAML/OIDC)
- Data residency compliance (India data stays in India)
- SLA documentation
- **Status**: SCAFFOLD DONE, SSO PENDING (commercial)

### BR-004: Tax Data Accuracy
- Data sourced from official government databases
- Hourly or daily update cycle for notifications/circulars
- Every AI response must include legal citations
- Disclaimer on AI-generated content
- Human review process for complex queries
- **Status**: ARCHITECTURE DONE, data pipeline PENDING

### BR-005: Data Privacy & Security
- DPDP Act 2023 compliance
- Client data encryption at rest and in transit
- No data sharing between tenants
- Right to deletion
- Data export capability
- **Status**: ARCHITECTURE DONE, certification PENDING

### BR-006: Scalability
- Support 10,000 concurrent users by Month 12
- Horizontal scaling for cloud backend
- CDN for static assets
- Database read replicas for heavy query loads
- **Status**: ARCHITECTURE SUPPORTS, not tested at scale

### BR-007: Open Source Community
- GitHub repository with clear contribution guidelines
- Issue templates, PR templates
- Community Discord/Slack
- Regular releases (bi-weekly)
- **Status**: REPO CREATED, community setup PENDING

---

## 8. Stakeholder Sign-off

| Role | Name | Status |
|------|------|--------|
| Product Owner | TBD | Pending |
| Technical Lead | TBD | Pending |
| Business Lead | TBD | Pending |
| Legal | TBD | Pending |

---

## 9. Document History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-03-23 | Initial BRD created |
