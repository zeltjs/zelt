import { dirname, isAbsolute, relative, resolve } from 'node:path';

import type { InferOutput } from 'valibot';
import {
  array,
  boolean,
  literal,
  number,
  object,
  record,
  safeParse,
  string,
  union,
  variant,
} from 'valibot';

import { compileGlobs } from './glob.lib';

const ExportReferenceSchema = object({
  filePath: string(),
  exportName: string(),
});

const StringInputSchema = union([
  object({ kind: literal('literal'), value: string() }),
  object({ kind: literal('argument'), index: number() }),
]);

const TestScopeConfigSchema = object({
  files: array(string()),
  category: union([literal('unit'), literal('e2e'), literal('unclassified')]),
});

const PluginConfigSchema = variant('id', [
  object({
    id: literal('zelt'),
    applications: array(object({ id: string(), app: ExportReferenceSchema })),
    setupFiles: array(string()),
    setupDetails: boolean(),
    timeoutMs: number(),
  }),
  object({
    id: literal('vitest'),
    scopes: array(TestScopeConfigSchema),
    globals: boolean(),
    cases: union([literal('serial'), literal('concurrent'), literal('unknown')]),
    hooks: union([literal('stack'), literal('list'), literal('parallel'), literal('unknown')]),
  }),
  object({ id: literal('valibot') }),
  object({ id: literal('drizzle') }),
  object({
    id: literal('http-requests'),
    scopes: array(TestScopeConfigSchema),
    applications: array(
      object({ id: string(), factory: ExportReferenceSchema, resultPath: array(string()) }),
    ),
    helpers: array(
      object({
        function: ExportReferenceSchema,
        applicationArgument: number(),
        method: StringInputSchema,
        path: StringInputSchema,
      }),
    ),
  }),
]);

const ColumnSchema = object({
  id: string(),
  label: string(),
  width: number(),
  initiallyHidden: boolean(),
});

const PresentationConfigSchema = object({
  id: string(),
  columns: array(ColumnSchema),
  rules: array(object({ files: array(string()), columnId: string() })),
  fallbackColumnId: string(),
});

// 設計書 付録C の Feature に 'declarations' は無いが、ec-backend.extract.json の
// required が provider:'ts' / feature:'declarations' を要求するため受け入れる。
const FeatureSchema = union([
  literal('declarations'),
  literal('meanings'),
  literal('relations'),
  literal('hints'),
  literal('setup'),
  literal('routes'),
  literal('di'),
  literal('tests'),
  literal('test-setups'),
  literal('requests'),
  literal('unit-associations'),
  literal('e2e-associations'),
]);

export const ExtractConfigSchema = object({
  version: literal(1),
  project: object({ id: string(), name: string() }),
  root: string(),
  tsconfig: string(),
  include: array(string()),
  exclude: array(string()),
  mapPackages: array(object({ package: string(), exports: array(string()) })),
  ignore: array(object({ package: string(), exports: array(string()) })),
  sourceText: array(string()),
  sourceModules: record(string(), string()),
  plugins: array(PluginConfigSchema),
  presentation: PresentationConfigSchema,
  required: array(object({ provider: string(), feature: FeatureSchema })),
  output: string(),
});

export type ExtractConfig = InferOutput<typeof ExtractConfigSchema>;
export type Feature = InferOutput<typeof FeatureSchema>;
/** module の export 1件。runtime が返す ClassSource と同じ形 */
export type ExportReference = Readonly<InferOutput<typeof ExportReferenceSchema>>;

export type ConfigIssue = { readonly path: string; readonly message: string };

export type ResolvedConfig = {
  readonly raw: ExtractConfig;
  readonly configFile: string;
  /** absolute project root */
  readonly root: string;
  readonly tsconfig: string;
  readonly output: string;
  /** package specifier -> absolute module file */
  readonly sourceModules: Readonly<Record<string, string>>;
  readonly isIncluded: (relPath: string) => boolean;
  readonly isSourceTextAllowed: (relPath: string) => boolean;
  readonly columnIdFor: (relPath: string) => string;
};

