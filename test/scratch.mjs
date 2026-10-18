/**
 * Scratch space for the test suite.
 *
 * The suite needs writable directories for its fixtures, and "the current
 * working directory" is not a safe assumption: a harness sandbox can grant
 * write access to the session workspace while denying the platform temp
 * directory *and* the repository checkout — which is exactly what happened when
 * this project moved to a different drive. A test that cannot create its own
 * fixture is indistinguishable from a test whose subject is broken, so the root
 * is resolved by probing candidates instead of being assumed:
 *
 *   1. LH_SCRATCH_ROOT — an explicit override, for a runner that knows better;
 *   2. <cwd>/.tmp — the repository, when it is writable;
 *   3. <tmpdir>/dsh-verified-progress — the platform temp directory.
 *
 * The first candidate that accepts a real create-write-remove round trip wins,
 * and the winner is reported by {@link scratchRoot} so a failing run says where
 * it was trying to work instead of just raising EPERM.
 */

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const CANDIDATES = [
  process.env.LH_SCRATCH_ROOT,
  path.join(process.cwd(), ".tmp"),
  path.join(os.tmpdir(), "dsh-verified-progress"),
].filter((value) => typeof value === "string" && value.trim() !== "");

let resolved;

async function probe(root) {
  const probeDir = path.join(root, `probe-${process.pid}-${Date.now()}`);
  await mkdir(probeDir, { recursive: true });
  await writeFile(path.join(probeDir, "ok.txt"), "ok", "utf8");
  await rm(probeDir, { recursive: true, force: true });
}

/**
 * The scratch root this run will use, and why.
 * @returns {Promise<{root: string, tried: string[]}>}
 */
export async function scratchRoot() {
  if (resolved) return resolved;
  const tried = [];
  for (const candidate of CANDIDATES) {
    try {
      await probe(candidate);
      resolved = { root: candidate, tried };
      return resolved;
    } catch (error) {
      tried.push(`${candidate} (${error.code ?? error.message})`);
    }
  }
  throw new Error(
    `no writable scratch directory; tried: ${tried.join(", ")}. ` +
      "Set LH_SCRATCH_ROOT to a writable directory.",
  );
}

/** Create a fixture directory and register its removal with the test context. */
export async function tempDir(t) {
  const { root } = await scratchRoot();
  const dir = await mkdtemp(path.join(root, "lh-test-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}
