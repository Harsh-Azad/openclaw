import { Router, Request, Response } from "express";
import { pluginRegistry } from "../plugins/plugin-registry.js";
import { createRbacMiddleware } from "../enterprise/rbac.js";

const router = Router();

router.get("/", (_req: Request, res: Response) => {
  const plugins = pluginRegistry.getPlugins();
  res.json({ plugins });
});

router.get("/health", async (_req: Request, res: Response) => {
  const health = await pluginRegistry.healthCheck();
  res.json({ plugins: health });
});

router.post(
  "/install",
  createRbacMiddleware("plugins:install"),
  async (req: Request, res: Response) => {
    // Plugin installation (commercial feature stub)
    res.status(501).json({
      error: "Plugin installation via API requires commercial license",
      message: "Contact licensing@jarvis-tax.ai for enterprise features",
    });
  },
);

router.delete(
  "/:pluginId",
  createRbacMiddleware("plugins:manage"),
  async (req: Request, res: Response) => {
    try {
      await pluginRegistry.unregister(req.params.pluginId);
      res.json({ message: "Plugin unregistered" });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : "Unregister failed",
      });
    }
  },
);

export { router as pluginsRouter };
