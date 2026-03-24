/**
 * @jarvis-tax/agent
 *
 * Autonomous agent runtime for Jarvis Tax Assistant.
 * Exports all components for programmatic usage.
 */

export { ReactAgent } from "./react-agent.js";
export { ToolRegistry } from "./tool-registry.js";
export { MemoryManager } from "./memory.js";
export { RagPipeline, createRagTools } from "./rag.js";
export { FILE_TOOLS } from "./tools/filesystem.js";
export { JARVIS_API_TOOLS } from "./tools/jarvis-api.js";
export { DOCUMENT_TOOLS } from "./tools/document.js";
export { ProviderManager, createProviderManagerFromEnv, OpenAIProvider, AnthropicProvider } from "./llm/index.js";
export { DocumentPipeline, createDocumentPipelineTools, TextExtractor, VLMDocumentProvider } from "./vlm/index.js";
export { RagV2Pipeline, createRagV2Tools } from "./rag-v2.js";
export type {
  Tool, ToolResult, AgentContext, AgentConfig,
  AgentResponse, ExecutionPlan, ExecutionStep, MemoryEntry
} from "./types.js";
export type {
  LLMProvider, LLMProviderConfig, LLMMessage, LLMToolCall,
  LLMCompletionRequest, LLMCompletionResponse
} from "./llm/index.js";
