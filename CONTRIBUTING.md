# Contributing to Jarvis Tax Assistant

Thank you for your interest in contributing to Jarvis! This document provides guidelines for contributing.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/jarvis.git`
3. Install dependencies:
   ```bash
   cd jarvis/cloud && npm install
   cd ../sdk && npm install
   ```
4. Set up dev environment:
   ```bash
   cd cloud
   cp .env.example .env
   # DB_MODE=sqlite is auto-detected when DATABASE_URL is not set
   ```
5. Run tests:
   ```bash
   cd cloud
   DB_MODE=sqlite npx tsx smoke-test.ts
   DB_MODE=sqlite npx tsx integration-test.ts
   ```

## Development Workflow

1. Create a branch: `git checkout -b feature/my-feature`
2. Make your changes
3. Run `npx tsc --noEmit` in `cloud/` to verify types
4. Run smoke + integration tests
5. Commit with a descriptive message
6. Push and open a PR

## What We Accept

### Bug Fixes
- Fix incorrect tax rates or legal citations
- Fix API errors or edge cases
- Fix TypeScript types

### New Features
- New tax domain plugins (e.g., transfer pricing, international tax)
- New compliance deadlines
- New document analysis capabilities
- Performance improvements
- UI improvements

### Documentation
- Tax law accuracy corrections
- API documentation
- Usage examples

### Tax Data Accuracy
**This is critical.** If you're updating tax rates, deadlines, or legal references:
- Cite the specific Section/Rule/Notification
- Include the effective date
- Reference the official source (gazette notification, CBDT/CBIC circular)

## Code Standards

- TypeScript strict mode
- No `any` types unless absolutely necessary (and documented why)
- All API endpoints must have Zod validation
- All new routes must have integration tests
- Follow existing code style

## Plugin Development

See `cloud/src/plugins/plugin-interface.ts` for the plugin API.
See `cloud/src/plugins/sample-transfer-pricing-plugin.ts` for an example.

## Pull Request Template

```
## Description
Brief description of changes.

## Type
- [ ] Bug fix
- [ ] New feature
- [ ] Tax data update
- [ ] Documentation
- [ ] Plugin

## Testing
- [ ] Smoke tests pass
- [ ] Integration tests pass (22/22)
- [ ] TypeScript compiles clean
- [ ] Tax citations verified (if applicable)

## Legal References (if updating tax data)
- Section/Rule: 
- Notification: 
- Effective Date: 
```

## License

By contributing, you agree that your contributions will be licensed under the AGPL-3.0 license.

For questions about commercial licensing implications, contact licensing@jarvis-tax.ai.
