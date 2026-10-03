import { test, expect, type Page } from '@playwright/test';
import { loginAs, USERS } from '../helpers';

// Scan button in "อุปกรณ์ที่ถือครอง" (hand-over) on a phone (Pixel 7 project). No camera in headless
// Chromium, so the scanner reads a photo (ZXing WebAssembly). Read-only: nothing is handed over.

// Code 128 "TB-0025" — a free iPad in the seeded register
const FREE = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAWsAAACWCAAAAAA9VvbXAAACzklEQVR4XmP8z4APMIIlgWqADIhKOAOiDVkBA0wxXApZI1AQopcRmzKILJCEaEE2ClkXmgJkLlwj3J0QWbjJyFysijEthehFU4xmIFZPMWADTAyjgF4hMBrW9Etro2E9GtbDsWQbTdej6Xo0XY+2WSgJgdEyZLQMGS1DRsuQ0TJkaKSB0fJ6tLweLa9Hy+vR8nq0vB7NBaghMFo3jtaNo3XjaKkwWjeO1o2juWC0bhyoNDDaDhlth4y2Q0ZL4NF2yGg7ZDQXjLZDRtshwz8XjLb5Rtt8o22+0dputM032uYbzQWjbb7RNt9om2+0HKBeCIy2r0fb18MxP42m69F0PZquR2vK0X7jaL9xNBeM9hsHKg2MtkNG2yGj7ZDREni0HTLaDhnNBaPtkNF2yPDPBaNtvtE232ibb7S2G23zjbb5RnPBaJtvtM032uYbLQeoFwKj7evR9vVo+3q0RKEkBEbLkNEyZLQMGS1DRsuQoZEGRsvr0fJ6tLweLa9Hy+vR8no0F6CGwGjdOFo3jtaNo6XCaN04WjeO5oLRunGg0sBoO2S0HTLaDhktgUfbIaPtkNFcMNoOGW2HDP9cMNrmG23zjbb5Rmu70TbfaJtvNBeMtvlG23yjbb7RcoB6ITDavqZfahoN69GwHu3LjJbeo32Z0b7MaC5ADYHRunG0bhytG0dLhdG6cbRuHM0Fo3XjQKWB0XbIaDtktB0yWgKPtkNG2yGjuWC0HTLaDhn+uWC0zTfa5htt843WdqNtvtE232guGG3zjbb5Rtt8o+UA9UJgtH092r4ebV+PliiUhMBoGTJahoyWIaNlyGgZMjTSwGh5PVpej5bXo+X1aHk9Wl6P5gLUEBitG0frxtG6cbRUGK0bR+vG0VwwWjcOVBoYbYeMtkNG2yGjJfBoO2S0HTKaC0bbIaPtkOGfC0bbfKNtvtE232htN9rmGxppAABMcB4rRqDJgQAAAABJRU5ErkJggg==', 'base64');
// Code 128 "E2ECON-NEW" — not in the register
const UNKNOWN = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAe8AAACWCAAAAADSuF+sAAADm0lEQVR4XmP8z4APMIIlgWqADIhKOAOiDZmLqRioBi4IZwMZyEYRYwLckURaB7ECzT2MMI8imwZXCXcSsl5MpzLAAgTufTQTkL2M6VqCitEciRl6aI5HNpAR1W0M2AATwygYSSEwGt8jK72PxvdofI+W8MM3BEbz92j+Hs3fo/l7NA0MjxAYLc9Hy/PRvDxano+mgdHyfDQNDL0QGK2/R+vv0Xw7Wn+PpoHR+ns0DYzW36NpYHCHwGh7bbS9NppHR9tro2lgtL02mgZG22ujaWC0vTaaBgZPCIy2z0fb56P5cbR9PpoGhkcIjJbno+X5aF4eLc9H08BoeT6aBkbHW0bTwOAOgdH22mh7bTSPjrbXRtPAaHttNA2MttdG08Boe200DQyeEBhtn4+2z0fz42j7fDQNDI8QGC3PR8vz0bw8Wp6PpoHR8nw0DQy9EBitv0fr79F8O1p/j6aB0fp7NA2M1t+jaWBwh8Boe220vTaaR0fba6NpYLS9NpoGRttro2lgtL02mgYGTwiMts9H2+ej+XG0fT6aBoZHCIyW56Pl+WheHi3PR9PAaHk+mgaGXgiM1t+j9fdovh2tv0fTwGj9PZoGRuvv0TQwuENgtL022l4bzaOj7bXRNDDaXhtNA6PttdE0MNpeG00DgycERtvno+3z0fw42j4fTQPDIwRGy/PR8nw0L4+W56NpYLQ8H00DQy8ERuvv0fp7NN+O1t+jaWC0/h5NA6P192gaGNwhMNpeG22vjebR0fbaaBoYba+NpoHR9tpoGhhtr42mgcETAqPt89H2+Wh+HG2fj6aB4RECo+X5aHk+mpdHy/PRNDBano+mgaEXAqP192j9PZpvR+vv0TQwWn+PpoHR+ns0DQzuEBhtr42210bz6Gh7bTQNjLbXRtPAaHttNA2MttdG08DgCYHR9vlo+3w0P462z0fTwPAIgdHyfLQ8H83Lo+X5aBoYLc9H08DQC4HR+nu0/h7Nt6P192gaGK2/R9PAaP09mgYGdwiMttdG22ujeXS0vTaaBkbba6NpYLS9NpoGRttro2lg8ITAaPt8tH0+mh9H2+ejaWB4hMBoeT5ano/m5dHyfDQNjJbno2lg6IXAaP09Wn+P5tvR+ns0DYzW36NpYLT+Hk0DgzsERttro+210Tw62l4bTQOj7bXRNDDaXhtNA6PttdE0MHhCYLR9Pto+H82Po+3z0TQwPEJgtDwfLc9H8/LwDQEAfZIqK4jR8OYAAAAASUVORK5CYII=', 'base64');

