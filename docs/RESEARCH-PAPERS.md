# Jarvis Enterprise Agent -- Research Paper Bibliography

**Purpose**: Papers required to build an enterprise-grade, self-hosted AI tax agent platform comparable to Claude Cowork but deployable inside an organization's firewall (EY, PwC, Deloitte, KPMG).

**Last Updated**: 2026-03-24

### IMPLEMENTATION STATUS
Papers marked with `[IMPLEMENTED]` have been directly applied in the Jarvis codebase.
- `[IMPLEMENTED]` ReAct (Yao et al.) -> `agent/src/react-agent.ts`
- `[IMPLEMENTED]` Global Planning (arXiv 2504.16563) -> `react-agent.ts:createPlan()`
- `[IMPLEMENTED]` Pre-execution Guardrails (arXiv 2510.09781) -> `react-agent.ts` approval gates
- `[IMPLEMENTED]` Difficulty-Aware Routing (arXiv 2509.11079) -> `react-agent.ts:assessComplexity()`
- `[IMPLEMENTED]` Tool Learning Survey (DSE Jun 2025) -> `tool-registry.ts` with typed schemas
- `[IMPLEMENTED]` LLM Agents Survey (Dec 2025) -> `memory.ts` hierarchical memory + Reflexion
- `[IMPLEMENTED]` Enterprise RAG concepts -> `rag.ts` TF-IDF + `rag-v2.ts` BM25+RRF hybrid search
- `[PARTIAL]` Reflexion pattern -> `memory.ts` lesson storage (full reflection loop needs LLM)
- `[IMPLEMENTED]` VLM pipeline scaffold -> `vlm/document-pipeline.ts` with text extractor + VLM provider
- `[IMPLEMENTED]` Multi-provider LLM -> `llm/provider-manager.ts` (OpenAI, Anthropic, vLLM, Ollama)
- `[IMPLEMENTED]` GUI Agent shell -> `desktop/` Electron app with approval workflow
- `[IMPLEMENTED]` Enterprise security -> `enterprise/multi-tenant.ts`, `sso.ts`, `audit-export.ts`
- `[PLANNED]` RLHF/DPO -> Phase 6 (requires training data + GPU)
- `[PLANNED]` VLM deployment -> Requires GPU (Qwen2.5-VL-72B model weights)

---

## 1. CORE AGENT ARCHITECTURE (How to build the autonomous execution loop)

### 1.1 Foundational Agent Frameworks

| Paper | Authors | Venue | Key Contribution |
|-------|---------|-------|-----------------|
| **ReAct: Synergizing Reasoning and Acting in Language Models** | Yao et al. | ICLR 2023 | The foundational Reason+Act loop. Agent thinks step-by-step then takes tool actions. **This is the core execution pattern we need.** |
| **Agentic AI: Architectures, Taxonomies, and Challenges** | Multiple | arXiv 2601.12560 (Jan 2026) | Comprehensive taxonomy of agent architectures (reactive, deliberative, hybrid). Covers perception, reasoning, planning, action, learning. |
| **AI Agent Systems: Architectures, Applications, and Evaluation** | Multiple | arXiv 2601.01743 (Jan 2026) | Covers tool-use, memory, multi-agent coordination, evaluation benchmarks. |
| **Enhancing LLM-Based Agents via Global Planning and Reward-driven Reflective Refinement** | Multiple | arXiv 2504.16563 (Apr 2025) | Improves ReAct with global planning (plan the full task first) + reward-driven reflection (learn from failures). |
| **Large Language Model Agents: A Comprehensive Survey** | Multiple | Preprints 202512.2119 (Dec 2025) | Most recent comprehensive survey covering architectures, memory, tool use, multi-agent, and safety. |
| **A Review of Prominent Paradigms for LLM-Based Agents** | Multiple | COLING 2025 | Compares ReAct vs Plan-and-Execute vs Reflexion vs LATS paradigms. |
| **Difficulty-Aware Agent Orchestration in LLM-Powered Workflows** | Multiple | arXiv 2509.11079 (Sep 2025) | Routes tasks to different agent strategies based on difficulty. Simple tasks get fast paths, complex ones get deep reasoning. |

### 1.2 Tool Use and Function Calling

