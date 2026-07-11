#!/usr/bin/env node
import { glob, readFile } from 'node:fs/promises';
import { builtinModules } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ALL_NODE_BUILTINS = 'all';

const ENTRYPOINT_POLICIES = {
  '@zeltjs/adapter-node': { nodeBuiltins: ALL_NODE_BUILTINS },
  '@zeltjs/cli': {
    nodeBuiltins: ALL_NODE_BUILTINS,
    globals: ['__dirname', '__filename'],
  },
  '@zeltjs/cli/config': { nodeBuiltins: ALL_NODE_BUILTINS, globals: ['__filename'] },
  '@zeltjs/core': { nodeBuiltins: ['async_hooks'] },
  '@zeltjs/core/internal-bridge/testing': { nodeBuiltins: ['async_hooks'] },
  '@zeltjs/core/internal-bridge/errors': { nodeBuiltins: [] },
  '@zeltjs/decorator-metadata/inspect': {
    nodeBuiltins: ALL_NODE_BUILTINS,
    globals: ['__filename'],
  },
  '@zeltjs/eslint-plugin': { nodeBuiltins: ALL_NODE_BUILTINS },
  '@zeltjs/graphql/codegen': { nodeBuiltins: ALL_NODE_BUILTINS },
  '@zeltjs/hono-client': { nodeBuiltins: ALL_NODE_BUILTINS },
  '@zeltjs/openapi': { nodeBuiltins: ALL_NODE_BUILTINS },
  '@zeltjs/testing/node': { nodeBuiltins: ALL_NODE_BUILTINS },
};

const NODE_BUILTINS = new Set(
  builtinModules.map((moduleName) => moduleName.replace(/^node:/, '').split('/')[0]),
);

const IMPORT_EXPORT_RE = /\b(?:import|export)\s+(?:[^'"()]*?\s+from\s+)?['"]([^'"]+)['"]/g;
const DYNAMIC_IMPORT_RE = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
const REQUIRE_RE = /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
const IMPORT_META_RE = /\bimport\.meta\.(dirname|filename|path)\b/g;
const NODE_GLOBAL_RE = /\b(__dirname|__filename)\b/g;

const toPosix = (value) => value.split(path.sep).join('/');

const normalizeNodeBuiltin = (specifier) => {
  const withoutPrefix = specifier.startsWith('node:') ? specifier.slice('node:'.length) : specifier;
  const root = withoutPrefix.split('/')[0];
  return NODE_BUILTINS.has(root) ? root : undefined;
};

const readJson = async (file) => JSON.parse(await readFile(file, 'utf8'));

const publicSpecifier = (packageName, exportKey) =>
  exportKey === '.' ? packageName : `${packageName}/${exportKey.slice(2)}`;

const collectExportTargets = (exportValue) => {
  const targets = [];
  const visit = (value, condition) => {
    if (typeof value === 'string') {
      if (/\.(?:js|mjs|cjs)$/.test(value)) targets.push({ condition, target: value });
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, `${condition}[${index}]`));
      return;
    }
    if (!value || typeof value !== 'object') return;
    for (const [nextCondition, nextValue] of Object.entries(value)) {
      if (nextCondition === 'types') continue;
      const nestedCondition =
        nextCondition === 'default'
          ? condition
          : condition === 'default'
            ? nextCondition
            : `${condition}.${nextCondition}`;
      visit(nextValue, nestedCondition);
    }
  };
  visit(exportValue, 'default');
  return targets;
};

const resolveRelativeModule = (fileSet, fromFile, specifier) => {
  if (!specifier.startsWith('.')) return undefined;
  const base = path.resolve(path.dirname(fromFile), specifier);
  const candidates = [
    base,
    `${base}.js`,
    `${base}.mjs`,
    `${base}.cjs`,
    path.join(base, 'index.js'),
    path.join(base, 'index.mjs'),
    path.join(base, 'index.cjs'),
  ];
  return candidates.find((candidate) => fileSet.has(path.resolve(candidate)));
};

const findSpecifiers = (source) => {
  const specifiers = [];
  for (const re of [IMPORT_EXPORT_RE, DYNAMIC_IMPORT_RE, REQUIRE_RE]) {
    re.lastIndex = 0;
    for (const match of source.matchAll(re)) {
      if (match[1]) specifiers.push(match[1]);
    }
  }
  return specifiers;
};

