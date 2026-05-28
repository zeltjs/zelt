import path from 'node:path';
import type { Rule } from 'eslint';

const DEFAULT_ALLOWED_FILES = ['index.ts', 'env.ts'];

const DEFAULT_ALLOWED_SUFFIXES = [
  'adaptor',
  'command',
  'config',
  'controller',
  'decorator',
  'error-handler',
  'errors',
  'exceptions',
  'formatter',
  'lib',
  'middleware',
  'module',
  'service',
  'transport',
  'types',
];

const rule: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Enforce double-dot file naming convention (e.g., foo.service.ts, bar.types.ts) with allowed suffixes',
    },
    messages: {
      missingDoubleDot:
        'File names must use double-dot naming (e.g., "foo.service.ts"). Found: "{{actualFile}}"',
      invalidSuffix:
        'File suffix "{{suffix}}" is not allowed. Use one of: {{allowedSuffixes}}. Found: "{{actualFile}}"',
    },
    schema: [
      {
        type: 'object',
        properties: {
          allowedFiles: {
            type: 'array',
            items: { type: 'string' },
            description: 'File names that are allowed without double-dot naming (e.g., "main.ts", "cli.ts")',
          },
          allowedPatterns: {
            type: 'array',
            items: { type: 'string' },
            description: 'Glob patterns for files allowed without double-dot naming (e.g., "on-*.ts")',
          },
          allowedSuffixes: {
            type: 'array',
            items: { type: 'string' },
            description: 'Additional suffixes to allow (merged with defaults)',
          },
        },
        additionalProperties: false,
      },
    ],
  },

  create(context) {
    const filename = context.filename;
    const basename = path.basename(filename);
    const options = (context.options[0] ?? {}) as {
      allowedFiles?: string[];
      allowedPatterns?: string[];
      allowedSuffixes?: string[];
    };

    const allowedFiles = new Set([...DEFAULT_ALLOWED_FILES, ...(options.allowedFiles ?? [])]);
    const allowedPatterns = options.allowedPatterns ?? [];
    const allowedSuffixes = new Set([...DEFAULT_ALLOWED_SUFFIXES, ...(options.allowedSuffixes ?? [])]);

    if (basename.endsWith('.test.ts') || basename.endsWith('.d.ts')) {
      return {};
    }

    if (allowedFiles.has(basename)) {
      return {};
    }

    for (const pattern of allowedPatterns) {
      if (matchGlobPattern(basename, pattern)) {
        return {};
      }
    }

    const dotCount = (basename.match(/\./g) ?? []).length;
    if (dotCount < 2) {
      return {
        Program(node) {
          context.report({
            node,
            messageId: 'missingDoubleDot',
            data: { actualFile: basename },
          });
        },
      };
    }

    const suffix = extractSuffix(basename);
    if (suffix && !allowedSuffixes.has(suffix)) {
      return {
        Program(node) {
          context.report({
            node,
            messageId: 'invalidSuffix',
            data: {
              suffix,
              allowedSuffixes: [...allowedSuffixes].sort().join(', '),
              actualFile: basename,
            },
          });
        },
      };
    }

    return {};
  },
};

function extractSuffix(filename: string): string | null {
  const withoutExt = filename.replace(/\.ts$/, '');
  const parts = withoutExt.split('.');
  if (parts.length >= 2) {
    return parts[parts.length - 1] ?? null;
  }
  return null;
}

function matchGlobPattern(filename: string, pattern: string): boolean {
  const regex = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`^${regex}$`).test(filename);
}

export default rule;
