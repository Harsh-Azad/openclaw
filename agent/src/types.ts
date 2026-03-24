/**
 * Core type definitions for the Jarvis Agent Runtime.
 *
 * Based on:
 * - ReAct (Yao et al., ICLR 2023): Thought-Action-Observation loop
 * - Global Planning (arXiv 2504.16563): Plan full task before executing
 * - Pre-execution guardrails (arXiv 2510.09781): Validate before acting
 */

export interface Tool {
  name: string;
  description: string;
  parameters: Record<string, any>;
  requiresApproval?: boolean;
  riskLevel?: "low" | "medium" | "high";
  execute: (params: Record<string, any>, context: AgentContext) => Promise<ToolResult>;
}

export interface ToolResult {
  success: boolean;
  output: string;
  error?: string;
  artifacts?: Array<{ type: string; path?: string; content?: string }>;
}

export interface AgentContext {
  sessionId: string;
  userId: string;
  workingDirectory: string;
  memory: MemoryEntry[];
  tools: Map<string, Tool>;
  approvalCallback?: (plan: ExecutionPlan) => Promise<boolean>;
  onThought?: (thought: string) => void;
  onAction?: (action: string, params: Record<string, any>) => void;
  onObservation?: (observation: string) => void;
  onPlan?: (plan: ExecutionPlan) => void;
}

export interface MemoryEntry {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  toolName?: string;
  toolCallId?: string;
  timestamp: number;
}

export interface ExecutionStep {
  id: number;
  action: string;
  tool: string;
  params: Record<string, any>;
  reasoning: string;
  riskLevel: "low" | "medium" | "high";
  requiresApproval: boolean;
}

export interface ExecutionPlan {
  goal: string;
  steps: ExecutionStep[];
  estimatedDuration: string;
  riskAssessment: string;
}

export interface AgentConfig {
  model: string;
  apiKey: string;
  apiBaseUrl?: string;
  maxIterations: number;
  maxTokens: number;
  temperature: number;
  systemPrompt: string;
  planningEnabled: boolean;
  approvalRequired: "none" | "high-risk" | "all";
  jarvisCloudUrl: string;
}

export interface AgentResponse {
  answer: string;
  toolsUsed: string[];
  iterations: number;
  plan?: ExecutionPlan;
  artifacts?: Array<{ type: string; path?: string; content?: string }>;
}