const findViolations = (entrypoint, file, source) => {
  const policy = ENTRYPOINT_POLICIES[entrypoint] ?? { nodeBuiltins: [] };
  const allowedNodeBuiltins = policy.nodeBuiltins;
  const allowedGlobals =
    policy.globals === ALL_NODE_BUILTINS
      ? ALL_NODE_BUILTINS
      : new Set(policy.globals ?? []);
  const violations = [];

  for (const specifier of findSpecifiers(source)) {
    const builtin = normalizeNodeBuiltin(specifier);
    if (
      builtin &&
      allowedNodeBuiltins !== ALL_NODE_BUILTINS &&
      !allowedNodeBuiltins.includes(builtin)
    ) {
      violations.push({
        file,
        kind: 'node-builtin',
        value: specifier,
        message: `Node builtin "${specifier}" is not allowed for ${entrypoint}.`,
      });
    }
  }

  for (const match of source.matchAll(IMPORT_META_RE)) {
    violations.push({
      file,
      kind: 'import-meta-location',
      value: `import.meta.${match[1]}`,
      message: `Runtime location API import.meta.${match[1]} is not allowed for ${entrypoint}.`,
    });
  }

  for (const match of source.matchAll(NODE_GLOBAL_RE)) {
    if (allowedGlobals === ALL_NODE_BUILTINS || allowedGlobals.has(match[1])) continue;
    violations.push({
      file,
      kind: 'node-location-global',
      value: match[1],
      message: `Node location global ${match[1]} is not allowed for ${entrypoint}.`,
    });
  }

  return violations;
};

const traceReachableFiles = async (fileSet, entryFile) => {
  const reachable = new Set();
  const pending = [path.resolve(entryFile)];
  while (pending.length > 0) {
    const file = pending.pop();
    if (!file || reachable.has(file) || !fileSet.has(file)) continue;
    reachable.add(file);
    const source = await readFile(file, 'utf8');
    for (const specifier of findSpecifiers(source)) {
      const resolved = resolveRelativeModule(fileSet, file, specifier);
      if (resolved && !reachable.has(resolved)) pending.push(resolved);
    }
  }
  return reachable;
};

export const verifyRuntimeContracts = async ({ rootDir = process.cwd() } = {}) => {
  const allDistFiles = await Array.fromAsync(
    glob('packages/*/dist/**/*.{js,mjs,cjs}', { cwd: rootDir }),
  );
  const fileSet = new Set(allDistFiles.map((file) => path.resolve(rootDir, file)));
  const packageFiles = await Array.fromAsync(glob('packages/*/package.json', { cwd: rootDir }));
  const violations = [];
  const missingExportTargets = [];
  let checkedEntrypoints = 0;

  for (const relativePackageFile of packageFiles.sort()) {
    const packageFile = path.resolve(rootDir, relativePackageFile);
    const packageJson = await readJson(packageFile);
    const packageDir = path.dirname(packageFile);
    const exportsMap =
      typeof packageJson.exports === 'string' || Array.isArray(packageJson.exports)
        ? { '.': packageJson.exports }
        : (packageJson.exports ?? {});
    for (const [exportKey, exportValue] of Object.entries(exportsMap)) {
      const entrypoint = publicSpecifier(packageJson.name, exportKey);
      const targets = collectExportTargets(exportValue);
      for (const { condition, target } of targets) {
        const entryFile = path.resolve(packageDir, target);
        if (!fileSet.has(entryFile)) {
          missingExportTargets.push({ entrypoint, condition, file: entryFile, value: target });
          continue;
        }
        checkedEntrypoints++;
        const reachableFiles = await traceReachableFiles(fileSet, entryFile);
        for (const file of reachableFiles) {
          const source = await readFile(file, 'utf8');
          for (const violation of findViolations(entrypoint, file, source)) {
            violations.push({ entrypoint, condition, ...violation });
          }
        }
      }
    }
  }

  return { checkedEntrypoints, distFileCount: allDistFiles.length, missingExportTargets, violations };
};

const reportResult = (result, rootDir) => {
  const { checkedEntrypoints, distFileCount, missingExportTargets, violations } = result;
  if (distFileCount === 0) {
    console.error('No dist files found. Build packages before running runtime contract verification.');
    return false;
  }

  if (missingExportTargets.length === 0 && violations.length === 0) {
    if (checkedEntrypoints === 0) {
      console.error('No package export targets were checked. Verify package.json exports point to dist files.');
      return false;
    }
    console.log(`All ${checkedEntrypoints} export target(s) satisfy their dist runtime contracts.`);
    return true;
  }

  if (missingExportTargets.length > 0) {
    console.error('Missing dist export targets found:\n');
    for (const violation of missingExportTargets) {
      console.error(`- ${violation.entrypoint} (${violation.condition})`);
      console.error(`  ${toPosix(path.relative(rootDir, violation.file))}`);
      console.error(`  missing-dist-export-target: ${violation.value}`);
      console.error('  Build packages before running runtime contract verification.\n');
    }
  }

  if (violations.length > 0) {
    console.error('Dist runtime contract violations found:\n');
    for (const violation of violations) {
      console.error(`- ${violation.entrypoint} (${violation.condition})`);
      console.error(`  ${toPosix(path.relative(rootDir, violation.file))}`);
      console.error(`  ${violation.kind}: ${violation.value}`);
      console.error(`  ${violation.message}\n`);
    }
  }

  console.error(
    `${missingExportTargets.length} missing dist export target(s), ${violations.length} runtime violation(s) across ${checkedEntrypoints} checked export target(s).`,
  );
  return false;
};

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  const rootDir = process.cwd();
  const result = await verifyRuntimeContracts({ rootDir });
  if (!reportResult(result, rootDir)) process.exitCode = 1;
}
