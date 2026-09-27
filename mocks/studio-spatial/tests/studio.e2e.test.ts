import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';
import { fixture, identity } from '../src/fixture';

// 抽出器のIDは所在と構造の写しなので、testは画面と同じ表示名で書き、DOMの属性へ直す
const graph = fixture();
const nodeId = (name: string) => identity(graph, name);
const quoted = (value: string) => value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
const attribute = (name: string, id: string) => `[${name}="${quoted(id)}"]`;
const subjectAttribute = (name: string, subject: string) => attribute(name, nodeId(subject));
const shortName = (subject: string) => subject.replace(/^.*#/, '');

async function find(page: Page, query: string, subject = query, name = shortName(subject)) {
  await page.locator('#search').fill(query);
  await page.locator(subjectAttribute('data-find', subject)).click();
  await expect(page.locator('.inspector-heading h2')).toHaveText(name);
}

async function lockFrom(page: Page, query: string, subject: string) {
  await find(page, query, subject);
  await page.locator('[data-action="as-root"]').click();
}

test('fetches JSON, shows the map without composition, and keeps every group collapsible', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const response = page.waitForResponse((r) => r.url().endsWith('ec-backend.snapshot.json'));
  await page.goto('/');
  expect((await response).ok()).toBe(true);
  await expect(page.locator('[data-group]')).toHaveCount(31);
  await expect(page.locator(subjectAttribute('data-group', 'app.ts'))).toHaveCount(0);
  await expect(page.locator('[data-column-toggle="column:composition"]')).not.toBeChecked();
  await expect(page.locator('[data-declaration]')).toHaveCount(0);
  await expect(page.locator('#root-select, #category, #scenario')).toHaveCount(0);
  for (const name of ['ProductController', 'schema.ts', 'user.types.ts']) {
    const toggle = page.locator(subjectAttribute('data-toggle', name));
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(
      await page.locator(`${subjectAttribute('data-group', name)} [data-declaration]`).count(),
    ).toBeGreaterThan(0);
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  }
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test('locks arrows and active scope while inspecting another collapsed group', async ({ page }) => {
  await page.goto('/');
  await lockFrom(page, 'POST /api/products', 'ProductController#create');
  await expect(page.locator('#scope-lock')).toHaveAttribute('aria-pressed', 'true');
  const arrows = await page
    .locator('.wire')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-edges')).sort());
  const dimmed = await page
    .locator('.dimmed-group')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-group')).sort());
  await page.locator(`.group-heading${subjectAttribute('data-select', 'OrderService')}`).click();
  await expect(page.locator('.inspector-heading h2')).toHaveText('OrderService');
  expect(
    await page
      .locator('.wire')
      .evaluateAll((els) => els.map((e) => e.getAttribute('data-edges')).sort()),
  ).toEqual(arrows);
  expect(
    await page
      .locator('.dimmed-group')
      .evaluateAll((els) => els.map((e) => e.getAttribute('data-group')).sort()),
  ).toEqual(dimmed);
  await page.locator('#scope-lock').click();
  await expect(page.locator('#scope-status')).toContainText('選択に追従: OrderService');
});

test('preserves middleware tags and matches collapsed owner emphasis', async ({ page }) => {
  await page.goto('/');
  const group = page.locator(subjectAttribute('data-group', 'AuthController'));
  await expect(group).toBeVisible();
  const count = await group.locator('.ref-middleware').count();
  await page.locator(`.group-heading${subjectAttribute('data-select', 'AuthService')}`).click();
  await expect(group).not.toHaveClass(/dimmed-group/);
  await expect(group.locator('.ref-middleware.dimmed')).toHaveCount(0);
  await page.locator(`.group-heading${subjectAttribute('data-select', 'JwtConfig')}`).click();
  await expect(group.locator('.ref-middleware')).toHaveCount(count);
  await expect(group).toHaveClass(/dimmed-group/);
  await expect(group.locator('.ref-middleware.dimmed')).toHaveCount(count);
});

// A hidden column leaves nothing behind: every wire and chip must point at a box on the map.
async function expectOnlyDrawnRelations(page: Page) {
  const ends = await page
    .locator('.wire')
    .evaluateAll((els) =>
      els.flatMap((e) => [e.getAttribute('data-from'), e.getAttribute('data-to')]),
    );
  for (const id of new Set(ends)) {
    if (id === null) throw new Error('a wire has no end');
    await expect(
      page.locator(`${attribute('data-group', id)}, ${attribute('data-declaration', id)}`),
    ).toHaveCount(1);
  }
  await expect(page.locator('.reference-tag', { hasText: 'との関係' })).toHaveCount(0);
}

test('toggles type/count/column visibility and drops relations to hidden columns', async ({
  page,
}) => {
  await page.goto('/');
  await page.locator(`.group-heading${subjectAttribute('data-select', 'schema.ts')}`).click();
  expect(await page.locator('.wire.edge-type').count()).toBeGreaterThan(0);
  await page.locator('#show-type-arrows').uncheck();
  await expect(page.locator('.wire.edge-type')).toHaveCount(0);
  expect(await page.locator('.wire.edge-table').count()).toBeGreaterThan(0);
  await page.locator('#show-edge-counts').uncheck();
  await expect(page.locator('.bundle-count')).toHaveCount(0);
  // The fixture's only config relation is a type reference, so type arrows must be shown again.
  await page.locator('#show-type-arrows').check();
  const config = page.locator('[data-column-toggle="column:5"]');
  await config.uncheck();
  await expect(page.locator(subjectAttribute('data-group', 'EcJwtConfig'))).toHaveCount(0);
  await expect(
    page.locator(`${subjectAttribute('data-group', 'user.types.ts')} .reference-tag`),
  ).toHaveCount(0);
  await expectOnlyDrawnRelations(page);
  const library = page.locator('[data-column-toggle="column:6"]');
  await library.uncheck();
  await expect(page.locator(subjectAttribute('data-group', 'JwtService'))).toHaveCount(0);
  await expect(
    page.locator(`${subjectAttribute('data-group', 'AuthService')} .reference-tag`),
  ).toHaveCount(0);
  await expectOnlyDrawnRelations(page);
  await library.check();
  await expect(page.locator(subjectAttribute('data-group', 'JwtService'))).toHaveCount(1);
});

// One group per column, so each heading can be checked against the boxes drawn beneath it.
const columnSamples: readonly (readonly [string, string, string])[] = [
  ['column:composition', 'Composition', 'app.ts'],
  ['column:0', 'Entry / Middleware', 'AuthController'],
  ['column:1', 'Use case', 'AuthService'],
  ['column:2', 'Domain', 'auth.schema.ts'],
  ['column:4', 'Adapter / Infrastructure', 'DrizzleService'],
  ['column:5', 'Config', 'EcJwtConfig'],
  ['column:6', 'ライブラリ', 'JwtConfig'],
];

async function expectHeadingsOverTheirBoxes(page: Page, hidden: readonly string[]) {
  const shown = columnSamples.filter(([id]) => !hidden.includes(id));
  await expect(page.locator('#column-headings span')).toHaveText(shown.map(([, label]) => label));
  const scroll = await page.locator('#map-scroll').boundingBox();
  if (!scroll) throw new Error('map is not rendered');
  for (const [, label, group] of shown) {
    const heading = await page.locator('#column-headings span', { hasText: label }).boundingBox();
    const box = await page.locator(subjectAttribute('data-group', group)).boundingBox();
    if (!heading || !box) throw new Error(`missing heading or box for ${label}`);
    expect(heading.y).toBeGreaterThanOrEqual(scroll.y);
    expect(heading.y + heading.height).toBeLessThanOrEqual(scroll.y + scroll.height);
    expect(box.x).toBeGreaterThanOrEqual(heading.x);
    expect(box.x + box.width).toBeLessThanOrEqual(heading.x + heading.width);
  }
}

test('keeps every shown column heading in view and above its boxes while columns are toggled', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('[data-group]')).toHaveCount(31);
  await expectHeadingsOverTheirBoxes(page, ['column:composition']);
  await page.locator('[data-column-toggle="column:composition"]').check();
  await expectHeadingsOverTheirBoxes(page, []);
  await page.locator('[data-column-toggle="column:composition"]').uncheck();
  await page.locator('[data-column-toggle="column:5"]').uncheck();
  await expectHeadingsOverTheirBoxes(page, ['column:composition', 'column:5']);
  await page.locator('[data-column-toggle="column:5"]').check();
  await page.locator('[data-column-toggle="column:6"]').uncheck();
  await expectHeadingsOverTheirBoxes(page, ['column:composition', 'column:6']);
  await expect(page.locator('#hidden-columns-notice')).toHaveCount(0);
});

