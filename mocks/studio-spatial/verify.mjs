import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';

const dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(dir, '../..');
const context = { window: {} };
for (const file of ['data.js', 'sources.js'])
  vm.runInNewContext(readFileSync(resolve(dir, file), 'utf8'), context);
const model = JSON.parse(JSON.stringify(context.window.EC_GRAPH));
const sources = JSON.parse(JSON.stringify(context.window.EC_SOURCES));
const groups = new Map(model.groups.map((g) => [g.id, g]));
const nodes = new Map(model.declarations.map((n) => [n.id, n]));
const files = new Map();
const declarations = new Map();
let checks = 0;
function ok(condition, message) {
  assert.ok(condition, message);
  checks++;
}
function equal(actual, expected, message) {
  assert.deepEqual(actual, expected, message);
  checks++;
}
const sorted = (values) => [...new Set(values)].sort();
function source(path) {
  if (!files.has(path))
    files.set(
      path,
      ts.createSourceFile(
        path,
        readFileSync(resolve(root, path), 'utf8'),
        ts.ScriptTarget.Latest,
        true,
      ),
    );
  return files.get(path);
}
function descendants(node, predicate) {
  const result = [];
  function visit(item) {
    if (predicate(item)) result.push(item);
    ts.forEachChild(item, visit);
  }
  visit(node);
  return result;
}
function classMember(group, name) {
  const declaration = declarations.get(group);
  const matches = declaration.members.filter((n) =>
    name === 'constructor' ? ts.isConstructorDeclaration(n) : n.name?.getText() === name,
  );
  return matches.find((n) => n.body) ?? matches[0];
}
function findDeclaration(node, group, file) {
  if (node.kind === 'callback')
    return descendants(classMember(group.id, node.owner), ts.isArrowFunction)[0];
  if (group.kind !== 'file') return classMember(group.id, node.name);
  if (node.kind === 'event-type')
    return descendants(
      file,
      (n) => ts.isPropertySignature(n) && n.name.getText() === "'order:created'",
    )[0];
  return (
    file.statements.find((n) => ts.isTypeAliasDeclaration(n) && n.name.text === node.name) ??
    descendants(file, (n) => ts.isVariableDeclaration(n) && n.name.getText() === node.name)[0]
  );
}
function bodyOf(node) {
  if (ts.isVariableDeclaration(node) && node.initializer && ts.isArrowFunction(node.initializer))
    return node.initializer.body;
  return node.body;
}
function signatureOf(node, file, group, member) {
  let start = node.getStart(file);
  const decorators = ts.canHaveDecorators(node) ? ts.getDecorators(node) : undefined;
  if (decorators?.length) {
    start = decorators.at(-1).end;
    while (/\s/.test(file.text[start])) start++;
  }
  const body = bodyOf(node);
  if (group.column === 5 && member.kind === 'property')
    return file.text
      .slice(start, node.initializer ? node.initializer.getStart(file) : node.end)
      .replace(/\s*=\s*$/, '')
      .replace(/;$/, '')
      .trim();
  return body ? file.text.slice(start, body.getStart(file)).trim() : node.getText(file);
}

