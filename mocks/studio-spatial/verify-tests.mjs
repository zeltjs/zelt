import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';

export function verifyTestsModel(fixture, model, root, ok, equal) {
  const calls = (node) => {
    const found = [];
    function visit(item) {
      if (ts.isCallExpression(item)) found.push(item);
      ts.forEachChild(item, visit);
    }
    visit(node);
    return found;
  };
  for (const [kind, file] of [
    ['unit', fixture.unitFile],
    ['e2e', fixture.e2eFile],
  ]) {
    const source = ts.createSourceFile(
      file,
      readFileSync(resolve(root, file), 'utf8'),
      ts.ScriptTarget.Latest,
      true,
    );
    const tests = calls(source).filter((call) => call.expression.getText() === 'it');
    equal(fixture[kind].length, tests.length, `${kind}: every test in declared fixture file`);
    for (const test of fixture[kind]) {
      const actual = tests.find(
        (call) => source.getLineAndCharacterOfPosition(call.getStart()).line + 1 === test.line,
      );
      equal(actual?.arguments[0].text, test.name, 'Test name and source line match');
      let parent = actual.parent;
      const suites = [];
      while (parent) {
        if (ts.isCallExpression(parent) && parent.expression.getText() === 'describe')
          suites.unshift(parent.arguments[0].text);
        parent = parent.parent;
      }
      equal(suites.join(' / '), test.suite, 'Describe provenance');
      if (kind === 'unit') {
        ok(
          calls(actual).some(
            (call) => call.expression.getText() === `jwtService.${test.target.split('.')[1]}`,
          ),
          'Unit directly invokes its target',
        );
        equal(test.target, `JwtService.${suites.at(-1)}`, 'Setup calls do not become test targets');
        equal(test.mocks.length, 0, 'No fabricated class mock');
        equal(test.style, 'Sociable', 'Real jose collaborator');
      } else {
        // Independent request oracle for this bounded fixture; no general extractor.
        const expected = new Set();
        for (const call of calls(actual)) {
          const expression = call.expression.getText();
          if (expression === 'createProduct') expected.add('ProductController.create');
          if (expression.endsWith('.http.request')) {
            const url = call.arguments[0].getText();
            expected.add(
              url.startsWith("'/api/products'") || url.startsWith("'/api/products?")
                ? 'ProductController.list'
                : 'ProductController.detail',
            );
          }
          if (expression === 'authRequest') {
            const method = call.arguments[2].text;
            ok(['PUT', 'DELETE'].includes(method), 'Fixture request method supported');
            expected.add(
              method === 'PUT' ? 'ProductController.update' : 'ProductController.remove',
            );
          }
        }
        equal(
          [...test.targets].sort(),
          [...expected].sort(),
          'Exact endpoint associations including preparation calls',
        );
        for (const target of test.targets)
          ok(
            model.roots.some((item) => item.id === target && item.kind === 'HTTP'),
            'E2E only links HTTP entries',
          );
      }
    }
  }
  console.log('PASS: 6 unit / 16 E2E test names, locations, targets and provenance.');
}

export async function verifyTestsBrowser(page, ok, equal) {
  const select = async (id) => {
    await page.locator('#search').fill(id);
    await page.locator(`[data-find="${id}"]`).click();
  };
  await select('CreateProductSchema');
  equal(
    await page.locator('.inspector-tabs button').allTextContents(),
    ['契約', '実コード'],
    'Only two inspector tabs',
  );
  equal(
    await page.locator('.unit-test, .e2e-test').count(),
    0,
    'Schema does not inherit HTTP tests',
  );
  ok(
    (await page.locator('#inspector').textContent()).includes('対応するUnit testなし'),
    'Known absent vs uncollected',
  );
  await select('JwtService.verify');
  equal(await page.locator('.unit-test').count(), 3, 'Only target method tests');
  equal(
    await page.locator('.test-style').allTextContents(),
    ['Sociable', 'Sociable', 'Sociable'],
    'Unit style visible',
  );
  await page.locator('.unit-test details summary').first().click();
  ok(await page.locator('.unit-test details[open]').isVisible(), 'Evidence can be opened');
  await select('JwtService');
  equal(await page.locator('.unit-test').count(), 6, 'Class aggregates all member test targets');
  await select('ProductController.create');
  equal(await page.locator('.e2e-test').count(), 6, 'Create includes test-body preparation POSTs');
  equal(await page.locator('.unit-test').count(), 0, 'E2E is not unit');
  await select('ProductController.detail');
  equal(await page.locator('.e2e-test').count(), 4, 'Detail includes deletion check request');
  await select('ProductController');
  equal(
    await page.locator('.endpoint-tests').count(),
    5,
    'Class aggregates endpoints without losing identity',
  );
  await select('OrderController.create');
  ok(
    (await page.locator('#inspector').textContent()).includes('未収録'),
    'Other E2E explicitly uncollected',
  );
  await page.locator('[data-tab="source"]').click();
  await page.keyboard.press('ArrowRight');
  equal(
    await page.locator('[data-tab="contract"]').getAttribute('aria-selected'),
    'true',
    'Two-tab wrapping',
  );
  await page.locator('[data-action="reset"]').click();
}
