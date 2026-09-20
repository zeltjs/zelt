export function verifyLockModel(model, present, ok, equal) {
  const ids = [...model.groups, ...model.declarations].map((item) => item.id);
  const original = JSON.stringify(model);
  const members = (id) => model.declarations.filter((n) => n.group === id).map((n) => n.id);
  const state = (display) => ({
    active: [...display.active].sort(),
    nodes: [...display.nodes.values()].map((n) => [n.id, n.dimmed]),
    groups: [...display.groups.values()].map((g) => [g.id, g.dimmed]),
    notes: [...display.groups.values()].flatMap((g) => g.notes.map((n) => [n.key, n.dimmed])),
    edges: display.projection.edges.map((e) => [e.from, e.to, e.kind, [...e.originals]]),
  });
  for (const focus of ['OrderService.findById', 'OrderService', 'User']) {
    const seeds = new Set([focus, ...members(focus)]);
    const edges = model.edges.filter(
      (e) => e.kind !== 'middleware' && (seeds.has(e.from) || seeds.has(e.to)),
    );
    for (const collapsed of [new Set(), new Set(model.groups.map((g) => g.id))]) {
      const options = {
        focus,
        selected: focus,
        collapsed,
        edges,
        showConfig: true,
        showTypes: true,
        changed: new Set(),
      };
      const baseline = present.display(model, options);
      const expectedActive = [
        ...new Set([...seeds, ...edges.flatMap((e) => [e.from, e.to])]),
      ].sort();
      equal(
        [...baseline.active].sort(),
        expectedActive,
        'Active source set is scope endpoints plus pinned seed',
      );
      for (const selected of ids) {
        const display = present.display(model, { ...options, selected });
        equal(
          state(display),
          state(baseline),
          'Every detail selection preserves locked wires, nodes, groups and tags',
        );
        if (display.nodes.has(selected))
          ok(display.nodes.get(selected).selected, 'Detail selection is independent');
      }
      const empty = present.display(model, {
        ...options,
        focus,
        edges: [],
        selected: 'ProductController',
      });
      equal(
        [...empty.active].sort(),
        [...seeds].sort(),
        'Isolated pinned seed is preserved without any edges',
      );
    }
  }
  equal(JSON.stringify(model), original, 'Lock presentation never mutates fixture');
  console.log('PASS: locked display invariants across 1188 scope/folding/detail combinations.');
}