| Paper | Authors | Venue | Key Contribution |
|-------|---------|-------|-----------------|
| **LLM-Based Agents for Tool Learning: A Survey** | Multiple | Data Science & Engineering (Jun 2025) | Comprehensive survey of how agents discover, select, and invoke tools. Covers tool creation, composition, and verification. |
| **From Language to Action: A Review of LLMs as Autonomous Agents** | Multiple | arXiv 2508.17281 (Aug 2025) | 108 papers reviewed. Covers tool-use patterns, environment interaction, and real-world deployment. |

---

## 2. VISION-LANGUAGE MODELS (Document understanding without sending data outside)

### 2.1 VLM Architecture and Training

| Paper | Authors | Venue | Key Contribution |
|-------|---------|-------|-----------------|
| **Vision Language Models: A Survey of 26K Papers** | Multiple | arXiv 2510.09586 (Oct 2025) | Meta-analysis of 26,104 VLM papers from CVPR/ICLR/NeurIPS 2023-2025. Shows trends, architectures, and what works. |
| **A Survey of State of the Art Large Vision Language Models: Alignment, Benchmark, Evaluations** | Li et al. | CVPR 2025 Workshop | Covers VLM alignment techniques, benchmarks, and challenges. |
| **What Matters When Building Vision-Language Models?** | Laurençon et al. | NeurIPS 2024 | Empirical study of what design choices matter most: data quality > model size > training tricks. |
| **Re-Align: Aligning VLMs via Retrieval-Augmented Feedback** | Multiple | EMNLP 2025 | Aligns VLMs using retrieved examples rather than human annotation. Cheaper than RLHF. |

### 2.2 Recommended Open-Source VLMs for On-Premise Deployment

| Model | Parameters | Key Strength | Use for Jarvis |
|-------|-----------|-------------|---------------|
| **Qwen2.5-VL-72B-Instruct** | 72B | Best open-source VLM for document understanding, 100+ languages | **Primary**: Tax document scanning, invoice OCR, financial statement parsing |
| **Qwen2-VL-7B** | 7B | Efficient, runs on single GPU | **Edge/laptop**: Quick document previews, receipt scanning |
| **InternVL2.5** | 8B-78B | Strong OCR, chart understanding | **Alternative**: Complex table extraction from PDFs |
| **Llama 3.2 Vision** | 11B/90B | Meta's multimodal, good general vision | **Fallback**: General document understanding |
| **DeepSeek-VL2** | Various | Strong on structured data extraction | **Specialist**: Balance sheets, tax forms |

---

## 3. RLHF AND ALIGNMENT (Making the agent trustworthy for tax/legal domain)

### 3.1 Core RLHF Theory

| Paper | Authors | Venue | Key Contribution |
|-------|---------|-------|-----------------|
| **Reinforcement Learning from Human Feedback** (Book) | Lambert et al. | arXiv 2504.12501 (2025-2026) | **THE comprehensive RLHF reference.** 300+ page book covering reward modeling, PPO, DPO, constitutional AI, iterative refinement. |
| **A Survey of Reinforcement Learning from Human Feedback** | Kaufmann et al. | arXiv 2312.14925 (2023, updated 2025) | Systematic survey of RLHF methods, applications across domains, open challenges. |
| **Safe RLHF: Safe Reinforcement Learning from Human Feedback** | Multiple | ICLR 2024 | Balances helpfulness vs safety. Critical for tax domain where wrong advice = legal liability. |
| **Robust RLHF for LLMs** | Multiple | arXiv 2504.03784 (Apr 2025) | Handles noisy/adversarial human feedback. Important when expert annotators disagree on tax interpretations. |

### 3.2 Practical Alignment for Domain-Specific Agents

| Technique | What It Does | Jarvis Application |
|-----------|-------------|-------------------|
| **DPO (Direct Preference Optimization)** | Skips reward model, trains directly on preference pairs | Fine-tune on "good tax answer" vs "bad tax answer" pairs rated by CAs |
| **Constitutional AI** | Agent self-critiques against principles | "Does this answer cite a specific section?" "Is the effective date mentioned?" |
| **RLAIF (RL from AI Feedback)** | Use a stronger model to evaluate a weaker one | Use Claude/GPT-4 to evaluate Llama's tax answers before deployment |
| **Expert Iteration** | Generate many answers, filter by expert, retrain | Generate 10 answers per tax question, have CAs pick the best, retrain |

---

## 4. GUI AGENTS AND DESKTOP AUTOMATION (Cowork-level computer use)

