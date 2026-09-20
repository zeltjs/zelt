import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';
import { verifySpecialBrowser, verifySpecialModel } from './verify-special.mjs';

const dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(dir, '../..');
const context = { window: {} };
for (const file of ['data.js', 'sources.js', 'projection.js', 'presentation.js'])
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

const runtimeSchemas = [];
for (const root of model.roots.filter((r) => r.kind === 'HTTP')) {
  for (const call of descendants(declarations.get(root.id), ts.isCallExpression)) {
    if (call.expression.getText() === 'request' && call.arguments.length === 1)
      runtimeSchemas.push(`${root.id}|${call.arguments[0].getText()}`);
  }
}
equal(
  sorted(model.edges.filter((e) => e.kind === 'schema').map((e) => `${e.from}|${e.to}`)),
  sorted(runtimeSchemas),
  'Runtime request(schema) dependencies are separate from type references',
);
equal(runtimeSchemas.length, 6, 'Six runtime schema references checked');
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
    /(?:src|href)="\.\/(?:data\.js|sources\.js|projection\.js|presentation\.js|map-view\.js|special-view\.js|app\.js|style\.css)\?v=([^"]+)"/g,
  ),
];
equal(assets.length, 8, 'All script/style assets versioned');
equal(sorted(assets.map((m) => m[1])), [model.version], 'Same cache revision for all assets');
ok(
  !readFileSync(resolve(dir, 'sources.js'), 'utf8').includes('ec-backend-test-secret-key'),
  'Do not copy JWT secret into fixture',
);
console.log(
  `PASS: ${checks} source/fixture checks (${appFiles.length} app files, ${groups.size} groups, ${nodes.size} declarations, ${model.edges.length} relations).`,
);

const projectionStart = checks;
const groupIds = model.groups.map((g) => g.id);
const graphBefore = JSON.stringify(model);
const collapseStates = [
  [],
  groupIds,
  ...groupIds.map((id) => [id]),
  ...groupIds.map((id) => groupIds.filter((other) => other !== id)),
];
for (const ids of collapseStates) {
  const collapsed = new Set(ids);
  const layout = context.window.EC_VIEW.layout(model, collapsed);
  const projection = context.window.EC_VIEW.project(model, collapsed, model.edges);
  const originals = projection.edges.flatMap((e) => e.originals);
  const hidden = model.edges.filter((e) => {
    const from = nodes.get(e.from)?.group ?? e.from;
    const to = nodes.get(e.to)?.group ?? e.to;
    return from === to && collapsed.has(from);
  });
  equal(
    originals.length + hidden.length,
    model.edges.length,
    'Every original relation accounted for',
  );
  equal(new Set(originals).size, originals.length, 'No duplicate source relations');
  equal(
    [...projection.internal.values()].reduce((a, b) => a + b, 0),
    hidden.length,
    'Exact internal relation count',
  );
  for (const edge of projection.edges) {
    ok(edge.from !== edge.to, 'No synthetic self-loop');
    for (const original of edge.originals) {
      const expected = (id) => (collapsed.has(nodes.get(id)?.group) ? nodes.get(id).group : id);
      equal(edge.from, expected(original.from), 'Only hidden source projected');
      equal(edge.to, expected(original.to), 'Only hidden target projected');
      equal(edge.kind, original.kind, 'Relation kind preserved');
    }
  }
  for (const group of model.groups) {
    const box = layout.boxes.get(group.id);
    equal(
      box.height,
      collapsed.has(group.id)
        ? 62
        : 62 + model.declarations.filter((node) => node.group === group.id).length * 46,
      'Collapsed summary space removed; expanded member height unchanged',
    );
    equal(box.x, group.column * 310 + 14, 'Layer column unchanged');
    ok(box.y >= 70 && box.y + box.height <= layout.height, 'Box contained in map');
    for (const other of model.groups.filter((g) => g.column === group.column && g.y > group.y))
      ok(box.y + box.height < layout.boxes.get(other.id).y, 'Vertical order and non-overlap');
    if (!ids.length) equal(box.y, group.y, 'All-expanded restores original coordinates');
  }
}
equal(JSON.stringify(model), graphBefore, 'Projection never mutates original graph');
ok(
  context.window.EC_VIEW.layout(model, new Set(groupIds)).height < model.height,
  'Collapsed canvas actually shrinks',
);
const smallModel = {
  declarations: [
    { id: 'a1', group: 'A' },
    { id: 'a2', group: 'A' },
    { id: 'b1', group: 'B' },
  ],
};
const sampleEdges = [
  { from: 'a1', to: 'b1', kind: 'call' },
  { from: 'a2', to: 'b1', kind: 'call' },
  { from: 'b1', to: 'a1', kind: 'call' },
  { from: 'a1', to: 'b1', kind: 'read' },
  { from: 'a1', to: 'a2', kind: 'call' },
];
const folded = context.window.EC_VIEW.project(smallModel, new Set(['A', 'B']), sampleEdges);
equal(folded.edges.length, 3, 'Reverse and read edges stay separate from bundled calls');
equal(folded.edges[0].originals.length, 2, 'Same direction and kind bundle');
equal(
  new Set(folded.edges.map((e) => e.offset)).size,
  3,
  'Different kinds and directions have distinct visual lanes',
);
equal(folded.internal.get('A'), 1, 'Internal relation becomes count');
equal(
  context.window.EC_VIEW.project(smallModel, new Set(['A']), sampleEdges.slice(0, 1)).edges[0]
    .originals.length,
  1,
  'Filter precedes projection; no unrelated method leaks into selection',
);
console.log(
  `PASS: ${checks - projectionStart} projection/layout checks (${collapseStates.length} collapse states).`,
);

