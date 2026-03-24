/**
 * Agent Memory Manager
 *
 * Implements hierarchical memory for the ReAct agent:
 * 1. Working Memory: Current conversation turns (in context window)
 * 2. Short-term Memory: Recent sessions (persisted to disk)
 * 3. Long-term Memory: Summarized knowledge (compressed, searchable)
 *
 * Based on "Large Language Model Agents: A Comprehensive Survey" (Dec 2025)
 * which identifies three memory types: sensory, short-term, long-term.
 *
 * Also implements "Reflexion" pattern: agent can review past mistakes
 * and avoid repeating them (stored as lessons in long-term memory).
 */

import fs from "node:fs/promises";
import path from "node:path";
import { MemoryEntry } from "./types.js";

interface SessionRecord {
  sessionId: string;
  startTime: number;
  endTime?: number;
  messages: MemoryEntry[];
  summary?: string;
  toolsUsed: string[];
  lessons: string[];
}

interface LongTermEntry {
  type: "fact" | "lesson" | "preference" | "procedure";
  content: string;
  source: string;
  confidence: number;
  createdAt: number;
  accessCount: number;
  lastAccessed: number;
}

export class MemoryManager {
  private sessions = new Map<string, SessionRecord>();
  private longTerm: LongTermEntry[] = [];
  private storagePath: string;

  constructor(storagePath: string) {
    this.storagePath = storagePath;
  }

  async init(): Promise<void> {
    await fs.mkdir(this.storagePath, { recursive: true });
    await this.loadFromDisk();
  }

  // Working memory: get messages for current session
  getWorkingMemory(sessionId: string, maxEntries = 20): MemoryEntry[] {
    const session = this.sessions.get(sessionId);
    if (!session) return [];
    return session.messages.slice(-maxEntries);
  }

  // Add a message to session memory
  addMessage(sessionId: string, entry: MemoryEntry): void {
    let session = this.sessions.get(sessionId);
    if (!session) {
      session = { sessionId, startTime: Date.now(), messages: [], toolsUsed: [], lessons: [] };
      this.sessions.set(sessionId, session);
    }
    session.messages.push(entry);
    if (entry.toolName && !session.toolsUsed.includes(entry.toolName)) {
      session.toolsUsed.push(entry.toolName);
    }
  }

  // Add a lesson learned (Reflexion pattern)
  addLesson(sessionId: string, lesson: string): void {
    const session = this.sessions.get(sessionId);
    if (session) session.lessons.push(lesson);

    this.longTerm.push({
      type: "lesson",
      content: lesson,
      source: sessionId,
      confidence: 0.8,
      createdAt: Date.now(),
      accessCount: 0,
      lastAccessed: Date.now(),
    });
  }

  // Add a fact to long-term memory
  addFact(content: string, source: string, confidence = 0.9): void {
    this.longTerm.push({
      type: "fact",
      content,
      source,
      confidence,
      createdAt: Date.now(),
      accessCount: 0,
      lastAccessed: Date.now(),
    });
  }

  // Search long-term memory by keyword
  searchLongTerm(query: string, limit = 5): LongTermEntry[] {
    const queryLower = query.toLowerCase();
    const scored = this.longTerm
      .map((entry) => {
        const words = queryLower.split(/\s+/);
        const contentLower = entry.content.toLowerCase();
        let score = 0;
        for (const word of words) {
          if (contentLower.includes(word)) score += 1;
        }
        // Boost by confidence and recency
        score *= entry.confidence;
        score *= 1 + 0.1 * Math.min(entry.accessCount, 10);
        return { entry, score };
      })
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    for (const s of scored) {
      s.entry.accessCount++;
      s.entry.lastAccessed = Date.now();
    }

    return scored.map((s) => s.entry);
  }

  // Get all lessons (for Reflexion-style reasoning)
  getLessons(): string[] {
    return this.longTerm
      .filter((e) => e.type === "lesson")
      .sort((a, b) => b.lastAccessed - a.lastAccessed)
      .slice(0, 10)
      .map((e) => e.content);
  }

  // End a session and persist
  async endSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.endTime = Date.now();

    // Auto-summarize if session is long
    if (session.messages.length > 10) {
      session.summary = this.summarizeSession(session);
    }

    await this.saveToDisk();
  }

  private summarizeSession(session: SessionRecord): string {
    const userMsgs = session.messages
      .filter((m) => m.role === "user")
      .map((m) => m.content.substring(0, 100));
    const tools = session.toolsUsed.join(", ");
    return `Session ${session.sessionId}: User asked about ${userMsgs.join("; ")}. Tools used: ${tools}. ${session.lessons.length} lessons learned.`;
  }

  // Context assembly: build a context string for the LLM
  assembleContext(sessionId: string): string {
    const parts: string[] = [];

    // Lessons
    const lessons = this.getLessons();
    if (lessons.length > 0) {
      parts.push("LESSONS FROM PAST SESSIONS:");
      for (const lesson of lessons) parts.push(`- ${lesson}`);
    }

    // Relevant facts
    const session = this.sessions.get(sessionId);
    if (session && session.messages.length > 0) {
      const lastUserMsg = [...session.messages].reverse().find((m) => m.role === "user");
      if (lastUserMsg) {
        const facts = this.searchLongTerm(lastUserMsg.content, 3);
        if (facts.length > 0) {
          parts.push("\nRELEVANT KNOWLEDGE:");
          for (const fact of facts) parts.push(`- [${fact.type}] ${fact.content}`);
        }
      }
    }

    return parts.join("\n");
  }

  // Persistence
  private async saveToDisk(): Promise<void> {
    try {
      const data = {
        sessions: Object.fromEntries(
          Array.from(this.sessions.entries()).map(([k, v]) => [k, { ...v, messages: v.messages.slice(-50) }])
        ),
        longTerm: this.longTerm.slice(-500),
      };
      await fs.writeFile(path.join(this.storagePath, "memory.json"), JSON.stringify(data, null, 2));
    } catch {}
  }

  private async loadFromDisk(): Promise<void> {
    try {
      const raw = await fs.readFile(path.join(this.storagePath, "memory.json"), "utf-8");
      const data = JSON.parse(raw);

      if (data.sessions) {
        for (const [id, session] of Object.entries(data.sessions)) {
          this.sessions.set(id, session as SessionRecord);
        }
      }
      if (data.longTerm) {
        this.longTerm = data.longTerm as LongTermEntry[];
      }
    } catch {}
  }

  getStats(): { sessions: number; longTermEntries: number; lessons: number } {
    return {
      sessions: this.sessions.size,
      longTermEntries: this.longTerm.length,
      lessons: this.longTerm.filter((e) => e.type === "lesson").length,
    };
  }
}
