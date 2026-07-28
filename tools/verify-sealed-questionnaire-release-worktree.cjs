#!/usr/bin/env node
"use strict";

const path = require("path");
const { spawnSync } = require("child_process");

const root = path.resolve(__dirname, "..");

function verifySealedWorktree({
  expectedCommit,
  rootDir = root,
  spawnImpl = spawnSync
}) {
  if (!/^[a-f0-9]{40}$/i.test(String(expectedCommit || ""))) {
    return failure("expected_commit_invalid");
  }

  const topLevel = runGit(
    ["rev-parse", "--show-toplevel"],
    rootDir,
    spawnImpl
  );
  if (!topLevel.ok || !samePath(topLevel.stdout.trim(), rootDir)) {
    return failure("git_root_unavailable");
  }

  const head = runGit(
    ["rev-parse", "--verify", "HEAD^{commit}"],
    rootDir,
    spawnImpl
  );
  if (!head.ok || !/^[a-f0-9]{40}$/i.test(head.stdout.trim())) {
    return failure("git_head_unavailable");
  }
  if (head.stdout.trim().toLowerCase() !== expectedCommit.toLowerCase()) {
    return failure("sealed_commit_mismatch", {
      currentCommit: head.stdout.trim().toLowerCase()
    });
  }

  const status = runGit(
    ["status", "--porcelain=v1", "--untracked-files=all"],
    rootDir,
    spawnImpl
  );
  if (!status.ok) {
    return failure("git_status_unavailable");
  }
  const changedEntries = status.stdout
    .split(/\r?\n/)
    .filter((line) => line.length > 0)
    .length;
  if (changedEntries > 0) {
    return failure("worktree_not_clean", { changedEntries });
  }

  return {
    ok: true,
    check: "sealed_questionnaire_release_worktree",
    commit: expectedCommit.toLowerCase(),
    worktreeClean: true
  };
}

function runGit(args, cwd, spawnImpl) {
  const result = spawnImpl("git", args, {
    cwd,
    encoding: "utf8",
    timeout: 10000,
    windowsHide: true
  });
  return {
    ok: !result.error && result.status === 0,
    stdout: String(result.stdout || "")
  };
}

function samePath(left, right) {
  if (!left || !right) return false;
  const normalizedLeft = path.resolve(left);
  const normalizedRight = path.resolve(right);
  return process.platform === "win32"
    ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
    : normalizedLeft === normalizedRight;
}

function failure(error, extra = {}) {
  return {
    ok: false,
    check: "sealed_questionnaire_release_worktree",
    error,
    ...extra
  };
}

if (require.main === module) {
  const result = verifySealedWorktree({
    expectedCommit: process.argv[2] || ""
  });
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}

module.exports = {
  samePath,
  verifySealedWorktree
};
