import { describe, expect, it } from 'vitest';
import { ZeltAppConfigurationError } from '../../../kernel';
import { cliSchema, cliUnion } from './command-schema.lib';
import { formatCommandHelp } from './format-command-help.lib';

describe('help derived from command schemas', () => {
  it('shows required options, aliases, types, descriptions, and defaults', () => {
    const schema = cliSchema({
      args: [
        { name: 'source', type: 'string' },
        { name: 'count', type: 'number', optional: true },
      ],
      options: [
        { name: 'guide', type: 'string', required: true, alias: 'g', description: 'Guide file' },
        { name: 'port', type: 'number', default: 3000 },
        { name: 'verbose', type: 'boolean' },
      ],
    });
    const help = formatCommandHelp('check', schema);
    expect(help).toContain('check <source> [count] --guide <guide> [--port <port>] [--verbose]');
    expect(help).toContain('--guide, -g (string, required)');
    expect(help).toContain('Guide file');
    expect(help).toContain('default: 3000');
    expect(help).toContain('default: false');
    expect(help).toContain('[count] (number, optional)');
  });

  it('shows each union usage and its options separately', () => {
    const schema = cliUnion([
      cliSchema({ options: [{ name: 'snapshot', type: 'string', required: true }] }),
      cliSchema({
        args: [{ name: 'directories', type: 'string', variadic: { min: 0 } }],
        options: [{ name: 'base', type: 'string' }],
      }),
      cliSchema({
        options: [
          { name: 'config', type: 'string', required: true },
          { name: 'base', type: 'string' },
        ],
      }),
    ]);
    const help = formatCommandHelp('serve', schema);
    expect(help).toContain(
      '  serve --snapshot <snapshot>\n  serve [directories...] [--base <base>]\n  serve --config <config> [--base <base>]',
    );
    const snapshotDetails = help.split('Alternative 1:')[1]?.split('Alternative 2:')[0];
    expect(snapshotDetails).toContain('--snapshot');
    expect(snapshotDetails).not.toContain('--base');
  });

  it('shows bounded required variadic arguments and their count', () => {
    const help = formatCommandHelp(
      'analyze',
      cliSchema({
        args: [
          {
            name: 'directories',
            type: 'string',
            variadic: { min: 1, max: 3 },
            description: 'Input directories',
          },
        ],
      }),
    );
    expect(help).toContain('analyze <directories...>');
    expect(help).toContain('1 to 3 values');
    expect(help).toContain('Input directories');
  });

  it('does not display false as a default for a required boolean flag', () => {
    const help = formatCommandHelp(
      'confirm',
      cliSchema({ options: [{ name: 'confirm', type: 'boolean', required: true }] }),
    );
    expect(help).toContain('confirm --confirm');
    expect(help).not.toContain('default:');
  });

  it('rejects invalid dynamically supplied schemas', () => {
    expect(() => formatCommandHelp('probe', { kind: 'union', schemas: [] })).toThrow(
      ZeltAppConfigurationError,
    );
  });
});
