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

test('the cards lab shows every template and finds a player', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/lab/cards');

  // Bronze, silver and gold (common and rare), and the two promos.
  const cards = page.getByRole('img', { name: /^Carte de / });
  await expect(cards).toHaveCount(8);
  await expect(page.getByText('Onze du week-end ·')).toBeVisible();
  await expect(page.getByText('Ancien pro ·')).toBeVisible();

  await page.getByRole('searchbox').fill('escaudain');
  await expect(page.getByRole('status')).toContainText('12 cartes');
  await expect(cards).toHaveCount(20);

  // Tuning redraws the cards; the reset button comes back to the defaults.
  const reset = page.getByRole('button', { name: 'Valeurs par défaut' });
  await expect(reset).toBeDisabled();
  await page.getByLabel('Grain').fill('0');
  await expect(reset).toBeEnabled();
  expect(errors).toEqual([]);
});

test('a card opens in 3D, reveals itself and turns over', async ({ page }) => {
  test.slow();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  // Low quality: the runners render WebGL in software.
  await page.goto('/lab/cards?q=low');
  await page
    .getByRole('button', { name: /^Voir en 3D/ })
    .first()
    .click();

  const dialog = page.getByRole('dialog', { name: 'Carte en 3D' });
  await expect(dialog.locator('canvas')).toBeVisible();
  // Textures drawn (fonts embedded), scene mounted: the buttons come alive.
  const flip = dialog.getByRole('button', { name: 'Retourner' });
  await expect(flip).toBeEnabled({ timeout: 30_000 });
  await flip.click();
  await dialog.getByRole('button', { name: 'Rejouer la révélation' }).click();
  await dialog.getByRole('button', { name: 'Fermer' }).click();
  await expect(dialog).toBeHidden();
  expect(errors).toEqual([]);
});

const packTuning = (overrides: Record<string, number>) => ({
  walkoutRank: 4,
  lightsGap: 0.42,
  clueHold: 1.25,
  tension: 1.5,
  flash: 1,
  shake: 1,
  particles: 1,
  gagChance: 0,
  speed: 3,
  ...overrides,
});

test('a pack opens: tear, the best card, the grid, the summary', async ({ page }) => {
  test.slow();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript((tuning) => {
    window.localStorage.setItem('ld.lab.pack.tuning', JSON.stringify(tuning));
  }, packTuning({}));
  await page.goto('/lab/pack?q=low');

  const stage = page.locator('[data-step]');
  await expect(stage).toHaveAttribute('data-step', 'idle', { timeout: 60_000 });
  await page.getByRole('button', { name: 'Ouvrir le pack' }).click();
  await expect(stage).toHaveAttribute('data-step', 'hero', { timeout: 60_000 });
  await expect(page.getByText('Touche pour voir le reste du pack')).toBeVisible();

  await page.locator('canvas').click();
  await expect(stage).toHaveAttribute('data-step', 'grid');
  await page.getByRole('button', { name: 'Tout retourner' }).click();
  await expect(stage).toHaveAttribute('data-step', 'summary', { timeout: 30_000 });
  await expect(page.getByRole('status')).toContainText('Ton pack');
  await expect(page.getByRole('button', { name: 'Nouveau pack' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('a small pack can play a joke, and the odds are shown', async ({ page }) => {
  test.slow();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(
    (tuning) => {
      window.localStorage.setItem('ld.lab.pack.tuning', JSON.stringify(tuning));
    },
    packTuning({ gagChance: 1, speed: 1.5 }),
  );
  await page.goto('/lab/pack?q=low');
  const stage = page.locator('[data-step]');
  await expect(stage).toHaveAttribute('data-step', 'idle', { timeout: 60_000 });

  await page.getByRole('combobox', { name: 'Type de pack' }).selectOption('bronze');
  await expect(stage).toHaveAttribute('data-step', 'idle', { timeout: 60_000 });
  // A bronze pack's best card is a bronze rare, unless a promo shows up (0.8 %): pin it.
  await page.getByRole('combobox', { name: 'Meilleure carte' }).selectOption('bronze-rare');
  await expect(stage).toHaveAttribute('data-step', 'idle', { timeout: 60_000 });
  await page.getByRole('button', { name: 'Probabilités' }).click();
  await expect(page.getByRole('region', { name: 'Probabilités' })).toContainText('Bronze rare');

  await page.getByRole('button', { name: 'Ouvrir le pack' }).click();
  await expect(stage).toHaveAttribute('data-step', /^gag-(flicker|dog)$/, { timeout: 60_000 });
  await expect(stage).toHaveAttribute('data-step', 'hero', { timeout: 60_000 });
  expect(errors).toEqual([]);
});