test('hiding a column removes its boxes, the wires to them and every chip about them', async ({
  page,
}) => {
  await page.goto('/');
  await page.locator(`.group-heading${subjectAttribute('data-select', 'AuthService')}`).click();
  const toJwt = `.wire${subjectAttribute('data-to', 'JwtService')}`;
  const authControllerTags = `${subjectAttribute('data-group', 'AuthController')} .reference-tag`;
  await expect(page.locator(toJwt)).not.toHaveCount(0);
  await expect(page.locator(authControllerTags)).toContainText(['適用: Jwt']);
  await page.locator('[data-column-toggle="column:6"]').uncheck();
  await expect(page.locator(subjectAttribute('data-group', 'JwtService'))).toHaveCount(0);
  await expect(page.locator(toJwt)).toHaveCount(0);
  await expect(page.locator(authControllerTags)).not.toContainText(['Jwt']);
  await expect(
    page.locator(`${subjectAttribute('data-group', 'AuthService')} .reference-tag`),
  ).toHaveCount(0);
  await expectOnlyDrawnRelations(page);
});

test('shows unit and endpoint test tables separately from source', async ({ page }) => {
  await page.goto('/');
  await find(page, 'JwtService');
  await expect(page.locator('.unit-test')).toHaveCount(0);
  await expect(page.locator('.test-coverage').first()).toHaveText('未収録（テストの有無は未確認）');
  await page.locator('[data-tab="source"]').click();
  await expect(page.locator('.source-code')).toContainText('class JwtService');
  await find(page, 'POST /api/products', 'ProductController#create');
  await expect(page.locator('.endpoint-tests h4')).toHaveText('POST /api/products');
  expect(await page.locator('.e2e-test').count()).toBeGreaterThan(0);
  await expect(
    page.locator(
      `${subjectAttribute('data-declaration', 'ProductController#create')} .member-hint`,
    ),
  ).toHaveText(['POST /api/products']);
  await expect(page.locator('.unit-test')).toHaveCount(0);
  await find(page, 'CreateProductSchema', 'product.schema.ts#CreateProductSchema');
  await expect(page.locator('.unit-test')).toHaveCount(0);
  await expect(page.locator('.e2e-test')).toHaveCount(0);
  await find(page, 'POST /api/auth/register', 'AuthController#register');
  await expect(page.locator('.endpoint-tests .test-coverage')).toContainText('一部のみ · 0件');
  await expect(page.locator('.e2e-test')).toHaveCount(0);
  await find(page, 'AuthService#register');
  expect(await page.locator('.unit-test').count()).toBeGreaterThan(0);
  await expect(page.locator('.unit-test .test-style')).toContainText(['Sociable']);
  await find(page, 'requireUser', 'current-user.lib.ts#requireUser');
  await expect(page.locator('.unit-test .test-style').first()).toHaveText('関数');
});

