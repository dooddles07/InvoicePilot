import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ROLE_PERMISSIONS, makePrincipal } from "../src/lib/security.js";

// Rows are permissions, columns are the roles that hold them. Copied from
// spec section 5, and from app/tests/test_permissions.py before it.
const MATRIX = {
  "invoice:read": ["owner", "admin", "member", "viewer"],
  "customer:read": ["owner", "admin", "member", "viewer"],
  "payment:read": ["owner", "admin", "member", "viewer"],
  "report:read": ["owner", "admin", "member", "viewer"],
  "integration:read": ["owner", "admin", "member", "viewer"],
  "automation:read": ["owner", "admin", "member"],
  "automation:write": ["owner", "admin"],
  "invoice:write": ["owner", "admin", "member"],
  "customer:write": ["owner", "admin", "member"],
  "payment:write": ["owner", "admin", "member"],
  "integration:write": ["owner", "admin"],
  "team:write": ["owner", "admin"],
  "workspace:write": ["owner", "admin"],
  "audit:read": ["owner", "admin"],
  "apikey:write": ["owner", "admin"],
  // Granted by no role. billing.py guards POST /billing/subscription with it,
  // so only owner reaches that route, through the wildcard. Ported as it is:
  // a hosting change that quietly widens a permission is a defect.
  "billing:write": ["owner"],
};

const ROLES = ["owner", "admin", "member", "viewer"];

function principal(role) {
  return makePrincipal(
    "11111111-1111-4111-8111-111111111111",
    "22222222-2222-4222-8222-222222222222",
    role,
  );
}

describe("the permission matrix", () => {
  for (const [permission, holders] of Object.entries(MATRIX)) {
    for (const role of ROLES) {
      const expected = holders.includes(role);
      it(`${expected ? "grants" : "denies"} ${permission} to ${role}`, () => {
        assert.equal(principal(role).can(permission), expected);
      });
    }
  }
});

describe("the grant lists themselves", () => {
  it("name only permissions the matrix knows", () => {
    // Catches a typo in a grant list, which reads as a permission nobody has
    // and a route nobody can reach.
    const granted = new Set(
      Object.values(ROLE_PERMISSIONS)
        .flat()
        .filter((permission) => permission !== "*"),
    );
    const unknown = [...granted].filter((permission) => !(permission in MATRIX));
    assert.deepEqual(unknown, []);
  });

  it("gives owner the wildcard and nothing else", () => {
    // The wildcard is the whole grant: an owner list that also enumerated
    // permissions would drift from the enumeration next to it.
    assert.deepEqual([...ROLE_PERMISSIONS.owner], ["*"]);
  });

  it("is frozen against a caller that tries to widen it", () => {
    assert.throws(() => ROLE_PERMISSIONS.viewer.push("invoice:write"), TypeError);
    assert.equal(principal("viewer").can("invoice:write"), false);
  });
});
