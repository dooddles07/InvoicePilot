import { pgTable, text, timestamp, uniqueIndex, uuid, varchar, index, foreignKey, unique, check, integer, date, bigint, jsonb, pgView, boolean, numeric, pgEnum } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export const invoiceStatus = pgEnum("invoice_status", ['draft', 'sent', 'viewed', 'partially_paid', 'paid', 'disputed'])
export const riskLevel = pgEnum("risk_level", ['low', 'medium', 'high'])


export const migrations = pgTable("_migrations", {
	filename: text().primaryKey().notNull(),
	appliedAt: timestamp("applied_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const users = pgTable("users", {
	id: uuid().primaryKey().notNull(),
	email: varchar({ length: 320 }).notNull(),
	fullName: varchar("full_name", { length: 200 }).notNull(),
	avatarUrl: varchar("avatar_url", { length: 500 }),
	passwordHash: varchar("password_hash", { length: 255 }).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	uniqueIndex("uq_users_email_lower").using("btree", sql`lower((email)::text)`),
]);

export const refreshTokens = pgTable("refresh_tokens", {
	id: uuid().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	tokenHash: varchar("token_hash", { length: 64 }).notNull(),
	expiresAt: timestamp("expires_at", { withTimezone: true, mode: 'string' }).notNull(),
	revokedAt: timestamp("revoked_at", { withTimezone: true, mode: 'string' }),
	replacedById: uuid("replaced_by_id"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("ix_refresh_tokens_user").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "refresh_tokens_user_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.replacedById],
			foreignColumns: [table.id],
			name: "refresh_tokens_replaced_by_id_fkey"
		}).onDelete("set null"),
	unique("uq_refresh_tokens_hash").on(table.tokenHash),
]);

export const workspaces = pgTable("workspaces", {
	id: uuid().primaryKey().notNull(),
	name: varchar({ length: 200 }).notNull(),
	slug: varchar({ length: 120 }).notNull(),
	plan: varchar({ length: 40 }).default('starter').notNull(),
	currency: varchar({ length: 3 }).default('USD').notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	unique("workspaces_slug_key").on(table.slug),
]);

export const workspaceMembers = pgTable("workspace_members", {
	id: uuid().primaryKey().notNull(),
	workspaceId: uuid("workspace_id").notNull(),
	userId: uuid("user_id"),
	invitedEmail: varchar("invited_email", { length: 320 }),
	role: varchar({ length: 20 }).default('member').notNull(),
	status: varchar({ length: 20 }).default('active').notNull(),
	lastActiveAt: timestamp("last_active_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("ix_workspace_members_user").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	index("ix_workspace_members_workspace_id").using("btree", table.workspaceId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.workspaceId],
			foreignColumns: [workspaces.id],
			name: "workspace_members_workspace_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "workspace_members_user_id_fkey"
		}).onDelete("cascade"),
	unique("uq_workspace_members_workspace_user").on(table.workspaceId, table.userId),
	check("ck_workspace_members_role", sql`(role)::text = ANY ((ARRAY['owner'::character varying, 'admin'::character varying, 'member'::character varying, 'viewer'::character varying])::text[])`),
	check("ck_workspace_members_status", sql`(status)::text = ANY ((ARRAY['active'::character varying, 'invited'::character varying])::text[])`),
	check("ck_workspace_members_identified", sql`(user_id IS NOT NULL) OR (invited_email IS NOT NULL)`),
]);

export const customers = pgTable("customers", {
	id: uuid().primaryKey().notNull(),
	workspaceId: uuid("workspace_id").notNull(),
	name: varchar({ length: 200 }).notNull(),
	contactName: varchar("contact_name", { length: 200 }).notNull(),
	email: varchar({ length: 320 }).notNull(),
	phone: varchar({ length: 40 }),
	industry: varchar({ length: 120 }),
	paymentTermsDays: integer("payment_terms_days").default(30).notNull(),
	customerSince: date("customer_since"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("ix_customers_workspace_id").using("btree", table.workspaceId.asc().nullsLast().op("uuid_ops")),
	index("ix_customers_workspace_name").using("btree", table.workspaceId.asc().nullsLast().op("text_ops"), table.name.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.workspaceId],
			foreignColumns: [workspaces.id],
			name: "customers_workspace_id_fkey"
		}).onDelete("cascade"),
	unique("uq_customers_workspace_email").on(table.workspaceId, table.email),
]);

