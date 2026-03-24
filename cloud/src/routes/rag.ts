import { Router, Request, Response } from "express";
import { ingestDocument, searchDocuments, getRAGStats } from "../services/rag-pipeline.js";

const router = Router();

router.get("/stats", async (_req: Request, res: Response) => {
  const stats = getRAGStats();
  res.json(stats);
});

router.post("/ingest", async (req: Request, res: Response) => {
  try {
    const { id, source, domain, title, content, citation, effectiveDate, url } = req.body;

    if (!id || !content || !title) {
      res.status(400).json({ error: "id, title, and content are required" });
      return;
    }

    const chunks = await ingestDocument({
      id,
      source: source || "article",
      domain: domain || "general",
      title,
      content,
      citation: citation || "",
      effectiveDate,
      url,
    });

    res.json({ message: `Ingested ${chunks} chunks from "${title}"`, chunks });
  } catch (err) {
    res.status(500).json({ error: "Ingestion failed" });
  }
});

router.get("/search", async (req: Request, res: Response) => {
  try {
    const { q, domain, topK } = req.query;

    if (!q) {
      res.status(400).json({ error: "Query parameter 'q' is required" });
      return;
    }

    const results = await searchDocuments(
      q as string,
      domain as string,
      topK ? Number(topK) : 5,
    );

    res.json({ results, count: results.length });
  } catch (err) {
    res.status(500).json({ error: "Search failed" });
  }
});

export { router as ragRouter };
