import assert from "node:assert/strict";
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  clearDevAppIcons,
  installDevAppIcon,
  restoreDevAppIcon,
} from "./dev-favicon.mjs";

function makeFixture() {
  const root = mkdtempSync(join(tmpdir(), "dev-favicon-"));
  mkdirSync(join(root, "app"));
  mkdirSync(join(root, "public/images"), { recursive: true });
  writeFileSync(join(root, "app/favicon.ico"), "FAVICON");
  writeFileSync(join(root, "public/images/cursor.jpeg"), "CURSOR");
  writeFileSync(join(root, "public/images/claude.png"), "CLAUDE");
  return root;
}

describe("dev-favicon", () => {
  it("installs cursor icon and hides favicon.ico", () => {
    const root = makeFixture();
    try {
      const note = installDevAppIcon(root, "cursor");
      assert.match(note, /icon\.jpeg/);
      assert.equal(existsSync(join(root, "app/favicon.ico")), false);
      assert.equal(existsSync(join(root, "app/.favicon.ico.dev-hidden")), true);
      assert.equal(readFileSync(join(root, "app/icon.jpeg"), "utf8"), "CURSOR");
      restoreDevAppIcon(root);
      assert.equal(existsSync(join(root, "app/favicon.ico")), true);
      assert.equal(existsSync(join(root, "app/icon.jpeg")), false);
      assert.equal(existsSync(join(root, "app/.favicon.ico.dev-hidden")), false);
      assert.equal(readFileSync(join(root, "app/favicon.ico"), "utf8"), "FAVICON");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("installs claude icon as png", () => {
    const root = makeFixture();
    try {
      installDevAppIcon(root, "claude");
      assert.equal(readFileSync(join(root, "app/icon.png"), "utf8"), "CLAUDE");
      restoreDevAppIcon(root);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("clearDevAppIcons removes generated icons only", () => {
    const root = makeFixture();
    try {
      copyFileSync(
        join(root, "public/images/claude.png"),
        join(root, "app/icon.png"),
      );
      clearDevAppIcons(root);
      assert.equal(existsSync(join(root, "app/icon.png")), false);
      assert.equal(existsSync(join(root, "app/favicon.ico")), true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
