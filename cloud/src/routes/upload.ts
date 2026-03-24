import { Router, Request, Response } from "express";
import multer from "multer";
import path from "node:path";
import os from "node:os";
import { loadTariffFromData, searchTariff, getTariffStats } from "../services/tariff-service.js";

const router = Router();

const storage = multer.diskStorage({
  destination: path.join(os.tmpdir(), "jarvis-uploads"),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}-${file.originalname}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (_req, file, cb) => {
    const allowed = [
      ".xlsx",
      ".xls",
      ".csv",
      ".pdf",
      ".docx",
      ".doc",
    ];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${ext} not supported`));
    }
  },
});

router.post(
  "/tariff-data",
  upload.single("file"),
  async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: "No file uploaded" });
        return;
      }

      const ext = path.extname(req.file.originalname).toLowerCase();
      if (ext !== ".xlsx" && ext !== ".xls") {
        res
          .status(400)
          .json({ error: "Only Excel files supported for tariff data" });
        return;
      }

      // Dynamic import xlsx
      const XLSX = await import("xlsx");
      const wb = XLSX.readFile(req.file.path);

      const sheetName =
        (req.body.sheet as string) ||
        wb.SheetNames.find(
          (s) =>
            s.toLowerCase().includes("ct") ||
            s.toLowerCase().includes("tariff"),
        ) ||
        wb.SheetNames[0];

      const sheet = wb.Sheets[sheetName];
      if (!sheet) {
        res.status(400).json({ error: `Sheet "${sheetName}" not found` });
        return;
      }

      const data = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        defval: "",
      }) as any[][];
      const headers = (data[0] || []).map(String);
      const rows = data.slice(1);
      const year = Number(req.body.year) || 2026;

      const loaded = await loadTariffFromData(rows, headers, year);

      res.json({
        message: `Loaded ${loaded} tariff entries from "${sheetName}"`,
        sheet: sheetName,
        year,
        rowsProcessed: rows.length,
        rowsLoaded: loaded,
      });
    } catch (err) {
      console.error("[Upload] Tariff data load error:", err);
      res.status(500).json({
        error: "Failed to load tariff data",
        details: err instanceof Error ? err.message : String(err),
      });
    }
  },
);

router.get("/tariff-search", async (req: Request, res: Response) => {
  try {
    const results = await searchTariff({
      hsn: req.query.hsn as string,
      search: req.query.search as string,
      chapter: req.query.chapter as string,
      year: req.query.year ? Number(req.query.year) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : 50,
    });

    res.json({ results, count: results.length });
  } catch (err) {
    console.error("[Upload] Tariff search error:", err);
    res.status(500).json({ error: "Tariff search failed" });
  }
});

router.get("/tariff-stats", async (_req: Request, res: Response) => {
  try {
    const stats = await getTariffStats();
    res.json({ stats });
  } catch (err) {
    res.status(500).json({ error: "Stats fetch failed" });
  }
});

router.post(
  "/document",
  upload.array("files", 5),
  async (req: Request, res: Response) => {
    try {
      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        res.status(400).json({ error: "No files uploaded" });
        return;
      }

      const fileInfos = files.map((f) => ({
        name: f.originalname,
        size: f.size,
        type: path.extname(f.originalname).toLowerCase(),
        path: f.path,
      }));

      res.json({
        message: `${files.length} file(s) uploaded successfully`,
        files: fileInfos,
        // Analysis will be triggered separately via /api/v1/tax/analyze-document
      });
    } catch (err) {
      console.error("[Upload] Document upload error:", err);
      res.status(500).json({ error: "File upload failed" });
    }
  },
);

export { router as uploadRouter };
