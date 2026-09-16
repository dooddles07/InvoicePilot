/**
 * Reports. Owns: the invoice_state and customer_stats views, read-only.
 *
 * Empty until the reports endpoints are implemented. Every query function
 * takes the principal's workspace id as its first argument and builds its
 * statement through the shared scoping helper, so no query reaches a tenant
 * table unscoped.
 */