async function scan(page: Page, png: Buffer) {
  await page.getByRole('button', { name: /สแกนบาร์โค้ด/ }).tap();
  const scanner = page.getByRole('dialog').filter({ hasText: 'สแกนบาร์โค้ด / QR' });
  await scanner.locator('input[aria-label="ถ่ายรูปบาร์โค้ด"]').setInputFiles({ name: 'tag.png', mimeType: 'image/png', buffer: png });
  await expect(scanner).toBeHidden({ timeout: 15_000 });
}

test('scanning a sticker fills the hand-over form', async ({ page }) => {
  await loginAs(page, USERS.itsupport);
  await page.goto('/employees');
  await page.locator('tr', { hasText: 'ณัฐธิดา' }).getByRole('button', { name: /อุปกรณ์/ }).tap();
  const dlg = page.getByRole('dialog').filter({ hasText: 'อุปกรณ์ที่ถือครอง' });

  // a free device: tag, type and model come from the register
  await scan(page, FREE);
  await expect(dlg.locator('#h-tag')).toHaveValue('TB-0025');
  await expect(dlg.locator('#h-model')).toHaveValue('iPad 10th Gen');
  await expect(dlg.locator('#h-type')).toHaveValue('iPad / Tablet');

  // an unknown sticker: tag only, with a hint to fill in the rest
  await scan(page, UNKNOWN);
  await expect(dlg.locator('#h-tag')).toHaveValue('E2ECON-NEW');
  await expect(dlg.locator('#h-model')).toHaveValue('');
  await expect(dlg.getByRole('status')).toContainText('ไม่อยู่ในรายการอุปกรณ์ว่าง');

  await dlg.getByRole('button', { name: 'ปิด' }).tap();
  await expect(dlg).toBeHidden();
});
