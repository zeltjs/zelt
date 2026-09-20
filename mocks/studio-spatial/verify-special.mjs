export function verifySpecialModel(model, present, ok, equal) {
  const original = JSON.stringify(model);
  for (const config of [false, true]) {
    const parts = present.partition(model, model.edges, config);
    equal(
      Object.values(parts).flat().length,
      model.edges.length,
      'Every relation has exactly one presentation',
    );
    equal(
      new Set(Object.values(parts).flat()).size,
      model.edges.length,
      'No duplicated/lost original relation',
    );
    equal(parts.middleware.length, 62, 'All 62 middleware applications become tags');
    equal(parts.warp.length, 1, 'Event delivery becomes warp');
    equal(parts.composition.length, 9, 'Nine app registrations remain in composition');
    ok(
      parts.wires.some((e) => e.from === 'AuthController.me' && e.to === 'requireUser'),
      'Entry-column helper remains an ordinary call',
    );
    ok(
      parts.wires.some((e) => e.kind === 'implements'),
      'Reverse adapter implementation dependency retained',
    );
    equal(parts.config.length > 0, !config, 'Only hidden config relations leave wire layer');
    const notes = present.notes(model, parts);
    const tags = [...notes.values()].flat();
    for (const edge of [...parts.middleware, ...parts.warp])
      ok(
        tags.some((note) => note.originals.includes(edge)),
        'Every special relation has a navigable note',
      );
    const jwt = notes.get('AuthController').find((note) => note.target === 'JwtMiddleware.use');
    equal(
      [...jwt.originals].map((e) => e.from),
      ['AuthController.me'],
      'Grouped middleware tag does not imply class-wide applicability',
    );
    const event = notes.get('OrderService').find((note) => note.kind === 'event');
    equal(
      event.target,
      'OrderHandlers.startup@order:created',
      'Warp targets actual receiver, not registration method',
    );
  }
  const calls = [
    { from: 'OrderService.createOrder', to: 'AuthController.login', kind: 'call' },
    { from: 'JwtMiddleware.use', to: 'JwtMiddleware.extractToken', kind: 'call' },
  ];
  const parts = present.partition(model, calls, true);
  equal([...parts.warp], [calls[0]], 'True cross-group entry call is a call warp, not an event');
  equal([...parts.wires], [calls[1]], 'Internal middleware calls remain ordinary wires');
  equal(JSON.stringify(model), original, 'Presentation never mutates source model');
  ok(present.space(model).get('AuthController') > 0, 'Reserve stable space for tags');
}

async function verifyPersistentMiddlewareTags(page, ok, equal) {
  const tags = page.locator('.ref-middleware');
  const inventory = () =>
    tags.evaluateAll((els) =>
      els.map((el) => ({
        key: el.dataset.reference,
        title: el.title,
        text: el.textContent,
        left: el.offsetLeft,
        top: el.offsetTop,
      })),
    );
  const initial = await inventory();
  ok(initial.length > 0, 'Initial middleware tags exist');
  equal(await page.locator('.ref-middleware.dimmed').count(), 0, 'Initial tags are not dimmed');
  await page.locator('[data-group="AuthController"] .group-heading').click();
  equal(await inventory(), initial, 'Selection preserves every tag, position and full provenance');
  equal(
    await page.locator('[data-group="AuthController"] .ref-middleware.dimmed').count(),
    0,
    'Related controller tags stay normal',
  );
  const other = page.locator('[data-group="ProductController"] .ref-middleware').first();
  ok(await other.isVisible(), 'Unrelated controller tag remains visible');
  ok(await other.evaluate((el) => el.classList.contains('dimmed')), 'Unrelated tag is dimmed');
  equal(
    await other.evaluate((el) => getComputedStyle(el).opacity),
    '1',
    'Dimmed parent does not double-dim tag',
  );

  await page.locator('[data-toggle="AuthController"]').click();
  await page.locator('[data-declaration="AuthController.login"]').click();
  const jwt = page.locator(
    '[data-group="AuthController"] .ref-middleware[title*="JwtMiddleware.use"]',
  );
  ok(await jwt.isVisible(), 'Method selection retains middleware applied to another method');
  equal(
    await jwt.evaluate((el) => getComputedStyle(el).opacity),
    '0.4',
    'Unrelated tag in active group uses node dimming',
  );
  ok(
    (await jwt.getAttribute('title')).includes('AuthController.me'),
    'Dimmed tag retains actual application source',
  );
  await page.locator('[data-mode="flow"]').click();
  ok(
    await jwt.evaluate((el) => el.classList.contains('dimmed')),
    'Flow mode retains dimmed out-of-scope tag',
  );
  const beforeJump = await inventory();
  await jwt.focus();
  await page.keyboard.press('Enter');
  equal(
    await page.inputValue('#root-select'),
    'JwtMiddleware.use',
    'Dimmed tag is keyboard navigable',
  );
  await page.locator('#reference-back').click();
  equal(await inventory(), beforeJump, 'Back restores tag inventory and position');
  ok(await jwt.evaluate((el) => el.classList.contains('dimmed')), 'Back restores dimming');
  await page.locator('[data-declaration="AuthController.me"]').click();
  ok(
    !(await jwt.evaluate((el) => el.classList.contains('dimmed'))),
    'Related method restores tag brightness',
  );
  await page.locator('[data-mode="all"]').click();
  equal(
    await page.locator('.ref-middleware.dimmed').count(),
    0,
    'All-relations mode restores all tags',
  );
  await page.locator('[data-mode="near"]').click();
  await page.locator('[data-group="OrderService"] .group-heading').click();
  equal(
    await tags.count(),
    initial.length,
    'Unrelated service selection never removes application tags',
  );
  ok(
    await page
      .locator('.collapsed .ref-middleware')
      .evaluateAll((els) =>
        els.every(
          (el) =>
            el.classList.contains('dimmed') ===
            el.closest('[data-group]').classList.contains('dimmed-group'),
        ),
      ),
    'Collapsed application tags follow their visible owner, not individual relations',
  );
  await page.locator('[data-action="reset"]').click();
  equal(await inventory(), initial, 'Reset restores initial tag layout and provenance');
  equal(await page.locator('.ref-middleware.dimmed').count(), 0, 'Reset clears tag dimming');
}

