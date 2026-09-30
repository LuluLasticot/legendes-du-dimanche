import { expect, test } from '@playwright/test';

test('the ball lab mounts and switches situations', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  // Low quality: the runners render WebGL in software.
  await page.goto('/lab/ball?q=low');

  await expect(page.locator('canvas')).toBeVisible();
  const tabs = page.getByRole('tab');
  await expect(tabs).toHaveCount(5);
  // The scene is up once the first step's hint shows: tabs only work from then on.
  await expect(page.getByText(/Trace ta frappe/)).toBeVisible({ timeout: 30_000 });

  await page.getByRole('tab', { name: 'Penalty' }).click();
  await expect(page.getByRole('tab', { name: 'Penalty' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('La puissance se dose ensuite avec la jauge')).toBeVisible();

  await page.getByRole('tab', { name: 'Gardien' }).click();
  await expect(page.getByText('Tu es dans les cages')).toBeVisible();

  expect(errors).toEqual([]);
});

test('a whole match: kick-off, half-time, full time, and a deterministic replay', async ({
  page,
}) => {
  test.slow();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  // Straight to kick-off, key moments left to the coach, fast-forward.
  await page.goto('/lab/match?auto=1&speed=40&seed=2');

  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Deuxième mi-temps' })).toBeVisible({
    timeout: 45_000,
  });
  await page.getByRole('button', { name: 'Deuxième mi-temps' }).click();
  await expect(page.getByRole('button', { name: 'Nouveau match' })).toBeVisible({
    timeout: 45_000,
  });
  await page.getByRole('button', { name: 'Rejouer avec les mêmes entrées' }).click();
  await expect(page.getByRole('status')).toContainText('Même match');
  expect(errors).toEqual([]);
});

test('the pre-match screen starts a match', async ({ page }) => {
  await page.goto('/lab/match?seed=3&speed=6');
  await expect(page.getByRole('button', { name: "Coup d'envoi" })).toBeVisible();
  // Key moments left to the coach: no 3D wait in this test.
  await page.getByLabel('Jouer les actions clés en 3D').uncheck();
  await page.getByRole('button', { name: "Coup d'envoi" }).click();
  // The clock runs: after a few seconds the minute has moved on.
  const minute = page.getByTestId('minute');
  await expect
    .poll(async () => Number.parseInt((await minute.textContent()) ?? '0', 10), {
      timeout: 25_000,
    })
    .toBeGreaterThan(3);
});

test('the clubs lab searches the pilot and opens a club sheet', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/lab/clubs');

  await expect(page.getByRole('status')).toContainText('clubs');
  await page.getByRole('searchbox').fill('cambrai');
  await expect(page.getByRole('status')).toContainText(/\d+ clubs?/);
  await page.getByRole('button', { name: /AC Cambrai/ }).click();

  // Crest, kits, sponsors and squad of the club.
  await expect(page.getByRole('heading', { level: 2, name: 'AC Cambrai' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'AC Cambrai' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Maillots' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Sponsors fictifs' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Gardiens' })).toBeVisible();

  await page.getByRole('button', { name: /Retour à la galerie/ }).click();
  await expect(page.getByRole('searchbox')).toBeVisible();
  expect(errors).toEqual([]);
});
