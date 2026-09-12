import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  findAvailablePort,
  preferredPort,
  resolveDevPort,
  WORKTREE_PORTS,
} from "./dev-port.mjs";

describe("preferredPort", () => {
  it("maps known worktree directory names", () => {
    assert.equal(
      preferredPort("/Users/youl/Projects/beatmejy.github.io", {}),
      3000,
    );
    assert.equal(
      preferredPort("/Users/youl/Projects/beatmejy-cursor", {}),
      3001,
    );
    assert.equal(
      preferredPort("/Users/youl/Projects/beatmejy-claude", {}),
      3002,
    );
  });

  it("defaults unknown directories to 3000", () => {
    assert.equal(preferredPort("/tmp/other-clone", {}), 3000);
  });

  it("honors PORT env over worktree mapping", () => {
    assert.equal(
      preferredPort("/Users/youl/Projects/beatmejy-cursor", { PORT: "4010" }),
      4010,
    );
  });

  it("rejects invalid PORT", () => {
    assert.throws(() => preferredPort("/tmp", { PORT: "abc" }), /Invalid PORT/);
    assert.throws(() => preferredPort("/tmp", { PORT: "0" }), /Invalid PORT/);
  });
});

describe("findAvailablePort", () => {
  it("returns the first free port", async () => {
    const busy = new Set([3001, 3002]);
    const port = await findAvailablePort(3001, {
      isFree: async (p) => !busy.has(p),
      limit: 10,
    });
    assert.equal(port, 3003);
  });

  it("throws when the scan range is exhausted", async () => {
    await assert.rejects(
      () =>
        findAvailablePort(3000, {
          isFree: async () => false,
          limit: 3,
        }),
      /No free port/,
    );
  });
});

describe("resolveDevPort", () => {
  it("keeps preferred port when free", async () => {
    const result = await resolveDevPort(
      "/Users/youl/Projects/beatmejy-cursor",
      {},
      { isFree: async () => true },
    );
    assert.deepEqual(result, {
      preferred: WORKTREE_PORTS["beatmejy-cursor"],
      port: 3001,
      redirected: false,
    });
  });

  it("redirects when preferred port is busy", async () => {
    const busy = new Set([3001]);
    const result = await resolveDevPort(
      "/Users/youl/Projects/beatmejy-cursor",
      {},
      { isFree: async (p) => !busy.has(p) },
    );
    assert.equal(result.preferred, 3001);
    assert.equal(result.port, 3002);
    assert.equal(result.redirected, true);
  });
});
