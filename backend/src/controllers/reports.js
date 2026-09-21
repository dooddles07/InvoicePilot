import { z } from "zod";

import * as reports from "../models/reports.js";
import { notImplemented } from "./not-implemented.js";
import { parse } from "./query.js";

const RANGE_DAYS = { "7d": [1, 7], "30d": [2, 15], "90d": [7, 13] };

const cashFlowQuery = z.object({
  range: z.enum(["7d", "30d", "90d", "12m"]).default("30d"),
});

export function reportsController(sql) {
  return {
    async summary(request, response) {
      response.json(await reports.getSummary(sql, request.principal.workspaceId));
    },

    async cashFlow(request, response) {
      const { range } = parse(cashFlowQuery, request.query);
      const data =
        range === "12m"
          ? await reports.getCashFlowMonths(sql, request.principal.workspaceId)
          : await reports.getCashFlowDays(
              sql,
              request.principal.workspaceId,
              ...RANGE_DAYS[range],
            );
      // label is not returned here: it is a locale-formatted string ("Feb 23"
      // for a day bucket, "Sep" for a month), and formatting differs by range
      // in a way only the caller -- who chose the range -- already knows.
      response.json({
        data: data.map((row) => ({
          date: row.start_at,
          expected_cents: row.expected_cents,
          actual_cents: row.actual_cents,
          overdue_cents: row.overdue_cents,
        })),
      });
    },

    async aging(request, response) {
      const workspaceId = request.principal.workspaceId;
      const [buckets, byCustomer] = await Promise.all([
        reports.getAgingBuckets(sql, workspaceId),
        reports.getAgingByCustomer(sql, workspaceId),
      ]);
      response.json({
        buckets: buckets.map((b) => ({
          key: b.key,
          amount_cents: b.amount_cents,
          invoice_count: b.invoice_count,
          share: b.share === null ? 0 : Number(b.share),
        })),
        by_customer: byCustomer.map((c) => ({
          customer_id: c.customer_id,
          customer_name: c.customer_name,
          cells: [c.current_cents, c.c1_30_cents, c.c31_60_cents, c.c61_90_cents, c.c90_plus_cents],
          total_cents: c.total_cents,
        })),
      });
    },

    collectionRate: notImplemented,
    customerRisk: notImplemented,
    daysToPayment: notImplemented,
  };
}