const issue = (path: string, message: string): ConfigIssue => ({ path, message });

const duplicateIssues = <T>(
  items: readonly T[],
  keyOf: (item: T) => string,
  path: string,
  label: string,
): ConfigIssue[] => {
  const seen = new Set<string>();
  const issues: ConfigIssue[] = [];
  for (const item of items) {
    const key = keyOf(item);
    if (seen.has(key)) issues.push(issue(path, `duplicate ${label}: ${key}`));
    seen.add(key);
  }
  return issues;
};

const columnReferenceIssues = (config: ExtractConfig): ConfigIssue[] => {
  const columnIds = new Set(config.presentation.columns.map((column) => column.id));
  const issues: ConfigIssue[] = [];
  for (const [i, rule] of config.presentation.rules.entries()) {
    if (!columnIds.has(rule.columnId)) {
      issues.push(issue(`presentation.rules[${i}]`, `unknown column id: ${rule.columnId}`));
    }
  }
  if (!columnIds.has(config.presentation.fallbackColumnId)) {
    issues.push(
      issue(
        'presentation.fallbackColumnId',
        `unknown column id: ${config.presentation.fallbackColumnId}`,
      ),
    );
  }
  return issues;
};

// 報告順は「列の重複 → 列参照 → plugin の重複 → package の重複」に固定する
const structuralIssues = (config: ExtractConfig): ConfigIssue[] => [
  ...duplicateIssues(
    config.presentation.columns,
    (column) => column.id,
    'presentation.columns',
    'column id',
  ),
  ...columnReferenceIssues(config),
  ...duplicateIssues(config.plugins, (plugin) => plugin.id, 'plugins', 'plugin id'),
  ...duplicateIssues(config.mapPackages, (entry) => entry.package, 'mapPackages', 'package'),
];

export type ConfigResult =
  | { ok: true; readonly config: ResolvedConfig }
  | { ok: false; readonly issues: readonly ConfigIssue[] };

const toPosix = (path: string): string => path.replaceAll('\\', '/');

/**
 * Validate a parsed `*.extract.json` and resolve every path against the config file.
 * Pure: no filesystem access, so the caller owns reading the file.
 */
export const resolveExtractConfig = (raw: unknown, configFile: string): ConfigResult => {
  const parsed = safeParse(ExtractConfigSchema, raw);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.issues.map((i) =>
        issue((i.path ?? []).map((p) => String(p.key)).join('.'), i.message),
      ),
    };
  }
  const config = parsed.output;
  const structural = structuralIssues(config);
  if (structural.length > 0) return { ok: false, issues: structural };

  const configDir = dirname(resolve(configFile));
  const root = resolve(configDir, config.root);
  const output = resolve(root, config.output);
  if (relative(root, output).startsWith('..') || isAbsolute(relative(root, output))) {
    return { ok: false, issues: [issue('output', 'output must stay inside root')] };
  }

  const includeMatch = compileGlobs(config.include);
  const excludeMatch = compileGlobs(config.exclude);
  const sourceTextMatch = compileGlobs(config.sourceText);
  const rules = config.presentation.rules.map((rule) => ({
    match: compileGlobs(rule.files),
    columnId: rule.columnId,
  }));

  const sourceModules: Record<string, string> = {};
  for (const [specifier, modulePath] of Object.entries(config.sourceModules)) {
    sourceModules[specifier] = resolve(root, modulePath);
  }

  return {
    ok: true,
    config: {
      raw: config,
      configFile: resolve(configFile),
      root,
      tsconfig: resolve(root, config.tsconfig),
      output,
      sourceModules,
      isIncluded: (relPath) => includeMatch(toPosix(relPath)) && !excludeMatch(toPosix(relPath)),
      isSourceTextAllowed: (relPath) => sourceTextMatch(toPosix(relPath)),
      columnIdFor: (relPath) =>
        rules.find((rule) => rule.match(toPosix(relPath)))?.columnId ??
        config.presentation.fallbackColumnId,
    },
  };
};
