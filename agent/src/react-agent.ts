/**
 * ReAct Agent Runtime
 *
 * Implements the ReAct (Reasoning + Acting) execution loop from:
 * - "ReAct: Synergizing Reasoning and Acting in Language Models" (Yao et al., ICLR 2023)
 *
 * Enhanced with:
 * - Global Planning from "Enhancing LLM-Based Agents via Global Planning" (arXiv 2504.16563)
 *   -> Agent creates a full execution plan BEFORE acting
 * - Pre-execution guardrails from "Building Foundational Guardrails" (arXiv 2510.09781)
 *   -> High-risk actions require user approval before execution
 * - Difficulty-aware routing from arXiv 2509.11079
 *   -> Simple questions answered directly, complex ones get multi-step planning
 *
 * Loop: User Message -> [Plan] -> Think -> Act -> Observe -> Think -> ... -> Final Answer
 */

import { AgentConfig, AgentContext, AgentResponse, ExecutionPlan, MemoryEntry, ToolResult } from "./types.js";
import { ToolRegistry } from "./tool-registry.js";
import { ProviderManager, LLMCompletionRequest } from "./llm/index.js";

const SYSTEM_PROMPT = `You are Jarvis, an expert AI tax assistant for Indian tax professionals (CAs, Lawyers, CS, CMAs).

You have access to tools. Use them to answer questions accurately.

DOMAINS: GST, Income Tax, Customs, Company Law, FEMA.

RULES:
- Always cite specific Section/Rule/Notification numbers
- Include effective dates when discussing provisions
- Flag penalties for non-compliance
- If unsure, say so explicitly
- For complex multi-step tasks, create a plan first

AVAILABLE TOOLS:
You can call tools by responding with function calls. The system will execute them and return results.

When you have enough information to answer, provide your final response directly.`;

export class ReactAgent {
  private config: AgentConfig;
  private registry: ToolRegistry;
  private sessions = new Map<string, MemoryEntry[]>();
  private providerManager?: ProviderManager;

  constructor(config: AgentConfig, registry: ToolRegistry, providerManager?: ProviderManager) {
    this.config = config;
    this.registry = registry;
    this.providerManager = providerManager;
  }

