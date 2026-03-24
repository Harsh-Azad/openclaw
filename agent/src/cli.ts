/**
 * Jarvis Agent CLI
 *
 * Interactive command-line interface for the Jarvis autonomous agent.
 * Supports multi-turn conversations with tool execution.
 *
 * Usage:
 *   npx tsx src/cli.ts                         # Interactive mode
 *   npx tsx src/cli.ts "What is TDS on salary?" # Single query mode
 */

import readline from "node:readline";
import { ReactAgent } from "./react-agent.js";
import { ToolRegistry } from "./tool-registry.js";
import { FILE_TOOLS } from "./tools/filesystem.js";
import { JARVIS_API_TOOLS } from "./tools/jarvis-api.js";
import { AgentConfig, ExecutionPlan } from "./types.js";

const config: AgentConfig = {
  model: process.env.JARVIS_MODEL || "gpt-4o",
  apiKey: process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY || "",
  apiBaseUrl: process.env.JARVIS_LLM_URL || "https://api.openai.com/v1",
  maxIterations: 10,
  maxTokens: 4000,
  temperature: 0.2,
  systemPrompt: "",
  planningEnabled: true,
  approvalRequired: "high-risk",
  jarvisCloudUrl: process.env.JARVIS_CLOUD_URL || "http://localhost:3001",
};

function formatPlan(plan: ExecutionPlan): string {
  let out = `\n  EXECUTION PLAN: ${plan.goal}\n`;
  out += `  Risk: ${plan.riskAssessment} | Duration: ${plan.estimatedDuration}\n`;
  out += `  Steps:\n`;
  for (const step of plan.steps) {
    const risk = step.riskLevel === "high" ? " [!HIGH RISK]" : step.riskLevel === "medium" ? " [MEDIUM]" : "";
    const approval = step.requiresApproval ? " (needs approval)" : "";
    out += `    ${step.id}. [${step.tool}] ${step.action}${risk}${approval}\n`;
    out += `       Reason: ${step.reasoning}\n`;
  }
  return out;
}

async function main() {
  // Check for API key
  if (!config.apiKey) {
    // Fall back to cloud backend's built-in KB (no LLM key needed for tax chat tool)
    console.log("[Jarvis Agent] No OPENAI_API_KEY set. Agent will use Jarvis Cloud built-in knowledge base.");
    console.log("[Jarvis Agent] Set OPENAI_API_KEY for full autonomous reasoning.\n");
  }

  // Build tool registry
  const registry = new ToolRegistry();
  registry.registerAll(FILE_TOOLS);
  registry.registerAll(JARVIS_API_TOOLS);

  console.log(`[Jarvis Agent] ${registry.list().length} tools registered:`);
  for (const tool of registry.list()) {
    console.log(`  - ${tool.name} [${tool.riskLevel || "low"}]`);
  }
  console.log();

  // Create agent
  const agent = new ReactAgent(config, registry);

  // Approval callback
  const approvalCallback = async (plan: ExecutionPlan): Promise<boolean> => {
    console.log(formatPlan(plan));
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((resolve) => {
      rl.question("  Approve this plan? (y/n): ", (answer) => {
        rl.close();
        resolve(answer.toLowerCase().startsWith("y"));
      });
    });
  };

  // Single query mode
  const singleQuery = process.argv[2];
  if (singleQuery) {
    console.log(`\n> ${singleQuery}\n`);
    const result = await agent.run(singleQuery, {
      sessionId: "cli",
      workingDirectory: process.cwd(),
      approvalCallback,
      onThought: (t: string) => {},
      onAction: (a: string, p: Record<string, any>) => console.log(`  [TOOL] ${a}(${JSON.stringify(p).substring(0, 100)})`),
      onObservation: (o: string) => console.log(`  [RESULT] ${o.substring(0, 200)}...`),
      onPlan: (p: ExecutionPlan) => console.log(formatPlan(p)),
      jarvisCloudUrl: config.jarvisCloudUrl,
    } as any);

    console.log(`\nJarvis: ${result.answer}`);
    if (result.toolsUsed.length > 0) {
      console.log(`\n[Tools used: ${result.toolsUsed.join(", ")} | Iterations: ${result.iterations}]`);
    }
    process.exit(0);
  }

  // Interactive mode
  console.log("JARVIS TAX ASSISTANT (Agent Mode)");
  console.log("Type your question. Type 'exit' to quit, 'clear' to reset session.\n");

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "You: ",
  });

  rl.prompt();

  rl.on("line", async (line) => {
    const input = line.trim();
    if (!input) { rl.prompt(); return; }
    if (input === "exit" || input === "quit") { process.exit(0); }
    if (input === "clear") {
      agent.clearSession("cli");
      console.log("[Session cleared]\n");
      rl.prompt();
      return;
    }

    try {
      const result = await agent.run(input, {
        sessionId: "cli",
        workingDirectory: process.cwd(),
        approvalCallback,
        onAction: (a: string, _p: Record<string, any>) => process.stdout.write(`  [${a}] `),
        onObservation: (_o: string) => process.stdout.write("done\n"),
        onPlan: (p: ExecutionPlan) => console.log(formatPlan(p)),
        jarvisCloudUrl: config.jarvisCloudUrl,
      } as any);

      console.log(`\nJarvis: ${result.answer}`);
      if (result.toolsUsed.length > 0) {
        console.log(`[Tools: ${result.toolsUsed.join(", ")} | Steps: ${result.iterations}]`);
      }
      console.log();
    } catch (err: any) {
      console.error(`[Error] ${err.message}\n`);
    }

    rl.prompt();
  });
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