verifySpecialModel(model, context.window.EC_PRESENT, ok, equal);
console.log('PASS: special relation partition, provenance and source immutability checks.');
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
  const checkDisplayOptions = async (page) => {
    const type = page.locator('#show-type-arrows');
    const counts = page.locator('#show-edge-counts');
    const edgeIds = () =>
      page
        .locator('[data-edge]')
        .evaluateAll((els) =>
          els.flatMap((el) => el.dataset.edges.split(',').map(Number)).sort((a, b) => a - b),
        );
    const invariant = () =>
      page.evaluate(() => ({
        selected: ecState.selected,
        root: ecState.root,
        tab: ecState.tab,
        collapsed: [...ecState.collapsed],
        model: JSON.stringify(ecModel),
        inspector: document.getElementById('inspector').innerHTML,
        reached: [...ecReachable('OrderController.detail')],
        highlights: [...document.querySelectorAll('[data-group], [data-declaration]')].map(
          (el) => el.className,
        ),
      }));
    ok((await type.isChecked()) && (await counts.isChecked()), 'Both display options default ON');
    await page.locator('[data-group="schema.ts"] .group-heading').click();
    const orderType = page.locator('[data-from="OrderService"][data-to="schema.ts"].edge-type');
    const orderTable = page.locator('[data-from="OrderService"][data-to="schema.ts"].edge-table');
    equal(
      await orderType.getAttribute('data-count'),
      '3',
      'Folded Order type bundle has three relations',
    );
    equal(
      await orderTable.getAttribute('data-count'),
      '6',
      'Folded Order table bundle has six relations',
    );
    await type.uncheck();
    equal(await orderType.count(), 0, 'Type OFF removes Order type bundle');
    equal(await orderTable.getAttribute('data-count'), '6', 'Type OFF retains Order table bundle');
    await counts.uncheck();
    equal(
      await page.locator('.bundle-count:visible').count(),
      0,
      'Numbers OFF hides bundle labels',
    );
    equal(
      await orderTable.getAttribute('data-count'),
      '6',
      'Numbers OFF retains original relation count',
    );
    ok(
      (await orderTable.locator('title').textContent()).includes('OrderService.createOrder'),
      'Numbers OFF retains hover details',
    );
    for (const expand of [false, true]) {
      await page.locator(`[data-action="${expand ? 'expand-all' : 'collapse-all'}"]`).click();
      for (const mode of ['near', 'flow', 'all']) {
        await page.locator(`[data-mode="${mode}"]`).click();
        const before = await invariant();
        const layout = await geometry(page);
        await type.check();
        await counts.check();
        const all = await edgeIds();
        for (const showType of [false, true]) {
          await type.setChecked(showType);
          for (const showCounts of [false, true]) {
            await counts.setChecked(showCounts);
            equal(
              await edgeIds(),
              all.filter((id) => showType || model.edges[id].kind !== 'type'),
              'Only type arrows are filtered',
            );
            const bundled = await page
              .locator('[data-edge]')
              .evaluateAll((els) => els.filter((el) => Number(el.dataset.count) > 1).length);
            equal(
              await page.locator('.bundle-count:visible').count(),
              showCounts ? bundled : 0,
              'Count toggle is independent of type toggle',
            );
            equal(
              await invariant(),
              before,
              'Display options preserve model, traversal, highlights and inspection',
            );
            equal(await geometry(page), layout, 'Display options preserve coordinates');
          }
        }
      }
    }
    await type.uncheck();
    await counts.uncheck();
    equal(
      await page.locator('.edge-schema[data-edge]').count(),
      6,
      'Runtime schema dependencies remain visible',
    );
    ok((await page.locator('.edge-read[data-edge]').count()) > 0, 'Reads remain visible');
    await page.selectOption('#root-select', 'AuthController.login');
    await page.locator('[data-tab="source"]').click();
    await page.locator('[data-action="collapse-all"]').click();
    ok(
      !(await type.isChecked()) && !(await counts.isChecked()),
      'Options persist through origin, tabs and collapse',
    );
    equal(await page.locator('.wire.edge-type').count(), 0, 'Redraw retains type OFF');
    equal(await page.locator('.bundle-count:visible').count(), 0, 'Redraw retains numbers OFF');
    await type.focus();
    await page.keyboard.press('Space');
    ok(await type.isChecked(), 'Type checkbox supports keyboard');
    await counts.focus();
    await page.keyboard.press('Space');
    ok(await counts.isChecked(), 'Numbers checkbox supports keyboard');
    await page.screenshot({
      path: `/tmp/studio-options-${page.viewportSize().width}.png`,
      fullPage: true,
    });
    await type.uncheck();
    await counts.uncheck();
    await page.locator('[data-action="reset"]').click();
    ok((await type.isChecked()) && (await counts.isChecked()), 'Reset restores both options ON');
  };
  const checkViewGeometry = async (page) => {
    const measurements = await page.evaluate(() => {
      const groups = [...document.querySelectorAll('[data-group]')];
      const boxes = groups.map((el) => ({
        id: el.dataset.group,
        y: Number.parseFloat(el.style.top),
        height: Number.parseFloat(el.style.height),
      }));
      const mini = [...document.querySelectorAll('[data-mini]')].map((el) => ({
        id: el.dataset.mini,
        y: Number(el.getAttribute('y')),
        height: Number(el.getAttribute('height')),
      }));
      const edges = [...document.querySelectorAll('[data-edge]')].map((path) => {
        const start = path.getPointAtLength(0),
          end = path.getPointAtLength(path.getTotalLength());
        const rect = (id) => {
          const node = [...document.querySelectorAll('[data-declaration]')].find(
            (el) => el.dataset.declaration === id,
          );
          const owner = groups.find(
            (el) => el.dataset.group === (node ? ecNodes.get(id).group : id),
          );
          const isMember = node && !node.hidden;
          const y =
            Number.parseFloat(owner.style.top) + (isMember ? Number.parseFloat(node.style.top) : 0);
          return { x: Number.parseFloat(owner.style.left), y, height: isMember ? 43 : 60 };
        };
        return {
          start: { x: start.x, y: start.y },
          end: { x: end.x, y: end.y },
          from: rect(path.dataset.from),
          to: rect(path.dataset.to),
        };
      });
      return {
        boxes,
        mini,
        edges,
        mapHeight: Number.parseFloat(document.getElementById('architecture-map').style.height),
        scrollHeight: Number.parseFloat(document.getElementById('map-space').style.height),
        zoom: ecState.zoom,
        svgHeight: Number(document.getElementById('map-wires').getAttribute('height')),
      };
    });
    equal(measurements.mini, measurements.boxes, 'Minimap matches rendered group boxes');
    equal(measurements.svgHeight, measurements.mapHeight, 'SVG follows compact map height');
    // CSSOM serializes fractional px values with fewer digits than JS arithmetic.
    ok(
      Math.abs(measurements.scrollHeight - measurements.mapHeight * measurements.zoom) < 0.01,
      'Scroll area follows projected canvas within CSS serialization precision',
    );
    for (const edge of measurements.edges) {
      for (const [point, box] of [
        [edge.start, edge.from],
        [edge.end, edge.to],
      ]) {
        ok(
          point.y >= box.y && point.y <= box.y + box.height,
          'Wire endpoint belongs to actual visible node/header',
        );
        ok(
          Math.min(Math.abs(point.x - box.x), Math.abs(point.x - box.x - 282)) < 0.1,
          'Wire endpoint lies on node horizontal boundary',
        );
      }
    }
  };
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
      equal(await page.locator('.collapsed-summary').count(), 0, 'Summary row removed from DOM');
      ok(
        !/宣言を折りたたみ|表示範囲の内部関係/.test(
          await page.locator('#class-groups').textContent(),
        ),
        'Both collapsed summary labels removed',
      );
      const foldedHeights = await page.evaluate(() => {
        const extra = window.EC_PRESENT.space(window.EC_GRAPH);
        return [...document.querySelectorAll('[data-group]')].map((el) => ({
          height: Number.parseFloat(el.style.height),
          extra: extra.get(el.dataset.group) ?? 0,
        }));
      });
      for (const box of foldedHeights)
        equal(box.height, 62 + box.extra, 'Compact header retains tag/warp space');
      await checkDisplayOptions(page);
      await verifySpecialBrowser(page, ok, equal);
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
      const compact = await geometry(page);
      equal(
        await page.locator('[data-toggle][aria-expanded="false"]').count(),
        groupIds.length,
        'All group kinds initially collapsed',
      );
      equal(
        await page.locator('.collapsed [data-declaration]:visible').count(),
        0,
        'Collapsed members are hidden',
      );
      equal(
        await page.locator('.class-group:not(.collapsed) [data-declaration]:visible').count(),
        0,
        'FILE and INTERFACE initially collapsed too',
      );
      for (const group of model.groups.filter((g) => g.kind !== 'class' && g.id !== 'app.ts')) {
        const memberIds = new Set(
          model.declarations.filter((n) => n.group === group.id).map((n) => n.id),
        );
        const owner = (id) => nodes.get(id)?.group ?? id;
        const relation = context.window.EC_PRESENT.partition(model, model.edges, true).wires.find(
          (e) =>
            (owner(e.from) === group.id || owner(e.to) === group.id) &&
            owner(e.from) !== owner(e.to),
        );
        ok(relation, `${group.id}: cross-group relation exists for endpoint regression`);
        const relationIndex = model.edges.indexOf(relation);
        const drawnRelation = () =>
          page
            .locator('[data-edges]')
            .evaluateAll(
              (paths, index) =>
                paths
                  .filter((p) => p.dataset.edges.split(',').includes(String(index)))
                  .map((p) => [p.dataset.from, p.dataset.to]),
              relationIndex,
            );
        await page.locator('[data-action="reset"]').click();
        await page.locator(`[data-select="${group.id}"].group-heading`).click();
        equal(
          await page.locator(`[data-toggle="${group.id}"]`).getAttribute('aria-expanded'),
          'false',
          `${group.id}: group selection keeps folded`,
        );
        const label = await page
          .locator(`[data-group="${group.id}"] .group-heading span`)
          .textContent();
        ok(label.startsWith(group.kind.toUpperCase()), `${group.id}: correct kind label preserved`);
        await page.locator('[data-mode="all"]').click();
        equal(
          await drawnRelation(),
          [[owner(relation.from), owner(relation.to)]],
          `${group.id}: hidden declaration edges project to group`,
        );
        await page.locator(`[data-toggle="${group.id}"]`).focus();
        await page.keyboard.press('Space');
        equal(
          await page.locator(`[data-group="${group.id}"] [data-declaration]:visible`).count(),
          memberIds.size,
          `${group.id}: individual expansion reveals every member`,
        );
        equal(
          await page.locator('[data-toggle][aria-expanded="true"]').count(),
          1,
          `${group.id}: other groups remain folded`,
        );
        const expandedEndpoint = (id) => (memberIds.has(id) ? id : owner(id));
        equal(
          await drawnRelation(),
          [[expandedEndpoint(relation.from), expandedEndpoint(relation.to)]],
          `${group.id}: edges reconnect to expanded declaration`,
        );
        await checkViewGeometry(page);
        await page.locator(`[data-toggle="${group.id}"]`).click();
        equal(
          await drawnRelation(),
          [[owner(relation.from), owner(relation.to)]],
          `${group.id}: refolding restores group endpoints`,
        );
        equal(await geometry(page), compact, `${group.id}: refolding restores layout`);
        const member = [...memberIds][0];
        await page.locator('#search').fill(member);
        await page.locator(`[data-find="${member}"]`).click();
        equal(
          await page.locator('[data-toggle][aria-expanded="true"]').count(),
          1,
          `${group.id}: search reveals only owner`,
        );
        ok(
          await page.locator(`[data-declaration="${member}"]`).isVisible(),
          `${group.id}: searched declaration is visible`,
        );
        await page.locator('[data-action="as-root"]').click();
        await page.locator(`[data-toggle="${group.id}"]`).click();
        equal(await page.inputValue('#root-select'), member, `${group.id}: fold keeps exact root`);
        equal(
          await page.locator('.inspector-heading h2').textContent(),
          member,
          `${group.id}: fold keeps selected identity`,
        );
      }
      await page.locator('[data-action="reset"]').click();
      await page.locator('[data-mode="all"]').click();
      ok(
        (await page.locator('[data-edge]').count()) < model.edges.length,
        'Collapsed relationships are bundled',
      );
      equal(
        await page
          .locator('[data-from="AuthController"][data-to="AuthService"].edge-call')
          .getAttribute('data-count'),
        '3',
        'Class receives three underlying method calls',
      );
      await checkViewGeometry(page);
      await page.locator('[data-toggle="AuthController"]').focus();
      await page.keyboard.press('Enter');
      equal(
        await page.locator('[data-toggle="AuthController"]').getAttribute('aria-expanded'),
        'true',
        'Keyboard expands one class',
      );
      ok(
        await page
          .locator('[data-toggle="AuthController"]')
          .evaluate((el) => el === document.activeElement),
        'Toggle retains focus',
      );
      equal(
        await page
          .locator('[data-from="AuthController.login"][data-to="AuthService"].edge-call')
          .count(),
        1,
        'Expanded function to collapsed class',
      );
      await page.locator('[data-toggle="AuthService"]').click();
      equal(
        await page
          .locator('[data-from="AuthController.login"][data-to="AuthService.login"].edge-call')
          .count(),
        1,
        'Both endpoints expanded',
      );
      await checkViewGeometry(page);
      await page.locator('[data-toggle="AuthController"]').click();
      equal(
        await page
          .locator('[data-from="AuthController"][data-to="AuthService.login"].edge-call')
          .count(),
        1,
        'Collapsed class to expanded function',
      );
      await page.locator('[data-action="collapse-all"]').click();
      equal(await geometry(page), compact, 'Collapse all restores compact geometry');
      await page.locator('[data-mode="near"]').click();
      await page.locator('[data-select="AuthController"].group-heading').click();
      equal(
        await page.locator('[data-toggle="AuthController"]').getAttribute('aria-expanded'),
        'false',
        'Selecting class does not expand',
      );
      await page.locator('#inspector [data-select="AuthController.login"]').click();
      equal(
        await page.locator('[data-toggle][aria-expanded="true"]').count(),
        1,
        'Member link opens only its owner',
      );
      await page.locator('[data-tab="source"]').click();
      await page.locator('[data-toggle="AuthController"]').click();
      equal(
        await page.locator('.inspector-heading h2').textContent(),
        'AuthController.login',
        'Collapse retains selected method identity',
      );
      equal(
        await page.locator('[data-tab="source"]').getAttribute('aria-selected'),
        'true',
        'Collapse retains detail tab',
      );
      ok(
        await page
          .locator('[data-group="AuthController"]')
          .evaluate((el) => el.classList.contains('selected-group')),
        'Hidden selection highlighted on owner',
      );
      equal(
        await page
          .locator('[data-from="AuthController"][data-to="AuthService"].edge-call')
          .getAttribute('data-count'),
        '1',
        'Near mode does not include other hidden methods',
      );
      await page.locator('[data-action="locate"]').click();
      equal(
        await page.locator('[data-toggle="AuthController"]').getAttribute('aria-expanded'),
        'true',
        'Locate reveals selected member',
      );
      await page.locator('[data-action="collapse-all"]').click();
      await page.locator('#search').fill('JwtService.sign');
      await page.locator('[data-find="JwtService.sign"]').click();
      equal(
        await page.locator('[data-toggle][aria-expanded="true"]').count(),
        1,
        'Search opens only owner',
      );
      await page.locator('[data-action="collapse-all"]').click();
      await page.selectOption('#root-select', 'AuthController.login');
      const flowEdges = await page.evaluate(() =>
        ecVisibleEdges().map((e) => ecModel.edges.indexOf(e)),
      );
      await page.locator('[data-toggle="AuthController"]').click();
      equal(
        await page.inputValue('#root-select'),
        'AuthController.login',
        'Collapse preserves exact origin',
      );
      equal(
        await page.evaluate(() => ecVisibleEdges().map((e) => ecModel.edges.indexOf(e))),
        flowEdges,
        'Collapse does not change traversal',
      );
      await page.locator('[data-action="scenario"]').click();
      ok(
        await page
          .locator('[data-group="OrderService"]')
          .evaluate((el) => el.classList.contains('changed-group')),
        'Change visible on folded class',
      );
      await page.locator('[data-action="reset"]').click();
      await page.screenshot({ path: `/tmp/studio-collapse-${viewport.width}.png`, fullPage: true });
      await page.locator('[data-action="expand-all"]').click();
      const initial = await geometry(page);
      await page.locator('[data-mode="all"]').click();
      equal(
        await page.locator('[data-edge]').count(),
        context.window.EC_PRESENT.partition(model, model.edges, true).wires.length,
        'All ordinary relations use wires; special relations have dedicated checks',
      );
      await checkViewGeometry(page);
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
      for (const origin of model.roots.filter((r) => r.id !== 'createEcApp')) {
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
      await page.locator('[data-toggle="AuthController"]').click();
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
      const beforeZoom = await geometry(page);
      await page.locator('[data-action="zoom-actual"]').click();
      equal(await page.locator('#zoom-level').textContent(), '100%', 'Readable zoom');
      await page.locator('[data-action="zoom-in"]').click();
      equal(await page.locator('#zoom-level').textContent(), '110%', 'Zoom in');
      await page.locator('[data-action="zoom-out"]').click();
      equal(await page.locator('#zoom-level').textContent(), '100%', 'Zoom out');
      equal(await geometry(page), beforeZoom, 'Zoom changes viewport only');
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
      equal(await geometry(page), compact, 'Reset restores compact coordinates');
      await page.screenshot({ path: `/tmp/studio-ec-whole-${viewport.width}.png`, fullPage: true });
      await page.close();
    }
    equal(errors, [], 'No browser exceptions');
    equal(requests, [], 'file:// works without external requests');
    let legacy = true;
    const server = createServer((request, response) => {
      const name = request.url.split('?')[0].slice(1) || 'index.html';
      if (
        ![
          'index.html',
          'style.css',
          'data.js',
          'sources.js',
          'projection.js',
          'presentation.js',
          'map-view.js',
          'special-view.js',
          'app.js',
        ].includes(name)
      ) {
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
        groups.size - 1,
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
