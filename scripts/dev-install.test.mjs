import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

test("a failed native build cannot install a stale app bundle", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "anarlog-install-test-"));
  try {
    const scripts = path.join(root, "scripts");
    const bin = path.join(root, "stub-bin");
    const target = path.join(root, "target");
    const afterBuild = path.join(root, "signing-attempted");
    mkdirSync(scripts);
    mkdirSync(bin);
    mkdirSync(path.join(root, "apps/desktop"), { recursive: true });
    mkdirSync(path.join(target, "release/bundle/macos/Anarlog Dev.app"), {
      recursive: true,
    });
    mkdirSync(path.join(target, "release"), { recursive: true });
    copyFileSync(
      new URL("./dev-install.sh", import.meta.url),
      path.join(scripts, "dev-install.sh"),
    );
    writeFileSync(path.join(scripts, "release-version.mjs"), "");
    writeFileSync(
      path.join(root, "release-version.json"),
      JSON.stringify({ version: "1.4.28" }),
    );
    for (const binary of ["anarlog", "char-chrome-native-host"]) {
      writeFileSync(path.join(target, "release", binary), "stub");
    }
    const stubs = {
      cargo:
        '#!/bin/sh\nif [ "$1" = metadata ]; then printf \'{"target_directory":"%s"}\\n\' "$ANARLOG_TEST_TARGET"; fi\n',
      rustc: "#!/bin/sh\necho 'host: aarch64-apple-darwin'\n",
      pnpm: "#!/bin/sh\nexit 42\n",
      security: '#!/bin/sh\ntouch "$ANARLOG_TEST_AFTER_BUILD"\n',
      codesign: '#!/bin/sh\ntouch "$ANARLOG_TEST_AFTER_BUILD"\n',
    };
    for (const [name, content] of Object.entries(stubs)) {
      writeFileSync(path.join(bin, name), content, { mode: 0o755 });
    }
    const result = spawnSync(
      "bash",
      [path.join(scripts, "dev-install.sh"), "--build-only"],
      {
        cwd: root,
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${bin}${path.delimiter}${path.dirname(process.execPath)}${path.delimiter}${process.env.PATH}`,
          ANARLOG_TEST_TARGET: target,
          ANARLOG_TEST_AFTER_BUILD: afterBuild,
        },
      },
    );
    assert.equal(result.status, 42, result.stderr);
    assert.equal(existsSync(afterBuild), false);
    assert.doesNotMatch(result.stdout, /ignoring|installing|verified/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
