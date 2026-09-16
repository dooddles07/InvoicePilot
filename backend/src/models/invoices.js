/**
 * Invoices. Owns: invoices, invoice_items, and the invoice_state view.
 *
 * Empty until the invoices endpoints are implemented. Every query function
 * takes the principal's workspace id as its first argument and builds its
 * statement through the shared scoping helper, so no query reaches a tenant
 * table unscoped.
 */
