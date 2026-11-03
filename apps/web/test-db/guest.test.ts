import { describe, expect, it } from 'vitest';
import { newGuest } from './harness.ts';

describe('guest sign-in', () => {
  it('creates an anonymous account with its own identity', async () => {
    const a = await newGuest();
    const b = await newGuest();
    expect(a.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(a.id).not.toBe(b.id);
    const { data } = await a.client.auth.getUser();
    expect(data.user?.is_anonymous).toBe(true);
  });
});
