/**
 * Plugin Registry
 *
 * Manages discovery, loading, lifecycle, and routing of Jarvis plugins.
 * Enterprise customers can register custom plugins without modifying core code.
 */

import {
  JarvisPlugin,
  JarvisPluginManifest,
  PluginContext,
  ChatRequest,
  ChatResponse,
  DocumentAnalysisRequest,
  DocumentAnalysisResponse,
  ComplianceItem,
  TaxDomain,
} from "./plugin-interface.js";

interface RegisteredPlugin {
  plugin: JarvisPlugin;
  manifest: JarvisPluginManifest;
  status: "registered" | "initialized" | "error" | "disabled";
  error?: string;
  loadedAt: Date;
}

class PluginRegistry {
  private plugins: Map<string, RegisteredPlugin> = new Map();
  private domainIndex: Map<TaxDomain, string[]> = new Map();

  async register(plugin: JarvisPlugin): Promise<void> {
    const { id } = plugin.manifest;

    if (this.plugins.has(id)) {
      throw new Error(`Plugin "${id}" is already registered`);
    }

    if (plugin.manifest.dependencies) {
      for (const dep of plugin.manifest.dependencies) {
        if (!this.plugins.has(dep)) {
          throw new Error(
            `Plugin "${id}" requires "${dep}" which is not registered`,
          );
        }
      }
    }

    this.plugins.set(id, {
      plugin,
      manifest: plugin.manifest,
      status: "registered",
      loadedAt: new Date(),
    });

    for (const domain of plugin.manifest.domains) {
      const existing = this.domainIndex.get(domain) || [];
      existing.push(id);
      this.domainIndex.set(domain, existing);
    }

    console.log(
      `[PluginRegistry] Registered: ${plugin.manifest.name} v${plugin.manifest.version}`,
    );
  }

  async initialize(pluginId: string, context: PluginContext): Promise<void> {
    const entry = this.plugins.get(pluginId);
    if (!entry) throw new Error(`Plugin "${pluginId}" not found`);

    try {
      await entry.plugin.initialize(context);
      entry.status = "initialized";
      console.log(`[PluginRegistry] Initialized: ${entry.manifest.name}`);
    } catch (err) {
      entry.status = "error";
      entry.error = err instanceof Error ? err.message : String(err);
      console.error(
        `[PluginRegistry] Failed to initialize ${entry.manifest.name}:`,
        entry.error,
      );
    }
  }

  async initializeAll(context: PluginContext): Promise<void> {
    for (const [id] of this.plugins) {
      await this.initialize(id, context);
    }
  }

  async routeChat(request: ChatRequest): Promise<ChatResponse | null> {
    const pluginIds = this.domainIndex.get(request.domain) || [];

    // Also check "general" domain plugins
    const generalIds = this.domainIndex.get("general") || [];
    const allIds = [...new Set([...pluginIds, ...generalIds])];

    for (const id of allIds) {
      const entry = this.plugins.get(id);
      if (!entry || entry.status !== "initialized" || !entry.plugin.onChat) {
        continue;
      }

      const response = await entry.plugin.onChat(request);
      if (response) return response;
    }

    return null;
  }

  async routeDocumentAnalysis(
    request: DocumentAnalysisRequest,
  ): Promise<DocumentAnalysisResponse | null> {
    for (const [, entry] of this.plugins) {
      if (
        entry.status !== "initialized" ||
        !entry.plugin.onDocumentAnalysis
      ) {
        continue;
      }

      const response = await entry.plugin.onDocumentAnalysis(request);
      if (response) return response;
    }

    return null;
  }

  async getComplianceItems(
    month: number,
    year: number,
  ): Promise<ComplianceItem[]> {
    const allItems: ComplianceItem[] = [];

    for (const [, entry] of this.plugins) {
      if (
        entry.status !== "initialized" ||
        !entry.plugin.getComplianceItems
      ) {
        continue;
      }

      const items = await entry.plugin.getComplianceItems(month, year);
      allItems.push(...items);
    }

    return allItems.sort(
      (a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime(),
    );
  }

  getPlugins(): JarvisPluginManifest[] {
    return Array.from(this.plugins.values()).map((p) => ({
      ...p.manifest,
      _status: p.status,
    })) as any;
  }

  getPlugin(id: string): RegisteredPlugin | undefined {
    return this.plugins.get(id);
  }

  async unregister(id: string): Promise<void> {
    const entry = this.plugins.get(id);
    if (!entry) return;

    if (entry.status === "initialized") {
      await entry.plugin.shutdown();
    }

    for (const domain of entry.manifest.domains) {
      const ids = this.domainIndex.get(domain) || [];
      this.domainIndex.set(
        domain,
        ids.filter((pid) => pid !== id),
      );
    }

    this.plugins.delete(id);
    console.log(`[PluginRegistry] Unregistered: ${entry.manifest.name}`);
  }

  async shutdown(): Promise<void> {
    for (const [id] of this.plugins) {
      await this.unregister(id);
    }
  }

  async healthCheck(): Promise<
    Record<string, { status: string; details?: string }>
  > {
    const results: Record<string, { status: string; details?: string }> = {};

    for (const [id, entry] of this.plugins) {
      if (entry.plugin.getHealth) {
        results[id] = await entry.plugin.getHealth();
      } else {
        results[id] = { status: entry.status };
      }
    }

    return results;
  }
}

export const pluginRegistry = new PluginRegistry();
export { PluginRegistry };
