/**
 * Collections. Owns: collection_events, and the collection_queue view.
 *
 * Empty until the collections endpoints are implemented. Every query function
 * takes the principal's workspace id as its first argument and builds its
 * statement through the shared scoping helper, so no query reaches a tenant
 * table unscoped.
 */
