import { db } from "../db/connection.js";

export interface Subscription {
  id: string;
  userId: string;
  tier: string;
  billingCycle: string;
  amount: number;
  currency: string;
  status: string;
  startDate: Date;
  endDate: Date;
}

export async function getSubscription(
  userId: string,
): Promise<Subscription | null> {
  const result = await db.query(
    `SELECT * FROM subscriptions
     WHERE user_id = $1 AND status = 'active' AND end_date > NOW()
     ORDER BY created_at DESC LIMIT 1`,
    [userId],
  );

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  return {
    id: row.id,
    userId: row.user_id,
    tier: row.tier,
    billingCycle: row.billing_cycle,
    amount: row.amount,
    currency: row.currency,
    status: row.status,
    startDate: row.start_date,
    endDate: row.end_date,
  };
}

export async function isSubscriptionActive(userId: string): Promise<boolean> {
  const sub = await getSubscription(userId);
  return sub !== null;
}

export async function getUserTier(userId: string): Promise<string> {
  const result = await db.query("SELECT tier FROM users WHERE id = $1", [
    userId,
  ]);
  return result.rows[0]?.tier || "free";
}
