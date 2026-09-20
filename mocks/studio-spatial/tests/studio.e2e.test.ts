import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

async function find(page: Page, id: string) {
  await page.locator('#search').fill(id);
  await page
    .locator('[data-find]')
    .filter({ has: page.getByText(id, { exact: true }) })
    .click();
  await expect(page.locator('.inspector-heading h2')).toHaveText(id);
}

test('fetches JSON, shows the map without composition, and keeps every group collapsible', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const response = page.waitForResponse((r) => r.url().endsWith('ec-backend.snapshot.json'));
  await page.goto('/');
  expect((await response).ok()).toBe(true);
  await expect(page.locator('[data-group]')).toHaveCount(40);
  await expect(page.locator('[data-group="app.ts"]')).toHaveCount(0);
  await expect(page.locator('[data-declaration]')).toHaveCount(0);
  for (const id of ['ProductController', 'schema.ts', 'user.types.ts']) {
    const toggle = page.locator(`[data-toggle="${id}"]`);
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(await page.locator(`[data-group="${id}"] [data-declaration]`).count()).toBeGreaterThan(
      0,
    );
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
  await page.locator('#root-select').selectOption('entry:ProductController.create');
  await expect(page.locator('#scope-lock')).toHaveAttribute('aria-pressed', 'true');
  const arrows = await page
    .locator('.wire')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-edges')).sort());
  const dimmed = await page
    .locator('.dimmed-group')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-group')).sort());
  await page.locator('.group-heading[data-select="OrderService"]').click();
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
  const group = page.locator('[data-group="AuthController"]');
  await expect(group).toBeVisible();
  const count = await group.locator('.ref-middleware').count();
  await page.locator('.group-heading[data-select="AuthService"]').click();
  await expect(group).not.toHaveClass(/dimmed-group/);
  await expect(group.locator('.ref-middleware.dimmed')).toHaveCount(0);
  await page.locator('.group-heading[data-select="JwtConfig"]').click();
  await expect(group.locator('.ref-middleware')).toHaveCount(count);
  await expect(group).toHaveClass(/dimmed-group/);
  await expect(group.locator('.ref-middleware.dimmed')).toHaveCount(count);
});

test('toggles type/count/config visibility and exposes hidden config relations', async ({
  page,
}) => {
  await page.goto('/');
  await page.locator('.group-heading[data-select="schema.ts"]').click();
  expect(await page.locator('.wire.edge-type').count()).toBeGreaterThan(0);
  await page.locator('#show-type-arrows').uncheck();
  await expect(page.locator('.wire.edge-type')).toHaveCount(0);
  expect(await page.locator('.wire.edge-table').count()).toBeGreaterThan(0);
  await page.locator('#show-edge-counts').uncheck();
  await expect(page.locator('.bundle-count')).toHaveCount(0);
  await page.locator('#show-config').uncheck();
  await expect(page.locator('[data-group="JwtConfig"]')).toHaveCount(0);
  await page.locator('[data-group="JwtService"] .ref-config').click();
  await expect(page.locator('#reference-dialog')).toBeVisible();
  await page.locator('#reference-dialog [data-reference-jump="JwtConfig.secret"]').first().click();
  await expect(page.locator('#show-config')).toBeChecked();
  await expect(page.locator('.inspector-heading h2')).toHaveText('JwtConfig.secret');
  await page.locator('#reference-back').click();
  await expect(page.locator('#show-config')).not.toBeChecked();
  await expect(page.locator('.inspector-heading h2')).toHaveText('schema.ts');
});

test('shows unit and endpoint test tables separately from source', async ({ page }) => {
  await page.goto('/');
  await find(page, 'JwtService');
  await expect(page.locator('.unit-test')).toHaveCount(6);
  await expect(page.locator('.test-style').first()).toHaveText('Solitary');
  await expect(page.locator('.test-mocks').first()).toHaveText('なし');
  await page.locator('[data-tab="source"]').click();
  await expect(page.locator('.source-code')).toContainText('class JwtService');
  await find(page, 'ProductController.create');
  expect(await page.locator('.e2e-test').count()).toBeGreaterThan(0);
  await expect(page.locator('.unit-test')).toHaveCount(0);
  await find(page, 'CreateProductSchema');
  await expect(page.locator('.unit-test')).toHaveCount(0);
  await expect(page.locator('.e2e-test')).toHaveCount(0);
});

test('restores node, lock, mode and tab on reload and browser back/forward', async ({ page }) => {
  await page.goto('/');
  await page.locator('#root-select').selectOption('entry:ProductController.create');
  await find(page, 'JwtService.sign');
  await page.locator('[data-tab="source"]').click();
  await expect(page).toHaveURL(/node=JwtService.sign/);
  const url = page.url();
  await page.reload();
  await expect(page.locator('.inspector-heading h2')).toHaveText('JwtService.sign');
  await expect(page.locator('[data-tab="source"]')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#scope-status')).toContainText('固定基準: ProductController.create');
  await page.locator('[data-tab="contract"]').click();
  await page.goBack();
  await expect(page).toHaveURL(url);
  await expect(page.locator('[data-tab="source"]')).toHaveAttribute('aria-selected', 'true');
  await page.goForward();
  await expect(page.locator('[data-tab="contract"]')).toHaveAttribute('aria-selected', 'true');
});

test('shows composition and help without introducing graph nodes', async ({ page }) => {
  await page.goto('/');
  await page.locator('#composition-button').click();
  await expect(page.locator('#reference-dialog')).toBeVisible();
  await page.locator('[data-composition-source]').click();
  await expect(page.locator('.source-code')).toContainText('createEcApp');
  await expect(page.locator('[data-action="as-root"]')).toBeDisabled();
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
  await find(page, 'JwtService.sign');
  await page.locator('[data-tab="contract"]').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('[data-tab="source"]')).toBeFocused();
  await expect(page.locator('.source-code')).toContainText('sign');
  await page.locator('[data-action="expand-all"]').click();
  await expect(page.locator('[data-toggle][aria-expanded="true"]')).toHaveCount(40);
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
