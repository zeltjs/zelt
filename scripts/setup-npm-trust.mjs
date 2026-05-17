#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import pty from 'node-pty';

const REPO = 'zeltjs/zelt';
const WORKFLOW = 'release.yml';
const SCOPE = '@zeltjs';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run') || args.includes('-n');
const SKIP_CONFIRM = args.includes('--yes') || args.includes('-y');

if (args.includes('--help') || args.includes('-h')) {
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

const question = (prompt) => new Promise((resolve) => rl.question(prompt, resolve));

const log = (msg) => {
  const time = new Date().toLocaleTimeString('en-US', { hour12: false });
  console.log(`[${time}] ${msg}`);
};

const confirm = async (prompt) => {
  if (SKIP_CONFIRM) return true;
  const answer = await question(`${prompt} [y/N] `);
  return answer.toLowerCase() === 'y';
};

// Run command with full PTY (interactive + capture output)
const runPty = (cmd, cmdArgs) => {
  return new Promise((resolve) => {
    const ptyProcess = pty.spawn(cmd, cmdArgs, {
      name: 'xterm-color',
      cols: process.stdout.columns || 80,
      rows: process.stdout.rows || 30,
      cwd: process.cwd(),
      env: process.env,
    });

    let output = '';

    ptyProcess.onData((data) => {
      process.stdout.write(data);
      output += data;
    });

    ptyProcess.onExit(({ exitCode }) => {
      resolve({ success: exitCode === 0, output });
    });

    // Forward stdin to pty
    process.stdin.setRawMode?.(true);
    process.stdin.resume();
    process.stdin.on('data', (data) => {
      ptyProcess.write(data.toString());
    });
  });
};

const runCommandCapture = (cmd, cmdArgs) => {
  try {
    const output = execSync([cmd, ...cmdArgs].join(' '), {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { success: true, output };
  } catch {
    return { success: false, output: '' };
  }
};

const getZeltjsPackages = () => {
  try {
    const output = execSync(
      `pnpm -r exec -- node -p "const p=require('./package.json'); p.private ? '' : p.name"`,
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] },
    );
    return output
      .split('\n')
      .filter((line) => line.startsWith(`${SCOPE}/`))
      .sort();
  } catch {
    return [];
  }
};

const getPrivatePackages = () => {
  try {
    const output = execSync(
      `pnpm -r exec -- node -p "const p=require('./package.json'); p.private && p.name?.startsWith('${SCOPE}/') ? p.name : ''"`,
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] },
    );
    return output
      .split('\n')
      .filter((line) => line.startsWith(`${SCOPE}/`))
      .sort();
  } catch {
    return [];
  }
};

const packageExistsOnNpm = (pkg) => {
  const { success } = runCommandCapture('npm', ['view', pkg, '--json']);
  return success;
};

const main = async () => {
  log('=== npm Trusted Publisher Setup ===');
  log(`Repository: ${REPO}`);
  log(`Workflow: ${WORKFLOW}`);
  log(`Scope: ${SCOPE}/*`);
  if (DRY_RUN) log('Mode: DRY-RUN');
  console.log();

  // ============================================================
  // Step 1: List packages (no auth required)
  // ============================================================
  log('Step 1: Listing packages...');
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
    console.log('  (none)');
  } else {
    for (const pkg of published) console.log(`  - ${pkg}`);
  }
  console.log();

  console.log(`Not on npm (${notOnNpm.length} packages):`);
  if (notOnNpm.length === 0) {
    console.log('  (none)');
  } else {
    for (const pkg of notOnNpm) console.log(`  - ${pkg}`);
  }
  console.log();

  console.log(`Private (${privatePackages.length} packages):`);
  if (privatePackages.length === 0) {
    console.log('  (none)');
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
    if (!(await confirm('Step 2: Check trusted publisher status? (requires 2FA)'))) {
      log('Aborted.');
      rl.close();
      process.exit(0);
    }
    console.log();

    log('Step 2: Checking trusted publisher status...');
    log('NOTE: 2FA authentication will be required for each package.');
    console.log();

    for (const pkg of published) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`Checking: ${pkg}`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

      // Run with full PTY for interactive 2FA
      const { success, output } = await runPty('npm', ['trust', 'list', pkg]);

      // Clean ANSI escape sequences and check if configured
      // biome-ignore lint/suspicious/noControlCharactersInRegex: needed for ANSI escape removal
      const cleanOutput = output.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
      const isConfigured = success && /type:\s*github/i.test(cleanOutput);

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
    log('Nothing to configure. All packages are already set up.');
    rl.close();
    process.exit(0);
  }

  log(`${toProcess.length} packages to configure.`);
  console.log();

  if (!(await confirm('Step 3: Setup trusted publishers? (requires 2FA)'))) {
    log('Aborted.');
    rl.close();
    process.exit(0);
  }
  console.log();

  if (!DRY_RUN) {
    log('NOTE: 2FA authentication will be required for each package.');
    console.log();
  }

  let processed = 0;
  let failed = 0;

  for (const pkg of needsSetup) {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    log(`Processing: ${pkg}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    log('  → Package exists on npm');
    log('  → Setting up trusted publisher...');

    if (DRY_RUN) {
      log(
        `  [DRY-RUN] Would run: npm trust github "${pkg}" --repository "${REPO}" --file "${WORKFLOW}" --yes`,
      );
      processed++;
    } else {
      const { success } = await runPty('npm', [
        'trust',
        'github',
        pkg,
        '--repository',
        REPO,
        '--file',
        WORKFLOW,
        '--yes',
      ]);
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
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    log(`Processing: ${pkg}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    log('  → Creating placeholder package...');
    if (DRY_RUN) {
      log(`  [DRY-RUN] Would run: npx setup-npm-trusted-publish "${pkg}"`);
    } else {
      await runPty('npx', ['setup-npm-trusted-publish', pkg]);
    }

    log('  → Setting up trusted publisher...');
    if (DRY_RUN) {
      log(
        `  [DRY-RUN] Would run: npm trust github "${pkg}" --repository "${REPO}" --file "${WORKFLOW}" --yes`,
      );
      processed++;
    } else {
      const { success } = await runPty('npm', [
        'trust',
        'github',
        pkg,
        '--repository',
        REPO,
        '--file',
        WORKFLOW,
        '--yes',
      ]);
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
  log('=== Complete ===');
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