test('shows setup in the details, not as lines on the map', async ({ page }) => {
  await page.goto('/');
  await find(page, 'AuthController#constructor');
  const setup = page.locator('.setup-item');
  await expect(setup).toHaveCount(1);
  await expect(setup.locator('code')).toHaveText('inject(AuthService)');
  await expect(page.locator(`.wire${subjectAttribute('data-to', 'AuthService')}`)).toHaveCount(0);
  await setup.locator(subjectAttribute('data-select', 'AuthService')).click();
  await expect(page.locator('.inspector-heading h2')).toHaveText('AuthService');
  await find(page, 'AuthController');
  await expect(page.locator('.setup-item code')).toHaveText([
    'inject(AuthService)',
    "@RateLimit({ limit: 3, windowSec: 60, key: 'auth:register' })",
    "@RateLimit({ limit: 5, windowSec: 60, key: 'auth:login' })",
    '@UseMiddleware(JwtMiddleware)',
  ]);
});

test('allocates tag space only while tags are rendered, including dimmed and expanded nodes', async ({
  page,
}) => {
  await page.goto('/');
  // Hiding the library column takes AuthController's library middleware tags away, keeping Logging.
  const group = page.locator(subjectAttribute('data-group', 'AuthController'));
  const library = page.locator('[data-column-toggle="column:6"]');
  for (const expanded of [false, true]) {
    if (expanded) await group.locator('[data-toggle]').click();
    const baseHeight = 62 + (await group.locator('[data-declaration]').count()) * 46;
    await expect(group.locator('.reference-tag')).toHaveCount(3);
    await expect(group).toHaveCSS('height', `${baseHeight + 74}px`);
    await library.uncheck();
    await expect(group.locator('.reference-tag')).toHaveText(['適用: Logging']);
    await expect(group).toHaveCSS('height', `${baseHeight + 48}px`);
    await page.locator(`.group-heading${subjectAttribute('data-select', 'CartService')}`).click();
    await expect(group).toHaveClass(/dimmed-group/);
    await expect(group).toHaveCSS('height', `${baseHeight + 48}px`);
    await library.check();
    await expect(group).toHaveCSS('height', `${baseHeight + 74}px`);
  }
});