export async function verifyLockBrowser(page, ok, equal) {
  const reset = () => page.locator('[data-action="reset"]').click();
  const select = async (id) => {
    await page.locator('#search').fill(id);
    await page.locator(`[data-find="${id}"]`).click();
  };
  const lock = page.locator('#scope-lock');
  const scope = () =>
    page.evaluate(() => {
      const display = EC_PRESENT.display(ecModel, {
        selected: ecState.selected,
        focus: ecFocus(),
        edges: ecVisibleEdges(),
        collapsed: ecState.collapsed,
        changed: new Set(),
        showConfig: document.getElementById('show-config').checked,
        showTypes: document.getElementById('show-type-arrows').checked,
      });
      return {
        focus: ecFocus(),
        edges: ecVisibleEdges().map((e) => ecModel.edges.indexOf(e)),
        active: [...display.active].sort(),
        dimmed: [...document.querySelectorAll('[data-declaration]')].map((el) => [
          el.dataset.declaration,
          el.classList.contains('dimmed'),
        ]),
        groups: [...document.querySelectorAll('[data-group]')].map((el) => [
          el.dataset.group,
          el.classList.contains('dimmed-group'),
        ]),
      };
    });
  await reset();
  ok(await lock.isDisabled(), 'No selection cannot be locked');
  equal(await lock.getAttribute('aria-pressed'), 'false', 'Initial scope follows selection');
  equal(
    await page.locator('#include-middleware').count(),
    0,
    'Middleware traversal option removed',
  );
  const inventory = await page.locator('.ref-middleware').count();
  ok(inventory > 0, 'Actual middleware applications remain as tags');

  for (const mode of ['near', 'flow']) {
    await reset();
    await select('OrderService.findById');
    await page.locator(`[data-mode="${mode}"]`).click();
    const before = await scope();
    await lock.focus();
    await page.keyboard.press('Enter');
    equal(await scope(), before, 'Lock itself does not change scope');
    equal(await lock.getAttribute('aria-pressed'), 'true', 'Lock state is visible');
    ok(
      (await page.locator('#scope-status').textContent()).includes('OrderService.findById'),
      'Pinned origin visible beside lock',
    );
    await select('ProductController');
    equal(await scope(), before, 'Selecting unrelated class preserves active set and arrows');
    ok(
      await page
        .locator('[data-group="ProductController"]')
        .evaluate(
          (el) => el.classList.contains('selected-group') && el.classList.contains('dimmed-group'),
        ),
      'Out-of-scope class is selected but remains dimmed',
    );
    await select('OrderService.getOrderItems');
    equal(await scope(), before, 'Selecting unrelated method within active class preserves scope');
    const member = page.locator('[data-declaration="OrderService.getOrderItems"]');
    ok(
      await member.evaluate(
        (el) => el.classList.contains('selected') && el.classList.contains('dimmed'),
      ),
      'Selected member outside locked scope remains dimmed',
    );
    await page.waitForTimeout(150);
    equal(
      await member.evaluate((el) => getComputedStyle(el).opacity),
      '0.4',
      'Selection CSS cannot override scope dimming',
    );
    await page.locator('[data-tab="source"]').click();
    equal(await scope(), before, 'Reading source leaves locked scope untouched');
    await page.locator('[data-action="collapse-all"]').click();
    equal(await scope(), before, 'Collapse reprojects without altering active sources');
    await page.locator('[data-action="expand-all"]').click();
    equal(await scope(), before, 'Expand reprojects without altering active sources');
    await page.locator('#show-type-arrows').uncheck();
    await page.locator('#show-config').uncheck();
    await page.locator('#show-edge-counts').uncheck();
    equal(await scope(), before, 'Display options do not alter locked sources');
    await page.selectOption('#category', 'Event');
    equal(await scope(), before, 'Candidate filter does not unlock or change scope');
    equal(
      await page.inputValue('#root-select'),
      '',
      'Filtered-out locked origin stays in lock status, not among candidates',
    );
    equal(
      await page.locator('#root-select option').count(),
      2,
      'Event filter contains only placeholder and actual event entry',
    );
    await lock.click();
    equal(await lock.getAttribute('aria-pressed'), 'false', 'Unlock is explicit');
    equal(
      (await scope()).focus,
      'OrderService.getOrderItems',
      'Unlock resumes current detail selection',
    );
    ok(
      JSON.stringify((await scope()).edges) !== JSON.stringify(before.edges),
      'Unlock updates arrows to current selection',
    );
    equal(
      await page.locator(`[data-mode="${mode}"]`).getAttribute('aria-pressed'),
      'true',
      'Unlock preserves scope mode',
    );
  }

  await reset();
  await page.selectOption('#root-select', 'OrderController.detail');
  equal(
    await lock.getAttribute('aria-pressed'),
    'true',
    'Origin shortcut activates ordinary lock UI',
  );
  equal(
    await page.locator('[data-mode="flow"]').getAttribute('aria-pressed'),
    'true',
    'Origin shortcut activates ordinary recursive UI',
  );
  const shortcut = await scope();
  await page.locator('#inspector [data-select="OrderService.findById"]').click();
  equal(await scope(), shortcut, 'Following a contract link preserves pinned scope');
  await select('ProductController');
  await page.locator('[data-mode="near"]').click();
  equal(
    (await scope()).focus,
    'OrderController.detail',
    'Changing range keeps pinned origin, not inspected node',
  );
  equal(await lock.getAttribute('aria-pressed'), 'true', 'Range change keeps lock');
  await page.locator('[data-mode="all"]').click();
  await page.locator('[data-mode="flow"]').click();
  equal(await scope(), shortcut, 'Returning to recursive restores same locked scope');

  const beforeJump = await scope();
  await page.locator('[data-group="OrderService"] .ref-event').click();
  equal(
    await page.locator('.inspector-heading h2').textContent(),
    'OrderHandlers.startup@order:created',
    'Warp opens actual receiver details',
  );
  equal(await scope(), beforeJump, 'Warp navigation cannot silently replace lock');
  await page.locator('#reference-back').click();
  equal(await scope(), beforeJump, 'Back restores pinned scope');
  const tag = page.locator('[data-group="OrderController"] .ref-middleware').first();
  await tag.click();
  equal(await scope(), beforeJump, 'Middleware tag navigation also respects lock');
  await page.locator('#reference-back').click();
  equal(await scope(), beforeJump, 'Middleware back restores pinned scope');

  await page.locator('[data-action="as-root"]').click();
  equal(
    (await scope()).focus,
    'ProductController',
    'Detail shortcut explicitly replaces locked origin',
  );
  await page.locator('#scope-lock').click();
  await page.selectOption('#root-select', 'JwtMiddleware.use');
  const middleware = await scope();
  ok(
    middleware.active.includes('JwtService.verify'),
    'Actual middleware calls are still traversed',
  );
  ok(
    !middleware.active.includes('OrderController.detail'),
    'Application relations do not pull in endpoints',
  );
  equal(
    await page.locator('.ref-middleware').count(),
    inventory,
    'Application tag inventory remains intact',
  );
  await page.screenshot({
    path: `/tmp/studio-flow-lock-${page.viewportSize().width}.png`,
    fullPage: true,
  });
  await reset();
  equal(await lock.getAttribute('aria-pressed'), 'false', 'Reset releases lock');
  equal(await page.locator('[data-edge]').count(), 0, 'Reset restores initial overview');
}
