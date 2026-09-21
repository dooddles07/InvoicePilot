/**
 * Webhooks. Owns: webhook_endpoints, webhook_deliveries.
 */
import { randomBytes, randomUUID } from "node:crypto";

import { firstOr404, inWorkspace } from "./scope.js";

export async function listEndpoints(sql, workspaceId) {
  return sql`
    SELECT id, workspace_id, url, events, status, failure_count, last_delivery_at
    FROM webhook_endpoints
    ${inWorkspace(sql, workspaceId)}
    ORDER BY created_at
  `;
}

/** The signing secret is returned only here, once -- same reasoning as an
 *  api_keys secret, but kept in the clear on the row itself (not hashed):
 *  the delivery worker has to read it back to sign every request. */
export async function createEndpoint(sql, workspaceId, { url, events }) {
  const secret = randomBytes(24).toString("base64url");
  const [row] = await sql`
    INSERT INTO webhook_endpoints (id, workspace_id, url, secret, events)
    VALUES (${randomUUID()}, ${workspaceId}, ${url}, ${secret}, ${events})
    RETURNING id, workspace_id, url, events, status, failure_count, last_delivery_at
  `;
  return { ...row, secret };
}

export async function deleteEndpoint(sql, workspaceId, endpointId) {
  const rows = await sql`
    DELETE FROM webhook_endpoints
    ${inWorkspace(sql, workspaceId)} AND id = ${endpointId}
    RETURNING id
  `;
  firstOr404(rows, "Webhook endpoint");
}

/** Scoped through the endpoint, not directly: the caller has already
 *  confirmed the endpoint is in this workspace, same shape as
 *  assertInvoiceExists + listInvoiceEvents in models/invoices.js. */
export async function findEndpointForDelivery(sql, workspaceId, endpointId) {
  const rows = await sql`
    SELECT id, workspace_id, url, secret, events, status, failure_count
    FROM webhook_endpoints
    ${inWorkspace(sql, workspaceId)} AND id = ${endpointId}
  `;
  return firstOr404(rows, "Webhook endpoint");
}

/** Every endpoint subscribed to this event, in every workspace -- the
 *  dispatch fan-out reads across tenants on purpose, the one query in this
 *  file that does not take a workspaceId, because one payment or send can
 *  only ever belong to the workspace that made it; the endpoint row itself
 *  carries the scoping the caller already applied when it inserted the row. */
export async function findEndpointsForEvent(sql, workspaceId, eventType) {
  return sql`
    SELECT id, workspace_id, url, secret
    FROM webhook_endpoints
    ${inWorkspace(sql, workspaceId)} AND status <> 'paused' AND ${eventType} = ANY(events)
  `;
}

export async function insertDelivery(sql, workspaceId, { endpointId, eventType, payload, attempt }) {
  const [row] = await sql`
    INSERT INTO webhook_deliveries (id, workspace_id, webhook_endpoint_id, event_type, payload, attempt)
    VALUES (${randomUUID()}, ${workspaceId}, ${endpointId}, ${eventType}, ${payload}, ${attempt ?? 1})
    RETURNING *
  `;
  return row;
}

export async function markDelivered(sql, deliveryId, responseStatus) {
  await sql`
    UPDATE webhook_deliveries
    SET status = 'delivered', response_status = ${responseStatus}, delivered_at = now()
    WHERE id = ${deliveryId}
  `;
}

export async function markFailed(sql, deliveryId, responseStatus) {
  await sql`
    UPDATE webhook_deliveries SET status = 'failed', response_status = ${responseStatus}
    WHERE id = ${deliveryId}
  `;
}

/** Delivered resets the streak; failed extends it and, past three in a row,
 *  moves the endpoint from active to failing -- the state the webhooks
 *  screen reads to explain why deliveries stopped being routine. */
export async function recordEndpointHealth(sql, endpointId, delivered) {
  await sql`
    UPDATE webhook_endpoints
    SET failure_count = CASE WHEN ${delivered} THEN 0 ELSE failure_count + 1 END,
        status = CASE
          WHEN ${delivered} THEN 'active'
          WHEN failure_count + 1 >= 3 THEN 'failing'
          ELSE status
        END,
        last_delivery_at = CASE WHEN ${delivered} THEN now() ELSE last_delivery_at END,
        updated_at = now()
    WHERE id = ${endpointId}
  `;
}

/** The daily retry sweep: every delivery still short of a day old that has
 *  not succeeded, oldest first. Deliveries older than 24 hours are left
 *  alone -- "retry with backoff for 24 hours, then stop" is the ceiling the
 *  webhooks screen itself already states. */
export async function listRetryableDeliveries(sql) {
  return sql`
    SELECT d.id, d.workspace_id, d.webhook_endpoint_id, d.event_type, d.payload, d.attempt,
      e.url, e.secret, e.status AS endpoint_status
    FROM webhook_deliveries d
    JOIN webhook_endpoints e ON e.id = d.webhook_endpoint_id
    WHERE d.status = 'failed'
      AND d.created_at > now() - interval '24 hours'
      AND e.status <> 'paused'
    ORDER BY d.created_at
  `;
}

export async function bumpDeliveryAttempt(sql, deliveryId) {
  await sql`UPDATE webhook_deliveries SET attempt = attempt + 1, status = 'pending' WHERE id = ${deliveryId}`;
}