  async run(userMessage: string, context: Partial<AgentContext> = {}): Promise<AgentResponse> {
    const sessionId = context.sessionId || "default";
    const memory = this.sessions.get(sessionId) || [];

    const ctx: AgentContext = {
      sessionId,
      userId: context.userId || "anonymous",
      workingDirectory: context.workingDirectory || process.cwd(),
      memory,
      tools: this.registry.getAll(),
      approvalCallback: context.approvalCallback,
      onThought: context.onThought,
      onAction: context.onAction,
      onObservation: context.onObservation,
      onPlan: context.onPlan,
      ...(context as any),
    };

    // Add user message to memory
    memory.push({ role: "user", content: userMessage, timestamp: Date.now() });

    // Determine if this needs planning (multi-step) or direct answer (simple)
    const needsPlanning = this.assessComplexity(userMessage);
    let plan: ExecutionPlan | undefined;

    if (needsPlanning && this.config.planningEnabled) {
      plan = await this.createPlan(userMessage, ctx);
      ctx.onPlan?.(plan);

      // Approval gate for high-risk plans
      if (this.config.approvalRequired !== "none" && plan.steps.some((s) => s.riskLevel === "high")) {
        if (ctx.approvalCallback) {
          const approved = await ctx.approvalCallback(plan);
          if (!approved) {
            const resp = "Task cancelled by user. The planned actions were not executed.";
            memory.push({ role: "assistant", content: resp, timestamp: Date.now() });
            this.sessions.set(sessionId, memory);
            return { answer: resp, toolsUsed: [], iterations: 0, plan };
          }
        }
      }
    }

    // ReAct loop
    const toolsUsed: string[] = [];
    let iterations = 0;
    const allArtifacts: Array<{ type: string; path?: string; content?: string }> = [];

    const messages = this.buildMessages(memory, ctx);

    while (iterations < this.config.maxIterations) {
      iterations++;

      const response = await this.callLLM(messages);

      // Check if LLM wants to call a tool
      if (response.toolCalls && response.toolCalls.length > 0) {
        for (const toolCall of response.toolCalls) {
          const toolName = toolCall.function.name;
          const toolArgs = JSON.parse(toolCall.function.arguments || "{}");

          ctx.onAction?.(toolName, toolArgs);

          const tool = this.registry.get(toolName);
          if (!tool) {
            const errResult = `Tool "${toolName}" not found.`;
            messages.push({ role: "assistant", content: null, tool_calls: [toolCall] } as any);
            messages.push({ role: "tool", tool_call_id: toolCall.id, content: errResult } as any);
            continue;
          }

          // Pre-execution guardrail: approval for high-risk tools
          if (tool.requiresApproval && this.config.approvalRequired !== "none") {
            if (ctx.approvalCallback) {
              const miniPlan: ExecutionPlan = {
                goal: `Execute ${toolName}`,
                steps: [{
                  id: 1, action: toolName, tool: toolName, params: toolArgs,
                  reasoning: "Tool requires approval", riskLevel: tool.riskLevel || "medium",
                  requiresApproval: true,
                }],
                estimatedDuration: "< 1 minute",
                riskAssessment: `${tool.riskLevel || "medium"} risk action`,
              };
              const approved = await ctx.approvalCallback(miniPlan);
              if (!approved) {
                messages.push({ role: "assistant", content: null, tool_calls: [toolCall] } as any);
                messages.push({ role: "tool", tool_call_id: toolCall.id, content: "Action cancelled by user." } as any);
                continue;
              }
            }
          }

          // Execute tool
          let result: ToolResult;
          try {
            result = await tool.execute(toolArgs, ctx);
          } catch (e: any) {
            result = { success: false, output: "", error: `Tool execution error: ${e.message}` };
          }

          const observation = result.success
            ? result.output
            : `ERROR: ${result.error}`;

          ctx.onObservation?.(observation);
          toolsUsed.push(toolName);

          if (result.artifacts) allArtifacts.push(...result.artifacts);

          // Add tool call and result to messages
          messages.push({ role: "assistant", content: null, tool_calls: [toolCall] } as any);
          messages.push({ role: "tool", tool_call_id: toolCall.id, content: observation.substring(0, 8000) } as any);

          // Add to memory
          memory.push({ role: "assistant", content: `[Called ${toolName}]`, toolName, timestamp: Date.now() });
          memory.push({ role: "tool", content: observation.substring(0, 2000), toolName, toolCallId: toolCall.id, timestamp: Date.now() });
        }
      } else {
        // LLM returned a final text response
        const answer = response.content || "";
        ctx.onThought?.(answer);

        memory.push({ role: "assistant", content: answer, timestamp: Date.now() });
        this.sessions.set(sessionId, memory);

        return {
          answer,
          toolsUsed: [...new Set(toolsUsed)],
          iterations,
          plan,
          artifacts: allArtifacts.length > 0 ? allArtifacts : undefined,
        };
      }
    }

    // Max iterations reached
    const fallback = "I've reached the maximum number of reasoning steps. Here's what I found so far based on the tools I used.";
    memory.push({ role: "assistant", content: fallback, timestamp: Date.now() });
    this.sessions.set(sessionId, memory);

    return { answer: fallback, toolsUsed: [...new Set(toolsUsed)], iterations, plan };
  }

  private assessComplexity(message: string): boolean {
    const complexIndicators = [
      "compare", "analyze", "organize", "review", "prepare", "create report",
      "all deadlines", "full analysis", "step by step", "multiple",
      "file", "folder", "document", "spreadsheet", "download",
    ];
    const lower = message.toLowerCase();
    return complexIndicators.some((ind) => lower.includes(ind));
  }

