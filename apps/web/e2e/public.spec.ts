import { expect, test } from '@playwright/test';

// A card of the pilot (AC Cambrai, 2026-27 squad, 5th player): generated, so always there.
const CARD = 'ac-cambrai-59122-2026-27-05';

test('a public card page shows the card, its club, and share images', async ({ page, request }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`/carte/${CARD}`);

  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('img', { name: /Carte de/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /AC Cambrai/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Partager' })).toBeVisible();

  // Link previews: Open Graph image as JPEG, story as PNG.
  const ogImage = await page.locator('meta[property="og:image"]').getAttribute('content');
  expect(ogImage).toContain(`/carte/${CARD}/opengraph-image`);
  const og = await request.get(new URL(ogImage ?? '').pathname);
  expect(og.status()).toBe(200);
  expect(og.headers()['content-type']).toBe('image/jpeg');
  const story = await request.get(`/carte/${CARD}/story`);
  expect(story.status()).toBe(200);
  expect(story.headers()['content-type']).toBe('image/png');
  // PNG header: width and height of the story (1080 × 1920).
  const png = await story.body();
  expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1080, 1920]);

  // Another version of the card, then its club.
  await page.getByRole('link', { name: 'Onze du week-end' }).click();
  await expect(page).toHaveURL(new RegExp(`/carte/${CARD}~weekend$`));
  await page.getByRole('link', { name: /AC Cambrai/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'AC Cambrai' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('a public club page lists its squad, each player linking to his card', async ({ page }) => {
  await page.goto('/club/ac-cambrai-59122');
  await expect(page.getByRole('heading', { level: 1, name: 'AC Cambrai' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Maillots' })).toBeVisible();
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
    'content',
    /\/club\/ac-cambrai-59122\/opengraph-image/,
  );
  await page.locator(`a[href="/carte/${CARD}"]`).click();
  await expect(page).toHaveURL(new RegExp(`/carte/${CARD}$`));
});

test('an unknown card or club is a 404', async ({ request }) => {
  expect((await request.get('/carte/nope')).status()).toBe(404);
  expect((await request.get('/club/nope')).status()).toBe(404);
});
