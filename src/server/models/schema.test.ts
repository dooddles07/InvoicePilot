import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { withRollback } from "../test/database";
import { makeCustomer, makeWorkspace } from "../test/factories";
import { customers } from "./schema";

describe("generated schema", () => {
  it("selects a row through the typed query builder", async () => {
    await withRollback(async (tx) => {
      const ws = await makeWorkspace(tx);
      const id = await makeCustomer(tx, ws, { name: "Typed Co" });

      const rows = await tx
        .select({ name: customers.name, terms: customers.paymentTermsDays })
        .from(customers)
        .where(eq(customers.id, id));

      expect(rows[0].name).toBe("Typed Co");
      expect(rows[0].terms).toBe(30);
    });
  });
});
