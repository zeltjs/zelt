const sorted = (values) => [...values].sort();

export function verifyScopeModel(model, api, ok, equal) {
  const edges = [
    ['EntryA', 'Caller'],
    ['Caller', 'X'],
    ['X', 'Shared'],
    ['Shared', 'DB'],
    ['EntryB', 'Shared'],
    ['Caller', 'Other'],
    ['Caller', 'DB'],
    ['X.constructor', 'Config'],
    ['Override', 'Shared'],
  ].map(([from, to]) => ({ from, to }));
  const before = JSON.stringify(edges);
  const scope = api.trace(['X'], edges);
  equal(sorted(scope.use.nodes), ['DB', 'Shared', 'X'], 'Use recurses only outgoing');
  equal(sorted(scope.usedBy.nodes), ['Caller', 'EntryA', 'X'], 'Used by recurses only incoming');
  equal(
    sorted(scope.nodes),
    ['Caller', 'DB', 'EntryA', 'Shared', 'X'],
    'Union excludes sideways callers, siblings and constructors',
  );
  equal(
    [...scope.edges],
    edges.slice(0, 4),
    'Only traced edges, not cross-links between union nodes',
  );
  equal(JSON.stringify(edges), before, 'Input edges immutable');
  equal(sorted(api.trace(['Alone'], []).nodes), ['Alone'], 'Isolated seed retained');
  equal([...api.trace([], edges).edges], [], 'No seed has no scope');
  const cycle = [
    { from: 'X', to: 'Y' },
    { from: 'Y', to: 'X' },
    { from: 'X', to: 'X' },
  ];
  const cyclic = api.trace(['X'], cycle);
  equal(sorted(cyclic.use.nodes), ['X', 'Y'], 'Use cycle terminates');
  equal(sorted(cyclic.usedBy.nodes), ['X', 'Y'], 'Used by cycle terminates');
  equal([...cyclic.edges], cycle, 'Union emits a cyclic edge once');
  equal([...api.trace(['X', 'X'], cycle).edges], cycle, 'Repeated seeds do not duplicate edges');
  const parallel = [...cycle, { from: 'X', to: 'Y', kind: 'type' }];
  equal([...api.trace(['X'], parallel).edges], parallel, 'Parallel source relations stay distinct');

  // Independent fixed-point oracle: repeatedly close one direction over the whole edge list.
  const close = (seeds, allowed, reverse) => {
    const result = new Set(seeds);
    let size;
    do {
      size = result.size;
      for (const edge of allowed) {
        if (result.has(reverse ? edge.to : edge.from)) result.add(reverse ? edge.from : edge.to);
      }
    } while (result.size !== size);
    return result;
  };
  const modelBefore = JSON.stringify(model);
  for (const item of [...model.groups, ...model.declarations]) {
    const seeds = [
      item.id,
      ...model.declarations.filter((n) => n.group === item.id).map((n) => n.id),
    ];
    for (const middleware of [false, true]) {
      const allowed = model.edges.filter((e) => middleware || e.kind !== 'middleware');
      const use = close(seeds, allowed, false);
      const usedBy = close(seeds, allowed, true);
      const actual = api.trace(seeds, allowed);
      equal(sorted(actual.use.nodes), sorted(use), `${item.id}: outgoing closure`);
      equal(sorted(actual.usedBy.nodes), sorted(usedBy), `${item.id}: incoming closure`);
      equal(
        [...actual.edges],
        allowed.filter((e) => use.has(e.from) || usedBy.has(e.to)),
        `${item.id}: directional edge provenance/order`,
      );
      ok(
        actual.edges.every((e) => model.edges.includes(e)),
        'No synthetic edges',
      );
    }
  }
  const order = api.trace(['OrderService.findById'], model.edges);
  ok(order.usedBy.nodes.has('OrderController.detail'), 'Method traces back to actual HTTP entry');
  ok(order.use.nodes.has('DrizzleService.db'), 'Method traces forward to actual DB access');
  ok(
    !order.nodes.has('ProductController.detail'),
    'Shared Drizzle dependency does not pull in product endpoint',
  );
  ok(!order.nodes.has('OrderService.constructor'), 'Constructor is not implicitly seeded');
  const jwt = api.trace(['JwtService.sign'], model.edges);
  ok(jwt.use.nodes.has('JwtConfig.secret'), 'Use follows config read');
  ok(!jwt.use.nodes.has('EcJwtConfig.secret'), 'Use does not reverse an override edge');
  equal(JSON.stringify(model), modelBefore, 'Full source graph unchanged');
  console.log(
    'PASS: independent use/used-by scope (synthetic branches/cycles and 396 fixture seed/option combinations).',
  );
}

