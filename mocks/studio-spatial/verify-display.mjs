export function verifyDisplayModel(model, present, ok, equal) {
  const original = JSON.stringify(model);
  const ids = model.groups.map((group) => group.id);
  const collapseStates = [
    [],
    ids,
    ...ids.map((id) => [id]),
    ...ids.map((id) => ids.filter((other) => other !== id)),
  ];
  const nodes = new Map(model.declarations.map((node) => [node.id, node]));
  const seeds = (id) =>
    new Set([id, ...model.declarations.filter((node) => node.group === id).map((node) => node.id)]);
  let cases = 0;
  for (const collapsedIds of collapseStates) {
    for (const selected of [null, 'AuthService', 'AuthController.login', 'OrderService.findById']) {
      for (const showConfig of [false, true]) {
        const selection = seeds(selected);
        const edges = selected
          ? model.edges.filter((edge) => selection.has(edge.from) || selection.has(edge.to))
          : [];
        const options = {
          collapsed: new Set(collapsedIds),
          selected,
          edges,
          showConfig,
          showTypes: true,
          middleware: true,
          changed: new Set(['Order']),
        };
        const before = JSON.stringify({ edges, collapsedIds });
        const display = present.display(model, options);
        const allNotes = present.notes(model, present.partition(model, model.edges, showConfig));
        for (const group of display.groups.values()) {
          equal(
            group.notes.length,
            allNotes.get(group.id).length,
            'All attachment kinds persist across selection and folding',
          );
          equal(
            group.changed,
            group.sourceIds.includes('Order'),
            'Change highlight follows represented sources',
          );
          for (const note of group.notes) {
            if (group.collapsed)
              equal(note.dimmed, group.dimmed, 'Every collapsed attachment shares owner emphasis');
            else
              equal(
                note.dimmed,
                group.dimmed ||
                  (selected !== null && !note.originals.some((edge) => edges.includes(edge))),
                'Expanded attachments use exact source relations',
              );
            ok(
              note.originals.every((edge) => model.edges.includes(edge)),
              'No invented attachment relations',
            );
            const baseline = allNotes
              .get(group.id)
              .find(
                (n) =>
                  n.kind === note.kind && n.target === note.target && n.incoming === note.incoming,
              );
            equal(
              [...note.originals],
              [...baseline.originals],
              'Complete attachment provenance retained',
            );
            const expectedUnits = [
              ...new Set(
                note.originals
                  .flatMap((edge) => [edge.from, edge.to])
                  .filter((id) => (nodes.get(id)?.group ?? id) === group.id)
                  .map((id) => (options.collapsed.has(group.id) ? group.id : id)),
              ),
            ];
            equal(
              [...note.units],
              expectedUnits,
              'Attachment owner uses the same display-unit mapping',
            );
          }
        }
        for (const node of model.declarations) {
          const expectedUnit = options.collapsed.has(node.group) ? node.group : node.id;
          equal(
            display.units.get(node.id),
            expectedUnit,
            'Source maps to current abstraction unit',
          );
          equal(display.nodes.get(node.id).unit, expectedUnit, 'Node consumes shared display unit');
        }
        for (const wire of display.projection.edges) {
          for (const edge of wire.originals) {
            equal(wire.from, display.units.get(edge.from), 'Wire source uses shared display unit');
            equal(wire.to, display.units.get(edge.to), 'Wire target uses shared display unit');
            ok(edges.includes(edge), 'Attachments never expand the traced wire scope');
          }
        }
        equal(
          JSON.stringify({ edges, collapsedIds }),
          before,
          'Input scope and collapse state unchanged',
        );
        cases++;
      }
    }
  }
  const options = {
    collapsed: new Set(ids),
    selected: null,
    edges: model.edges,
    showConfig: false,
    showTypes: false,
    middleware: false,
    changed: new Set(),
  };
  const off = present.display(model, options);
  equal(off.parts.middleware.length, 0, 'Explicit middleware OFF still excludes applications');
  for (const group of off.groups.values()) {
    ok(
      group.notes.every((note) => note.kind !== 'middleware'),
      'Explicit middleware OFF excludes attachment',
    );
    equal(
      group.hidden,
      group.id === 'app.ts' || model.groups.find((g) => g.id === group.id).column === 5,
      'Hidden group policy centralized',
    );
  }
  ok(
    off.projection.edges.every((edge) => edge.kind !== 'type'),
    'Explicit type OFF still excludes type wires',
  );
  const initial = present.display(model, {
    ...options,
    middleware: true,
    showTypes: true,
    edges: [],
  });
  equal(initial.projection.edges.length, 0, 'Initial map shows no wires');
  ok(
    [...initial.groups.values()].every((g) => !g.dimmed && g.notes.every((n) => !n.dimmed)),
    'Initial map shows all attachment kinds at normal emphasis',
  );
  const noteKeys = (display) =>
    [...display.groups.values()].flatMap((g) =>
      g.notes.filter((n) => n.kind !== 'config').map((n) => n.key),
    );
  equal(
    noteKeys(initial),
    noteKeys(
      present.display(model, {
        ...options,
        middleware: true,
        showTypes: true,
        showConfig: true,
        edges: [],
      }),
    ),
    'Reference keys remain stable across config visibility',
  );
  equal(JSON.stringify(model), original, 'Display projection never mutates source graph');
  console.log(
    `PASS: shared display model invariants (${cases} fold/selection/config combinations).`,
  );
}

