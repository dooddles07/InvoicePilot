/**
 * The answer for every route that exists, is guarded, and has no service
 * behind it. One handler rather than fifty copies of one line; the detail
 * string is the one the Python service answers with today.
 */
import { NotImplemented } from "../middleware/errors.js";

export function notImplemented() {
  throw new NotImplemented(
    "Not implemented: the service layer for this route is not wired yet.",
  );
}