export const invoices = pgTable("invoices", {
	id: uuid().primaryKey().notNull(),
	workspaceId: uuid("workspace_id").notNull(),
	number: varchar({ length: 60 }).notNull(),
	customerId: uuid("customer_id").notNull(),
	status: invoiceStatus().default('draft').notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	paidCents: bigint("paid_cents", { mode: "number" }).default(0).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	balanceCents: bigint("balance_cents", { mode: "number" }).notNull().generatedAlwaysAs(sql`GREATEST((amount_cents - paid_cents), (0)::bigint)`),
	issueDate: date("issue_date").notNull(),
	dueDate: date("due_date").notNull(),
	paidDate: date("paid_date"),
	poNumber: varchar("po_number", { length: 80 }),
	notes: text(),
	lastContactedAt: timestamp("last_contacted_at", { withTimezone: true, mode: 'string' }),
	sentAt: timestamp("sent_at", { withTimezone: true, mode: 'string' }),
	viewedAt: timestamp("viewed_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("ix_invoices_workspace_balance").using("btree", table.workspaceId.asc().nullsLast().op("int8_ops"), table.balanceCents.asc().nullsLast().op("uuid_ops")).where(sql`(balance_cents > 0)`),
	index("ix_invoices_workspace_customer").using("btree", table.workspaceId.asc().nullsLast().op("uuid_ops"), table.customerId.asc().nullsLast().op("uuid_ops")),
	index("ix_invoices_workspace_id").using("btree", table.workspaceId.asc().nullsLast().op("uuid_ops")),
	index("ix_invoices_workspace_status_due").using("btree", table.workspaceId.asc().nullsLast().op("uuid_ops"), table.status.asc().nullsLast().op("enum_ops"), table.dueDate.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.workspaceId],
			foreignColumns: [workspaces.id],
			name: "invoices_workspace_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.customerId],
			foreignColumns: [customers.id],
			name: "invoices_customer_id_fkey"
		}).onDelete("restrict"),
	unique("uq_invoices_workspace_number").on(table.workspaceId, table.number),
	check("ck_invoices_amount_positive", sql`amount_cents > 0`),
	check("ck_invoices_paid_within_amount", sql`(paid_cents >= 0) AND (paid_cents <= amount_cents)`),
	check("ck_invoices_due_after_issue", sql`due_date >= issue_date`),
]);

export const invoiceItems = pgTable("invoice_items", {
	id: uuid().primaryKey().notNull(),
	workspaceId: uuid("workspace_id").notNull(),
	invoiceId: uuid("invoice_id").notNull(),
	description: varchar({ length: 300 }).notNull(),
	quantity: integer().default(1).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	unitPriceCents: bigint("unit_price_cents", { mode: "number" }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("ix_invoice_items_invoice_id").using("btree", table.invoiceId.asc().nullsLast().op("uuid_ops")),
	index("ix_invoice_items_workspace_id").using("btree", table.workspaceId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.workspaceId],
			foreignColumns: [workspaces.id],
			name: "invoice_items_workspace_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.invoiceId],
			foreignColumns: [invoices.id],
			name: "invoice_items_invoice_id_fkey"
		}).onDelete("cascade"),
	check("ck_invoice_items_quantity_positive", sql`quantity > 0`),
]);

export const payments = pgTable("payments", {
	id: uuid().primaryKey().notNull(),
	workspaceId: uuid("workspace_id").notNull(),
	invoiceId: uuid("invoice_id").notNull(),
	customerId: uuid("customer_id").notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
	method: varchar({ length: 40 }).notNull(),
	reference: varchar({ length: 120 }),
	receivedAt: timestamp("received_at", { withTimezone: true, mode: 'string' }).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("ix_payments_workspace_id").using("btree", table.workspaceId.asc().nullsLast().op("uuid_ops")),
	index("ix_payments_workspace_received").using("btree", table.workspaceId.asc().nullsLast().op("timestamptz_ops"), table.receivedAt.asc().nullsLast().op("timestamptz_ops")),
	foreignKey({
			columns: [table.workspaceId],
			foreignColumns: [workspaces.id],
			name: "payments_workspace_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.invoiceId],
			foreignColumns: [invoices.id],
			name: "payments_invoice_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.customerId],
			foreignColumns: [customers.id],
			name: "payments_customer_id_fkey"
		}).onDelete("restrict"),
	check("ck_payments_amount_positive", sql`amount_cents > 0`),
]);