export async function verifyDisplayBrowser(page, ok, equal) {
  const reset = () => page.locator('[data-action="reset"]').click();
  const graphBefore = await page.evaluate(() => JSON.stringify(ecModel));
  const inventory = () =>
    page.locator('.reference-tag').evaluateAll((els) =>
      els.map((el) => ({
        key: el.dataset.reference,
        title: el.title,
        left: el.offsetLeft,
        top: el.offsetTop,
      })),
    );
  const assertCollapsedOwners = async () => {
    ok(
      await page
        .locator('.collapsed .reference-tag')
        .evaluateAll((els) =>
          els.every(
            (el) =>
              el.classList.contains('dimmed') ===
              el.closest('[data-group]').classList.contains('dimmed-group'),
          ),
        ),
      'All collapsed attachment kinds follow owner emphasis in DOM',
    );
  };
  const scope = () =>
    page.evaluate(() => ({
      selected: ecState.selected,
      root: ecState.root,
      edges: ecVisibleEdges().map((edge) => ecModel.edges.indexOf(edge)),
    }));
  const initial = await inventory();
  await page.locator('[data-group="AuthService"] .group-heading').click();
  equal(await inventory(), initial, 'Selection preserves every attachment kind and position');
  equal(
    await page.locator('[data-group="AuthController"] .ref-middleware:not(.dimmed)').count(),
    5,
    'Related collapsed controller shows all five middleware tags normally',
  );
  await assertCollapsedOwners();
  await page.locator('[data-toggle="AuthController"]').click();
  await page.locator('[data-declaration="AuthController.login"]').click();
  const jwt = page.locator(
    '[data-group="AuthController"] .ref-middleware[title*="JwtMiddleware.use"]',
  );
  ok(
    await jwt.evaluate((el) => el.classList.contains('dimmed')),
    'Expanded login does not imply JWT applies to login',
  );
  const beforeFold = await scope();
  await page.locator('[data-toggle="AuthController"]').click();
  equal(
    await scope(),
    beforeFold,
    'Collapsing changes representation, not trace scope or source selection',
  );
  equal(
    await jwt.evaluate((el) => getComputedStyle(el).opacity),
    '1',
    'Collapsed normal owner has normal attachment opacity',
  );
  await page.locator('[data-toggle="AuthController"]').click();
  equal(await scope(), beforeFold, 'Expansion preserves trace scope');
  equal(
    await jwt.evaluate((el) => getComputedStyle(el).opacity),
    '0.4',
    'Expansion restores relation-level emphasis',
  );
  await reset();
  await page.locator('[data-toggle="OrderService"]').click();
  await page.locator('[data-declaration="OrderService.findById"]').click();
  const warp = page.locator('[data-group="OrderService"] .ref-event');
  ok(await warp.isVisible(), 'Out-of-scope warp remains visible');
  ok(
    await warp.evaluate((el) => el.classList.contains('dimmed')),
    'Expanded unrelated warp is dimmed',
  );
  await page.locator('[data-toggle="OrderService"]').click();
  equal(
    await warp.evaluate((el) => getComputedStyle(el).opacity),
    '1',
    'Collapsed active owner retains normal warp',
  );
  await warp.focus();
  await page.keyboard.press('Enter');
  equal(
    await page.inputValue('#root-select'),
    'OrderHandlers.startup@order:created',
    'Retained warp navigates to actual callback',
  );
  await page.locator('#reference-back').click();
  equal(
    await warp.evaluate((el) => getComputedStyle(el).opacity),
    '1',
    'Back restores collapsed warp emphasis',
  );
  await reset();
  await page.locator('#show-config').uncheck();
  const withConfigNotes = await inventory();
  await page.locator('[data-group="AuthController"] .group-heading').click();
  equal(await inventory(), withConfigNotes, 'Hidden config references persist across selection');
  const config = page.locator('[data-group="JwtMiddleware"] .ref-config');
  ok(await config.isVisible(), 'Active middleware keeps its hidden-config reference');
  equal(
    await config.evaluate((el) => getComputedStyle(el).opacity),
    '1',
    'Config attachment shares collapsed owner emphasis',
  );
  await assertCollapsedOwners();
  await config.click();
  ok(
    await page.locator('#reference-dialog').isVisible(),
    'Retained config note exposes original relations',
  );
  await page.keyboard.press('Escape');
  await page.locator('[data-group="OrderService"] .group-heading').click();
  ok(await config.isVisible(), 'Unrelated hidden-config note persists');
  ok(
    await config.evaluate((el) => el.classList.contains('dimmed')),
    'Unrelated hidden-config note is dimmed',
  );
  await page.screenshot({
    path: `/tmp/studio-display-model-${page.viewportSize().width}.png`,
    fullPage: true,
  });
  await page.locator('[data-mode="all"]').click();
  await assertCollapsedOwners();
  equal(
    await page.locator('.reference-tag.dimmed').count(),
    0,
    'All-relations mode restores all attachment kinds',
  );
  await reset();
  equal(await inventory(), initial, 'Reset restores full stable attachment inventory');
  equal(
    await page.evaluate(() => JSON.stringify(ecModel)),
    graphBefore,
    'UI operations never mutate source graph',
  );
}
