/**
 * Users. Owns: users, workspace_members.
 *
 * Empty until the users endpoints are implemented. Every query function
 * takes the principal's workspace id as its first argument and builds its
 * statement through the shared scoping helper, so no query reaches a tenant
 * table unscoped.
 */