equal(groups.size, model.groups.length, 'Unique declaring groups');
equal(nodes.size, model.declarations.length, 'One identity per declaration');
for (const group of model.groups) {
  const file = source(group.file);
  const declaration =
    group.kind === 'file'
      ? file
      : file.statements.find(
          (n) =>
            (ts.isClassDeclaration(n) || ts.isInterfaceDeclaration(n)) && n.name.text === group.id,
        );
  ok(declaration, `Real ${group.kind}: ${group.id}`);
  declarations.set(group.id, declaration);
  equal(sources[group.id].file, group.file, 'Group file identity');
  for (const node of model.declarations.filter((n) => n.group === group.id)) {
    const actual = findDeclaration(node, group, file);
    ok(actual, `Real declaration: ${node.id}`);
    declarations.set(node.id, actual);
    const snapshot = sources[node.id];
    equal(snapshot.file, group.file, `${node.id}: file`);
    equal(
      snapshot.line,
      file.getLineAndCharacterOfPosition(actual.getStart(file)).line + 1,
      `${node.id}: location`,
    );
    equal(
      snapshot.end,
      file.getLineAndCharacterOfPosition(actual.end).line + 1,
      `${node.id}: end location`,
    );
    equal(
      snapshot.signature,
      signatureOf(actual, file, group, node),
      `${node.id}: exact signature`,
    );
    const hiddenConfig =
      group.column === 5 &&
      (node.kind === 'property' || (node.kind === 'getter' && node.name !== 'resolveUser'));
    if (!hiddenConfig)
      equal(snapshot.code, actual.getText(file), `${node.id}: exact source excerpt`);
    else ok(snapshot.code.includes('非表示'), `${node.id}: config value is not published`);
    const predicates = {
      method: ts.isMethodDeclaration,
      constructor: ts.isConstructorDeclaration,
      callback: ts.isArrowFunction,
      getter: ts.isGetAccessorDeclaration,
      property: ts.isPropertyDeclaration,
      signature: ts.isMethodSignature,
      type: ts.isTypeAliasDeclaration,
    };
    if (predicates[node.kind]) ok(predicates[node.kind](actual), `${node.id}: kind ${node.kind}`);
    if (node.kind === 'function')
      ok(
        ts.isArrowFunction(actual.initializer) || ts.isFunctionDeclaration(actual),
        `${node.id}: real function, not merged responsibility`,
      );
  }
}

// Independent scope: enumerate application files and declarations, not fixture selections.
const appFiles = readdirSync(resolve(root, 'integration/ec-backend/src'), { recursive: true })
  .filter((f) => f.endsWith('.ts'))
  .map((f) => `integration/ec-backend/src/${f}`)
  .sort();
equal(
  sorted(
    model.groups.filter((g) => g.file.startsWith('integration/ec-backend/src/')).map((g) => g.file),
  ),
  appFiles,
  'Every ec-backend source file is represented',
);
for (const path of appFiles) {
  const file = source(path);
  for (const declaration of file.statements.filter(ts.isClassDeclaration)) {
    ok(groups.has(declaration.name.text), `${declaration.name.text}: no omitted application class`);
    for (const member of declaration.members) {
      const name = ts.isConstructorDeclaration(member) ? 'constructor' : member.name?.getText(file);
      ok(
        nodes.has(`${declaration.name.text}.${name}`),
        `${declaration.name.text}.${name}: no omitted application member`,
      );
    }
  }
  for (const declaration of file.statements.filter(ts.isTypeAliasDeclaration))
    ok(nodes.has(declaration.name.text), `${declaration.name.text}: app type shown`);
  for (const statement of file.statements.filter(ts.isVariableStatement)) {
    for (const declaration of statement.declarationList.declarations)
      ok(
        nodes.has(declaration.name.getText(file)),
        `${declaration.name.getText(file)}: app top-level declaration shown`,
      );
  }
}