export async function verifySpecialBrowser(page, ok, equal) {
  await verifyPersistentMiddlewareTags(page, ok, equal);
  const reset = () => page.locator('[data-action="reset"]').click();
  const snapshot = () =>
    page.evaluate(() => ({
      state: { ...ecState, collapsed: [...ecState.collapsed] },
      inputs: ['show-config', 'show-type-arrows', 'show-edge-counts'].map(
        (id) => document.getElementById(id).checked,
      ),
      scroll: [
        document.getElementById('map-scroll').scrollLeft,
        document.getElementById('map-scroll').scrollTop,
      ],
      inspector: document.getElementById('inspector').innerHTML,
    }));
  const geometry = () =>
    page.locator('[data-group]').evaluateAll((els) => els.map((el) => el.getAttribute('style')));
  const assertNotesFit = async () => {
    const bounds = await page.locator('.reference-tag:visible').evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect(),
          group = el.closest('[data-group]');
        const box = group.getBoundingClientRect();
        const members = [...group.querySelectorAll('[data-declaration]:not([hidden])')].map(
          (n) => n.getBoundingClientRect().bottom,
        );
        return (
          r.left >= box.left &&
          r.right <= box.right &&
          r.top >= box.top + 1 &&
          r.bottom <= box.bottom &&
          members.every((bottom) => bottom <= r.top)
        );
      }),
    );
    ok(
      bounds.length > 0 && bounds.every(Boolean),
      'Tags stay inside owning box and clear of method nodes',
    );
  };
  ok(await page.locator('[data-group="app.ts"]').isHidden(), 'app.ts absent from normal map');
  ok(await page.locator('[data-mini="app.ts"]').isHidden(), 'app.ts absent from minimap');
  equal(
    await page.locator('#root-select option[value="createEcApp"]').count(),
    0,
    'Composition is not a normal root option',
  );
  ok(await page.locator('#show-config').isChecked(), 'Config defaults ON');
  await assertNotesFit();

  await page.locator('[data-group="AuthController"] .group-heading').click();
  const jwt = page.locator(
    '[data-group="AuthController"] .ref-middleware[title*="JwtMiddleware.use"]',
  );
  equal(await jwt.count(), 1, 'One actual JWT application tag on controller');
  ok(
    (await jwt.getAttribute('title')).includes('AuthController.me'),
    'Tag identifies covered method',
  );
  ok(
    !(await jwt.getAttribute('title')).includes('AuthController.register'),
    'Tag does not claim unrelated methods',
  );
  equal(await page.locator('.wire.edge-middleware').count(), 0, 'No middleware application wires');
  const beforeMiddleware = await snapshot();
  await jwt.focus();
  await page.keyboard.press('Enter');
  equal(await page.inputValue('#root-select'), 'JwtMiddleware.use', 'Tag opens middleware as root');
  await page.locator('#reference-back').click();
  equal(await snapshot(), beforeMiddleware, 'Return restores middleware origin and fold state');

  await page.locator('[data-group="OrderService"] .group-heading').click();
  await page.locator('[data-tab="source"]').click();
  await page.locator('#show-type-arrows').uncheck();
  await page.locator('#show-edge-counts').uncheck();
  await page.locator('#include-middleware').uncheck();
  const warp = page.locator('[data-group="OrderService"] .ref-event');
  await warp.scrollIntoViewIfNeeded();
  const beforeWarp = await snapshot();
  await warp.click();
  equal(
    await page.inputValue('#root-select'),
    'OrderHandlers.startup@order:created',
    'Warp navigates to receiver callback',
  );
  ok(
    await page.locator('[data-declaration="OrderHandlers.startup@order:created"]').isVisible(),
    'Warp reveals existing receiver node',
  );
  equal(await page.locator('.wire.edge-event').count(), 0, 'No event back-wire');
  await page.locator('#reference-back').click();
  equal(
    await snapshot(),
    beforeWarp,
    'Warp return restores selection, tab, options, zoom and scroll',
  );

  await reset();
  await page.locator('[data-mode="all"]').click();
  const positions = await geometry();
  const beforeConfig = await page.evaluate(() => ({
    graph: JSON.stringify(ecModel),
    reached: [...ecReachable('AuthController.login')],
    root: ecState.root,
    selected: ecState.selected,
  }));
  await page.locator('#show-config').uncheck();
  equal(await geometry(), positions, 'Config visibility does not reposition any box');
  equal(
    await page.evaluate(() => ({
      graph: JSON.stringify(ecModel),
      reached: [...ecReachable('AuthController.login')],
      root: ecState.root,
      selected: ecState.selected,
    })),
    beforeConfig,
    'Config OFF preserves graph, traversal and selection',
  );
  const configIds = await page.evaluate(() =>
    ecModel.groups.filter((g) => g.column === 5).map((g) => g.id),
  );
  for (const id of configIds) {
    ok(await page.locator(`[data-group="${id}"]`).isHidden(), 'Config group hidden');
    ok(await page.locator(`[data-mini="${id}"]`).isHidden(), 'Config minimap group hidden');
  }
  ok(
    await page.evaluate(() =>
      [...document.querySelectorAll('[data-edge]')].every((el) =>
        [el.dataset.from, el.dataset.to].every((id) => ecOwner(id).column !== 5),
      ),
    ),
    'No wire has an invisible config endpoint',
  );
  ok((await page.locator('.wire.edge-read').count()) > 0, 'Non-config reads remain visible');
  await page.locator('[data-group="JwtService"] .ref-config').click();
  ok(await page.locator('#reference-dialog').isVisible(), 'Hidden config references inspectable');
  const configJump = page.locator('[data-reference-jump="JwtConfig.secret"]').first();
  await configJump.click();
  ok(
    await page.locator('#show-config').isChecked(),
    'Following config reference reveals its actual box',
  );
  await page.locator('#reference-back').click();
  ok(!(await page.locator('#show-config').isChecked()), 'Back restores config OFF');
  equal(await geometry(), positions, 'Back preserves geometry');
  await page.locator('#include-middleware').uncheck();
  equal(
    await page.locator('.ref-middleware').count(),
    0,
    'Middleware OFF removes application tags',
  );
  await page.locator('#show-type-arrows').uncheck();
  await page.locator('#show-edge-counts').uncheck();
  equal(
    await page.locator('.wire.edge-type').count(),
    0,
    'Type OFF works with special presentation',
  );
  equal(
    await page.locator('.bundle-count:visible').count(),
    0,
    'Counts OFF works with special presentation',
  );
  await page.locator('[data-action="expand-all"]').click();
  await assertNotesFit();
  await page.locator('[data-action="collapse-all"]').click();
  await assertNotesFit();
  await page.screenshot({
    path: `/tmp/studio-special-${page.viewportSize().width}.png`,
    fullPage: true,
  });

  await page.locator('#composition-button').click();
  equal(
    await page.locator('#reference-content [data-select]').count(),
    9,
    'Composition exposes all nine registration relations',
  );
  await page.locator('[data-composition-source]').click();
  equal(
    await page.locator('.inspector-heading h2').textContent(),
    'createEcApp',
    'Composition exposes real source declaration',
  );
  ok(
    (await page.locator('.source-code').textContent()).includes('createApp'),
    'Composition source is readable',
  );
  ok(
    await page.locator('[data-action="as-root"]').isDisabled(),
    'Composition not presented as normal map traversal',
  );
  await page.locator('#search').fill('app.ts');
  await page.locator('[data-find="app.ts"]').click();
  ok(await page.locator('#reference-dialog').isVisible(), 'Searching app.ts leads to composition');
  await page.keyboard.press('Escape');
  ok(await page.locator('[data-group="app.ts"]').isHidden(), 'Search never adds app.ts to map');
  await reset();
  ok(await page.locator('#reference-back').isHidden(), 'Reset clears navigation history');
  ok(await page.locator('#show-config').isChecked(), 'Reset restores config ON');
}
