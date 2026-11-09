import { spawnSync } from "node:child_process";

function git(args, capture = false) {
  const result = spawnSync("git", args, { encoding: "utf8", stdio: capture ? ["ignore", "pipe", "inherit"] : "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Git command failed: git ${args[0]}`);
  return result.stdout?.trim();
}

try {
  if (git(["branch", "--show-current"], true) !== "main") throw new Error("Switch to main before updating.");
  if (git(["status", "--porcelain=v1", "--untracked-files=all", "--ignore-submodules=none"], true)) {
    throw new Error("Commit or otherwise preserve your local changes before updating. No pull was performed.");
  }
  git(["pull", "--ff-only", "--no-rebase", "--no-autostash", "--no-recurse-submodules", "origin", "main"]);
} catch (error) {
  console.error(`[update:github] ${error.message}`);
  process.exitCode = 1;
}