const actualHttp = [];
const actualJwtTargets = [];
const actualRateTargets = [];
const decoratorsOf = (n) => (ts.canHaveDecorators(n) ? ts.getDecorators(n) : undefined) ?? [];
for (const path of appFiles) {
  const file = source(path);
  for (const cls of file.statements.filter(ts.isClassDeclaration)) {
    const classDecorators = decoratorsOf(cls).map((n) => n.getText(file));
    const controller = classDecorators.find((s) => s.startsWith('@Controller('));
    if (!controller) continue;
    const prefix = controller.match(/'([^']+)'/)[1];
    for (const method of cls.members.filter(ts.isMethodDeclaration)) {
      const decorators = decoratorsOf(method).map((n) => n.getText(file));
      const route = decorators.find((s) => /^@(Get|Post|Put|Delete)\(/.test(s));
      if (!route) continue;
      const match = route.match(/^@(Get|Post|Put|Delete)\('([^']*)'\)/);
      const id = `${cls.name.text}.${method.name.text}`;
      actualHttp.push({
        id,
        kind: 'HTTP',
        label: `${match[1].toUpperCase()} ${prefix}${match[2]}`,
      });
      if ([...classDecorators, ...decorators].includes('@UseMiddleware(JwtMiddleware)'))
        actualJwtTargets.push(id);
      if (decorators.some((s) => s.startsWith('@RateLimit('))) actualRateTargets.push(id);
    }
  }
}
equal(
  model.roots.filter((r) => r.kind === 'HTTP').sort((a, b) => a.id.localeCompare(b.id)),
  actualHttp.sort((a, b) => a.id.localeCompare(b.id)),
  'All HTTP entries and method/path registrations match source',
);
equal(actualHttp.length, 16, '16 HTTP entries');
const middlewareSources = (to) =>
  sorted(model.edges.filter((e) => e.kind === 'middleware' && e.to === to).map((e) => e.from));
equal(
  middlewareSources('JwtMiddleware.use'),
  sorted(actualJwtTargets),
  'JWT class/method application matches decorators',
);
equal(
  middlewareSources('RateLimitMiddleware.use'),
  sorted(actualRateTargets),
  'RateLimit wrapper application matches decorators',
);
for (const name of ['CorsMiddleware', 'SecureHeadersMiddleware', 'LoggingMiddleware'])
  equal(
    middlewareSources(`${name}.use`),
    sorted(actualHttp.map((r) => r.id)),
    `${name}: all HTTP entries`,
  );
ok(
  source('integration/ec-backend/src/app.ts').text.includes('middlewares: [LoggingMiddleware]'),
  'Logging explicitly registered',
);
const httpService = source('packages/core/src/features/http/http.service.ts');
const security = descendants(
  httpService,
  (n) => ts.isVariableDeclaration(n) && n.name.getText() === 'securityMiddlewares',
)[0];
equal(
  security.initializer.elements.map((n) => n.getText()),
  ['CorsMiddleware', 'SecureHeadersMiddleware'],
  'Core automatically registers security middleware',
);
equal(
  model.roots
    .filter((r) => r.kind === 'Middleware')
    .map((r) => r.id)
    .sort(),
  [
    'CorsMiddleware.use',
    'JwtMiddleware.use',
    'LoggingMiddleware.use',
    'RateLimitMiddleware.use',
    'SecureHeadersMiddleware.use',
  ],
  'All app-relevant middleware origins',
);
const onCalls = descendants(
  source('integration/ec-backend/src/entry/job/order.handlers.ts'),
  (n) => ts.isCallExpression(n) && n.expression.getText() === 'this.eventBus.on',
);
equal(onCalls.length, 1, 'One application event subscription');
equal(
  onCalls[0].arguments[1],
  declarations.get('OrderHandlers.startup@order:created'),
  'Event entry is the registered callback, not startup',
);
equal(
  model.roots.filter((r) => r.kind === 'Event').map((r) => r.id),
  ['OrderHandlers.startup@order:created'],
  'Event origin coverage',
);

const keys = new Set();
for (const edge of model.edges) {
  const key = `${edge.from}|${edge.to}|${edge.kind}`;
  ok(!keys.has(key), `Unique relation ${key}`);
  keys.add(key);
  ok(declarations.has(edge.from) && declarations.has(edge.to), `Real endpoints: ${key}`);
  const origin = declarations.get(edge.from);
  if (edge.evidence)
    ok(
      source(edge.evidence.file).text.includes(edge.evidence.text),
      `${key}: registration/type evidence`,
    );
  if (
    !(edge.kind === 'middleware' && edge.expression !== '@UseMiddleware(JwtMiddleware)') &&
    edge.kind !== 'type'
  ) {
    const container =
      edge.kind === 'middleware' ? declarations.get(nodes.get(edge.from).group) : origin;
    ok(container.getText().includes(edge.expression), `${key}: expression exists in source`);
  }
  if (edge.kind === 'type' && !edge.evidence)
    ok(
      new RegExp(`\\b${edge.expression}\\b`).test(origin.getText()),
      `${key}: type/schema reference`,
    );
  if (edge.kind === 'call')
    ok(
      ['method', 'function'].includes(nodes.get(edge.to)?.kind),
      `${key}: call target is actual function`,
    );
  if (edge.kind === 'read')
    ok(
      ['property', 'getter', 'value'].includes(nodes.get(edge.to)?.kind),
      `${key}: property access is not a fake method`,
    );
}