export async function verifyScopeBrowser(page, ok, equal) {
  const reset = () => page.locator('[data-action="reset"]').click();
  await reset();
  const graphBefore = await page.evaluate(() => JSON.stringify(ecModel));
  await page.locator('#search').fill('OrderService.findById');
  await page.locator('[data-find="OrderService.findById"]').click();
  const near = await page.evaluate(() => ecVisibleEdges().map((e) => ecModel.edges.indexOf(e)));
  await page.locator('[data-mode="flow"]').click();
  const readScope = () =>
    page.evaluate(() => ({
      root: ecState.root,
      selected: ecState.selected,
      nodes: [...ecReachable(ecState.root || ecState.selected)].sort(),
      edges: ecVisibleEdges().map((e) => ecModel.edges.indexOf(e)),
    }));
  const flow = await readScope();
  equal(flow.root, '', 'Unset root uses selected declaration');
  ok(flow.nodes.includes('OrderController.detail'), 'Flow includes used-by endpoint');
  ok(flow.nodes.includes('DrizzleService.db'), 'Flow includes use dependency');
  ok(!flow.nodes.includes('ProductController.detail'), 'Flow excludes shared-dependency sibling');
  ok(
    await page
      .locator('[data-group="ProductController"]')
      .evaluate((el) => el.classList.contains('dimmed-group')),
    'Unrelated endpoint stays dimmed',
  );
  const displayed = await page
    .locator('[data-edge]')
    .evaluateAll((els) => els.flatMap((el) => el.dataset.edges.split(',').map(Number)));
  const expected = await page.evaluate(() => {
    const endpoint = (id) =>
      ecState.collapsed.has(ecNodes.get(id)?.group) ? ecNodes.get(id).group : id;
    return EC_PRESENT.partition(ecModel, ecVisibleEdges(), true)
      .wires.filter(
        (e) => endpoint(e.from) !== endpoint(e.to) || !ecState.collapsed.has(endpoint(e.from)),
      )
      .map((e) => ecModel.edges.indexOf(e));
  });
  equal(sorted(displayed), sorted(expected), 'Rendered trace excludes folded internal edges');
  await page.locator('[data-toggle="OrderService"]').click();
  equal(await readScope(), flow, 'Folding does not broaden a method scope');
  await page.locator('#show-type-arrows').uncheck();
  await page.locator('#show-config').uncheck();
  await page.locator('#show-edge-counts').uncheck();
  equal(await readScope(), flow, 'Display options do not alter recursive scope');
  await page.locator('[data-action="as-root"]').click();
  await page.locator('[data-group="ProductService"] .group-heading').click();
  const pinned = await readScope();
  equal(pinned.root, 'OrderService.findById', 'Explicit root remains pinned');
  equal(pinned.edges, flow.edges, 'Detail selection does not replace pinned root');
  ok(
    (await page.locator('#scope-status').textContent()).includes('固定基準: OrderService.findById'),
    'Summary names actual trace root',
  );
  await page.locator('[data-action="reset"]').click();
  await page.locator('#search').fill('OrderService.findById');
  await page.locator('[data-find="OrderService.findById"]').click();
  equal((await readScope()).edges, near, 'Near mode remains direct-only');
  await page.locator('[data-group="OrderService"] .group-heading').click();
  await page.locator('[data-mode="flow"]').click();
  ok(
    (await readScope()).nodes.includes('OrderService.createOrder'),
    'Explicit class seed includes all members',
  );
  await reset();
  await page.selectOption('#root-select', 'JwtMiddleware.use');
  ok(
    !(await readScope()).nodes.includes('OrderController.detail'),
    'Middleware application is no longer traversed',
  );
  await reset();
  equal(
    await page.evaluate(() => JSON.stringify(ecModel)),
    graphBefore,
    'Browser traversal leaves source graph unchanged',
  );
}
