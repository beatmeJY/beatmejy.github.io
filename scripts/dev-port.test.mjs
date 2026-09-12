import assert from "node:assert/strict";
import { createServer } from "node:net";
import { describe, it } from "node:test";
import {
  BRANCH_PORTS,
  UNKNOWN_FALLBACK_PORT,
  WORKTREE_PORTS,
  findAvailablePort,
  nextPortAfter,
  preferredPort,
  resolveDevPort,
} from "./dev-port.mjs";

describe("preferredPort", () => {
  it("prefers git branch over directory name", () => {
    assert.equal(
      preferredPort("/tmp/weird-name", {}, { branch: "feature/cursor-work" }),
      BRANCH_PORTS["feature/cursor-work"],
    );
    assert.equal(
      preferredPort("/tmp/weird-name", {}, { branch: "feature/claude-work" }),
      BRANCH_PORTS["feature/claude-work"],
    );
    assert.equal(
      preferredPort("/tmp/weird-name", {}, { branch: "main" }),
      BRANCH_PORTS.main,
    );
  });

  it("maps known worktree directory names when branch unknown", () => {
    assert.equal(
      preferredPort("/Users/youl/Projects/beatmejy.github.io", {}, { branch: null }),
      3000,
    );
    assert.equal(
      preferredPort("/Users/youl/Projects/beatmejy-cursor", {}, { branch: null }),
      3001,
    );
    assert.equal(
      preferredPort("/Users/youl/Projects/beatmejy-claude", {}, { branch: null }),
      3002,
    );
  });

  it("uses non-3000 fallback for unknown directories", () => {
    assert.equal(
      preferredPort("/tmp/other-clone", {}, { branch: null }),
      UNKNOWN_FALLBACK_PORT,
    );
  });

  it("honors PORT env over branch/directory mapping", () => {
    assert.equal(
      preferredPort("/Users/youl/Projects/beatmejy-cursor", { PORT: "4010" }, {
        branch: "feature/cursor-work",
      }),
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
      "/tmp/x",
      {},
      { branch: "feature/cursor-work", isFree: async () => true },
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
      "/tmp/x",
      {},
      {
        branch: "feature/cursor-work",
        isFree: async (p) => !busy.has(p),
      },
    );
    assert.equal(result.preferred, 3001);
    assert.equal(result.port, 3002);
    assert.equal(result.redirected, true);
  });
});

describe("nextPortAfter", () => {
  it("skips the failed port", async () => {
    const port = await nextPortAfter(3001, { isFree: async () => true });
    assert.equal(port, 3002);
  });
});

describe("concurrent bind race (integration)", () => {
  it("two winners cannot both hold the same port", async () => {
    // isPortFree check-then-act can race; holding listen is exclusive.
    const start = 34501;
    const probes = await Promise.all(
      Array.from({ length: 8 }, () => findAvailablePort(start)),
    );
    // Many probes may return the same free port under race — that's the bug shape.
    // Binding must serialize: at most one listen succeeds per port.
    const listeners = [];
    const outcomes = await Promise.all(
      probes.map(
        (port) =>
          new Promise((resolve) => {
            const server = createServer();
            server.once("error", (err) => {
              resolve({ ok: false, port, code: err.code });
            });
            server.listen(port, "127.0.0.1", () => {
              listeners.push(server);
              resolve({ ok: true, port });
            });
          }),
      ),
    );

    const ok = outcomes.filter((o) => o.ok);
    const fail = outcomes.filter((o) => !o.ok);
    assert.ok(ok.length >= 1, "at least one bind should succeed");
    // If probes collided on one port, extras must see EADDRINUSE
    const samePort = probes.every((p) => p === probes[0]);
    if (samePort && probes.length > 1) {
      assert.ok(
        fail.some((f) => f.code === "EADDRINUSE"),
        "concurrent bind on same probed port must yield EADDRINUSE for losers",
      );
    }

    await Promise.all(
      listeners.map(
        (s) =>
          new Promise((resolve) => {
            s.close(() => resolve());
          }),
      ),
    );
  });
});
