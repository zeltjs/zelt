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
  const sourceFile = (file) =>
    ts.createSourceFile(
      file,
      readFileSync(resolve(root, file), 'utf8'),
      ts.ScriptTarget.Latest,
      true,
    );
  const setup = fixture.setups.JwtService;
  const setupCall = calls(sourceFile(fixture.unitFile)).find(
    (call) => call.expression.getText() === 'createTestTarget',
  );
  equal(
    setup.targetClass,
    setupCall.arguments[0].getText(),
    'Zelt target class from setup argument',
  );
  const options = setupCall.arguments[1];
  const option = (name) =>
    options.properties.find((item) => item.name.getText() === name)?.initializer;
  equal(
    [...setup.configs],
    option('configs').elements.map((item) => item.getText()),
    'Config registration from Zelt options',
  );
  const overrideOption = option('overrides');
  const overrides = overrideOption
    ? overrideOption.elements.map((item) => ({
        provide: item.properties
          .find((property) => property.name.getText() === 'provide')
          .initializer.getText(),
        useValue: item.properties
          .find((property) => property.name.getText() === 'useValue')
          .initializer.getText(),
      }))
    : [];
  equal(
    JSON.parse(JSON.stringify(setup.overrides)),
    overrides,
    'Mock facts match actual Zelt overrides',
  );
  const config = sourceFile('packages/auth-jwt/src/jwt.config.ts').statements.find(
    (item) => ts.isClassDeclaration(item) && item.name.text === 'JwtConfig',
  );
  ok(
    ts.getDecorators(config).some((item) => item.expression.getText() === 'Config'),
    'Config role verified from decorator',
  );
  const injections = calls(sourceFile('packages/auth-jwt/src/jwt.service.ts')).filter(
    (call) => call.expression.getText() === 'inject',
  );
  equal(
    injections.map((call) => call.arguments[0].getText()),
    ['JwtConfig'],
    'Complete DI inputs of fixture class (not its library imports)',
  );
  equal(
    JSON.parse(JSON.stringify(setup.dependencies)),
    [{ provide: config.name.text, kind: 'config' }],
    'Setup dependencies match actual DI tokens and roles',
  );

  const summary = (data) => JSON.parse(JSON.stringify(fixture.summarizeSetup(data)));
  const cases = [
    [[], [], 'Solitary', []],
    [[{ provide: 'Settings', kind: 'config' }], [], 'Solitary', []],
    [[{ provide: 'Repo', kind: 'service' }], [], 'Sociable', []],
    [
      [{ provide: 'Repo', kind: 'service' }],
      [{ provide: 'Repo', useValue: 'mockRepo' }],
      'Solitary',
      ['Repo'],
    ],
    [
      [
        { provide: 'Repo', kind: 'service' },
        { provide: 'Mail', kind: 'service' },
      ],
      [{ provide: 'Repo', useValue: 'mockRepo' }],
      'Sociable',
      ['Repo'],
    ],
    [
      [{ provide: 'Repo', kind: 'service' }],
      [{ provide: 'Unused', useValue: 'mockUnused' }],
      'Sociable',
      ['Unused'],
    ],
  ];
  for (const [dependencies, overrides, style, mocks] of cases) {
    const input = { resolved: true, dependencies, overrides, configs: ['TestConfig'] };
    const before = JSON.stringify(input);
    equal(
      summary(input),
      { style, mocks },
      'Classify real/overridden/absent DI service dependencies',
    );
    equal(JSON.stringify(input), before, 'Classification preserves input facts');
  }
  equal(
    summary({ resolved: false }),
    { style: null, mocks: null },
    'Unresolved facts never become no mocks',
  );
  equal(
    summary({ ...setup, imports: ['jose', 'other-library'] }),
    summary(setup),
    'Library imports cannot affect Zelt classification',
  );
  equal(
    summary({ ...setup, overrides: [{ provide: 'Repo' }, { provide: 'Repo' }] }).mocks,
    ['Repo'],
    'Unique provided class names',
  );
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
        equal(test.setup, setup.targetClass, 'Test uses the verified Zelt setup');
        equal(
          summary(fixture.setups[test.setup]),
          { style: 'Solitary', mocks: [] },
          'Config-only target is Solitary under Zelt DI criterion',
        );
        ok(
          !('style' in test) && !('mocks' in test) && !('evidence' in test),
          'No stored classifications or narrative judgments',
        );
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
    ['Solitary', 'Solitary', 'Solitary'],
    'Computed Zelt style visible',
  );
  equal(
    await page.locator('.test-table th').allTextContents(),
    ['test名', '分類', 'mock対象'],
    'Comparable table columns',
  );
  equal(await page.locator('tr.unit-test').count(), 3, 'One table row per test');
  equal(
    await page.locator('.test-mocks').allTextContents(),
    ['なし', 'なし', 'なし'],
    'Mock column uses Zelt overrides',
  );
  equal(await page.locator('#inspector details').count(), 0, 'No per-test prose disclosure');
  ok(
    !(await page.locator('#inspector').textContent()).includes('jose'),
    'No library-based classification narrative',
  );
  ok(
    (await page.locator('.unit-test td').first().getAttribute('title')).includes(
      'jwt.service.test.ts:43',
    ),
    'Source provenance retained without row paragraphs',
  );
  ok(
    await page
      .locator('.test-table-scroll')
      .evaluate(
        (element) => element.clientWidth <= document.querySelector('.inspector-body').clientWidth,
      ),
    'Table scroll is contained on small viewports',
  );
  const synthetic = await page.evaluate(() => {
    const facts = window.EC_TESTS.setups.JwtService;
    window.EC_TESTS.setups.JwtService = {
      resolved: true,
      dependencies: [{ provide: 'Repo', kind: 'service' }],
      overrides: [{ provide: 'Repo', useValue: 'mockRepo' }],
    };
    const html = ecTestList('JwtService.verify');
    window.EC_TESTS.setups.JwtService = facts;
    const holder = document.createElement('div');
    holder.innerHTML = html;
    return [...holder.querySelectorAll('.test-mocks')].map((element) => element.textContent);
  });
  equal(
    synthetic,
    ['Repo', 'Repo', 'Repo'],
    'Mock names render from provided class tokens (synthetic only, not fixture)',
  );
  await select('JwtService');
  equal(await page.locator('.unit-test').count(), 6, 'Class aggregates all member test targets');
  equal(
    await page.locator('.test-table th').allTextContents(),
    ['test名', '対象', '分類', 'mock対象'],
    'Class table retains method identity',
  );
  await select('ProductController.create');
  equal(await page.locator('.e2e-test').count(), 6, 'Create includes test-body preparation POSTs');
  equal(await page.locator('tr.e2e-test').count(), 6, 'Related E2E also uses compact rows');
  equal(await page.locator('#inspector details').count(), 0, 'No per-E2E explanations');
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
