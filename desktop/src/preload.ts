/**
 * Preload Script - Secure Bridge
 *
 * Exposes a limited API to the renderer process.
 * Following Electron security best practices:
 * - contextIsolation: true
 * - nodeIntegration: false
 * - Only expose specific, validated IPC channels
 */

import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("jarvis", {
  // File system
  selectDirectory: () => ipcRenderer.invoke("fs:selectDirectory"),
  getWorkingDirectory: () => ipcRenderer.invoke("fs:getWorkingDirectory"),
  listFiles: (dir?: string) => ipcRenderer.invoke("fs:listFiles", dir),
  readFile: (path: string) => ipcRenderer.invoke("fs:readFile", path),
  openExternal: (path: string) => ipcRenderer.invoke("fs:openExternal", path),

  // Agent
  getAgentStatus: () => ipcRenderer.invoke("agent:getStatus"),
  sendMessage: (message: string) => ipcRenderer.invoke("agent:sendMessage", message),
  approve: (planId: string) => ipcRenderer.invoke("agent:approve", planId),

  // Settings
  getSettings: () => ipcRenderer.invoke("settings:get"),

  // Event listeners
  onThinking: (callback: (data: any) => void) => {
    ipcRenderer.on("agent:thinking", (_event, data) => callback(data));
  },
  onDone: (callback: (data: any) => void) => {
    ipcRenderer.on("agent:done", (_event, data) => callback(data));
  },
  onToolCall: (callback: (data: any) => void) => {
    ipcRenderer.on("agent:toolCall", (_event, data) => callback(data));
  },
  onApprovalNeeded: (callback: (data: any) => void) => {
    ipcRenderer.on("agent:approvalNeeded", (_event, data) => callback(data));
  },
});
