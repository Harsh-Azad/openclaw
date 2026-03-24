/**
 * Payment Service -- Razorpay Integration
 *
 * Handles order creation, payment verification, webhook processing.
 * Stripe support is scaffolded for international payments.
 */

import crypto from "node:crypto";
import { db } from "../db/connection.js";

const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || "";
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || "";

interface RazorpayOrder {
  id: string;
  amount: number;
  currency: string;
  status: string;
}

let razorpayInstance: any = null;

function getRazorpay() {
  if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
    return null;
  }
  if (!razorpayInstance) {
    try {
      // Dynamic import because razorpay may not be configured
      const Razorpay = require("razorpay");
      razorpayInstance = new Razorpay({
        key_id: RAZORPAY_KEY_ID,
        key_secret: RAZORPAY_KEY_SECRET,
      });
    } catch {
      return null;
    }
  }
  return razorpayInstance;
}

export async function createOrder(params: {
  subscriptionId: string;
  amount: number;
  currency: string;
  userId: string;
  tier: string;
}): Promise<{ orderId: string; razorpayOrderId?: string; amount: number; currency: string; keyId: string }> {
  const rp = getRazorpay();

  if (rp) {
    const order: RazorpayOrder = await rp.orders.create({
      amount: params.amount * 100, // Razorpay expects paise
      currency: params.currency,
      receipt: params.subscriptionId,
      notes: {
        userId: params.userId,
        tier: params.tier,
        subscriptionId: params.subscriptionId,
      },
    });

    await db.query(
      `UPDATE subscriptions SET payment_id = $1, updated_at = $2 WHERE id = $3`,
      [`rp_order_${order.id}`, new Date().toISOString(), params.subscriptionId],
    );

    return {
      orderId: params.subscriptionId,
      razorpayOrderId: order.id,
      amount: params.amount,
      currency: params.currency,
      keyId: RAZORPAY_KEY_ID,
    };
  }

  // Dev mode: mock order
  const mockOrderId = `mock_order_${Date.now()}`;
  return {
    orderId: params.subscriptionId,
    razorpayOrderId: mockOrderId,
    amount: params.amount,
    currency: params.currency,
    keyId: "mock_key",
  };
}

export function verifyPaymentSignature(params: {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}): boolean {
  if (!RAZORPAY_KEY_SECRET) {
    // Dev mode: accept all
    console.warn("[Payment] No Razorpay secret -- accepting payment in dev mode");
    return true;
  }

  const body = params.razorpayOrderId + "|" + params.razorpayPaymentId;
  const expectedSignature = crypto
    .createHmac("sha256", RAZORPAY_KEY_SECRET)
    .update(body)
    .digest("hex");

  return expectedSignature === params.razorpaySignature;
}

export async function activateSubscription(
  subscriptionId: string,
  paymentId: string,
  userId: string,
): Promise<void> {
  await db.query(
    `UPDATE subscriptions SET status = 'active', payment_id = $1, updated_at = $2
     WHERE id = $3 AND user_id = $4`,
    [paymentId, new Date().toISOString(), subscriptionId, userId],
  );

  const subResult = await db.query(
    "SELECT tier FROM subscriptions WHERE id = $1",
    [subscriptionId],
  );

  if (subResult.rows.length > 0) {
    await db.query("UPDATE users SET tier = $1, updated_at = $2 WHERE id = $3", [
      subResult.rows[0].tier,
      new Date().toISOString(),
      userId,
    ]);
  }
}

export async function handleWebhook(body: any, signature: string): Promise<string> {
  if (RAZORPAY_KEY_SECRET) {
    const expectedSig = crypto
      .createHmac("sha256", RAZORPAY_KEY_SECRET)
      .update(JSON.stringify(body))
      .digest("hex");

    if (expectedSig !== signature) {
      throw new Error("Invalid webhook signature");
    }
  }

  const event = body.event;
  const payload = body.payload;

  switch (event) {
    case "payment.captured": {
      const paymentId = payload.payment?.entity?.id;
      const orderId = payload.payment?.entity?.order_id;
      const notes = payload.payment?.entity?.notes || {};

      if (notes.subscriptionId && notes.userId) {
        await activateSubscription(notes.subscriptionId, paymentId, notes.userId);
        return "subscription_activated";
      }
      return "payment_captured";
    }

    case "payment.failed": {
      const notes = payload.payment?.entity?.notes || {};
      if (notes.subscriptionId) {
        await db.query(
          `UPDATE subscriptions SET status = 'payment_failed', updated_at = $1 WHERE id = $2`,
          [new Date().toISOString(), notes.subscriptionId],
        );
      }
      return "payment_failed";
    }

    default:
      return `unhandled_event:${event}`;
  }
}