### 4.1 Computer Use / GUI Agent Research

| Paper | Authors | Venue | Key Contribution |
|-------|---------|-------|-----------------|
| **Large Language Model-Brained GUI Agents: A Survey** | Multiple | arXiv 2411.18279 (Nov 2024) | **Most comprehensive GUI agent survey.** Covers screen understanding, action grounding, planning. References Claude 3.5 "computer use" feature. |
| **Instruction Agent: Enhancing Agent with Expert Demonstration** | Multiple | arXiv 2509.07098 (Sep 2025) | Teaches agents from expert demos. Record a CA filling a tax form, agent learns to replicate. |
| **Anthropic Computer Use** (Technical Report) | Anthropic | Blog (Oct 2024) | Claude's computer use: screenshot -> reason -> click/type. The basis for Cowork. |

### 4.2 Key Open-Source GUI Agent Frameworks

| Framework | What It Does | Relevance |
|-----------|-------------|-----------|
| **Open Interpreter** | Local code execution + computer control | Could be the base for Jarvis desktop agent |
| **SWE-Agent** | Autonomous software engineering agent | Architecture patterns for tool use |
| **AgentQL / Browser Use** | Browser automation for AI agents | Tax portal automation (GST portal, ITR e-filing) |

---

## 5. RAG AT ENTERPRISE SCALE (Searchable tax knowledge base)

### 5.1 RAG Architecture

| Paper | Authors | Venue | Key Contribution |
|-------|---------|-------|-----------------|
| **Agentic Retrieval-Augmented Generation: A Survey** | Multiple | arXiv 2501.09136 (Jan 2025) | Covers Agentic RAG where the agent decides when/how to retrieve. Not just "retrieve then generate" but "reason -> retrieve -> verify -> generate". |
| **A Systematic Review of Key RAG Components** | Multiple | arXiv 2507.18910 (Jul 2025) | Reviews chunking strategies, embedding models, reranking, and generation. |

### 5.2 Recommended Stack for On-Premise RAG

| Component | Recommendation | Why |
|-----------|---------------|-----|
| **Vector DB** | pgvector (PostgreSQL extension) or Milvus | pgvector: zero new infra. Milvus: better at scale. Both on-premise. |
| **Embedding Model** | BGE-M3 or Nomic-Embed | Run locally, multilingual, 8192 token context |
| **Reranker** | BGE-Reranker-v2-M3 or Cohere Rerank (self-hosted) | Dramatically improves retrieval quality |
| **Chunking** | Semantic chunking (not fixed-size) | Tax laws have natural section boundaries |

---

## 6. ENTERPRISE SECURITY AND SAFETY

### 6.1 Agent Safety

| Paper | Authors | Venue | Key Contribution |
|-------|---------|-------|-----------------|
| **The 2025 AI Agent Index: Documenting Technical and Safety Features** | Multiple | arXiv 2602.17753 (Feb 2026) | Annotates 45 fields per agent system including guardrails, sandboxing, evaluations, compliance. **THE enterprise safety checklist.** |
| **A Safety and Security Framework for Real-World Agentic Systems** | Multiple | arXiv 2511.21990 (Nov 2025) | Dynamic framework for securing agents in enterprise. Covers threat models, monitoring, incident response. |
| **Agentic AI Security: Threats, Defenses, Evaluation** | Multiple | arXiv 2510.23883 (Oct 2025) | Taxonomy of attacks (prompt injection, tool misuse, data exfiltration) and defenses. |
| **Building a Foundational Guardrail for General Agentic Systems** | Multiple | arXiv 2510.09781 (Oct 2025) | Pre-execution guardrail that monitors agent actions before they execute. **Critical for tax domain -- verify before filing.** |
| **TRiSM for Agentic AI: Trust, Risk, and Security Management** | Multiple | arXiv 2506.04133 (Jun 2025) | Enterprise TRiSM framework for multi-agent systems. Covers Gartner's AI TRiSM pillar. |
| **Safety in Large Reasoning Models: A Survey** | Multiple | arXiv 2504.17704 (Apr 2025) | Safety for reasoning models (o1-style). Important since tax reasoning requires chain-of-thought. |

### 6.2 Financial/Legal Domain Safety

