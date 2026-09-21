/**
 * Webhook delivery: sign, send, record.
 *
 * ponytail: fired inline from the write path with no queue, so a burst of
 * writes serialises its webhook deliveries one at a time behind them. A
 * queue (or at least Promise.allSettled across endpoints) is the fix if
 * delivery latency ever shows up in a write's own response time.
 */
import { createHmac, randomUUID } from "node:crypto";

import {
  bumpDeliveryAttempt,
  findEndpointsForEvent,
  insertDelivery,
  listRetryableDeliveries,
  markDelivered,
  markFailed,
  recordEndpointHealth,
} from "../models/webhooks.js";

function sign(secret, body) {
  return createHmac("sha256", secret).update(body, "utf8").digest("hex");
}

async function send(url, secret, payload) {
  const body = JSON.stringify(payload);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-InvoicePilot-Signature": sign(secret, body),
      },
      body,
      signal: AbortSignal.timeout(5_000),
    });
    return { ok: response.ok, status: response.status };
  } catch {
    // DNS failure, timeout, connection refused -- all the same to a caller
    // who only needs to know whether to count this as a failure.
    return { ok: false, status: null };
  }
}

/**
 * Called from the write paths that already own a real event -- a payment
 * recorded, an invoice sent, a reminder sent -- after their own writes have
 * gone through, on the same `sql`/`tx` handle. Awaited, not fire-and-forget:
 * a test wraps everything in one transaction that rolls back the moment the
 * test function returns, so a dispatch still running after that point would
 * race the rollback rather than write inside it. The caller wraps this in
 * its own try/catch -- a webhook target being down must not fail the write
 * that triggered it, only the notification about it.
 */
export async function dispatchEvent(sql, workspaceId, eventType, data) {
  const endpoints = await findEndpointsForEvent(sql, workspaceId, eventType);
  const payload = { id: randomUUID(), type: eventType, created_at: new Date().toISOString(), data };

  for (const endpoint of endpoints) {
    const delivery = await insertDelivery(sql, workspaceId, { endpointId: endpoint.id, eventType, payload });
    const result = await send(endpoint.url, endpoint.secret, payload);
    if (result.ok) {
      await markDelivered(sql, delivery.id, result.status);
    } else {
      await markFailed(sql, delivery.id, result.status);
    }
    await recordEndpointHealth(sql, endpoint.id, result.ok);
  }
}

/** The on-demand "send test event" button: one endpoint, one synthetic
 *  payload, delivered and recorded exactly like a real one so the delivery
 *  log does not need a second code path to explain a test row. */
export async function sendTestEvent(sql, endpoint) {
  const payload = {
    id: randomUUID(),
    type: "test.ping",
    created_at: new Date().toISOString(),
    data: { message: "Test delivery from InvoicePilot" },
  };
  const delivery = await insertDelivery(sql, endpoint.workspace_id, {
    endpointId: endpoint.id,
    eventType: "test.ping",
    payload,
  });
  const result = await send(endpoint.url, endpoint.secret, payload);
  if (result.ok) {
    await markDelivered(sql, delivery.id, result.status);
  } else {
    await markFailed(sql, delivery.id, result.status);
  }
  await recordEndpointHealth(sql, endpoint.id, result.ok);
  return result;
}

/** The daily retry sweep -- see models/webhooks.js's listRetryableDeliveries
 *  for the 24-hour ceiling. Runs from the same admin-guarded cron as the
 *  demo reseed and the automation evaluator. */
export async function retryFailedDeliveries(sql) {
  const deliveries = await listRetryableDeliveries(sql);
  let retried = 0;
  for (const delivery of deliveries) {
    await bumpDeliveryAttempt(sql, delivery.id);
    const result = await send(delivery.url, delivery.secret, delivery.payload);
    if (result.ok) {
      await markDelivered(sql, delivery.id, result.status);
    } else {
      await markFailed(sql, delivery.id, result.status);
    }
    await recordEndpointHealth(sql, delivery.webhook_endpoint_id, result.ok);
    retried += 1;
  }
  return retried;
}
