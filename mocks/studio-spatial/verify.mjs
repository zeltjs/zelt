import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';

const dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(dir, '../..');
const context = { window: {} };
vm.runInNewContext(readFileSync(resolve(dir, 'data.js'), 'utf8'), context);
const model = JSON.parse(JSON.stringify(context.window.STUDIO_MOCK));
let checks = 0;
function equal(actual, expected, message) {
  assert.deepEqual(actual, expected, message);
  checks++;
}
function ok(value, message) {
  assert.ok(value, message);
  checks++;
}
const normalize = (text) => text.replace(/\s+/g, '').replace(/,\)/g, ')');
const classes = new Map();
const methods = new Map();
equal(new Set(model.nodes.map((n) => n.id)).size, model.nodes.length, 'Unique method identity');
equal(new Set(model.groups.map((g) => g.id)).size, model.groups.length, 'Unique class identity');
equal(model.nodes.length, 9, 'Nine individually declared methods');
equal(model.groups.length, 8, 'Eight declaring classes');
equal(model.properties.length, 3, 'DB property and two real getter declarations');
const propertyDeclarations = new Map();

for (const group of model.groups) {
  const file = ts.createSourceFile(
    group.file,
    readFileSync(resolve(root, group.file), 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
  const matches = file.statements.filter(
    (node) => ts.isClassDeclaration(node) && node.name.text === group.id,
  );
  equal(matches.length, 1, `${group.id}: exactly one class declaration`);
  const declaration = matches[0];
  classes.set(group.id, { declaration, file });
  const actualMethods = declaration.members.filter(ts.isMethodDeclaration);
  const visible = model.nodes.filter((node) => node.group === group.id);
  equal(
    [...visible.map((node) => node.name), ...group.omitted].sort(),
    actualMethods.map((method) => method.name.text).sort(),
    `${group.id}: visible + omitted members match source`,
  );
  const implemented = (declaration.heritageClauses ?? [])
    .filter((clause) => clause.token === ts.SyntaxKind.ImplementsKeyword)
    .flatMap((clause) => clause.types.map((type) => type.expression.getText(file)));
  equal(group.implements, implemented, `${group.id}: implements is separate from calls`);
  const accessors = declaration.members.filter(ts.isGetAccessorDeclaration);
  const fields = model.properties.filter((property) => property.group === group.id);
  equal(
    [
      ...fields.filter((property) => property.kind === 'getter').map((property) => property.name),
      ...(group.omittedAccessors ?? []),
    ].sort(),
    accessors.map((accessor) => accessor.name.text).sort(),
    `${group.id}: visible + omitted accessors match source`,
  );
  if (group.extends) {
    equal(
      declaration.heritageClauses
        .filter((clause) => clause.token === ts.SyntaxKind.ExtendsKeyword)
        .flatMap((clause) => clause.types.map((type) => type.expression.getText(file))),
      [group.extends],
      'Actual config inheritance',
    );
    ok(
      readFileSync(resolve(root, group.registration.file), 'utf8').includes(
        group.registration.snippet,
      ),
      'Actual config registration',
    );
  }
  for (const property of fields) {
    const matches = declaration.members.filter(
      (member) =>
        (ts.isPropertyDeclaration(member) || ts.isGetAccessorDeclaration(member)) &&
        member.name.text === property.name,
    );
    equal(matches.length, 1, `${property.id}: one real property/accessor`);
    const member = matches[0];
    equal(
      ts.isGetAccessorDeclaration(member) ? 'getter' : 'property',
      property.kind,
      'Do not invent a getter for a field',
    );
    const actual = ts.isGetAccessorDeclaration(member)
      ? file.text.slice(member.getStart(file), member.body.getStart(file)).trim()
      : member.getText(file);
    equal(normalize(property.signature), normalize(actual), `${property.id}: exact declaration`);
    for (const snippet of property.snippets)
      ok(declaration.getText(file).includes(snippet), `${property.id}: source evidence`);
    propertyDeclarations.set(property.id, member);
  }
  for (const node of visible) {
    equal(node.id, `${group.id}.${node.name}`, 'Node identity matches class/method');
    const match = actualMethods.filter((method) => method.name.text === node.name);
    equal(match.length, 1, `${node.id}: one real method`);
    const method = match[0];
    methods.set(node.id, method);
    const modifiers = (method.modifiers ?? [])
      .filter((modifier) => !ts.isDecorator(modifier))
      .map((modifier) => modifier.getText(file));
    const generics = method.typeParameters
      ? `<${method.typeParameters.map((param) => param.getText(file)).join(', ')}>`
      : '';
    const signature = `${modifiers.join(' ')} ${node.name}${generics}(${method.parameters.map((param) => param.getText(file)).join(', ')})${method.type ? `: ${method.type.getText(file)}` : ''}`;
    equal(normalize(node.signature), normalize(signature), `${node.id}: signature`);
    for (const snippet of node.snippets)
      ok(
        method.body.getText(file).includes(snippet),
        `${node.id}: source excerpt belongs to this method`,
      );
  }
}

const discovered = [];
const discoveredReads = [];
for (const node of model.nodes) {
  const { declaration, file } = classes.get(node.group);
  const constructorDeclaration = declaration.members.find(ts.isConstructorDeclaration);
  const receivers = new Map();
  for (const param of constructorDeclaration?.parameters ?? []) {
    if (
      param.initializer &&
      ts.isCallExpression(param.initializer) &&
      param.initializer.expression.getText(file) === 'inject'
    )
      receivers.set(
        `this.${param.name.getText(file)}`,
        param.initializer.arguments[0].getText(file),
      );
  }
  function visit(expression) {
    if (
      ts.isPropertyAccessExpression(expression) &&
      receivers.has(expression.expression.getText(file))
    ) {
      const receiver = expression.expression.getText(file);
      const classId = receivers.get(receiver);
      const target = classes.get(classId);
      ok(target, `${node.id}: injected class ${classId} must not be silently omitted`);
      const member = target.declaration.members.find(
        (member) => member.name?.getText(target.file) === expression.name.text,
      );
      ok(member, `${node.id}: resolve ${classId}.${expression.name.text}`);
      const id = `${classId}.${expression.name.text}`;
      if (ts.isPropertyDeclaration(member) || ts.isGetAccessorDeclaration(member)) {
        ok(propertyDeclarations.has(id), `${id}: an actual property access must be represented`);
        discoveredReads.push({ from: node.id, to: id, receiver });
      } else if (ts.isMethodDeclaration(member)) {
        ok(methods.has(id), `${id}: a called injected method must be represented`);
      }
    }
    if (ts.isCallExpression(expression) && ts.isPropertyAccessExpression(expression.expression)) {
      const receiver = expression.expression.expression.getText(file);
      const to = `${receivers.get(receiver)}.${expression.expression.name.text}`;
      if (methods.has(to)) discovered.push({ from: node.id, to, receiver });
    }
    ts.forEachChild(expression, visit);
  }
  visit(methods.get(node.id).body);
}
const edgeKey = (edge) => `${edge.from} -> ${edge.to} via ${edge.receiver}`;
equal(
  model.reads.map(edgeKey).sort(),
  [...new Set(discoveredReads.map(edgeKey))].sort(),
  'All injected property/getter accesses in the selected methods are represented, before filtering by fixture targets',
);
for (const read of model.reads)
  ok(
    methods.get(read.from).body.getText().includes(read.expression),
    `${edgeKey(read)}: exact property expression`,
  );
equal(
  model.edges.map(edgeKey).sort(),
  discovered.map(edgeKey).sort(),
  'All direct calls between displayed methods match injected receiver targets',
);
for (const edge of model.edges)
  ok(
    methods.get(edge.from).body.getText().includes(edge.expression),
    `${edgeKey(edge)}: exact call site`,
  );
ok(
  !model.edges.some(
    (edge) => edge.from === 'OrderService.findById' && edge.to === 'OrderService.getOrderItems',
  ),
  'No invented read-composition edge',
);
const type = model.types.Order;
ok(
  readFileSync(resolve(root, type.file), 'utf8').includes(type.declaration),
  'Order type declaration',
);
equal(
  type.direct,
  model.nodes
    .filter((node) => /\bOrder\b/.test(methods.get(node.id).type?.getText() ?? ''))
    .map((node) => node.id),
  'Direct Order return references',
);
equal(
  type.propagated,
  model.edges.filter((edge) => type.direct.includes(edge.to)).map((edge) => edge.from),
  'Affected caller identities',
);
console.log(
  `PASS: ${checks} source/fixture checks (8 classes, 9 methods, 3 properties, 6 calls, 4 reads).`,
);

if (process.argv.includes('--browser')) {
  const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_EXECUTABLE,
    args: ['--no-sandbox'],
  });
  const errors = [];
  const requests = [];
  const browserStart = checks;
  const url = pathToFileURL(resolve(dir, 'index.html')).href;
  const geometry = (page) =>
    page
      .locator('[data-node]:visible, [data-group]:visible, [data-property]:visible')
      .evaluateAll((elements) => {
        const map = document.getElementById('architecture-map').getBoundingClientRect();
        return elements.map((el) => {
          const rect = el.getBoundingClientRect();
          return {
            id: el.dataset.node ?? el.dataset.group ?? el.dataset.property,
            x: rect.x - map.x,
            y: rect.y - map.y,
            width: rect.width,
            height: rect.height,
          };
        });
      });
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
      await page.goto(url);
      equal(await page.locator('[data-node]:visible').count(), 8, 'One DOM node per real method');
      equal(
        await page.locator('[data-group]:visible').count(),
        5,
        'Separate class groups including DB',
      );
      equal(
        await page.locator('[data-property]:visible').count(),
        1,
        'DB property shown separately',
      );
      equal(await page.locator('[data-edge]').count(), 6, 'Method-to-method edges');
      const before = await geometry(page);
      const mapTop = await page
        .locator('#architecture-map')
        .evaluate((el) => el.getBoundingClientRect().top);
      for (const node of model.nodes.filter((node) => node.group !== 'JwtService')) {
        const locator = page.locator(`[data-node="${node.id}"]`);
        equal(
          await locator.evaluate((el) => el.closest('[data-group]').dataset.group),
          node.group,
          'DOM containment matches declaring class',
        );
        await locator.click();
        equal(
          await page.locator('#detail-title').innerText(),
          `${node.name}()`,
          'Selected detail has exact method name',
        );
        for (const tab of ['boundary', 'internal', 'source']) {
          await page.locator(`[data-tab="${tab}"]`).click();
          ok(
            (await page.locator('#detail-content').innerText()).length > 40,
            `${node.id}/${tab}: content`,
          );
          equal(await geometry(page), before, 'No node/group movement');
          if (viewport.width >= 1000)
            equal(
              await page
                .locator('#architecture-map')
                .evaluate((el) => el.getBoundingClientRect().top),
              mapTop,
              'Map stays in viewport while changing reading depth',
            );
        }
      }
      for (const group of model.groups.filter((group) => group.view !== 'config')) {
        await page.locator(`#class-groups [data-select-group="${group.id}"]`).click();
        equal(
          await page.locator('#detail-title').innerText(),
          group.id,
          'Group selects actual class',
        );
        equal(
          await page
            .locator('#detail-content [data-select]')
            .evaluateAll((els) => els.map((el) => el.dataset.select)),
          model.nodes.filter((node) => node.group === group.id).map((node) => node.id),
          'Class detail lists exactly its visible members',
        );
      }
      for (const flow of ['create', 'read', 'all']) {
        await page.locator(`[data-flow="${flow}"]`).click();
        equal(
          await page.locator(`[data-flow="${flow}"]`).getAttribute('aria-pressed'),
          'true',
          'Flow selected',
        );
        equal(await geometry(page), before, 'Flow selection does not move nodes');
        equal(
          await page.locator('.function-node:not(.dimmed):visible').count(),
          model.nodes.filter(
            (node) => node.group !== 'JwtService' && (flow === 'all' || node.flows.includes(flow)),
          ).length,
          'Only matching flow remains emphasized',
        );
      }
      await page.locator('[data-node="OrderController.detail"]').click();
      for (const id of ['OrderService.findById', 'OrderService.getOrderItems'])
        ok(
          (await page.locator(`#detail-content [data-select="${id}"]`).count()) === 1,
          'detail has each separate call target',
        );
      await page.locator('#detail-content [data-select="OrderService.getOrderItems"]').click();
      equal(
        await page.locator('#detail-title').innerText(),
        'getOrderItems()',
        'Call link selects same node, not a composite',
      );
      await page.locator('[data-tab="boundary"]').focus();
      await page.keyboard.press('ArrowRight');
      equal(
        await page.locator('[data-tab="internal"]').getAttribute('aria-selected'),
        'true',
        'Keyboard tabs',
      );
      await page.locator('[data-action="toggle-change"]').click();
      equal(
        await page
          .locator('.function-node.impacted')
          .evaluateAll((els) => els.map((el) => el.dataset.node).sort()),
        [...type.direct, ...type.propagated].sort(),
        'Type scenario highlights only four relevant methods',
      );
      ok(
        (await page.locator('#detail-content').innerText()).includes("'refunded'"),
        'Hypothetical type diff',
      );
      equal(await geometry(page), before, 'Type change does not move nodes');
      await page.locator('[data-action="toggle-change"]').click();
      equal(await page.locator('.impacted').count(), 0, 'Scenario reversible');
      await page.locator('[data-node="OrderService.findById"]').click();
      ok(
        (await page
          .locator('#detail-content [data-select-property="DrizzleService.db"]')
          .count()) === 1,
        'findById exposes DB dependency in boundary view',
      );
      await page.locator('#detail-content [data-select-property="DrizzleService.db"]').click();
      equal(
        await page.locator('#detail-title').innerText(),
        'db',
        'Property selection is not a fake method',
      );
      equal(
        await page.locator('#detail-content [data-select]').count(),
        3,
        'DB property lists all three reading methods',
      );
      equal(
        await page.locator('[data-read-edge].focused').count(),
        3,
        'Selecting DB highlights its incoming reads',
      );
      equal(await geometry(page), before, 'Property selection preserves map positions');
      await page.locator('button[data-view="config"]').click();
      const configBefore = await geometry(page);
      equal(
        await page.locator('[data-node]:visible').count(),
        1,
        'Separate config view uses a real JWT method',
      );
      equal(
        await page.locator('[data-property]:visible').count(),
        2,
        'Static getter and override declarations are separate',
      );
      for (const tab of ['boundary', 'internal', 'source']) {
        await page.locator(`[data-tab="${tab}"]`).click();
        ok(
          (await page.locator('#detail-content').innerText()).includes('this.config.secret'),
          'Real config read is visible at every reading depth',
        );
        equal(await geometry(page), configBefore, 'Config reading depth preserves map');
      }
      for (const property of model.properties.filter((property) => property.kind === 'getter')) {
        await page.locator(`[data-property="${property.id}"]`).click();
        equal(
          await page.locator('#detail-title').innerText(),
          'secret',
          'Actual getter, no invented method name',
        );
        ok(
          (await page.locator('#detail-content').innerText()).includes(property.signature),
          'Getter signature visible',
        );
        equal(await geometry(page), configBefore, 'Config property selection preserves map');
      }
      ok(
        (await page.locator('#detail-content').innerText()).includes(
          'configs: [EcJwtConfig, EcCorsConfig]',
        ),
        'Config registration provenance visible',
      );
      for (const group of model.groups.filter((group) => group.view === 'config')) {
        await page.locator(`#class-groups [data-select-group="${group.id}"]`).click();
        equal(
          await page.locator('#detail-title').innerText(),
          group.id,
          'Config class is selectable',
        );
      }
      await page.screenshot({
        path: `/tmp/studio-properties-config-${viewport.width}.png`,
        fullPage: viewport.width < 1000,
      });
      await page.locator('button[data-view="orders"]').click();
      equal(await geometry(page), before, 'Returning to orders restores identical positions');
      await page.locator('[data-action="scope"]').click();
      ok(
        (await page.locator('#detail-content').innerText()).includes('DrizzleService.db'),
        'Property references are not fake function nodes',
      );
      await page.locator('[data-action="help"]').click();
      ok(await page.locator('dialog').isVisible(), 'Help opens');
      await page.keyboard.press('Escape');
      ok(!(await page.locator('dialog').isVisible()), 'Help closes');
      await page.locator('[data-action="reset"]').click();
      equal(
        await page.locator('#detail-title').innerText(),
        'OrderService',
        'Reset class selection',
      );
      equal(
        await page.locator('.map-scroll').evaluate((el) => el.scrollLeft),
        0,
        'Reset horizontal scroll',
      );
      equal(
        await page.locator('[data-flow="all"]').getAttribute('aria-pressed'),
        'true',
        'Reset flow',
      );
      ok(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        'Document fits viewport width',
      );
      if (viewport.width < 1000)
        ok(
          await page.locator('.map-scroll').evaluate((el) => el.scrollWidth > el.clientWidth),
          'Mobile map scrolls independently',
        );
      await page.screenshot({
        path: `/tmp/studio-properties-${viewport.width}.png`,
        fullPage: viewport.width < 1000,
      });
      await page.close();
    }
    equal(errors, [], 'No browser errors');
    equal(requests, [], 'No network dependencies or writes');
    // Warm a browser with incompatible legacy assets, then navigate to the new HTML.
    const legacy = {
      '/style.css': '.class-group { display:none!important; }',
      '/data.js': 'window.STUDIO_MOCK = { legacy: true };',
      '/app.js': 'document.getElementById("legacy-root").classList.add("ready");',
    };
    const served = [];
    const server = createServer((req, res) => {
      const request = new URL(req.url, 'http://localhost');
      served.push(request.pathname + request.search);
      if (request.pathname === '/legacy') {
        res.setHeader('Content-Type', 'text/html');
        res.end(
          '<link rel="stylesheet" href="/style.css"><div id="legacy-root"></div><script src="/data.js"></script><script src="/app.js"></script>',
        );
      } else if (request.pathname === '/') {
        res.setHeader('Content-Type', 'text/html');
        res.setHeader('Cache-Control', 'no-store');
        res.end(readFileSync(resolve(dir, 'index.html')));
      } else if (Object.hasOwn(legacy, request.pathname)) {
        res.setHeader(
          'Content-Type',
          request.pathname.endsWith('.css') ? 'text/css' : 'text/javascript',
        );
        res.setHeader('Cache-Control', 'public, max-age=3600');
        res.end(
          request.search
            ? readFileSync(resolve(dir, request.pathname.slice(1)))
            : legacy[request.pathname],
        );
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const cachedPage = await browser.newPage();
    const cacheErrors = [];
    cachedPage.on('pageerror', (error) => cacheErrors.push(error.message));
    try {
      const base = `http://127.0.0.1:${server.address().port}`;
      await cachedPage.goto(`${base}/legacy`);
      ok(
        (await cachedPage.locator('#legacy-root.ready').count()) === 1,
        'Legacy assets cached successfully',
      );
      await cachedPage.goto(base);
      equal(
        await cachedPage.locator('[data-node]:visible').count(),
        8,
        'HTTP upgrade displays nodes despite cached legacy JS',
      );
      equal(
        await cachedPage.locator('[data-property]:visible').count(),
        1,
        'HTTP upgrade displays DB property despite cached legacy CSS',
      );
      const versions = await cachedPage
        .locator('script[src], link[rel="stylesheet"]')
        .evaluateAll((els) => els.map((el) => new URL(el.src || el.href).search));
      ok(
        versions.length === 3 && versions[0] !== '' && versions.every((v) => v === versions[0]),
        'CSS/data/app use one explicit asset revision',
      );
      await cachedPage.reload();
      await cachedPage.locator('button[data-view="config"]').click();
      equal(
        await cachedPage.locator('[data-property]:visible').count(),
        2,
        'Warm HTTP reload supports config view',
      );
      equal(cacheErrors, [], 'No old renderMap or other script errors after upgrade');
      for (const asset of Object.keys(legacy))
        equal(
          served.filter((url) => url === asset).length,
          1,
          'Legacy URL was not requested again during upgrade',
        );
    } finally {
      await cachedPage.close();
      await new Promise((resolve) => server.close(resolve));
    }
    console.log(
      `PASS: ${checks - browserStart} browser checks; 1440×1000, 1280×800, 390×844, file:// and cached HTTP upgrade.`,
    );
  } finally {
    await browser.close();
  }
}
