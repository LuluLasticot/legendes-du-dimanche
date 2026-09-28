import { expect, test } from '@playwright/test';

test('the ball lab mounts and switches situations', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  // Low quality: the runners render WebGL in software.
  await page.goto('/lab/ball?q=low');

  await expect(page.locator('canvas')).toBeVisible();
  const tabs = page.getByRole('tab');
  await expect(tabs).toHaveCount(5);

  await page.getByRole('tab', { name: 'Penalty' }).click();
  await expect(page.getByRole('tab', { name: 'Penalty' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('La puissance se dose ensuite avec la jauge')).toBeVisible();

  await page.getByRole('tab', { name: 'Gardien' }).click();
  await expect(page.getByText('Tu es dans les cages')).toBeVisible();

  expect(errors).toEqual([]);
});
