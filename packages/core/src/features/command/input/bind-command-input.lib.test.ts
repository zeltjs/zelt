import { describe, expect, it } from 'vitest';
import { bindCommandInput } from './bind-command-input.lib';
import { cliSchema } from './command-schema.types';

describe('bindCommandInput', () => {
  describe('empty schema', () => {
    it('returns empty object for empty schema', () => {
      const result = bindCommandInput([], cliSchema({}));
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.parsed).toEqual({});
    });
  });

  describe('positional args', () => {
    it('extracts positional string args in order', () => {
      const schema = cliSchema({ args: [{ name: 'target', type: 'string' }] });
      const result = bindCommandInput(['hello'], schema);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.parsed['target']).toBe('hello');
    });

    it('extracts multiple positional args', () => {
      const schema = cliSchema({
        args: [
          { name: 'source', type: 'string' },
          { name: 'dest', type: 'string' },
        ],
      });
      const result = bindCommandInput(['a.txt', 'b.txt'], schema);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.parsed['source']).toBe('a.txt');
        expect(result.parsed['dest']).toBe('b.txt');
      }
    });

    it('converts number args', () => {
      const schema = cliSchema({ args: [{ name: 'count', type: 'number' }] });
      const result = bindCommandInput(['42'], schema);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.parsed['count']).toBe(42);
    });

    it('returns error for invalid number', () => {
      const schema = cliSchema({ args: [{ name: 'count', type: 'number' }] });
      const result = bindCommandInput(['not-a-number'], schema);
      expect(result.ok).toBe(false);
    });

    it('handles optional args as undefined when missing', () => {
      const schema = cliSchema({
        args: [{ name: 'target', type: 'string', optional: true }],
      });
      const result = bindCommandInput([], schema);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.parsed['target']).toBeUndefined();
    });

    it('returns error for missing required arg', () => {
      const schema = cliSchema({
        args: [{ name: 'target', type: 'string' }],
      });
      const result = bindCommandInput([], schema);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain('Missing required argument: target');
    });
  });

  describe('options', () => {
    it('parses boolean options', () => {
      const schema = cliSchema({ options: [{ name: 'verbose', type: 'boolean' }] });
      const result = bindCommandInput(['--verbose'], schema);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.parsed['verbose']).toBe(true);
    });

    it('defaults boolean to false when not specified', () => {
      const schema = cliSchema({ options: [{ name: 'verbose', type: 'boolean' }] });
      const result = bindCommandInput([], schema);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.parsed['verbose']).toBe(false);
    });

    it('parses string options', () => {
      const schema = cliSchema({ options: [{ name: 'name', type: 'string' }] });
      const result = bindCommandInput(['--name', 'alice'], schema);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.parsed['name']).toBe('alice');
    });

    it('parses number options', () => {
      const schema = cliSchema({ options: [{ name: 'port', type: 'number' }] });
      const result = bindCommandInput(['--port', '3000'], schema);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.parsed['port']).toBe(3000);
    });

    it('applies default values for string options', () => {
      const schema = cliSchema({
        options: [{ name: 'env', type: 'string', default: 'development' }],
      });
      const result = bindCommandInput([], schema);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.parsed['env']).toBe('development');
    });

    it('applies default values for number options', () => {
      const schema = cliSchema({ options: [{ name: 'port', type: 'number', default: 3000 }] });
      const result = bindCommandInput([], schema);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.parsed['port']).toBe(3000);
    });

    it('applies default values for boolean options', () => {
      const schema = cliSchema({ options: [{ name: 'debug', type: 'boolean', default: true }] });
      const result = bindCommandInput([], schema);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.parsed['debug']).toBe(true);
    });

    it('parses alias options', () => {
      const schema = cliSchema({ options: [{ name: 'verbose', type: 'boolean', alias: 'v' }] });
      const result = bindCommandInput(['-v'], schema);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.parsed['verbose']).toBe(true);
    });

    it('returns undefined for unspecified string options without default', () => {
      const schema = cliSchema({ options: [{ name: 'name', type: 'string' }] });
      const result = bindCommandInput([], schema);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.parsed['name']).toBeUndefined();
    });
  });

  describe('mixed args and options', () => {
    it('parses both positional args and options', () => {
      const schema = cliSchema({
        args: [{ name: 'target', type: 'string' }],
        options: [
          { name: 'verbose', type: 'boolean', alias: 'v' },
          { name: 'port', type: 'number', default: 8080 },
        ],
      });
      const result = bindCommandInput(['hello', '-v', '--port', '3000'], schema);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.parsed['target']).toBe('hello');
        expect(result.parsed['verbose']).toBe(true);
        expect(result.parsed['port']).toBe(3000);
      }
    });
  });
});