  private async createPlan(userMessage: string, ctx: AgentContext): Promise<ExecutionPlan> {
    const toolDescriptions = this.registry.list()
      .map((t) => `- ${t.name}: ${t.description} [risk: ${t.riskLevel || "low"}]`)
      .join("\n");

    const planPrompt = `You are a planning agent. Given the user's request, create a step-by-step execution plan.

Available tools:
${toolDescriptions}

User request: "${userMessage}"

Respond with a JSON object:
{
  "goal": "one-line summary of what to achieve",
  "steps": [
    {"id": 1, "action": "description", "tool": "tool_name", "params": {}, "reasoning": "why", "riskLevel": "low|medium|high", "requiresApproval": false}
  ],
  "estimatedDuration": "X minutes",
  "riskAssessment": "overall risk summary"
}

Only output the JSON, nothing else.`;

    try {
      const response = await this.callLLMRaw([
        { role: "system", content: "You are a planning assistant. Output only valid JSON." },
        { role: "user", content: planPrompt },
      ]);

      const jsonStr = response.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
      return JSON.parse(jsonStr);
    } catch {
      return {
        goal: userMessage,
        steps: [{ id: 1, action: "Direct answer", tool: "jarvis_tax_chat", params: { query: userMessage }, reasoning: "Simple query", riskLevel: "low", requiresApproval: false }],
        estimatedDuration: "< 1 minute",
        riskAssessment: "Low risk - information query only",
      };
    }
  }

  private buildMessages(memory: MemoryEntry[], ctx: AgentContext): any[] {
    const systemContent = this.config.systemPrompt || SYSTEM_PROMPT;
    const messages: any[] = [{ role: "system", content: systemContent }];

    // Add recent memory (last 20 entries to stay within context)
    const recent = memory.slice(-20);
    for (const entry of recent) {
      if (entry.role === "tool") {
        // Tool results are handled inline with tool_calls
        continue;
      }
      messages.push({ role: entry.role, content: entry.content });
    }

    return messages;
  }

  private async callLLM(messages: any[]): Promise<{ content?: string; toolCalls?: any[] }> {
    // Use ProviderManager if available (multi-provider with failover)
    if (this.providerManager && this.providerManager.listProviders().length > 0) {
      const request: LLMCompletionRequest = {
        messages,
        temperature: this.config.temperature,
        max_tokens: this.config.maxTokens,
        tools: this.registry.toOpenAITools(),
        tool_choice: "auto",
      };

      const result = await this.providerManager.complete(request);
      return {
        content: result.content || undefined,
        toolCalls: result.toolCalls?.map((tc) => ({
          id: tc.id,
          type: "function",
          function: { name: tc.function.name, arguments: tc.function.arguments },
        })) || undefined,
      };
    }

    // Fallback: direct fetch (backwards compatible)
    const url = this.config.apiBaseUrl || "https://api.openai.com/v1";
    const body: any = {
      model: this.config.model || "gpt-4o",
      messages,
      temperature: this.config.temperature,
      max_tokens: this.config.maxTokens,
    };

    const tools = this.registry.toOpenAITools();
    if (tools.length > 0) {
      body.tools = tools;
      body.tool_choice = "auto";
    }

    const res = await fetch(`${url}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`LLM API error ${res.status}: ${err.substring(0, 200)}`);
    }

    const data: any = await res.json();
    const choice = data.choices?.[0];
    if (!choice) throw new Error("No response from LLM");

    return {
      content: choice.message?.content || undefined,
      toolCalls: choice.message?.tool_calls || undefined,
    };
  }

  private async callLLMRaw(messages: any[]): Promise<string> {
    if (this.providerManager && this.providerManager.listProviders().length > 0) {
      const result = await this.providerManager.complete({ messages, temperature: 0.1, max_tokens: 2000 });
      return result.content || "";
    }

    const url = this.config.apiBaseUrl || "https://api.openai.com/v1";
    const res = await fetch(`${url}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model || "gpt-4o",
        messages,
        temperature: 0.1,
        max_tokens: 2000,
      }),
    });

    if (!res.ok) throw new Error(`LLM API error ${res.status}`);
    const data: any = await res.json();
    return data.choices?.[0]?.message?.content || "";
  }

  getSessionMemory(sessionId: string): MemoryEntry[] {
    return this.sessions.get(sessionId) || [];
  }

  clearSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }
}
