/**
 * LLM Provider Types
 *
 * Unified interface for all LLM providers (OpenAI, Anthropic, vLLM, Ollama).
 * Based on "From Language to Action" survey (arXiv 2508.17281):
 * - Standardized tool-calling format across providers
 * - Streaming support for real-time responses
 * - Token usage tracking for cost management
 */

export interface LLMMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  name?: string;
  tool_calls?: LLMToolCall[];
  tool_call_id?: string;
}

export interface LLMToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface LLMToolDef {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, any>;
  };
}

export interface LLMCompletionRequest {
  messages: LLMMessage[];
  tools?: LLMToolDef[];
  tool_choice?: "auto" | "none" | "required";
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  stop?: string[];
}

export interface LLMCompletionResponse {
  content: string | null;
  toolCalls: LLMToolCall[] | null;
  finishReason: "stop" | "tool_calls" | "length" | "error";
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
  model: string;
  latencyMs: number;
}

export interface LLMStreamChunk {
  content?: string;
  toolCalls?: Partial<LLMToolCall>[];
  done: boolean;
}

export type StreamCallback = (chunk: LLMStreamChunk) => void;

export interface LLMProvider {
  name: string;
  models: string[];
  supportsTools: boolean;
  supportsStreaming: boolean;
  supportsVision: boolean;

  complete(request: LLMCompletionRequest): Promise<LLMCompletionResponse>;
  stream(request: LLMCompletionRequest, callback: StreamCallback): Promise<LLMCompletionResponse>;
  healthCheck(): Promise<{ ok: boolean; latencyMs: number; model: string }>;
}

export interface LLMProviderConfig {
  provider: "openai" | "anthropic" | "vllm" | "ollama" | "custom";
  apiKey?: string;
  baseUrl: string;
  model: string;
  maxTokens: number;
  temperature: number;
  timeout: number;
}
