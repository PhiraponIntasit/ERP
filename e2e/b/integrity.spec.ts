import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { db } from '../helpers';

// The money & stock rules in scripts/integrity.sql (also run on every nightly backup) hold on the test database:
// whatever the other tests did through the app, held stock, payments, serials and coupon uses still add up.
test('money & stock invariants hold', async () => {
  const sql = readFileSync(path.resolve('scripts/integrity.sql'), 'utf8');
  expect(await db.$queryRawUnsafe(sql)).toEqual([]);
});