| Paper | Authors | Venue | Key Contribution |
|-------|---------|-------|-----------------|
| **The Agentic Regulator: Risks for AI in Finance** | Multiple | arXiv 2512.11933 (Dec 2025) | AI agent risks in regulated finance. Covers automated reporting, compliance monitoring, regulatory requirements. |
| **Agentic AI for Financial Crime Compliance** | Axelsen et al. | arXiv 2509.13137 (Sep 2025) | How AI agents can assist financial compliance. Directly applicable to tax compliance. |

---

## 7. OPEN-SOURCE LLMs FOR ON-PREMISE DEPLOYMENT

### 7.1 Recommended Models (as of March 2026)

| Model | Size | License | Best For | Hardware Needed |
|-------|------|---------|----------|----------------|
| **Qwen3-235B-A22B** | 235B (22B active, MoE) | Apache 2.0 | Best open-source reasoning. Dual-mode (think/no-think). | 2x A100 80GB |
| **DeepSeek-R1** | 671B (37B active, MoE) | MIT | Best open-source for complex reasoning. 164K context. | 4x A100 80GB |
| **Llama 4 Maverick** | 400B (17B active, MoE) | Llama License | Strong general + multilingual. 1M context. | 2x A100 80GB |
| **Qwen2.5-72B-Instruct** | 72B | Apache 2.0 | Best dense model for enterprise. | 2x A100 80GB or 4x A6000 |
| **Mistral Large 2** | 123B | Apache 2.0 | Strong European model, good at structured output. | 2x A100 80GB |
| **Llama 3.3-70B** | 70B | Llama License | Best cost/performance ratio. | 2x A100 40GB |
| **Qwen2.5-32B** | 32B | Apache 2.0 | Sweet spot for single-GPU deployment. | 1x A100 80GB |
| **Mistral Small 3.2** | 24B | Apache 2.0 | Efficient, good for high-throughput. | 1x A6000 48GB |

### 7.2 Serving Infrastructure

| Tool | Purpose | Why |
|------|---------|-----|
| **vLLM** | High-throughput LLM inference | PagedAttention, continuous batching, fastest open-source serving |
| **SGLang** | Structured generation + serving | Better for constrained JSON output (tax citations) |
| **Ollama** | Simple local deployment | Easy setup for developer machines |
| **TensorRT-LLM** | NVIDIA-optimized inference | Maximum GPU utilization for production |

---

## 8. ARCHITECTURE: JARVIS ENTERPRISE AGENT

Based on the research above, here is the target architecture:

```
┌──────────────────────────────────────────────────────────┐
│                    EY/PwC FIREWALL                        │
│                                                          │
│  ┌─────────────┐    ┌──────────────────────────────────┐ │
│  │ User Desktop │    │   Jarvis Agent Server (on-prem)  │ │
│  │             │    │                                  │ │
│  │ Jarvis      │◄──►│  ┌─────────┐  ┌──────────────┐  │ │
│  │ Desktop App │    │  │ Agent   │  │ Local LLM    │  │ │
│  │ (Electron)  │    │  │ Runtime │──│ (Qwen3/Llama)│  │ │
│  │             │    │  │ (ReAct) │  │ via vLLM     │  │ │
│  │ - Local     │    │  └────┬────┘  └──────────────┘  │ │
│  │   files     │    │       │                          │ │
│  │ - Browser   │    │  ┌────┴──────────────────────┐   │ │
│  │ - Approval  │    │  │       Tool Registry       │   │ │
│  │   gates     │    │  │ tax_chat | compliance     │   │ │
│  │ - Scanner   │    │  │ tariff  | doc_analyze     │   │ │
│  │   (VLM)     │    │  │ file_ops | browser        │   │ │
│  └─────────────┘    │  │ rag_search | portal_auto  │   │ │
│                     │  └───────────────────────────┘   │ │
│  ┌─────────────┐    │                                  │ │
│  │ WhatsApp/   │    │  ┌──────────────────────────┐    │ │
│  │ Telegram/   │◄──►│  │  Jarvis Cloud Backend    │    │ │
│  │ Slack/Teams │    │  │  (Express + PostgreSQL)   │    │ │
│  └─────────────┘    │  │  Auth | RBAC | Audit      │    │ │
│                     │  │  Tariff | Compliance       │    │ │
│  ┌─────────────┐    │  │  RAG | Plugins            │    │ │
│  │ Mobile App  │    │  └──────────────────────────┘    │ │
│  │ (iOS/Andr)  │◄──►│                                  │ │
│  │ Doc scan    │    │  ┌──────────────────────────┐    │ │
│  │ via camera  │    │  │    Vector DB (pgvector)   │    │ │
│  └─────────────┘    │  │  Tax laws | Circulars     │    │ │
│                     │  │  Case laws | Notifications│    │ │
│                     │  └──────────────────────────┘    │ │
│                     │                                  │ │
│                     │  ┌──────────────────────────┐    │ │
│                     │  │   VLM (Qwen2.5-VL-72B)   │    │ │
│                     │  │  Document understanding   │    │ │
│                     │  │  Invoice/receipt OCR       │    │ │
│                     │  │  Financial statement parse │    │ │
│                     │  └──────────────────────────┘    │ │
│                     └──────────────────────────────────┘ │
│                                                          │
│  NOTHING LEAVES THE FIREWALL                             │
│  - No API calls to OpenAI/Anthropic/Google               │
│  - All models run on-premise (GPU cluster)               │
│  - All data stored on-premise (PostgreSQL + pgvector)    │
│  - Audit trail for every action                          │
│  - RBAC for every user                                   │
│  - Sandboxed execution for agent tools                   │
└──────────────────────────────────────────────────────────┘
```

