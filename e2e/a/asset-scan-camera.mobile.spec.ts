import { test, expect, type Page } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loginAs, USERS } from '../helpers';

// Barcode scanner with a live camera on the warranty lookup (Pixel 7 project). Chrome plays a generated Y4M file as the camera feed.
// Headless Chromium on Linux has no native BarcodeDetector, so this exercises the ZXing WebAssembly fallback.

// QR code for "MN-0050" (21×21 modules, # = dark), fed to Chrome as a fake camera.
const QR = ['#######.#.....#######', '#.....#...###.#.....#', '#.###.#.###.#.#.###.#', '#.###.#..##.#.#.###.#', '#.###.#.#####.#.###.#',
  '#.....#.....#.#.....#', '#######.#.#.#.#######', '........#.#..........', '.....##..##...#.#.#.#', '.#...#..#.#..#####.##', '###.#.##.#..#.##...#.',
  '##..##....##.#.#.####', '#######...#..#.###...', '........##..#.#....##', '#######..##...#.#...#', '#.....#.#..#..#...##.', '#.###.#..#.#.##.#.#..',
  '#.###.#......#....#..', '#.###.#..########.###', '#.....#..#.##....##.#', '#######..##..###..#..'];
/** One-frame Y4M video (Chrome loops it) with the QR code centred on white. */
function qrVideo(): string {
  const W = 320, H = 240, S = 6, x0 = (W - 21 * S) >> 1, y0 = (H - 21 * S) >> 1;
  const y = Buffer.alloc(W * H, 255);
  QR.forEach((row, r) => [...row].forEach((c, k) => {
    if (c === '#') for (let dy = 0; dy < S; dy++) y.fill(0, (y0 + r * S + dy) * W + x0 + k * S, (y0 + r * S + dy) * W + x0 + (k + 1) * S);
  }));
  const file = path.join(tmpdir(), 'e2e-asset-qr.y4m');
  writeFileSync(file, Buffer.concat([Buffer.from(`YUV4MPEG2 W${W} H${H} F15:1 Ip A1:1 C420jpeg\nFRAME\n`), y, Buffer.alloc((W / 2) * (H / 2) * 2, 128)]));
  return file;
}
test.use({
  permissions: ['camera'],
  launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${qrVideo()}`] },
});

async function openScanner(page: Page) {
  await loginAs(page, USERS.storekeeper);
  await page.goto('/warranty');
  await page.getByRole('button', { name: 'สแกน Serial' }).tap();
  return page.getByRole('dialog');
}

test('pointing the camera at a QR looks up that serial', async ({ page }) => {
  const dlg = await openScanner(page);
  await expect(dlg.getByLabel('ภาพจากกล้อง')).toBeVisible();
  await expect(dlg).toBeHidden({ timeout: 15_000 });                 // closes by itself once it reads
  await expect(page).toHaveURL(/\/warranty\?q=MN-0050$/);
  // camera is released when the scanner closes
  expect(await page.evaluate(() => [...document.querySelectorAll('video')].filter(v => (v.srcObject as MediaStream | null)?.active).length)).toBe(0);
});
