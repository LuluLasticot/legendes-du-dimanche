import { expect, test } from '@playwright/test';

// The slice from the first visit to the first reward (spec §11): needs local Supabase
// (`pnpm db:start`, apps/web/.env.local); skipped without it.
test.skip(!process.env.NEXT_PUBLIC_SUPABASE_URL, 'needs local Supabase');

test('a new player: welcome, club, starter pack, eleven, first match, first reward', async ({
  page,
}) => {
  test.setTimeout(6 * 60_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/jouer');
  await expect(page).toHaveURL(/\/jouer\/bienvenue$/);
  await page.getByRole('button', { name: 'Commencer' }).click();

  await expect(page).toHaveURL(/\/jouer\/bienvenue\/club$/);
  await page.getByRole('searchbox').fill('bermerain');
  await page.getByRole('button', { name: /AC Bermerain/ }).click();
  await page.getByRole('button', { name: 'Choisir AC Bermerain' }).click();

  // The starter pack is opened by the server as the page loads; the 3D scene is the lab's.
  await expect(page).toHaveURL(/\/jouer\/bienvenue\/pack$/);
  await expect(page.locator('[data-step]')).toHaveAttribute('data-step', /idle|failed/, {
    timeout: 90_000,
  });

  await page.goto('/jouer/equipes?accueil=1');
  await expect(page.getByText('Voici ton onze')).toBeVisible();
  await page.getByRole('link', { name: 'Continuer vers La Une' }).click();
  await expect(page.getByText('2 sur 5')).toBeVisible();

  // The match, the key moments left to the coach, at full speed.
  await page.goto('/jouer/match?auto=1&speed=6');
  await page.getByRole('button', { name: "Coup d'envoi" }).click();
  await page.getByRole('button', { name: 'Deuxième mi-temps' }).click({ timeout: 180_000 });
  await expect(page.getByText('Match validé')).toBeVisible({ timeout: 180_000 });
  await page.getByRole('link', { name: 'Retour à La Une' }).click();

  await expect(page).toHaveURL(/\/jouer$/);
  await expect(page.getByText('3 sur 5')).toBeVisible();
  const credits = await page.locator('header dd').first().innerText();
  expect(Number(credits.replace(/\D/g, ''))).toBeGreaterThan(1000);
  expect(errors).toEqual([]);
});