// Audit visible function bodies before selecting target declarations. Unknown injected
// targets must either be explicitly shown or trigger a failure, never be filtered away.
const expectedEdges = new Set();
const supported = new Set(['method', 'function', 'callback', 'constructor']);
function auditBody(item) {
  const group = groups.get(item.group);
  if (group.boundary || !supported.has(item.kind)) return;
  const declaration = declarations.get(item.id),
    file = source(group.file);
  const constructorDeclaration =
    group.kind === 'class' ? classMember(group.id, 'constructor') : undefined;
  const receivers = new Map();
  for (const p of constructorDeclaration?.parameters ?? [])
    if (
      p.initializer &&
      ts.isCallExpression(p.initializer) &&
      p.initializer.expression.getText() === 'inject'
    ) {
      receivers.set(`this.${p.name.getText()}`, p.initializer.arguments[0].getText());
      receivers.set(p.name.getText(), p.initializer.arguments[0].getText());
    }
  const separate = new Set(
    [...declarations.values()].filter((n) => n !== declaration && ts.isArrowFunction(n)),
  );
  function visit(n) {
    if (separate.has(n)) return;
    if (ts.isPropertyAccessExpression(n)) {
      const receiver = n.expression.getText(file);
      const owner = receiver === 'this' ? group.id : receivers.get(receiver);
      const targetId = owner ? `${owner}.${n.name.text}` : undefined;
      const target = targetId ? nodes.get(targetId) : undefined;
      if (owner && receiver !== 'this')
        ok(target, `${item.id}: injected reference ${targetId} must be represented`);
      const assignment =
        ts.isBinaryExpression(n.parent) &&
        n.parent.left === n &&
        n.parent.operatorToken.kind === ts.SyntaxKind.EqualsToken;
      if (target && !assignment) {
        const kind =
          target.kind === 'method'
            ? 'call'
            : ['getter', 'property'].includes(target.kind)
              ? 'read'
              : undefined;
        if (kind) expectedEdges.add(`${item.id}|${targetId}|${kind}`);
      }
    }
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression)) {
      const id = n.expression.text,
        target = nodes.get(id);
      if (target?.kind === 'function') expectedEdges.add(`${item.id}|${id}|call`);
      if (target?.kind === 'value') expectedEdges.add(`${item.id}|${id}|read`);
    }
    ts.forEachChild(n, visit);
  }
  visit(bodyOf(declaration));
}
for (const item of model.declarations) auditBody(item);
for (const key of expectedEdges) ok(keys.has(key), `No omitted call/property dependency: ${key}`);
equal(
  sorted(
    model.edges
      .filter((edge) => edge.kind === 'call')
      .map((edge) => `${edge.from}|${edge.to}|call`),
  ),
  sorted([...expectedEdges].filter((key) => key.endsWith('|call'))),
  'Every direct call targets the actual receiver declaration; no additional fabricated calls',
);
for (const group of model.groups) {
  const height = 62 + model.declarations.filter((n) => n.group === group.id).length * 46;
  ok(group.y + height <= model.height, `${group.id}: inside canvas`);
  for (const other of model.groups.filter((g) => g.column === group.column && g.y > group.y)) {
    ok(group.y + height < other.y, `${group.id} does not overlap ${other.id}`);
  }
}
ok(
  keys.has('AuthService.login|JwtService.sign|call') &&
    keys.has('JwtMiddleware.use|JwtService.verify|call'),
  'Entry and middleware share JwtService',
);
ok(
  keys.has('JwtService.sign|JwtConfig.secret|read') &&
    keys.has('JwtService.verify|JwtConfig.secret|read'),
  'Config can be reached from both origin kinds',
);
ok(
  !keys.has('OrderService.findById|OrderService.getOrderItems|call'),
  'No invented combined lookup method',
);
ok(
  keys.has('OrderService.createOrder|OrderHandlers.startup@order:created|event'),
  'Event connection distinct from direct call',
);
const assets = [
  ...readFileSync(resolve(dir, 'index.html'), 'utf8').matchAll(
    /(?:src|href)="\.\/(?:data\.js|sources\.js|app\.js|style\.css)\?v=([^"]+)"/g,
  ),
];
equal(assets.length, 4, 'All script/style assets versioned');
equal(sorted(assets.map((m) => m[1])), [model.version], 'Same cache revision for all assets');
ok(
  !readFileSync(resolve(dir, 'sources.js'), 'utf8').includes('ec-backend-test-secret-key'),
  'Do not copy JWT secret into fixture',
);
console.log(
  `PASS: ${checks} source/fixture checks (${appFiles.length} app files, ${groups.size} groups, ${nodes.size} declarations, ${model.edges.length} relations).`,
);