export const collectionEvents = pgTable("collection_events", {
	id: uuid().primaryKey().notNull(),
	workspaceId: uuid("workspace_id").notNull(),
	invoiceId: uuid("invoice_id"),
	customerId: uuid("customer_id").notNull(),
	type: varchar({ length: 40 }).notNull(),
	channel: varchar({ length: 20 }),
	summary: varchar({ length: 300 }).notNull(),
	detail: text(),
	actor: varchar({ length: 200 }).notNull(),
	occurredAt: timestamp("occurred_at", { withTimezone: true, mode: 'string' }).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("ix_collection_events_workspace_customer").using("btree", table.workspaceId.asc().nullsLast().op("uuid_ops"), table.customerId.asc().nullsLast().op("uuid_ops")),
	index("ix_collection_events_workspace_id").using("btree", table.workspaceId.asc().nullsLast().op("uuid_ops")),
	index("ix_collection_events_workspace_invoice").using("btree", table.workspaceId.asc().nullsLast().op("timestamptz_ops"), table.invoiceId.asc().nullsLast().op("uuid_ops"), table.occurredAt.asc().nullsLast().op("timestamptz_ops")),
	foreignKey({
			columns: [table.workspaceId],
			foreignColumns: [workspaces.id],
			name: "collection_events_workspace_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.invoiceId],
			foreignColumns: [invoices.id],
			name: "collection_events_invoice_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.customerId],
			foreignColumns: [customers.id],
			name: "collection_events_customer_id_fkey"
		}).onDelete("cascade"),
]);

export const communicationLogs = pgTable("communication_logs", {
	id: uuid().primaryKey().notNull(),
	workspaceId: uuid("workspace_id").notNull(),
	invoiceId: uuid("invoice_id"),
	customerId: uuid("customer_id").notNull(),
	channel: varchar({ length: 20 }).default('email').notNull(),
	toAddress: varchar("to_address", { length: 320 }).notNull(),
	subject: varchar({ length: 300 }).notNull(),
	body: text().notNull(),
	status: varchar({ length: 20 }).default('queued').notNull(),
	providerMessageId: varchar("provider_message_id", { length: 200 }),
	idempotencyKey: varchar("idempotency_key", { length: 64 }).notNull(),
	error: text(),
	queuedAt: timestamp("queued_at", { withTimezone: true, mode: 'string' }).notNull(),
	sentAt: timestamp("sent_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("ix_communication_logs_workspace_id").using("btree", table.workspaceId.asc().nullsLast().op("uuid_ops")),
	index("ix_communication_logs_workspace_status").using("btree", table.workspaceId.asc().nullsLast().op("text_ops"), table.status.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.workspaceId],
			foreignColumns: [workspaces.id],
			name: "communication_logs_workspace_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.invoiceId],
			foreignColumns: [invoices.id],
			name: "communication_logs_invoice_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.customerId],
			foreignColumns: [customers.id],
			name: "communication_logs_customer_id_fkey"
		}).onDelete("cascade"),
	unique("uq_communication_logs_workspace_key").on(table.workspaceId, table.idempotencyKey),
	check("ck_communication_logs_status", sql`(status)::text = ANY ((ARRAY['queued'::character varying, 'sent'::character varying, 'failed'::character varying])::text[])`),
]);

export const auditLogs = pgTable("audit_logs", {
	id: uuid().primaryKey().notNull(),
	workspaceId: uuid("workspace_id").notNull(),
	actorUserId: uuid("actor_user_id"),
	actorLabel: varchar("actor_label", { length: 200 }).notNull(),
	action: varchar({ length: 80 }).notNull(),
	targetType: varchar("target_type", { length: 40 }).notNull(),
	targetId: varchar("target_id", { length: 80 }).notNull(),
	ip: varchar({ length: 45 }),
	occurredAt: timestamp("occurred_at", { withTimezone: true, mode: 'string' }).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("ix_audit_logs_workspace_id").using("btree", table.workspaceId.asc().nullsLast().op("uuid_ops")),
	index("ix_audit_logs_workspace_occurred").using("btree", table.workspaceId.asc().nullsLast().op("timestamptz_ops"), table.occurredAt.desc().nullsFirst().op("timestamptz_ops")),
	foreignKey({
			columns: [table.workspaceId],
			foreignColumns: [workspaces.id],
			name: "audit_logs_workspace_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.actorUserId],
			foreignColumns: [users.id],
			name: "audit_logs_actor_user_id_fkey"
		}).onDelete("set null"),
]);

export const emailTemplates = pgTable("email_templates", {
	id: uuid().primaryKey().notNull(),
	workspaceId: uuid("workspace_id").notNull(),
	name: varchar({ length: 120 }).notNull(),
	tone: varchar({ length: 20 }).notNull(),
	subject: varchar({ length: 300 }).notNull(),
	body: text().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("ix_email_templates_workspace_id").using("btree", table.workspaceId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.workspaceId],
			foreignColumns: [workspaces.id],
			name: "email_templates_workspace_id_fkey"
		}).onDelete("cascade"),
	unique("uq_email_templates_workspace_tone").on(table.workspaceId, table.tone),
]);

