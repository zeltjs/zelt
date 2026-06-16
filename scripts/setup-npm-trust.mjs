#!/usr/bin/env node
import { execFileSync, spawn } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

const REPO = "zeltjs/zelt";
const WORKFLOW = "release-please.yml";
const SCOPE = "@zeltjs";
const MIN_NPM_VERSION = [11, 16, 0];
const TRUST_PERMISSION_ARGS = ["--allow-publish"];
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REGISTRY_RETRY_COUNT = 12;
const REGISTRY_RETRY_DELAY_MS = 5_000;

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run") || args.includes("-n");
const SKIP_CONFIRM = args.includes("--yes") || args.includes("-y");

if (args.includes("--help") || args.includes("-h")) {
  console.log(`
Usage: setup-npm-trust.mjs [OPTIONS]

Options:
  -y, --yes        Skip confirmation prompts
  -n, --dry-run    Show what would be done without making changes
  -h, --help       Show this help message

Steps (each requires confirmation):
  1. List packages (no auth required)
  2. Check trusted publisher status (2FA required)
  3. Setup trusted publishers (2FA required)
`);
  process.exit(0);
}

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
});

const question = (prompt) =>
  new Promise((resolve) => rl.question(prompt, resolve));

const log = (msg) => {
  const time = new Date().toLocaleTimeString("en-US", { hour12: false });
  console.log(`[${time}] ${msg}`);
};

const confirm = async (prompt) => {
  if (SKIP_CONFIRM) return true;
  const answer = await question(`${prompt} [y/N] `);
  return answer.toLowerCase() === "y";
};

const resolveNpm = () => {
  const command = process.platform === "win32" ? "npm.cmd" : "npm";
  return { command, args: [], label: "npm from PATH" };
};

const npm = resolveNpm();
const npmEnv = {
  ...process.env,
  npm_config_loglevel: process.env.npm_config_loglevel ?? "error",
};

const parseVersion = (version) =>
  version
    .trim()
    .replace(/^v/, "")
    .split(".")
    .map((part) => Number.parseInt(part, 10));

const versionGte = (actual, required) => {
  for (let i = 0; i < required.length; i++) {
    const left = actual[i] ?? 0;
    const right = required[i] ?? 0;
    if (left > right) return true;
    if (left < right) return false;
  }
  return true;
};