if (process.argv.includes('--browser')) {
  const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_EXECUTABLE,
    args: ['--no-sandbox'],
  });
  const browserStart = checks;
  const errors = [];
  const requests = [];
  const geometry = (page) =>
    page
      .locator('[data-group], [data-declaration]')
      .evaluateAll((els) =>
        els.map((el) => [
          el.dataset.group ?? el.dataset.declaration,
          el.style.left,
          el.style.top,
          el.style.width,
          el.style.height,
        ]),
      );
  try {
    for (const viewport of [
      { width: 1440, height: 1000 },
      { width: 1280, height: 800 },
      { width: 390, height: 844 },
    ]) {
      const page = await browser.newPage({ viewport });
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('request', (request) => {
        if (/^https?:/.test(request.url())) requests.push(request.url());
      });
      await page.goto(pathToFileURL(resolve(dir, 'index.html')).href);
      await page.locator('[data-group]').first().waitFor();
      equal(
        await page.locator('[data-group]').count(),
        groups.size,
        `${viewport.width}: all groups rendered`,
      );
      equal(
        await page.locator('[data-declaration]').count(),
        nodes.size,
        'All declarations rendered',
      );
      equal(
        await page.locator('[data-node]').count(),
        model.declarations.filter((n) => supported.has(n.kind)).length,
        'Only actual functions use data-node',
      );
      ok(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        'No page-wide horizontal overflow',
      );
      const initial = await geometry(page);
      await page.locator('[data-mode="all"]').click();
      equal(
        await page.locator('[data-edge]').count(),
        model.edges.length,
        'All relationships can be displayed',
      );
      await page.locator('#include-middleware').uncheck();
      equal(
        await page.locator('.edge-middleware[data-edge]').count(),
        0,
        'Middleware application can be excluded without hiding config',
      );
      await page.locator('#include-middleware').check();
      await page.selectOption('#category', 'HTTP');
      equal(await page.locator('#root-select option').count(), 17, 'All HTTP options available');
      await page.selectOption('#category', 'all');
      for (const origin of model.roots) {
        await page.selectOption('#root-select', origin.id);
        equal(
          await page.locator('.inspector-heading h2').textContent(),
          origin.id,
          `Root ${origin.id}`,
        );
        equal(await geometry(page), initial, 'Origin selection never repositions declarations');
        await page.locator('[data-tab="source"]').click();
        ok(
          (await page.locator('.source-code').textContent()).length > 0,
          'Source available for every root',
        );
      }
      // Exercise each declaration/namespace at all widths, then drive real DOM clicks below.
      const selected = await page.evaluate(() =>
        window.EC_GRAPH.declarations.map((item) => {
          ecSelect(item.id);
          return [
            item.id,
            document.querySelector('.inspector-heading h2').textContent,
            document.querySelector('.contract-grid pre').textContent,
          ];
        }),
      );
      for (const [id, title, signature] of selected) {
        equal(title, id, 'Every declaration selectable');
        equal(signature, sources[id].signature, 'Exact contract in inspector');
      }
      const selectedGroups = await page.evaluate(() =>
        window.EC_GRAPH.groups.map((group) => {
          ecSelect(group.id);
          const title = document.querySelector('.inspector-heading h2').textContent;
          ecState.tab = 'source';
          ecRenderInspector();
          return [group.id, title, document.querySelector('.inspector-body').textContent];
        }),
      );
      for (const [id, title, content] of selectedGroups) {
        equal(title, id, 'Every class/file/interface selectable');
        ok(
          content.includes('宣言ヘッダー'),
          'Group source explicitly identifies excerpt, not full body',
        );
      }
      await page.locator('[data-action="reset"]').click();
      await page.locator('[data-declaration="AuthController.login"]').click();
      equal(
        await page.locator('.inspector-heading h2').textContent(),
        'AuthController.login',
        'Real method click',
      );
      await page.locator('#inspector [data-select="AuthService.login"]').click();
      await page.locator('#inspector [data-select="JwtService.sign"]').click();
      await page.locator('#inspector [data-select="JwtConfig.secret"]').click();
      equal(
        await page.locator('.inspector-heading h2').textContent(),
        'JwtConfig.secret',
        'Entry to shared config navigation',
      );
      await page.locator('[data-action="as-root"]').click();
      equal(
        await page.inputValue('#root-select'),
        'JwtConfig.secret',
        'Non-entry declaration remains visible as custom origin',
      );
      await page.selectOption('#root-select', 'JwtMiddleware.use');
      await page.locator('#inspector [data-select="JwtService.verify"]').click();
      await page.locator('#inspector [data-select="JwtConfig.secret"]').click();
      equal(
        await page.locator('[data-declaration="JwtConfig.secret"]').count(),
        1,
        'Same config, no duplicate per flow',
      );
      await page.locator('[data-tab="contract"]').focus();
      await page.keyboard.press('ArrowRight');
      equal(
        await page.locator('[data-tab="source"]').getAttribute('aria-selected'),
        'true',
        'Keyboard tabs',
      );
      await page.keyboard.press('End');
      equal(
        await page.locator('[data-tab="scope"]').getAttribute('aria-selected'),
        'true',
        'Keyboard End tab',
      );
      await page.locator('#search').fill('OrderService.createOrder');
      await page.locator('[data-find="OrderService.createOrder"]').click();
      await page.locator('#inspector [data-select="OrderHandlers.startup@order:created"]').click();
      equal(
        await page.locator('.inspector-heading h2').textContent(),
        'OrderHandlers.startup@order:created',
        'Event publisher → real callback',
      );
      await page.locator('[data-action="as-root"]').click();
      equal(
        await page.inputValue('#root-select'),
        'OrderHandlers.startup@order:created',
        'Selected origin remains visible in picker',
      );
      ok(
        (await page.locator('[data-mode="flow"]').getAttribute('aria-pressed')) === 'true',
        'Selected callback becomes origin',
      );
      await page.locator('#search').fill('no-such-declaration-983');
      ok(
        (await page.locator('#search-results').textContent()).includes('該当する宣言はありません'),
        'Empty search result explicit',
      );
      await page.keyboard.press('Escape');
      ok(await page.locator('#search-results').isHidden(), 'Escape dismisses search');
      await page.locator('[data-action="zoom-actual"]').click();
      equal(await page.locator('#zoom-level').textContent(), '100%', 'Readable zoom');
      await page.locator('[data-action="zoom-in"]').click();
      equal(await page.locator('#zoom-level').textContent(), '110%', 'Zoom in');
      await page.locator('[data-action="zoom-out"]').click();
      equal(await page.locator('#zoom-level').textContent(), '100%', 'Zoom out');
      equal(await geometry(page), initial, 'Zoom changes viewport only');
      await page.locator('[data-action="scenario"]').click();
      ok(
        await page
          .locator('[data-declaration="Order"]')
          .evaluate((el) => el.classList.contains('changed')),
        'Order scenario is visibly hypothetical',
      );
      ok(
        await page
          .locator('[data-declaration="OrderService.getOrderItems"]')
          .evaluate((el) => !el.classList.contains('changed')),
        'Do not claim unrelated return-type impact',
      );
      await page.locator('[data-action="help"]').click();
      ok(await page.locator('#help-dialog').isVisible(), 'Help dialog');
      await page.keyboard.press('Escape');
      ok(await page.locator('#help-dialog').isHidden(), 'Native dialog Escape');
      await page.selectOption('#category', 'Event');
      equal(
        await page.locator('#root-select option').count(),
        2,
        'Event picker includes exactly callback and default',
      );
      await page.locator('[data-action="reset"]').click();
      equal(await page.inputValue('#search'), '', 'Reset search');
      equal(await page.inputValue('#root-select'), '', 'Reset origin');
      equal(await page.locator('[data-edge]').count(), 0, 'Overview starts without hairball');
      equal(await geometry(page), initial, 'Reset preserves coordinates');
      await page.screenshot({ path: `/tmp/studio-ec-whole-${viewport.width}.png`, fullPage: true });
      await page.close();
    }
    equal(errors, [], 'No browser exceptions');
    equal(requests, [], 'file:// works without external requests');
    let legacy = true;
    const server = createServer((request, response) => {
      const name = request.url.split('?')[0].slice(1) || 'index.html';
      if (!['index.html', 'style.css', 'data.js', 'sources.js', 'app.js'].includes(name)) {
        response.writeHead(404);
        response.end();
        return;
      }
      const types = { html: 'text/html', css: 'text/css', js: 'text/javascript' };
      response.setHeader('Content-Type', types[name.split('.').at(-1)]);
      response.setHeader('Cache-Control', name === 'index.html' ? 'no-cache' : 'max-age=3600');
      if (legacy) {
        response.end(
          name === 'index.html'
            ? '<!doctype html><html><head><link rel="stylesheet" href="./style.css?v=property-reads-2"><script src="./data.js?v=property-reads-2"></script><script src="./app.js?v=property-reads-2"></script></head><body>Legacy mock</body></html>'
            : name.endsWith('.css')
              ? '.class-group { display: none !important }'
              : 'window.legacyMock = true;',
        );
        return;
      }
      response.end(readFileSync(resolve(dir, name)));
    });
    await new Promise((done) => server.listen(0, '127.0.0.1', done));
    try {
      const page = await browser.newPage();
      page.on('pageerror', (error) => errors.push(error.message));
      const url = `http://127.0.0.1:${server.address().port}/`;
      await page.goto(url);
      ok(
        await page.evaluate(() => window.legacyMock === true),
        'Old incompatible assets populated warm cache',
      );
      legacy = false;
      await page.reload();
      equal(
        await page.locator('[data-group]:visible').count(),
        groups.size,
        'Updated HTML does not reuse hidden legacy styles',
      );
      await page.reload();
      equal(
        await page.locator('[data-declaration]').count(),
        nodes.size,
        'HTTP reload with cached assets',
      );
      await page.selectOption('#root-select', 'AuthController.login');
      ok((await page.locator('[data-edge]').count()) > 0, 'HTTP root interaction');
      await page.close();
    } finally {
      await new Promise((done) => server.close(done));
    }
    equal(errors, [], 'No errors after HTTP cache reload');
    console.log(
      `PASS: ${checks - browserStart} browser checks across 1440 / 1280 / 390px and file / HTTP.`,
    );
  } finally {
    await browser.close();
  }
}
