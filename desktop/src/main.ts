/**
 * Jarvis Desktop Agent - Electron Main Process
 *
 * This is the main entry point for the Electron desktop app.
 * It creates the browser window, sets up IPC handlers for the agent runtime,
 * and manages file system access, approval workflows, and settings.
 *
 * Architecture:
 * - Main process: Node.js with full filesystem access, runs agent runtime
 * - Renderer process: Chromium web page (UI), communicates via IPC
 * - Preload script: Secure bridge between main and renderer
 */

import { app, BrowserWindow, ipcMain, dialog, shell } from "electron";
import path from "node:path";
import fs from "node:fs";

let mainWindow: BrowserWindow | null = null;

// Agent state
let workingDirectory = app.getPath("documents");
let agentRunning = false;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: "Jarvis Tax Assistant",
    icon: path.join(__dirname, "..", "assets", "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// IPC Handlers

// File system
ipcMain.handle("fs:selectDirectory", async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ["openDirectory"],
    title: "Select Working Directory",
  });
  if (!result.canceled && result.filePaths[0]) {
    workingDirectory = result.filePaths[0];
    return workingDirectory;
  }
  return null;
});

ipcMain.handle("fs:getWorkingDirectory", () => workingDirectory);

ipcMain.handle("fs:listFiles", async (_event, dirPath?: string) => {
  const dir = dirPath || workingDirectory;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    return entries.map((e) => ({
      name: e.name,
      isDirectory: e.isDirectory(),
      path: path.join(dir, e.name),
      size: e.isFile() ? fs.statSync(path.join(dir, e.name)).size : 0,
      modified: e.isFile() ? fs.statSync(path.join(dir, e.name)).mtimeMs : 0,
    }));
  } catch (e: any) {
    return { error: e.message };
  }
});

ipcMain.handle("fs:readFile", async (_event, filePath: string) => {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch (e: any) {
    return { error: e.message };
  }
});

ipcMain.handle("fs:openExternal", async (_event, filePath: string) => {
  shell.openPath(filePath);
});

// Agent control
ipcMain.handle("agent:getStatus", () => ({
  running: agentRunning,
  workingDirectory,
}));

ipcMain.handle("agent:sendMessage", async (_event, message: string) => {
  // In production, this would invoke the ReactAgent with ProviderManager
  // For now, return a placeholder that shows the architecture works
  agentRunning = true;
  mainWindow?.webContents.send("agent:thinking", { status: "thinking" });

  // Simulate agent processing
  const response = {
    answer: `[Agent Runtime] Received: "${message}"\n\nThe agent runtime is connected. To enable full AI responses, configure an LLM provider in Settings.\n\nAvailable tools: read_file, write_file, list_files, search_files, jarvis_tax_chat, jarvis_compliance, jarvis_tariff, parse_csv, scan_document, rag_search_local`,
    toolsUsed: [] as string[],
    iterations: 0,
  };

  agentRunning = false;
  mainWindow?.webContents.send("agent:done", { status: "done" });
  return response;
});

// Approval workflow
ipcMain.handle("agent:approve", async (_event, planId: string) => {
  // This will be called when the agent needs user approval for a high-risk action
  const result = await dialog.showMessageBox(mainWindow!, {
    type: "warning",
    title: "Jarvis - Action Approval Required",
    message: `The agent wants to perform a potentially risky action (Plan: ${planId}).`,
    detail: "Do you want to allow this action?",
    buttons: ["Deny", "Approve"],
    defaultId: 0,
    cancelId: 0,
  });
  return result.response === 1;
});

// Settings
ipcMain.handle("settings:get", () => ({
  workingDirectory,
  llmProvider: process.env.VLLM_BASE_URL ? "vllm" : process.env.OPENAI_API_KEY ? "openai" : "none",
  llmModel: process.env.VLLM_MODEL || process.env.OPENAI_MODEL || "none",
  cloudUrl: process.env.JARVIS_CLOUD_URL || "http://localhost:3001",
  vlmEnabled: !!process.env.VLM_BASE_URL,
}));

// App lifecycle
app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
