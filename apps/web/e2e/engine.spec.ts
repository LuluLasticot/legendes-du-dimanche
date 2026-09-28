import { expect, test } from '@playwright/test';

// The home page runs the engine self-test in the visitor's browser: this is the cross-engine
// determinism check (Chromium, Firefox, WebKit must all match the committed fingerprint).
test('the engine is bit-identical in this browser', async ({ page }) => {
  await page.goto('/');
  const badge = page.getByTestId('determinism');
  await expect(badge).toHaveAttribute('data-state', /ok|mismatch/, { timeout: 30_000 });
  await expect(badge).toHaveAttribute('data-state', 'ok');
});
