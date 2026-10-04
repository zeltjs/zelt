import assert from 'node:assert/strict';
import { test } from 'node:test';
import { transformSync } from '@swc/core';
import { rolldown } from 'rolldown';
import { annotateClassDecorators } from './pure-class-decorators.mjs';

const id = '/repo/packages/core/src/built-in-service/logger/logger.service.ts';
const compile = (source) => transformSync(source, {
  jsc: { parser: { syntax: 'typescript', decorators: true }, transform: { legacyDecorator: true }, target: 'es2020' },
}).code;

test('marks audited internal registration and its factories as pure', () => {
  const result = annotateClassDecorators(compile('@Injectable() export class LoggerService {}'), id);
  assert.match(result.code, /LoggerService = \/\* @__PURE__ \*\/ _ts_decorate/);
  assert.ok(result.map.mappings.length > 0);
});

test('does not mark consumer classes or feature decorators as pure', () => {
  const code = compile('@Injectable() export class UserService {}');
  assert.equal(annotateClassDecorators(code, '/consumer/src/service.ts'), null);
  assert.equal(annotateClassDecorators(code, '/repo/packages/core/src/features/http/controller.ts'), null);
});

test('rejects an unknown decorator on an audited built-in', () => {
  assert.throws(() => annotateClassDecorators(compile('@RegisterGlobally() export class LoggerService {}'), id), /Unaudited decorator/);
});

test('rejects member registration rather than treating it as class-local registration', () => {
  assert.throws(() => annotateClassDecorators('C = _ts_decorate([Config], C.prototype, "method", null);', id), /Unaudited decorator/);
});

test('preserves class identity and registration when its value is retained', () => {
  const code = compile(`
    const registrations = new WeakSet();
    const Injectable = () => (cls) => { registrations.add(cls); return cls; };
    @Injectable() class LoggerService {}
    globalThis.__retainedClassTest = [LoggerService, registrations.has(LoggerService)];
  `);
  const result = annotateClassDecorators(code, id);
  new Function(result.code)();
  try {
    const [cls, registered] = globalThis.__retainedClassTest;
    assert.equal(cls.name, 'LoggerService');
    assert.equal(registered, true);
  } finally { delete globalThis.__retainedClassTest; }
});

test('annotation positions remain correct after Unicode source text', () => {
  const result = annotateClassDecorators('/* 日本語 */\nclass C {}\nC = _ts_decorate([Config], C);', id);
  assert.match(result.code, /C = \/\* @__PURE__ \*\/ _ts_decorate\(\[Config\], class C \{\}\);/);
});


test('bundling removes unused registration and preserves retained class metadata', async () => {
  const source = compile(`
    const registrations = new WeakSet();
    const Injectable = () => (cls) => { registrations.add(cls); return cls; };
    @Injectable() class UnusedService {}
    @Injectable() class RetainedService { child() { return new RetainedService(); } }
    export const result = [RetainedService, registrations.has(RetainedService)];
  `);
  const transformed = annotateClassDecorators(source, id);
  const bundle = await rolldown({
    input: id,
    plugins: [{ name: 'fixture', resolveId: () => id, load: () => transformed.code }],
  });
  try {
    const { output } = await bundle.generate({ format: 'esm' });
    assert.doesNotMatch(output[0].code, /UnusedService/);
    const { result: [cls, registered] } = await import(`data:text/javascript;base64,${Buffer.from(output[0].code).toString('base64')}`);
    assert.equal(registered, true);
    assert.ok(new cls().child() instanceof cls);
  } finally {
    await bundle.close();
  }
});


test('rejects self-referencing metadata whose initialization order would change', () => {
  assert.throws(() => annotateClassDecorators(
    'class C {}\nC = _ts_decorate([_ts_metadata("design:paramtypes", [C])], C);', id,
  ), /Self-referencing decorator metadata/);
});
