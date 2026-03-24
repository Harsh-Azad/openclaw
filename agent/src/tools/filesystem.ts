/**
 * File System Tools
 *
 * Gives the agent Cowork-level local file access:
 * read, write, list, search, organize, delete.
 *
 * Based on Claude Cowork's core capability: "point it at a folder,
 * it reads/writes/organizes files autonomously."
 */

import fs from "node:fs/promises";
import path from "node:path";
import { Tool, AgentContext, ToolResult } from "../types.js";

function ok(output: string, artifacts?: any[]): ToolResult {
  return { success: true, output, artifacts };
}
function fail(error: string): ToolResult {
  return { success: false, output: "", error };
}

export const readFileTool: Tool = {
  name: "read_file",
  description: "Read the contents of a file. Returns the text content. Supports .txt, .md, .json, .csv, .ts, .js, .py, .yaml, .xml, .html, .css and other text files.",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "Absolute or relative path to the file" },
      maxLines: { type: "number", description: "Maximum lines to read (default: all)" },
    },
    required: ["path"],
  },
  riskLevel: "low",
  execute: async (params, ctx) => {
    try {
      const p = path.resolve(ctx.workingDirectory, params.path);
      const content = await fs.readFile(p, "utf-8");
      const lines = content.split("\n");
      const maxLines = params.maxLines || lines.length;
      const truncated = lines.slice(0, maxLines).join("\n");
      return ok(`[${lines.length} lines, ${content.length} bytes]\n${truncated}`);
    } catch (e: any) {
      return fail(`Cannot read file: ${e.message}`);
    }
  },
};

export const writeFileTool: Tool = {
  name: "write_file",
  description: "Write content to a file. Creates the file if it doesn't exist, overwrites if it does. Creates parent directories automatically.",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "Path to write to" },
      content: { type: "string", description: "Content to write" },
    },
    required: ["path", "content"],
  },
  riskLevel: "medium",
  requiresApproval: true,
  execute: async (params, ctx) => {
    try {
      const p = path.resolve(ctx.workingDirectory, params.path);
      await fs.mkdir(path.dirname(p), { recursive: true });
      await fs.writeFile(p, params.content, "utf-8");
      return ok(`Written ${params.content.length} bytes to ${p}`);
    } catch (e: any) {
      return fail(`Cannot write file: ${e.message}`);
    }
  },
};

export const listFilesTool: Tool = {
  name: "list_files",
  description: "List files and directories in a folder. Returns names, sizes, and types.",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "Directory path (default: working directory)" },
      recursive: { type: "boolean", description: "List recursively (default: false)" },
      pattern: { type: "string", description: "Glob pattern filter (e.g. '*.xlsx')" },
    },
  },
  riskLevel: "low",
  execute: async (params, ctx) => {
    try {
      const dir = path.resolve(ctx.workingDirectory, params.path || ".");
      const entries = await fs.readdir(dir, { withFileTypes: true });
      const results: string[] = [];

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          results.push(`[DIR]  ${entry.name}/`);
          if (params.recursive) {
            const subEntries = await fs.readdir(fullPath, { withFileTypes: true });
            for (const sub of subEntries) {
              results.push(`       ${entry.name}/${sub.name}${sub.isDirectory() ? "/" : ""}`);
            }
          }
        } else {
          const stat = await fs.stat(fullPath);
          const size = stat.size < 1024 ? `${stat.size}B` : stat.size < 1048576 ? `${(stat.size / 1024).toFixed(1)}KB` : `${(stat.size / 1048576).toFixed(1)}MB`;
          if (!params.pattern || entry.name.includes(params.pattern.replace("*", ""))) {
            results.push(`[FILE] ${entry.name} (${size})`);
          }
        }
      }

      return ok(`${dir}\n${results.length} items:\n${results.join("\n")}`);
    } catch (e: any) {
      return fail(`Cannot list directory: ${e.message}`);
    }
  },
};

export const searchFilesTool: Tool = {
  name: "search_files",
  description: "Search for text within files in a directory. Returns matching lines with file paths and line numbers.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "Text to search for" },
      path: { type: "string", description: "Directory to search in" },
      fileExtensions: { type: "string", description: "Comma-separated extensions (e.g. '.txt,.md,.json')" },
    },
    required: ["query"],
  },
  riskLevel: "low",
  execute: async (params, ctx) => {
    try {
      const dir = path.resolve(ctx.workingDirectory, params.path || ".");
      const exts = params.fileExtensions ? params.fileExtensions.split(",").map((e: string) => e.trim()) : null;
      const matches: string[] = [];

      async function searchDir(d: string) {
        const entries = await fs.readdir(d, { withFileTypes: true });
        for (const entry of entries) {
          const full = path.join(d, entry.name);
          if (entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "node_modules") {
            await searchDir(full);
          } else if (entry.isFile()) {
            if (exts && !exts.some((ext: string) => entry.name.endsWith(ext))) continue;
            try {
              const content = await fs.readFile(full, "utf-8");
              const lines = content.split("\n");
              for (let i = 0; i < lines.length; i++) {
                if (lines[i].toLowerCase().includes(params.query.toLowerCase())) {
                  matches.push(`${full}:${i + 1}: ${lines[i].trim().substring(0, 120)}`);
                  if (matches.length >= 50) return;
                }
              }
            } catch {}
          }
        }
      }

      await searchDir(dir);
      return ok(`Found ${matches.length} matches for "${params.query}":\n${matches.join("\n")}`);
    } catch (e: any) {
      return fail(`Search failed: ${e.message}`);
    }
  },
};

export const moveFileTool: Tool = {
  name: "move_file",
  description: "Move or rename a file/directory.",
  parameters: {
    type: "object",
    properties: {
      source: { type: "string", description: "Source path" },
      destination: { type: "string", description: "Destination path" },
    },
    required: ["source", "destination"],
  },
  riskLevel: "medium",
  requiresApproval: true,
  execute: async (params, ctx) => {
    try {
      const src = path.resolve(ctx.workingDirectory, params.source);
      const dst = path.resolve(ctx.workingDirectory, params.destination);
      await fs.mkdir(path.dirname(dst), { recursive: true });
      await fs.rename(src, dst);
      return ok(`Moved ${src} -> ${dst}`);
    } catch (e: any) {
      return fail(`Move failed: ${e.message}`);
    }
  },
};

export const deleteFileTool: Tool = {
  name: "delete_file",
  description: "Delete a file or empty directory. Use with caution.",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "Path to delete" },
    },
    required: ["path"],
  },
  riskLevel: "high",
  requiresApproval: true,
  execute: async (params, ctx) => {
    try {
      const p = path.resolve(ctx.workingDirectory, params.path);
      const stat = await fs.stat(p);
      if (stat.isDirectory()) {
        await fs.rmdir(p);
      } else {
        await fs.unlink(p);
      }
      return ok(`Deleted ${p}`);
    } catch (e: any) {
      return fail(`Delete failed: ${e.message}`);
    }
  },
};

export const FILE_TOOLS = [readFileTool, writeFileTool, listFilesTool, searchFilesTool, moveFileTool, deleteFileTool];
