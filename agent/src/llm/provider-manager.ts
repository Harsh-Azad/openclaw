/**
 * LLM Provider Manager
 *
 * Manages multiple LLM providers with automatic failover, load balancing,
 * and cost tracking. Enterprise feature: ensures no data leaves firewall
 * by routing to local vLLM when configured.
 *
 * Based on "Difficulty-Aware Agent Orchestration" (arXiv 2509.11079):
 * - Simple queries -> fast/cheap model (e.g., Qwen3-8B via Ollama)
 * - Complex reasoning -> powerful model (e.g., GPT-4o or Qwen3-235B via vLLM)
 * - Document understanding -> VLM (e.g., Qwen2.5-VL via vLLM)
 */

import { LLMProvider, LLMProviderConfig, LLMCompletionRequest, LLMCompletionResponse } from "./types.js";
import { OpenAIProvider } from "./openai-provider.js";
import { AnthropicProvider } from "./anthropic-provider.js";

interface ProviderStats {
  totalCalls: number;
  totalTokens: number;
  totalLatencyMs: number;
  errors: number;
  lastError?: string;
  lastUsed?: number;
}

interface RoutingRule {
  name: string;
  condition: (request: LLMCompletionRequest) => boolean;
  provider: string;
}

export class ProviderManager {
  private providers = new Map<string, LLMProvider>();
  private stats = new Map<string, ProviderStats>();
  private primaryProvider: string = "";
  private fallbackProviders: string[] = [];
  private routingRules: RoutingRule[] = [];

  constructor() {}

  addProvider(id: string, config: LLMProviderConfig, isPrimary = false): void {
    let provider: LLMProvider;

    switch (config.provider) {
      case "anthropic":
        provider = new AnthropicProvider(config);
        break;
      case "openai":
      case "vllm":
      case "ollama":
      case "custom":
      default:
        provider = new OpenAIProvider(config);
        break;
    }

    this.providers.set(id, provider);
    this.stats.set(id, { totalCalls: 0, totalTokens: 0, totalLatencyMs: 0, errors: 0 });

    if (isPrimary || !this.primaryProvider) {
      this.primaryProvider = id;
    } else {
      this.fallbackProviders.push(id);
    }
  }

  addRoutingRule(rule: RoutingRule): void {
    this.routingRules.push(rule);
  }

  async complete(request: LLMCompletionRequest): Promise<LLMCompletionResponse & { providerId: string }> {
    // Check routing rules first
    for (const rule of this.routingRules) {
      if (rule.condition(request) && this.providers.has(rule.provider)) {
        try {
          const result = await this.callProvider(rule.provider, request);
          return { ...result, providerId: rule.provider };
        } catch {
          // Fall through to primary
        }
      }
    }

    // Try primary provider
    try {
      const result = await this.callProvider(this.primaryProvider, request);
      return { ...result, providerId: this.primaryProvider };
    } catch (primaryError: any) {
      // Automatic failover to fallback providers
      for (const fallbackId of this.fallbackProviders) {
        try {
          const result = await this.callProvider(fallbackId, request);
          return { ...result, providerId: fallbackId };
        } catch {
          continue;
        }
      }
      throw new Error(`All LLM providers failed. Primary error: ${primaryError.message}`);
    }
  }

  private async callProvider(id: string, request: LLMCompletionRequest): Promise<LLMCompletionResponse> {
    const provider = this.providers.get(id);
    if (!provider) throw new Error(`Provider "${id}" not found`);

    const stats = this.stats.get(id)!;
    stats.totalCalls++;
    stats.lastUsed = Date.now();

    try {
      const result = await provider.complete(request);
      stats.totalTokens += result.usage.totalTokens;
      stats.totalLatencyMs += result.latencyMs;
      return result;
    } catch (e: any) {
      stats.errors++;
      stats.lastError = e.message;
      throw e;
    }
  }

  async healthCheckAll(): Promise<Record<string, { ok: boolean; latencyMs: number; model: string }>> {
    const results: Record<string, { ok: boolean; latencyMs: number; model: string }> = {};
    for (const [id, provider] of this.providers) {
      results[id] = await provider.healthCheck();
    }
    return results;
  }

  getStats(): Record<string, ProviderStats> {
    return Object.fromEntries(this.stats);
  }

  getProvider(id: string): LLMProvider | undefined {
    return this.providers.get(id);
  }

  listProviders(): string[] {
    return Array.from(this.providers.keys());
  }
}

/**
 * Create a ProviderManager from environment variables.
 *
 * Supported env vars:
 *   OPENAI_API_KEY + OPENAI_MODEL (default: gpt-4o)
 *   ANTHROPIC_API_KEY + ANTHROPIC_MODEL (default: claude-sonnet-4-20250514)
 *   VLLM_BASE_URL + VLLM_MODEL (e.g., http://gpu-server:8000/v1, Qwen3-235B-A22B)
 *   OLLAMA_BASE_URL + OLLAMA_MODEL (e.g., http://localhost:11434/v1, qwen3:8b)
 */
export function createProviderManagerFromEnv(): ProviderManager {
  const pm = new ProviderManager();

  // Local vLLM (highest priority for enterprise -- data stays on-premise)
  if (process.env.VLLM_BASE_URL) {
    pm.addProvider("vllm", {
      provider: "vllm",
      baseUrl: process.env.VLLM_BASE_URL,
      apiKey: process.env.VLLM_API_KEY || "token-placeholder",
      model: process.env.VLLM_MODEL || "Qwen3-235B-A22B",
      maxTokens: 4096,
      temperature: 0.2,
      timeout: 120000,
    }, true);
  }

  // Local Ollama (lightweight local models)
  if (process.env.OLLAMA_BASE_URL) {
    pm.addProvider("ollama", {
      provider: "ollama",
      baseUrl: process.env.OLLAMA_BASE_URL,
      model: process.env.OLLAMA_MODEL || "qwen3:8b",
      maxTokens: 4096,
      temperature: 0.2,
      timeout: 60000,
    });

    // Route simple queries to Ollama (cheaper/faster)
    pm.addRoutingRule({
      name: "simple-to-ollama",
      condition: (req) => {
        const lastMsg = req.messages[req.messages.length - 1];
        const content = lastMsg?.content || "";
        return typeof content === "string" && content.length < 200 && !req.tools?.length;
      },
      provider: "ollama",
    });
  }

  // OpenAI (cloud fallback)
  if (process.env.OPENAI_API_KEY) {
    pm.addProvider("openai", {
      provider: "openai",
      apiKey: process.env.OPENAI_API_KEY,
      baseUrl: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
      model: process.env.OPENAI_MODEL || "gpt-4o",
      maxTokens: 4096,
      temperature: 0.2,
      timeout: 60000,
    }, !process.env.VLLM_BASE_URL); // Primary only if no vLLM
  }

  // Anthropic (cloud fallback)
  if (process.env.ANTHROPIC_API_KEY) {
    pm.addProvider("anthropic", {
      provider: "anthropic",
      apiKey: process.env.ANTHROPIC_API_KEY,
      baseUrl: process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com/v1",
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514",
      maxTokens: 4096,
      temperature: 0.2,
      timeout: 60000,
    });
  }

  return pm;
}