test('restores node, lock, mode and tab on reload and browser back/forward', async ({ page }) => {
  await page.goto('/');
  await lockFrom(page, 'POST /api/products', 'ProductController#create');
  await find(page, 'sign', 'JwtService#sign');
  await page.locator('[data-tab="source"]').click();
  await expect
    .poll(() => new URL(page.url()).searchParams.get('node'))
    .toBe(nodeId('JwtService#sign'));
  const url = page.url();
  await page.reload();
  await expect(page.locator('.inspector-heading h2')).toHaveText('sign');
  await expect(page.locator('[data-tab="source"]')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#scope-status')).toContainText('固定基準: create');
  await page.locator('[data-tab="contract"]').click();
  await page.goBack();
  await expect(page).toHaveURL(url);
  await expect(page.locator('[data-tab="source"]')).toHaveAttribute('aria-selected', 'true');
  await page.goForward();
  await expect(page.locator('[data-tab="contract"]')).toHaveAttribute('aria-selected', 'true');
});

test('reaches the composition through search and hides it with its wires', async ({ page }) => {
  await page.goto('/');
  await expect(
    page.locator(`${subjectAttribute('data-group', 'AuthController')} .reference-tag`),
  ).not.toContainText(['Composition']);
  await find(page, 'app', 'app.ts#app');
  await expect(page.locator('[data-column-toggle="column:composition"]')).toBeChecked();
  const fromApp = `.wire${subjectAttribute('data-from', 'app.ts#app')}`;
  expect(await page.locator(fromApp).count()).toBeGreaterThan(0);
  await expect(page.locator(subjectAttribute('data-group', 'app.ts'))).toHaveCount(1);
  await expect(page.locator('.inspector-heading h2')).toHaveText('app');
  await expect(page.locator('[data-action="as-root"]')).toBeEnabled();
  await page.locator('[data-tab="source"]').click();
  await expect(page.locator('.source-code')).toContainText('createApp');
  await page.locator('[data-column-toggle="column:composition"]').uncheck();
  await expect(page.locator(subjectAttribute('data-group', 'app.ts'))).toHaveCount(0);
  await expect(page.locator(fromApp)).toHaveCount(0);
  await expectOnlyDrawnRelations(page);
  await page.locator('[data-action="help"]').click();
  await expect(page.locator('#help-dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#help-dialog')).toHaveCount(0);
});

test('reports fetch and URL failures rather than showing substituted data', async ({ page }) => {
  await page.route('**/ec-backend.snapshot.json', (route) =>
    route.fulfill({ status: 503, body: 'unavailable' }),
  );
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('HTTP 503');
  await expect(page.locator('[data-group]')).toHaveCount(0);
  await page.unroute('**/ec-backend.snapshot.json');
  await page.goto('/?node=does-not-exist');
  await expect(page.getByRole('alert')).toContainText('Unknown identity');
  await page.goto('/?mode=invalid');
  await expect(page.getByRole('alert')).toContainText('URL復元失敗');
});

test('keeps drawing operations local while preserving zoom, bulk folding and keyboard tabs', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: '100%', exact: true }).click();
  await expect(page.locator('#zoom-level')).toHaveText('100%');
  await page.getByRole('button', { name: '縮小', exact: true }).click();
  await expect(page.locator('#zoom-level')).toHaveText('90%');
  await find(page, 'sign', 'JwtService#sign');
  await page.locator('[data-tab="contract"]').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('[data-tab="source"]')).toBeFocused();
  await expect(page.locator('.source-code')).toContainText('sign');
  await page.locator('[data-action="expand-all"]').click();
  await expect(page.locator('[data-toggle][aria-expanded="true"]')).toHaveCount(31);
  await page.locator('[data-action="collapse-all"]').click();
  await expect(page.locator('[data-declaration]')).toHaveCount(0);
  await expect.poll(() => page.locator('#map-scroll').evaluate((el) => el.scrollTop)).toBe(0);
  await expect(page.locator('#zoom-level')).toHaveText('90%');
  await page.locator('#mini-map').getByRole('button', { name: 'JwtService', exact: true }).click();
  await expect(page.locator('.inspector-heading h2')).toHaveText('JwtService');
  await page.locator('[data-action="reset"]').click();
  await expect(page.locator('#scope-lock')).toBeDisabled();
  await expect(page).not.toHaveURL(/node=/);
});
