# Phase 1: Agent Runtime -- Completion Report

**Date**: 2026-03-24
**Status**: COMPLETE
**Tests**: 28/28 PASS (59/59 total with cloud)

---

## What Was Built

### Core Runtime (`agent/src/react-agent.ts`, 238 lines)
- Full ReAct (Reason+Act) execution loop from Yao et al. (ICLR 2023)
- Global planning: agent creates step-by-step plan before executing complex tasks
- Pre-execution guardrails: high-risk tools require user approval
- Difficulty assessment: simple queries answered directly, complex ones get multi-step planning
- OpenAI-compatible function calling (works with GPT-4o, Claude, local LLMs via OpenAI-compat API)
- Max iteration limit to prevent infinite loops
- Session-based memory with automatic context assembly

### Tool System (`agent/src/tool-registry.ts` + `agent/src/tools/`)
15 tools total:

| Category | Tools | Purpose |
|----------|-------|---------|
| File System | read_file, write_file, list_files, search_files, move_file, delete_file | Cowork-level local file access |
| Cloud API | jarvis_tax_chat, jarvis_compliance, jarvis_tariff, jarvis_rag_search | Tax knowledge via cloud backend |
| Document | parse_csv, parse_json, analyze_data | Structured data analysis for CAs |
| RAG | rag_ingest_file, rag_search_local | Local knowledge base |

Each tool has:
- JSON Schema parameters (validated at call time)
- Risk level (low/medium/high)
- Approval flag (requires user confirmation before executing)

### Memory System (`agent/src/memory.ts`, 203 lines)
- **Working Memory**: Last 20 messages (in LLM context window)
- **Short-term Memory**: Full session history, persisted to disk
- **Long-term Memory**: Facts, lessons, preferences (keyword-searchable)
- **Reflexion Pattern**: Agent stores lessons from mistakes, retrieves them for similar tasks
- **Context Assembly**: Auto-includes relevant facts + lessons in prompts
- **Persistence**: JSON file on disk, loads on startup

### RAG Pipeline (`agent/src/rag.ts`, 280 lines)
- Semantic chunking (paragraph/section boundaries)
- TF-IDF vectorization with smoothed IDF for small corpora
- Cosine similarity search with re-vectorization at query time
- Domain-filtered search (restrict to GST, income-tax, etc.)
- File ingestion (read file -> chunk -> vectorize -> index)
- Persistence to disk (JSON-based index)
- Upgrade path documented: swap to BGE-M3 embeddings + pgvector

### CLI (`agent/src/cli.ts`, 152 lines)
- Interactive mode (multi-turn conversation with tool execution)
- Single-query mode (`npx tsx src/cli.ts "question"`)
- Execution plan display with risk assessment
- Approval gate prompts for high-risk operations
- Session clear command

## Research Papers Applied

| Paper | How Applied |
|-------|-----------|
| ReAct (Yao et al., ICLR 2023) | Core Think->Act->Observe loop in react-agent.ts |
| Global Planning (arXiv 2504.16563) | createPlan() -- agent plans full task before executing |
| Pre-execution Guardrails (arXiv 2510.09781) | Approval gates on high-risk tools |
| Difficulty-Aware Routing (arXiv 2509.11079) | assessComplexity() -- routes simple vs complex tasks |
| Tool Learning Survey (DSE, Jun 2025) | Typed tool registry with JSON Schema |
| LLM Agents Survey (Dec 2025) | Hierarchical memory (working/short/long-term) |
| Reflexion concept | Lessons stored in long-term memory for future retrieval |

## What's Next (Phase 2-8)

| Phase | What | Requires |
|-------|------|----------|
| Phase 2: Local LLM | vLLM + Qwen3-235B | GPU hardware (NVIDIA A100/H100) |
| Phase 3: VLM | Qwen2.5-VL-72B for document scanning | GPU + training data |
| Phase 4: Desktop App | Electron with file browser + approval UI | Phase 1 complete (done) |
| Phase 5: RAG v2 | pgvector + BGE-M3 embeddings | PostgreSQL + embedding model |
| Phase 6: RLHF/DPO | Fine-tune on 10K tax Q&A pairs | Training infrastructure |
| Phase 7: Enterprise | Multi-tenant, SSO, SOC 2 | Customer contracts |
| Phase 8: Channels | WhatsApp/Teams/Slack | Bot tokens |

## Key Decisions Made

1. **OpenAI-compatible API**: Agent uses OpenAI chat completions format, making it trivially swappable to local LLMs (vLLM, Ollama, etc.) that expose the same API
2. **TF-IDF over embeddings**: For Phase 1, chose zero-dependency TF-IDF over external embedding models. Works well enough for small corpora; upgrade path is clear
3. **Smoothed IDF**: Used `log(1 + N/(1+df))` instead of standard `log(N/(1+df))` to handle small corpora where standard IDF produces zeros
4. **Approval per-tool, not per-plan**: Individual tools declare their risk level. Agent asks for approval at tool-call time, not just at plan-approval time
5. **Agent auto-registers with cloud**: Agent creates its own cloud backend account on first use, caches the token for subsequent calls
