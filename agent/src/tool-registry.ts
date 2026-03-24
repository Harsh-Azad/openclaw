/**
 * Tool Registry
 *
 * Central registry for all tools the agent can invoke.
 * Based on "LLM-Based Agents for Tool Learning" (Data Science & Engineering, Jun 2025):
 * - Tools are typed functions with JSON Schema parameters
 * - Tools declare risk level and approval requirements
 * - Registry converts tools to OpenAI function-calling format
 */

import { Tool } from "./types.js";

export class ToolRegistry {
  private tools = new Map<string, Tool>();

  register(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }

  registerAll(tools: Tool[]): void {
    for (const tool of tools) this.register(tool);
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  getAll(): Map<string, Tool> {
    return this.tools;
  }

  list(): Tool[] {
    return Array.from(this.tools.values());
  }

  toOpenAITools(): Array<{
    type: "function";
    function: { name: string; description: string; parameters: Record<string, any> };
  }> {
    return this.list().map((tool) => ({
      type: "function" as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));
  }
}
