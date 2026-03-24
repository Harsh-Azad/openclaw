/**
 * Anthropic Claude Provider
 *
 * Native Anthropic API support for Claude models.
 * Translates between OpenAI tool format and Anthropic's native tool use format.
 */

import {
  LLMProvider, LLMProviderConfig, LLMCompletionRequest,
  LLMCompletionResponse, LLMStreamChunk, StreamCallback, LLMToolCall,
} from "./types.js";

export class AnthropicProvider implements LLMProvider {
  name = "anthropic";
  models: string[];
  supportsTools = true;
  supportsStreaming = true;
  supportsVision = true;

  private config: LLMProviderConfig;

  constructor(config: LLMProviderConfig) {
    this.config = config;
    this.models = [config.model];
  }

  async complete(request: LLMCompletionRequest): Promise<LLMCompletionResponse> {
    const start = Date.now();

    // Convert OpenAI format to Anthropic format
    const systemMsg = request.messages.find((m) => m.role === "system");
    const nonSystemMsgs = request.messages.filter((m) => m.role !== "system");

    const anthropicMessages = nonSystemMsgs.map((m) => {
      if (m.role === "tool") {
        return {
          role: "user" as const,
          content: [{
            type: "tool_result" as const,
            tool_use_id: m.tool_call_id || "",
            content: m.content || "",
          }],
        };
      }
      if (m.role === "assistant" && m.tool_calls) {
        return {
          role: "assistant" as const,
          content: m.tool_calls.map((tc) => ({
            type: "tool_use" as const,
            id: tc.id,
            name: tc.function.name,
            input: JSON.parse(tc.function.arguments || "{}"),
          })),
        };
      }
      return { role: m.role as "user" | "assistant", content: m.content || "" };
    });

    const body: Record<string, any> = {
      model: this.config.model,
      messages: anthropicMessages,
      max_tokens: request.max_tokens ?? this.config.maxTokens,
      temperature: request.temperature ?? this.config.temperature,
    };

    if (systemMsg?.content) body.system = systemMsg.content;

    if (request.tools && request.tools.length > 0) {
      body.tools = request.tools.map((t) => ({
        name: t.function.name,
        description: t.function.description,
        input_schema: t.function.parameters,
      }));
    }

    const res = await fetch(`${this.config.baseUrl}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.config.apiKey || "",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "Unknown error");
      throw new Error(`Anthropic API error ${res.status}: ${errText.substring(0, 300)}`);
    }

    const data: any = await res.json();

    // Convert Anthropic response to unified format
    let content: string | null = null;
    const toolCalls: LLMToolCall[] = [];

    for (const block of data.content || []) {
      if (block.type === "text") {
        content = (content || "") + block.text;
      } else if (block.type === "tool_use") {
        toolCalls.push({
          id: block.id,
          type: "function",
          function: {
            name: block.name,
            arguments: JSON.stringify(block.input),
          },
        });
      }
    }

    return {
      content,
      toolCalls: toolCalls.length > 0 ? toolCalls : null,
      finishReason: data.stop_reason === "tool_use" ? "tool_calls" : "stop",
      usage: {
        promptTokens: data.usage?.input_tokens || 0,
        completionTokens: data.usage?.output_tokens || 0,
        totalTokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
      },
      model: data.model || this.config.model,
      latencyMs: Date.now() - start,
    };
  }

  async stream(request: LLMCompletionRequest, callback: StreamCallback): Promise<LLMCompletionResponse> {
    // For now, fall back to non-streaming (Anthropic streaming requires SSE parsing)
    const result = await this.complete(request);
    if (result.content) {
      callback({ content: result.content, done: false });
    }
    callback({ done: true });
    return result;
  }

  async healthCheck(): Promise<{ ok: boolean; latencyMs: number; model: string }> {
    const start = Date.now();
    try {
      const res = await fetch(`${this.config.baseUrl}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.config.apiKey || "",
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: this.config.model,
          messages: [{ role: "user", content: "ping" }],
          max_tokens: 5,
        }),
      });
      return { ok: res.ok, latencyMs: Date.now() - start, model: this.config.model };
    } catch {
      return { ok: false, latencyMs: Date.now() - start, model: this.config.model };
    }
  }
}
