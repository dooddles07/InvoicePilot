/**
 * The prose behind the collections queue's ai_note.
 *
 * Ported from src/lib/data/index.ts's aiNoteFor(), which lived in the
 * frontend fixtures. It moved here because ai_note is a declared field on
 * the API's NeedsAttentionItem response -- a field the browser computes
 * itself is a lie in the type. Pure and DB-free: every value it reads comes
 * already joined on the row models/collections.js's listQueue returns.
 */
function money(cents) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export function aiNoteFor(row) {
  const contacted = row.last_contacted_at ? row.days_since_contact : null;

  if (row.status === "disputed") {
    return "A dispute is open on this invoice. Resolve the query before sending another reminder — chasing a disputed balance costs goodwill without moving the money.";
  }
  if (row.status === "partially_paid") {
    return `${row.customer_name} has already part-paid this invoice, so the intent is there. Ask for a date on the remaining ${money(row.balance_cents)} rather than re-sending the whole demand.`;
  }
  if (row.on_time_rate >= 75 && row.days_overdue <= 14) {
    return `${row.customer_name} normally settles within ${row.avg_days_to_pay} days of issue and pays on time ${row.on_time_rate}% of the time. One friendly reminder is usually enough.`;
  }
  if (contacted !== null && contacted <= 2) {
    const when = contacted === 0 ? "today" : `${contacted} day${contacted === 1 ? "" : "s"} ago`;
    return `You contacted ${row.contact_name} ${when}. Give it another two working days before following up again — back-to-back chasing lowers the reply rate.`;
  }
  if (row.days_overdue > 90) {
    return `At ${row.days_overdue} days this is beyond what email recovers. Escalate to ${row.contact_name} by phone, and agree a payment plan rather than a lump sum.`;
  }
  if (row.days_overdue > 45) {
    const since = contacted ? `; the last contact was ${contacted} days ago` : "";
    return `Email alone rarely works past 45 days on this account. A call to ${row.contact_name} is the higher-yield next step${since}.`;
  }
  if (row.risk === "high") {
    return row.on_time_rate === 0
      ? `${row.customer_name} has not settled a single invoice on time in the last year — average days-to-pay is ${row.avg_days_to_pay} against ${row.payment_terms_days}-day terms. Treat the due date as advisory and chase early.`
      : `On-time rate is down to ${row.on_time_rate}% and average days-to-pay is now ${row.avg_days_to_pay}. Contact today, while the balance is still inside the recoverable window.`;
  }
  const beyond = row.avg_days_to_pay - row.payment_terms_days;
  return beyond <= 0
    ? "This account normally pays on terms, so the delay is out of character. A short reminder naming the invoice number is usually all it takes."
    : `This account usually pays ${beyond} day${beyond === 1 ? "" : "s"} beyond terms. A short, specific reminder naming the invoice number tends to be enough.`;
}

/**
 * The dashboard's "AI collection insights" cards. Same source row as
 * aiNoteFor -- models/collections.js's listQueue -- reshaped for a
 * different panel: a headline, a reasoning sentence naming this invoice's
 * share of the overdue book, and a confidence score that climbs with days
 * overdue rather than resets per invoice.
 */
export function aiInsightFor(row, priority, overdueTotalCents, workspaceId) {
  const escalate = row.days_overdue > 30;
  const share = Math.round((row.balance_cents / (overdueTotalCents || 1)) * 100);

  return {
    id: `ai_${row.invoice_id}`,
    workspace_id: workspaceId,
    priority,
    customer_id: row.customer_id,
    customer_name: row.customer_name,
    invoice_id: row.invoice_id,
    amount_cents: row.balance_cents,
    headline: escalate
      ? `Payment is ${row.days_overdue} days overdue`
      : row.risk === "high"
        ? "High likelihood of further delay"
        : "Balance is slipping past terms",
    reasoning: `${row.customer_name} settles on time ${row.on_time_rate}% of the time and averages ${row.avg_days_to_pay} days against ${row.payment_terms_days}-day terms. This invoice is ${row.days_overdue} days past due and accounts for ${share}% of your overdue balance.`,
    recommended_action: escalate ? "Send escalation" : "Contact today",
    action_kind: escalate ? "send_escalation" : "send_reminder",
    confidence: Math.min(0.95, 0.62 + row.days_overdue / 220),
    created_at: new Date().toISOString(),
  };
}