const getNpmVersion = () =>
  execFileSync(npm.command, [...npm.args, "--version"], {
    cwd: ROOT,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();

const assertSupportedNpm = () => {
  const version = getNpmVersion();
  if (!versionGte(parseVersion(version), MIN_NPM_VERSION)) {
    throw new Error(
      `This script requires npm >= ${MIN_NPM_VERSION.join(
        ".",
      )} so trusted publisher permissions can be configured; resolved npm ${version} from ${npm.label}`,
    );
  }
  return version;
};

const npmArgs = (cmdArgs) => [...npm.args, ...cmdArgs];

const runInteractive = (cmdArgs, { capture = false } = {}) => {
  return new Promise((resolve) => {
    const child = spawn(npm.command, npmArgs(cmdArgs), {
      cwd: ROOT,
      env: npmEnv,
      stdio: capture ? ["inherit", "pipe", "pipe"] : "inherit",
    });

    let output = "";
    if (capture) {
      child.stdout.on("data", (data) => {
        process.stdout.write(data);
        output += data;
      });
      child.stderr.on("data", (data) => {
        process.stderr.write(data);
        output += data;
      });
    }

    child.on("error", (error) => {
      console.error(error.message);
      resolve({ success: false, output });
    });
    child.on("close", (exitCode) => {
      resolve({ success: exitCode === 0, output });
    });
  });
};

const runCommandCapture = (cmdArgs) => {
  try {
    const output = execFileSync(npm.command, npmArgs(cmdArgs), {
      cwd: ROOT,
      encoding: "utf-8",
      env: npmEnv,
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { success: true, output };
  } catch (error) {
    const output = [error.stdout, error.stderr]
      .filter(Boolean)
      .map(String)
      .join("");
    return { success: false, output };
  }
};

const getNpmUser = () => runCommandCapture(["whoami"]);

const ensureAuthenticated = async () => {
  let result = getNpmUser();
  if (result.success) {
    log(`npm user: ${result.output.trim()}`);
    return;
  }

  console.error("npm login is required before using npm trust.");
  console.error(`Resolved npm: ${npm.label}`);
  console.error("Run this script again after logging in, or let it run npm login now.");
  console.error();

  if (SKIP_CONFIRM || !(await confirm("Run npm login now?"))) {
    throw new Error("Aborted: npm is not logged in.");
  }

  const login = await runInteractive(["login", "--auth-type=web"]);
  if (!login.success) {
    throw new Error("npm login failed.");
  }

  result = getNpmUser();
  if (!result.success) {
    throw new Error("npm login did not produce an authenticated npm session.");
  }

  log(`npm user: ${result.output.trim()}`);
};

const assertTrustCommandSucceeded = ({ success, output }, pkg) => {
  if (success) return;

  if (/E401|must be logged in|Unauthorized/i.test(output)) {
    throw new Error(
      `npm is not authenticated while checking ${pkg}. Run npm login and retry.`,
    );
  }
};

const needsOneTimePassword = (output) =>
  /EOTP|one-time password|Open this URL in your browser to authenticate/i.test(
    output,
  );

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const hasTrustedPublisher = (output) => {
  return (
    /type:\s*github/i.test(output) &&
    new RegExp(`file:\\s*${escapeRegExp(WORKFLOW)}`, "i").test(output) &&
    new RegExp(`repository:\\s*${escapeRegExp(REPO)}`, "i").test(output)
  );
};

const trustList = async (pkg) => {
  let result = await runInteractive(["trust", "list", pkg], {
    capture: true,
  });

  if (needsOneTimePassword(result.output)) {
    log("2FA required. Opening npm trust in interactive mode...");
    console.log();

    const interactive = await runInteractive(["trust", "list", pkg]);
    if (!interactive.success) {
      throw new Error(`npm 2FA authentication failed while checking ${pkg}.`);
    }

    result = await runInteractive(["trust", "list", pkg], {
      capture: true,
    });
  }

  assertTrustCommandSucceeded(result, pkg);

  if (needsOneTimePassword(result.output)) {
    throw new Error(
      `npm still requires 2FA while checking ${pkg}. Enable the temporary 2FA skip in npm and retry.`,
    );
  }

  return result;
};

const readJson = (path) => JSON.parse(readFileSync(path, "utf-8"));

const packageJsonPaths = () => {
  const paths = [];
  for (const workspaceDir of ["packages", "examples"]) {
    const absoluteDir = join(ROOT, workspaceDir);
    if (!existsSync(absoluteDir)) continue;
    for (const entry of readdirSync(absoluteDir)) {
      const packageJson = join(absoluteDir, entry, "package.json");
      if (existsSync(packageJson) && statSync(packageJson).isFile()) {
        paths.push(packageJson);
      }
    }
  }

  const websitePackageJson = join(ROOT, "website", "package.json");
  if (existsSync(websitePackageJson)) {
    paths.push(websitePackageJson);
  }

  return paths;
};

const getWorkspacePackages = () => {
  return packageJsonPaths()
    .map((path) => readJson(path))
    .filter((pkg) => pkg.name?.startsWith(`${SCOPE}/`));
};

const getZeltjsPackages = () =>
  getWorkspacePackages()
    .filter((pkg) => !pkg.private)
    .map((pkg) => pkg.name)
    .sort();

const getPrivatePackages = () =>
  getWorkspacePackages()
    .filter((pkg) => pkg.private)
    .map((pkg) => pkg.name)
    .sort();

const packageExistsOnNpm = (pkg) => {
  const { success } = runCommandCapture(["view", pkg, "--json"]);
  return success;
};

const trustGithubCommandText = (pkg) =>
  [
    "npm",
    "trust",
    "github",
    `"${pkg}"`,
    "--repository",
    `"${REPO}"`,
    "--file",
    `"${WORKFLOW}"`,
    ...TRUST_PERMISSION_ARGS,
    "--yes",
  ].join(" ");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const waitForPackageOnNpm = async (pkg) => {
  for (let attempt = 1; attempt <= REGISTRY_RETRY_COUNT; attempt++) {
    if (packageExistsOnNpm(pkg)) {
      return true;
    }

    if (attempt < REGISTRY_RETRY_COUNT) {
      log(
        `  → Waiting for npm registry to expose ${pkg} (${attempt}/${REGISTRY_RETRY_COUNT})...`,
      );
      await sleep(REGISTRY_RETRY_DELAY_MS);
    }
  }

  return false;
};

const trustGithub = async (pkg) => {
  const result = await runInteractive([
    "trust",
    "github",
    pkg,
    "--repository",
    REPO,
    "--file",
    WORKFLOW,
    ...TRUST_PERMISSION_ARGS,
    "--yes",
  ]);

  if (result.success) {
    return true;
  }

  log("  → Rechecking trusted publisher status after failed setup...");
  const { success, output } = await trustList(pkg);
  const cleanOutput = output.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "");
  return success && hasTrustedPublisher(cleanOutput);
};

const main = async () => {
  const npmVersion = assertSupportedNpm();

  log("=== npm Trusted Publisher Setup ===");
  log(`Repository: ${REPO}`);
  log(`Workflow: ${WORKFLOW}`);
  log(`Scope: ${SCOPE}/*`);
  log(`npm: ${npmVersion} (${npm.label})`);
  if (DRY_RUN) log("Mode: DRY-RUN");
  console.log();

  // ============================================================
  // Step 1: List packages (no auth required)
  // ============================================================
  log("Step 1: Listing packages...");
  console.log();

  const packages = getZeltjsPackages();
  const privatePackages = getPrivatePackages();

  log(`Checking ${packages.length} public packages on npm...`);
  console.log();

  const published = [];
  const notOnNpm = [];

  for (const pkg of packages) {
    if (packageExistsOnNpm(pkg)) {
      published.push(pkg);
    } else {
      notOnNpm.push(pkg);
    }
  }

  console.log(`Published (${published.length} packages):`);
  if (published.length === 0) {
    console.log("  (none)");
  } else {
    for (const pkg of published) console.log(`  - ${pkg}`);
  }
  console.log();

  console.log(`Not on npm (${notOnNpm.length} packages):`);
  if (notOnNpm.length === 0) {
    console.log("  (none)");
  } else {
    for (const pkg of notOnNpm) console.log(`  - ${pkg}`);
  }
  console.log();

  console.log(`Private (${privatePackages.length} packages):`);
  if (privatePackages.length === 0) {
    console.log("  (none)");
  } else {
    for (const pkg of privatePackages) console.log(`  - ${pkg}`);
  }
  console.log();

  // ============================================================
  // Step 2: Check trusted publisher status (2FA required)
  // ============================================================
  const configured = [];
  const needsSetup = [];

  if (published.length > 0) {
    if (
      !(await confirm("Step 2: Check trusted publisher status? (requires 2FA)"))
    ) {
      log("Aborted.");
      rl.close();
      process.exit(0);
    }
    console.log();

    await ensureAuthenticated();
    console.log();

    log("Step 2: Checking trusted publisher status...");
    log("NOTE: 2FA authentication will be required for each package.");
    console.log();

    for (const pkg of published) {
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log(`Checking: ${pkg}`);
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

      const { success, output } = await trustList(pkg);

      // Clean ANSI escape sequences and check if configured
      // biome-ignore lint/suspicious/noControlCharactersInRegex: needed for ANSI escape removal
      const cleanOutput = output.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "");
      const isConfigured = success && hasTrustedPublisher(cleanOutput);

      if (isConfigured) {
        configured.push(pkg);
        console.log(`  → ${pkg} ✓`);
      } else {
        needsSetup.push(pkg);
        console.log(`  → ${pkg} ✗`);
      }
      console.log();
    }

    log(`${configured.length} configured, ${needsSetup.length} needs setup.`);
    console.log();
  }

  // ============================================================
  // Step 3: Setup trusted publishers (2FA required)
  // ============================================================
  const toProcess = [...needsSetup, ...notOnNpm];

  if (toProcess.length === 0) {
    log("Nothing to configure. All packages are already set up.");
    rl.close();
    process.exit(0);
  }

  log(`${toProcess.length} packages to configure.`);
  console.log();

  if (!(await confirm("Step 3: Setup trusted publishers? (requires 2FA)"))) {
    log("Aborted.");
    rl.close();
    process.exit(0);
  }
  console.log();

  await ensureAuthenticated();
  console.log();

  if (!DRY_RUN) {
    log("NOTE: 2FA authentication will be required for each package.");
    console.log();
  }

  let processed = 0;
  let failed = 0;

  for (const pkg of needsSetup) {
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    log(`Processing: ${pkg}`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    log("  → Package exists on npm");
    log("  → Setting up trusted publisher...");

    if (DRY_RUN) {
      log(`  [DRY-RUN] Would run: ${trustGithubCommandText(pkg)}`);
      processed++;
    } else {
      const success = await trustGithub(pkg);
      if (success) {
        processed++;
      } else {
        failed++;
        log(`  ✗ Failed: ${pkg}`);
      }
    }
    console.log();
  }

  for (const pkg of notOnNpm) {
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    log(`Processing: ${pkg}`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    log("  → Creating placeholder package...");
    if (DRY_RUN) {
      log(`  [DRY-RUN] Would run: npm exec -- setup-npm-trusted-publish "${pkg}"`);
    } else {
      const placeholder = await runInteractive([
        "exec",
        "--",
        "setup-npm-trusted-publish",
        pkg,
      ]);
      if (!placeholder.success) {
        failed++;
        log(`  ✗ Failed to create placeholder package: ${pkg}`);
        console.log();
        continue;
      }
    }

    if (!DRY_RUN && !(await waitForPackageOnNpm(pkg))) {
      failed++;
      log(`  ✗ Package is not visible on npm yet: ${pkg}`);
      console.log();
      continue;
    }

    log("  → Setting up trusted publisher...");
    if (DRY_RUN) {
      log(`  [DRY-RUN] Would run: ${trustGithubCommandText(pkg)}`);
      processed++;
    } else {
      const success = await trustGithub(pkg);
      if (success) {
        processed++;
      } else {
        failed++;
        log(`  ✗ Failed: ${pkg}`);
      }
    }
    console.log();
  }

  console.log();
  log("=== Complete ===");
  log(`Processed: ${processed} / ${toProcess.length}`);
  if (failed > 0) {
    log(`Failed: ${failed}`);
    rl.close();
    process.exit(1);
  }

  rl.close();
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