### Key Design Decisions

1. **ReAct execution loop** -- Agent reasons, then acts, then observes result, then reasons again
2. **Local LLM** -- Qwen3-235B or DeepSeek-R1 via vLLM (no data leaves firewall)
3. **Local VLM** -- Qwen2.5-VL-72B for document scanning (invoices, receipts, financial statements)
4. **RLHF/DPO alignment** -- Fine-tune on CA-validated tax Q&A pairs for domain accuracy
5. **Constitutional AI guardrails** -- Every answer must cite a section, every filing action requires approval
6. **Pre-execution guardrails** -- Agent plan is validated before execution (no accidental filings)
7. **Agentic RAG** -- Agent decides when to search knowledge base vs when to reason from context
8. **Enterprise security** -- RBAC, audit logs, sandboxed execution, encrypted storage, SOC 2 ready

---

## 9. IMPLEMENTATION ROADMAP

| Phase | Duration | Deliverable |
|-------|----------|-------------|
| **Phase 1: Agent Runtime** | 4 weeks | ReAct execution loop with tool registry, local file access, approval gates |
| **Phase 2: Local LLM** | 2 weeks | vLLM serving Qwen3/Llama on GPU cluster, API compatible with OpenAI format |
| **Phase 3: VLM Integration** | 2 weeks | Document scanning pipeline: upload -> VLM -> structured extraction |
| **Phase 4: Desktop App** | 4 weeks | Electron app with file browser, chat, approval workflow, settings |
| **Phase 5: RAG Pipeline** | 3 weeks | pgvector + BGE embeddings + semantic chunking for tax corpus |
| **Phase 6: RLHF/DPO** | 6 weeks | Collect 10K tax Q&A pairs, fine-tune reward model, run DPO training |
| **Phase 7: Enterprise** | 4 weeks | Multi-tenant, SSO, audit export, compliance reporting, SOC 2 prep |
| **Phase 8: Channels** | 3 weeks | WhatsApp/Teams/Slack integration for mobile access |
| **Total** | ~28 weeks | Full Cowork-equivalent for tax domain |

---

## 10. HARDWARE REQUIREMENTS (For EY-scale deployment)

### Minimum (50 users)
- 2x NVIDIA A100 80GB (LLM inference)
- 1x NVIDIA A100 80GB (VLM inference)
- 64GB RAM application server
- 2TB NVMe SSD (model weights + vector DB)
- PostgreSQL 16 with pgvector

### Recommended (500 users)
- 4x NVIDIA H100 80GB (LLM inference with redundancy)
- 2x NVIDIA A100 80GB (VLM inference)
- 128GB RAM application server (x2 for HA)
- 10TB NVMe SSD (model weights + vector DB + document storage)
- PostgreSQL 16 cluster with pgvector + read replicas

### Enterprise (5000+ users)
- 8x NVIDIA H100 80GB (distributed inference)
- 4x NVIDIA A100 80GB (VLM + embedding generation)
- Kubernetes cluster for auto-scaling
- Distributed PostgreSQL (Citus or YugabyteDB)
- S3-compatible object storage for documents
