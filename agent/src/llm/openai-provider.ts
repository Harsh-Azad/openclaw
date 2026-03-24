/**
 * OpenAI-Compatible LLM Provider
 *
 * Works with: OpenAI API, Azure OpenAI, vLLM (--api-key token --served-model-name),
 * Ollama (with OpenAI compat endpoint), LM Studio, LocalAI, etc.
 *
 * This is the primary provider since vLLM (our production local LLM server)
 * exposes an OpenAI-compatible API. One provider handles both cloud and local.
 */

import {
  LLMProvider, LLMProviderConfig, LLMCompletionRequest,
  LLMCompletionResponse, LLMStreamChunk, StreamCallback, LLMToolCall,
} from "./types.js";

export class OpenAIProvider implements LLMProvider {
  name: string;
  models: string[];
  supportsTools = true;
  supportsStreaming = true;
  supportsVision = false;

  private config: LLMProviderConfig;

  constructor(config: LLMProviderConfig) {
    this.config = config;
    this.name = `openai-compat:${config.baseUrl}`;
    this.models = [config.model];
  }

  async complete(request: LLMCompletionRequest): Promise<LLMCompletionResponse> {
    const start = Date.now();

    const body: Record<string, any> = {
      model: this.config.model,
      messages: request.messages,
      temperature: request.temperature ?? this.config.temperature,
      max_tokens: request.max_tokens ?? this.config.maxTokens,
    };

    if (request.tools && request.tools.length > 0) {
      body.tools = request.tools;
      body.tool_choice = request.tool_choice || "auto";
    }
    if (request.stop) body.stop = request.stop;

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.config.apiKey) {
      headers["Authorization"] = `Bearer ${this.config.apiKey}`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const res = await fetch(`${this.config.baseUrl}/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        const errText = await res.text().catch(() => "Unknown error");
        throw new Error(`LLM API error ${res.status}: ${errText.substring(0, 300)}`);
      }

      const data: any = await res.json();
      const choice = data.choices?.[0];
      if (!choice) throw new Error("No choices in LLM response");

      const toolCalls: LLMToolCall[] | null = choice.message?.tool_calls?.map((tc: any) => ({
        id: tc.id,
        type: "function" as const,
        function: { name: tc.function.name, arguments: tc.function.arguments },
      })) || null;

      return {
        content: choice.message?.content || null,
        toolCalls,
        finishReason: choice.finish_reason === "tool_calls" ? "tool_calls" : choice.finish_reason || "stop",
        usage: {
          promptTokens: data.usage?.prompt_tokens || 0,
          completionTokens: data.usage?.completion_tokens || 0,
          totalTokens: data.usage?.total_tokens || 0,
        },
        model: data.model || this.config.model,
        latencyMs: Date.now() - start,
      };
    } catch (e: any) {
      clearTimeout(timeoutId);
      if (e.name === "AbortError") throw new Error(`LLM request timed out after ${this.config.timeout}ms`);
      throw e;
    }
  }

  async stream(request: LLMCompletionRequest, callback: StreamCallback): Promise<LLMCompletionResponse> {
    const start = Date.now();

    const body: Record<string, any> = {
      model: this.config.model,
      messages: request.messages,
      temperature: request.temperature ?? this.config.temperature,
      max_tokens: request.max_tokens ?? this.config.maxTokens,
      stream: true,
    };

    if (request.tools && request.tools.length > 0) {
      body.tools = request.tools;
      body.tool_choice = request.tool_choice || "auto";
    }

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.config.apiKey) {
      headers["Authorization"] = `Bearer ${this.config.apiKey}`;
    }

    const res = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "Unknown error");
      throw new Error(`LLM stream error ${res.status}: ${errText.substring(0, 300)}`);
    }

    let fullContent = "";
    const allToolCalls: LLMToolCall[] = [];
    let finishReason: "stop" | "tool_calls" | "length" | "error" = "stop";

    const reader = res.body?.getReader();
    if (!reader) throw new Error("No response body for streaming");

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === "data: [DONE]") {
          if (trimmed === "data: [DONE]") {
            callback({ done: true });
          }
          continue;
        }
        if (!trimmed.startsWith("data: ")) continue;

        try {
          const chunk = JSON.parse(trimmed.slice(6));
          const delta = chunk.choices?.[0]?.delta;
          if (!delta) continue;

          if (delta.content) {
            fullContent += delta.content;
            callback({ content: delta.content, done: false });
          }

          if (delta.tool_calls) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index ?? 0;
              if (!allToolCalls[idx]) {
                allToolCalls[idx] = { id: tc.id || "", type: "function", function: { name: "", arguments: "" } };
              }
              if (tc.function?.name) allToolCalls[idx].function.name += tc.function.name;
              if (tc.function?.arguments) allToolCalls[idx].function.arguments += tc.function.arguments;
            }
          }

          if (chunk.choices?.[0]?.finish_reason) {
            finishReason = chunk.choices[0].finish_reason === "tool_calls" ? "tool_calls" : chunk.choices[0].finish_reason;
          }
        } catch {}
      }
    }

    return {
      content: fullContent || null,
      toolCalls: allToolCalls.length > 0 ? allToolCalls : null,
      finishReason,
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      model: this.config.model,
      latencyMs: Date.now() - start,
    };
  }

  async healthCheck(): Promise<{ ok: boolean; latencyMs: number; model: string }> {
    const start = Date.now();
    try {
      const res = await fetch(`${this.config.baseUrl}/models`, {
        headers: this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {},
      });
      return { ok: res.ok, latencyMs: Date.now() - start, model: this.config.model };
    } catch {
      return { ok: false, latencyMs: Date.now() - start, model: this.config.model };
    }
  }
}
