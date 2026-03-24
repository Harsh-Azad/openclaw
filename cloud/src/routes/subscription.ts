import { Router, Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { db } from "../db/connection.js";
import { TIER_LIMITS } from "../middleware/subscription.js";
import { createOrder, verifyPaymentSignature, activateSubscription, handleWebhook } from "../services/payment-service.js";

const router = Router();

const TIER_PRICING = {
  free: { monthly: 0, annual: 0, currency: "INR" },
  professional: { monthly: 2999, annual: 29990, currency: "INR" },
  enterprise: { monthly: 9999, annual: 99990, currency: "INR" },
} as const;

router.get("/plans", (_req: Request, res: Response) => {
  const plans = Object.entries(TIER_PRICING).map(([tier, pricing]) => ({
    tier,
    pricing,
    limits: TIER_LIMITS[tier],
  }));
  res.json({ plans });
});

router.get("/current", async (req: Request, res: Response) => {
  try {
    const result = await db.query(
      `SELECT s.*, u.tier FROM subscriptions s
       JOIN users u ON s.user_id = u.id
       WHERE s.user_id = $1 AND s.status = 'active'
       ORDER BY s.created_at DESC LIMIT 1`,
      [req.user!.userId],
    );

    if (result.rows.length === 0) {
      res.json({
        subscription: null,
        tier: "free",
        limits: TIER_LIMITS["free"],
      });
      return;
    }

    const sub = result.rows[0];
    res.json({
      subscription: sub,
      tier: sub.tier,
      limits: TIER_LIMITS[sub.tier] || TIER_LIMITS["free"],
    });
  } catch (err) {
    console.error("[Subscription] Fetch error:", err);
    res.status(500).json({ error: "Failed to fetch subscription" });
  }
});

router.post("/subscribe", async (req: Request, res: Response) => {
  try {
    const { tier, billing } = req.body;

    if (!tier || !["professional", "enterprise"].includes(tier)) {
      res.status(400).json({ error: "Invalid tier" });
      return;
    }

    if (!billing || !["monthly", "annual"].includes(billing)) {
      res.status(400).json({ error: "Invalid billing cycle" });
      return;
    }

    const pricing = TIER_PRICING[tier as keyof typeof TIER_PRICING];
    const amount = billing === "monthly" ? pricing.monthly : pricing.annual;

    const subscriptionId = uuidv4();
    const startDate = new Date();
    const endDate = new Date();
    endDate.setMonth(
      endDate.getMonth() + (billing === "monthly" ? 1 : 12),
    );

    await db.query(
      `INSERT INTO subscriptions (id, user_id, tier, billing_cycle, amount, currency, status, start_date, end_date, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
      [
        subscriptionId,
        req.user!.userId,
        tier,
        billing,
        amount,
        pricing.currency,
        "pending_payment",
        startDate,
        endDate,
      ],
    );

    const paymentOrder = await createOrder({
      subscriptionId,
      amount,
      currency: pricing.currency,
      userId: req.user!.userId,
      tier,
    });

    res.json({
      message: "Subscription created, complete payment to activate",
      subscription: {
        id: subscriptionId,
        tier,
        billing,
        amount,
        currency: pricing.currency,
        startDate,
        endDate,
      },
      payment: paymentOrder,
    });
  } catch (err) {
    console.error("[Subscription] Subscribe error:", err);
    res.status(500).json({ error: "Subscription creation failed" });
  }
});

router.post("/confirm-payment", async (req: Request, res: Response) => {
  try {
    const { subscriptionId, paymentId, signature } = req.body;

    const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;

    if (!subscriptionId || !razorpayPaymentId) {
      res.status(400).json({ error: "Missing payment details" });
      return;
    }

    const isValid = verifyPaymentSignature({
      razorpayOrderId: razorpayOrderId || "",
      razorpayPaymentId: razorpayPaymentId || paymentId,
      razorpaySignature: razorpaySignature || "",
    });

    if (!isValid) {
      res.status(400).json({ error: "Invalid payment signature" });
      return;
    }

    await activateSubscription(
      subscriptionId,
      razorpayPaymentId || paymentId,
      req.user!.userId,
    );

    res.json({ message: "Payment confirmed, subscription activated" });
  } catch (err) {
    console.error("[Subscription] Payment confirm error:", err);
    res.status(500).json({ error: "Payment confirmation failed" });
  }
});

router.get("/usage", async (req: Request, res: Response) => {
  try {
    const today = new Date().toISOString().split("T")[0];

    const result = await db.query(
      `SELECT
        COALESCE(SUM(CASE WHEN type = 'query' THEN 1 ELSE 0 END), 0) as queries_today,
        COALESCE(SUM(CASE WHEN type = 'document' THEN 1 ELSE 0 END), 0) as documents_today
       FROM usage_logs
       WHERE user_id = $1 AND DATE(created_at) = $2`,
      [req.user!.userId, today],
    );

    const usage = result.rows[0];
    const tier = req.user!.tier || "free";
    const limits = TIER_LIMITS[tier] || TIER_LIMITS["free"];

    res.json({
      usage: {
        queries: { used: Number(usage.queries_today), limit: limits.queriesPerDay },
        documents: { used: Number(usage.documents_today), limit: limits.documentsPerDay },
      },
      tier,
    });
  } catch (err) {
    console.error("[Subscription] Usage fetch error:", err);
    res.status(500).json({ error: "Failed to fetch usage" });
  }
});

// Razorpay Webhook (no auth -- verified by signature)
router.post("/webhook/razorpay", async (req: Request, res: Response) => {
  try {
    const signature = req.headers["x-razorpay-signature"] as string || "";
    const result = await handleWebhook(req.body, signature);
    res.json({ status: "ok", result });
  } catch (err) {
    console.error("[Subscription] Webhook error:", err);
    res.status(400).json({ error: "Webhook processing failed" });
  }
});

export { router as subscriptionRouter };
