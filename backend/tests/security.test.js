import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ACCESS_TOKEN_TTL_MINUTES,
  REFRESH_TOKEN_TTL_DAYS,
  decodeAccessToken,
  generateRefreshToken,
  hashPassword,
  hashRefreshToken,
  issueAccessToken,
  makePrincipal,
  refreshExpiry,
  verifyPassword,
} from "../src/lib/security.js";

const SECRET = "test-only-key-that-is-long-enough-for-hs256";
const OTHER_SECRET = "a-different-key-that-is-also-long-enough-!!";

function principal(role) {
  return makePrincipal(
    "11111111-1111-4111-8111-111111111111",
    "22222222-2222-4222-8222-222222222222",
    role,
  );
}

describe("passwords", () => {
  it("round trips, and rejects the wrong one", async () => {
    const hashed = await hashPassword("correct horse battery staple");
    assert.notEqual(hashed, "correct horse battery staple");
    assert.equal(await verifyPassword("correct horse battery staple", hashed), true);
    assert.equal(await verifyPassword("wrong horse battery staple", hashed), false);
  });

  it("answers false for a hash it cannot parse", async () => {
    // A corrupted or truncated column must read as "does not match", not as a
    // 500 that tells the caller their guess was interesting.
    assert.equal(await verifyPassword("anything", "not-an-argon2-hash"), false);
  });

  it("salts, so the same password hashes differently twice", async () => {
    const [first, second] = await Promise.all([
      hashPassword("correct horse battery staple"),
      hashPassword("correct horse battery staple"),
    ]);
    assert.notEqual(first, second);
  });
});

describe("access tokens", () => {
  it("carry the workspace scope through a round trip", async () => {
    const original = principal("member");
    const decoded = await decodeAccessToken(
      await issueAccessToken(original, SECRET),
      SECRET,
    );

    // The workspace travels inside the signed token, so a caller cannot widen
    // their own scope by editing a request.
    assert.equal(decoded.workspaceId, original.workspaceId);
    assert.equal(decoded.userId, original.userId);
    assert.equal(decoded.role, "member");
  });

  it("refuse a signature from another key", async () => {
    const token = await issueAccessToken(principal("owner"), SECRET);
    await assert.rejects(() => decodeAccessToken(token, OTHER_SECRET));
  });

  it("refuse a token that is not a token", async () => {
    await assert.rejects(() => decodeAccessToken("neither.a.jwt", SECRET));
  });
});

describe("the permission matrix, by role", () => {
  it("lets a viewer read and not write", () => {
    const viewer = principal("viewer");
    assert.equal(viewer.can("invoice:read"), true);
    assert.equal(viewer.can("invoice:write"), false);
    assert.equal(viewer.can("team:write"), false);
  });

  it("lets a member collect but not configure", () => {
    const member = principal("member");
    assert.equal(member.can("invoice:write"), true);
    assert.equal(member.can("payment:write"), true);
    // Working the queue is not the same authority as changing how money is
    // chased, or who else can chase it.
    assert.equal(member.can("automation:write"), false);
    assert.equal(member.can("team:write"), false);
  });

  it("gives an owner everything through the wildcard", () => {
    const owner = principal("owner");
    for (const permission of [
      "invoice:write",
      "team:write",
      "apikey:write",
      "anything:at:all",
    ]) {
      assert.equal(owner.can(permission), true, permission);
    }
  });

  it("grants nothing to a role nobody defined", () => {
    // Python raised KeyError here. A role column holding something unexpected
    // should close the door, not answer 500.
    assert.equal(principal("superuser").can("invoice:read"), false);
  });
});

describe("refresh tokens", () => {
  it("are unpredictable and unique", () => {
    const tokens = new Set(Array.from({ length: 100 }, generateRefreshToken));
    assert.equal(tokens.size, 100);
    // 32 bytes of urandom, base64url-encoded without padding.
    assert.ok([...tokens].every((token) => token.length === 43));
  });

  it("hash deterministically, and the hash hides the token", () => {
    // Stored hashed so a database disclosure hands over no live sessions.
    const token = generateRefreshToken();
    const digest = hashRefreshToken(token);
    assert.equal(digest, hashRefreshToken(token));
    assert.equal(digest.length, 64);
    assert.ok(!digest.includes(token));
  });

  it("expire a fortnight out, as a Date", () => {
    // A Date, not a string: postgres.js binds a Date to timestamptz with its
    // offset intact, and binds a string by hoping. The symptom of getting this
    // wrong is sessions that expire at the wrong hour.
    const expiry = refreshExpiry();
    assert.ok(expiry instanceof Date);
    const days = (expiry.getTime() - Date.now()) / 86_400_000;
    assert.ok(Math.abs(days - REFRESH_TOKEN_TTL_DAYS) < 0.01, `${days} days`);
  });
});

describe("the configured lifetimes", () => {
  it("match the Python service", () => {
    assert.equal(ACCESS_TOKEN_TTL_MINUTES, 30);
    assert.equal(REFRESH_TOKEN_TTL_DAYS, 14);
  });
});
