import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import {
  ZeltDuplicatePrebuiltContributionError,
  ZeltInvalidPrebuiltContributionError,
} from './cli.errors';
import type { PrebuiltContribution } from './config/config.types';
import { GENERATED_FILE_HEADER_MARKER } from './outputs-ledger.lib';

const IDENTIFIER_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const RELATIVE_IMPORT_PATH_RE = /^\.\.?\/[\w\-./]+$/;
const MAX_CONTROL_CHAR_CODE = 0x1f;

const hasControlCharacter = (value: string): boolean => {
  for (let i = 0; i < value.length; i += 1) {
    if (value.charCodeAt(i) <= MAX_CONTROL_CHAR_CODE) return true;
  }
  return false;
};

/** @throws {ZeltInvalidPrebuiltContributionError} */
const assertIdentifier = (field: 'feature' | 'exportName', value: string): void => {
  if (!IDENTIFIER_RE.test(value)) {
    throw new ZeltInvalidPrebuiltContributionError({ field, value });
  }
};

/** @throws {ZeltInvalidPrebuiltContributionError} */
const assertImportPath = (value: string): void => {
  if (!RELATIVE_IMPORT_PATH_RE.test(value)) {
    throw new ZeltInvalidPrebuiltContributionError({ field: 'importPath', value });
  }
};

/** @throws {ZeltInvalidPrebuiltContributionError} */
const assertKey = (value: string): void => {
  if (value.length === 0 || hasControlCharacter(value)) {
    throw new ZeltInvalidPrebuiltContributionError({ field: 'key', value });
  }
};

/** @throws {ZeltInvalidPrebuiltContributionError} */
const assertContribution = (contribution: PrebuiltContribution): void => {
  assertIdentifier('feature', contribution.feature);
  assertIdentifier('exportName', contribution.exportName);
  assertImportPath(contribution.importPath);
  assertKey(contribution.key);
};

const contributionsEqual = (a: PrebuiltContribution, b: PrebuiltContribution): boolean =>
  a.feature === b.feature &&
  a.key === b.key &&
  a.importPath === b.importPath &&
  a.exportName === b.exportName;

// Mounting the same feature child at multiple locations produces identical
// contributions; only a genuine (feature, key) collision with differing
// fields is an error.
/** @throws {ZeltDuplicatePrebuiltContributionError} */
const dedupeContributions = (
  contributions: readonly PrebuiltContribution[],
): readonly PrebuiltContribution[] => {
  const byId = new Map<string, PrebuiltContribution>();
  const deduped: PrebuiltContribution[] = [];
  for (const contribution of contributions) {
    const id = `${contribution.feature}:${contribution.key}`;
    const existing = byId.get(id);
    if (existing === undefined) {
      byId.set(id, contribution);
      deduped.push(contribution);
      continue;
    }
    if (!contributionsEqual(existing, contribution)) {
      throw new ZeltDuplicatePrebuiltContributionError({
        feature: contribution.feature,
        key: contribution.key,
      });
    }
  }
  return deduped;
};

const escapeSingleQuoted = (value: string): string =>
  `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

type ResolvedEntry = {
  readonly feature: string;
  readonly key: string;
  readonly importPath: string;
  readonly exportName: string;
  readonly alias: string;
};

const sortContributions = (
  contributions: readonly PrebuiltContribution[],
): readonly PrebuiltContribution[] =>
  [...contributions].sort((a, b) => {
    if (a.feature !== b.feature) return a.feature < b.feature ? -1 : 1;
    return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
  });

const resolveEntries = (contributions: readonly PrebuiltContribution[]): readonly ResolvedEntry[] =>
  sortContributions(contributions).map((contribution, index) => ({
    ...contribution,
    alias: `p${index}`,
  }));

const groupByFeature = (
  entries: readonly ResolvedEntry[],
): readonly (readonly ResolvedEntry[])[] => {
  const groups: ResolvedEntry[][] = [];
  for (const entry of entries) {
    const currentGroup = groups[groups.length - 1];
    if (currentGroup !== undefined && currentGroup[0]?.feature === entry.feature) {
      currentGroup.push(entry);
    } else {
      groups.push([entry]);
    }
  }
  return groups;
};

const buildModuleSource = (contributions: readonly PrebuiltContribution[]): string => {
  const entries = resolveEntries(contributions);
  const groups = groupByFeature(entries);

  const importLines = entries.map(
    (entry) =>
      `import { ${entry.exportName} as ${entry.alias} } from ${escapeSingleQuoted(entry.importPath)};`,
  );

  const featureLines = groups.flatMap((group) => {
    const feature = group[0]?.feature;
    const keyLines = group.map(
      (entry) => `      ${escapeSingleQuoted(entry.key)}: ${entry.alias},`,
    );
    return [`    ${feature}: {`, ...keyLines, `    },`];
  });

  const lines = [
    `// ${GENERATED_FILE_HEADER_MARKER}`,
    "import type { ZeltPrebuilt } from '@zeltjs/core';",
    ...importLines,
    'export const zeltPrebuilt = {',
    '  version: 1,',
    '  features: {',
    ...featureLines,
    '  },',
    '} satisfies ZeltPrebuilt;',
    '',
  ];

  return lines.join('\n');
};

const writeIfChanged = async (path: string, content: string): Promise<boolean> => {
  if (existsSync(path)) {
    const existing = await readFile(path, 'utf8');
    if (existing === content) return false;
  }
  await writeFile(path, content, 'utf8');
  return true;
};

export type WritePrebuiltModuleResult = {
  readonly changed: boolean;
};

/** @throws {ZeltInvalidPrebuiltContributionError | ZeltDuplicatePrebuiltContributionError} */
export const writePrebuiltModule = async (
  cwd: string,
  contributions: readonly PrebuiltContribution[],
): Promise<WritePrebuiltModuleResult> => {
  for (const contribution of contributions) {
    assertContribution(contribution);
  }
  const deduped = dedupeContributions(contributions);

  const outPath = join(cwd, '.zelt', 'prebuilt.ts');
  await mkdir(dirname(outPath), { recursive: true });
  const changed = await writeIfChanged(outPath, buildModuleSource(deduped));
  return { changed };
};
