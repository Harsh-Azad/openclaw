import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { db } from "../db/connection.js";

const router = Router();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(2),
  profession: z.enum([
    "ca",
    "lawyer",
    "tax-consultant",
    "cs",
    "cma",
    "other",
  ]),
  firm: z.string().optional(),
  phone: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

function generateTokens(user: {
  id: string;
  email: string;
  role: string;
  tier: string;
}) {
  const secret = process.env.JWT_SECRET || "dev-secret";

  const accessToken = jwt.sign(
    { userId: user.id, email: user.email, role: user.role, tier: user.tier },
    secret,
    { expiresIn: "7d" as any },
  );

  const refreshToken = jwt.sign({ userId: user.id, type: "refresh" }, secret, {
    expiresIn: "30d" as any,
  });

  return { accessToken, refreshToken };
}

router.post("/register", async (req: Request, res: Response) => {
  try {
    const data = registerSchema.parse(req.body);

    const existing = await db.query(
      "SELECT id FROM users WHERE email = $1",
      [data.email],
    );
    if (existing.rows.length > 0) {
      res.status(409).json({ error: "Email already registered" });
      return;
    }

    const passwordHash = await bcrypt.hash(data.password, 12);
    const userId = uuidv4();

    await db.query(
      `INSERT INTO users (id, email, password_hash, name, profession, firm, phone, role, tier, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
      [
        userId,
        data.email,
        passwordHash,
        data.name,
        data.profession,
        data.firm || null,
        data.phone || null,
        "user",
        "free",
      ],
    );

    const tokens = generateTokens({
      id: userId,
      email: data.email,
      role: "user",
      tier: "free",
    });

    res.status(201).json({
      message: "Registration successful",
      user: {
        id: userId,
        email: data.email,
        name: data.name,
        profession: data.profession,
        tier: "free",
      },
      ...tokens,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: "Validation failed", details: err.errors });
      return;
    }
    console.error("[Auth] Registration error:", err);
    res.status(500).json({ error: "Registration failed" });
  }
});

router.post("/login", async (req: Request, res: Response) => {
  try {
    const data = loginSchema.parse(req.body);

    const result = await db.query(
      "SELECT id, email, password_hash, name, role, tier FROM users WHERE email = $1",
      [data.email],
    );

    if (result.rows.length === 0) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(
      data.password,
      user.password_hash,
    );

    if (!validPassword) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    const tokens = generateTokens({
      id: user.id,
      email: user.email,
      role: user.role,
      tier: user.tier,
    });

    await db.query(
      "UPDATE users SET last_login = NOW() WHERE id = $1",
      [user.id],
    );

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        tier: user.tier,
      },
      ...tokens,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: "Validation failed", details: err.errors });
      return;
    }
    console.error("[Auth] Login error:", err);
    res.status(500).json({ error: "Login failed" });
  }
});

router.post("/refresh", async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      res.status(400).json({ error: "Refresh token required" });
      return;
    }

    const decoded = jwt.verify(
      refreshToken,
      process.env.JWT_SECRET || "dev-secret",
    ) as { userId: string; type: string };

    if (decoded.type !== "refresh") {
      res.status(401).json({ error: "Invalid token type" });
      return;
    }

    const result = await db.query(
      "SELECT id, email, role, tier FROM users WHERE id = $1",
      [decoded.userId],
    );

    if (result.rows.length === 0) {
      res.status(401).json({ error: "User not found" });
      return;
    }

    const user = result.rows[0];
    const tokens = generateTokens({
      id: user.id,
      email: user.email,
      role: user.role,
      tier: user.tier,
    });

    res.json(tokens);
  } catch {
    res.status(401).json({ error: "Invalid refresh token" });
  }
});

router.get("/me", async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  try {
    const decoded = jwt.verify(
      authHeader.slice(7),
      process.env.JWT_SECRET || "dev-secret",
    ) as { userId: string };

    const result = await db.query(
      "SELECT id, email, name, profession, firm, role, tier, created_at FROM users WHERE id = $1",
      [decoded.userId],
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.json({ user: result.rows[0] });
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
});

export { router as authRouter };