export const importBatches = pgTable("import_batches", {
	id: uuid().primaryKey().notNull(),
	workspaceId: uuid("workspace_id").notNull(),
	createdBy: uuid("created_by"),
	filename: varchar({ length: 300 }).notNull(),
	rowCount: integer("row_count").default(0).notNull(),
	acceptedCount: integer("accepted_count").default(0).notNull(),
	rejectedCount: integer("rejected_count").default(0).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	importedCents: bigint("imported_cents", { mode: "number" }).default(0).notNull(),
	status: varchar({ length: 20 }).default('pending').notNull(),
	rejections: jsonb(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("ix_import_batches_workspace_id").using("btree", table.workspaceId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.workspaceId],
			foreignColumns: [workspaces.id],
			name: "import_batches_workspace_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [users.id],
			name: "import_batches_created_by_fkey"
		}).onDelete("set null"),
]);
export const invoiceState = pgView("invoice_state", {	id: uuid(),
	workspaceId: uuid("workspace_id"),
	number: varchar({ length: 60 }),
	customerId: uuid("customer_id"),
	status: invoiceStatus(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	amountCents: bigint("amount_cents", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	paidCents: bigint("paid_cents", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	balanceCents: bigint("balance_cents", { mode: "number" }),
	issueDate: date("issue_date"),
	dueDate: date("due_date"),
	paidDate: date("paid_date"),
	poNumber: varchar("po_number", { length: 80 }),
	notes: text(),
	lastContactedAt: timestamp("last_contacted_at", { withTimezone: true, mode: 'string' }),
	sentAt: timestamp("sent_at", { withTimezone: true, mode: 'string' }),
	viewedAt: timestamp("viewed_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }),
	customerName: varchar("customer_name", { length: 200 }),
	daysOverdue: integer("days_overdue"),
	isOverdue: boolean("is_overdue"),
}).as(sql`SELECT i.id, i.workspace_id, i.number, i.customer_id, i.status, i.amount_cents, i.paid_cents, i.balance_cents, i.issue_date, i.due_date, i.paid_date, i.po_number, i.notes, i.last_contacted_at, i.sent_at, i.viewed_at, i.created_at, i.updated_at, c.name AS customer_name, CURRENT_DATE - i.due_date AS days_overdue, i.due_date < CURRENT_DATE AND i.balance_cents > 0 AND (i.status <> ALL (ARRAY['draft'::invoice_status, 'paid'::invoice_status])) AS is_overdue FROM invoices i JOIN customers c ON c.id = i.customer_id`);

export const customerStats = pgView("customer_stats", {	customerId: uuid("customer_id"),
	workspaceId: uuid("workspace_id"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	outstandingCents: bigint("outstanding_cents", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	overdueCents: bigint("overdue_cents", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	totalInvoicedCents: bigint("total_invoiced_cents", { mode: "number" }),
	avgDaysToPay: integer("avg_days_to_pay"),
	onTimeRate: integer("on_time_rate"),
	openInvoiceCount: integer("open_invoice_count"),
	oldestOpenDays: integer("oldest_open_days"),
	risk: riskLevel(),
	riskReason: text("risk_reason"),
}).as(sql`WITH settled AS ( SELECT invoices.customer_id, avg(invoices.paid_date - invoices.issue_date) AS avg_days_to_pay, avg((invoices.paid_date <= invoices.due_date)::integer) * 100::numeric AS on_time_rate, count(*) AS settled_count FROM invoices WHERE invoices.status = 'paid'::invoice_status AND invoices.paid_date IS NOT NULL GROUP BY invoices.customer_id ), open_now AS ( SELECT invoice_state.customer_id, sum(invoice_state.balance_cents) AS outstanding_cents, COALESCE(sum(invoice_state.balance_cents) FILTER (WHERE invoice_state.is_overdue), 0::numeric) AS overdue_cents, count(*) AS open_invoice_count, COALESCE(max(invoice_state.days_overdue) FILTER (WHERE invoice_state.is_overdue), 0) AS oldest_open_days FROM invoice_state WHERE invoice_state.status <> ALL (ARRAY['draft'::invoice_status, 'paid'::invoice_status]) GROUP BY invoice_state.customer_id ), totals AS ( SELECT invoices.customer_id, sum(invoices.amount_cents) AS total_invoiced_cents FROM invoices WHERE invoices.status <> 'draft'::invoice_status GROUP BY invoices.customer_id ) SELECT c.id AS customer_id, c.workspace_id, COALESCE(o.outstanding_cents, 0::numeric)::bigint AS outstanding_cents, COALESCE(o.overdue_cents, 0::numeric)::bigint AS overdue_cents, COALESCE(t.total_invoiced_cents, 0::numeric)::bigint AS total_invoiced_cents, COALESCE(round(s.avg_days_to_pay), 0::numeric)::integer AS avg_days_to_pay, COALESCE(round(s.on_time_rate), 0::numeric)::integer AS on_time_rate, COALESCE(o.open_invoice_count, 0::bigint)::integer AS open_invoice_count, COALESCE(o.oldest_open_days, 0) AS oldest_open_days, CASE WHEN COALESCE(s.settled_count, 0::bigint) > 0 AND s.on_time_rate < 40::numeric THEN 'high'::text WHEN COALESCE(o.oldest_open_days, 0) > 60 THEN 'high'::text WHEN COALESCE(s.settled_count, 0::bigint) > 0 AND s.on_time_rate < 75::numeric THEN 'medium'::text WHEN COALESCE(o.oldest_open_days, 0) > 14 THEN 'medium'::text WHEN COALESCE(s.settled_count, 0::bigint) > 0 AND s.avg_days_to_pay > (c.payment_terms_days + 7)::numeric THEN 'medium'::text ELSE 'low'::text END::risk_level AS risk, CASE WHEN COALESCE(s.settled_count, 0::bigint) > 0 AND s.on_time_rate < 40::numeric THEN ('Settles on time only '::text || round(s.on_time_rate)) || '% of the time'::text WHEN COALESCE(o.oldest_open_days, 0) > 60 THEN ('Carrying a balance '::text || o.oldest_open_days) || ' days past due'::text WHEN COALESCE(s.settled_count, 0::bigint) > 0 AND s.on_time_rate < 75::numeric THEN ('On-time rate has fallen to '::text || round(s.on_time_rate)) || '%'::text WHEN COALESCE(o.oldest_open_days, 0) > 14 THEN ('Balance is '::text || o.oldest_open_days) || ' days past terms'::text WHEN COALESCE(s.settled_count, 0::bigint) > 0 AND s.avg_days_to_pay > (c.payment_terms_days + 7)::numeric THEN ((('Averages '::text || round(s.avg_days_to_pay)) || ' days against '::text) || c.payment_terms_days) || '-day terms'::text WHEN COALESCE(s.settled_count, 0::bigint) = 0 AND COALESCE(o.open_invoice_count, 0::bigint) = 0 THEN 'No payment history yet'::text ELSE 'Pays on terms'::text END AS risk_reason FROM customers c LEFT JOIN settled s ON s.customer_id = c.id LEFT JOIN open_now o ON o.customer_id = c.id LEFT JOIN totals t ON t.customer_id = c.id`);

export const collectionQueue = pgView("collection_queue", {	invoiceId: uuid("invoice_id"),
	workspaceId: uuid("workspace_id"),
	customerId: uuid("customer_id"),
	number: varchar({ length: 60 }),
	customerName: varchar("customer_name", { length: 200 }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	balanceCents: bigint("balance_cents", { mode: "number" }),
	daysOverdue: integer("days_overdue"),
	risk: riskLevel(),
	recoveryScore: numeric("recovery_score"),
}).as(sql`SELECT invoice_id, workspace_id, customer_id, number, customer_name, balance_cents, days_overdue, risk, recovery_score FROM ( SELECT DISTINCT ON (i.workspace_id, i.customer_id) i.id AS invoice_id, i.workspace_id, i.customer_id, i.number, i.customer_name, i.balance_cents, i.days_overdue, cs.risk, i.balance_cents::numeric * CASE cs.risk WHEN 'high'::risk_level THEN 2.4 WHEN 'medium'::risk_level THEN 1.6 ELSE 1.0 END * exp((- i.days_overdue)::numeric / 55.0) AS recovery_score FROM invoice_state i JOIN customer_stats cs ON cs.customer_id = i.customer_id WHERE i.is_overdue ORDER BY i.workspace_id, i.customer_id, (i.balance_cents::numeric * CASE cs.risk WHEN 'high'::risk_level THEN 2.4 WHEN 'medium'::risk_level THEN 1.6 ELSE 1.0 END * exp((- i.days_overdue)::numeric / 55.0)) DESC) q ORDER BY workspace_id, recovery_score DESC`);