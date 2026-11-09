import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, writeFile, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

test("GitHub update refuses local edits and divergence, and preserves stashes", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "axis-git-update-"));
  const remote = resolve(directory, "upstream");
  const local = resolve(directory, "local");
  const command = resolve("scripts/dev/update-github.mjs");
  const git = (cwd, ...args) => {
    const result = spawnSync("git", args, { cwd, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  const update = () => spawnSync(process.execPath, [command], { cwd: local, encoding: "utf8" });
  const configure = (cwd) => {
    git(cwd, "config", "user.email", "test@axis.invalid");
    git(cwd, "config", "user.name", "Axis test");
  };
  try {
    git(directory, "init", "-b", "main", remote);
    configure(remote);
    await writeFile(resolve(remote, "tracked"), "base");
    git(remote, "add", ".");
    git(remote, "commit", "-m", "Initial");
    git(directory, "clone", remote, local);
    configure(local);
    await writeFile(resolve(local, "tracked"), "work in progress");
    git(local, "stash", "push", "-m", "Keep");
    const stash = git(local, "rev-parse", "refs/stash");
    const before = git(local, "rev-parse", "HEAD");
    await writeFile(resolve(remote, "tracked"), "upstream change");
    git(remote, "commit", "-am", "Upstream");

    await writeFile(resolve(local, "local-only"), "keep this");
    assert.match(update().stderr, /No pull was performed/);
    assert.equal(git(local, "rev-parse", "refs/remotes/origin/main"), before);
    assert.equal(await readFile(resolve(local, "local-only"), "utf8"), "keep this");
    await rm(resolve(local, "local-only"));
    await writeFile(resolve(local, "tracked"), "staged change");
    git(local, "add", "tracked");
    assert.match(update().stderr, /No pull was performed/);
    assert.equal(git(local, "rev-parse", "refs/remotes/origin/main"), before);
    git(local, "restore", "--staged", "--worktree", "tracked");
    const applied = update();
    assert.equal(applied.status, 0, applied.stderr);
    assert.equal(await readFile(resolve(local, "tracked"), "utf8"), "upstream change");

    await writeFile(resolve(local, "tracked"), "local commit");
    git(local, "commit", "-am", "Local");
    const localHead = git(local, "rev-parse", "HEAD");
    await writeFile(resolve(remote, "tracked"), "another upstream change");
    git(remote, "commit", "-am", "Another upstream");
    assert.notEqual(update().status, 0);
    assert.equal(git(local, "rev-parse", "HEAD"), localHead);
    assert.equal(git(local, "rev-parse", "refs/stash"), stash);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
