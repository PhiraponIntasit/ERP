import { test, expect, type Page } from '@playwright/test';
import { db, loginAs, USERS } from '../helpers';

const OPEN = ['new', 'assigned', 'progress', 'waiting'];
const kpi = (page: Page, label: string) => page.locator('.kpi', { hasText: label });

test('dashboard KPIs match the database', async ({ page }) => {
  const [open, newN, total, done, pending, critical] = await Promise.all([
    db.ticket.count({ where: { status: { in: OPEN } } }),
    db.ticket.count({ where: { status: 'new' } }),
    db.ticket.count(),
    db.ticket.count({ where: { status: { in: ['resolved', 'closed'] } } }),
    db.purchaseRequest.count({ where: { status: { in: ['pending', 'pending_exec'] } } }),
    db.ticket.count({ where: { urgency: 'critical', status: { in: OPEN } } }),
  ]);
  await loginAs(page, USERS.manager);
  await page.goto('/dashboard');
  await expect(kpi(page, 'คำร้องที่เปิดอยู่').locator('.kpi-value')).toHaveText(`${open}งาน`);
  await expect(kpi(page, 'คำร้องที่เปิดอยู่')).toContainText(`รอมอบหมาย ${newN} · วิกฤต ${critical}`);
  await expect(kpi(page, 'อัตราแก้ไขเสร็จ')).toContainText(`เสร็จ ${done} จาก ${total} งาน`);
  await expect(kpi(page, 'รออนุมัติจัดซื้อ').locator('.kpi-value')).toHaveText(`${pending}ใบ`);
});

test('a resolved ticket past its SLA lowers the SLA rate; an open one counts as overdue', async ({ page }) => {
  const tag = `E2E-SLA-${Date.now()}`;
  const req = await db.user.findUniqueOrThrow({ where: { username: USERS.employee } });
  const longAgo = new Date(Date.now() - 10 * 864e5);
  const read = async () => {
    await page.goto('/dashboard');
    const sla = kpi(page, 'งานซ่อมทัน SLA');
    return { rate: await sla.locator('.kpi-value').innerText(), overdue: Number((await sla.locator('.card-meta').innerText()).match(/\d+/)![0]) };
  };
  await loginAs(page, USERS.manager);
  const before = await read();
  // critical = 4 h SLA: one resolved after 2 days (missed), one still open after 10 days (overdue)
  await db.ticket.createMany({ data: [
    { id: `${tag}-A`, title: tag, cat: 'laptop', urgency: 'critical', desc: '', requesterId: req.id, created: longAgo, status: 'closed', resolvedAt: new Date(longAgo.getTime() + 2 * 864e5) },
    { id: `${tag}-B`, title: tag, cat: 'laptop', urgency: 'critical', desc: '', requesterId: req.id, created: longAgo, status: 'new' },
  ] });
  try {
    const after = await read();
    expect(after.overdue).toBe(before.overdue + 1);
    const pct = (s: string) => Number(s.replace(/\D/g, ''));
    expect(pct(after.rate)).toBeLessThanOrEqual(pct(before.rate));
  } finally {
    await db.ticket.deleteMany({ where: { id: { startsWith: tag } } });
  }
});
