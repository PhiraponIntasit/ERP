import { notFound } from 'next/navigation';
import { config } from '@/lib/domain';
import { enterDemoShop } from '@/server/actions/demo';

export default async function DemoShopPage({ searchParams }: { searchParams: Promise<{ missing?: string }> }) {
  if (!config.showDemo()) notFound();
  const missing = (await searchParams).missing;
  return (
    <div className="stack-4" style={{ maxWidth: 560 }}>
      <h1 className="section-h">เดโมหน้าร้าน</h1>
      <p className="lead">เข้าเป็นลูกค้าตัวอย่าง (มานี ใจดี) เพื่อสาธิตการสั่งซื้อ → ชำระเงินด้วย PromptPay QR โหมดเดโม → หลังร้านแพ็กและจัดส่ง ถ้าตะกร้าว่าง ระบบใส่ CPU 1 ชิ้นกับสาย HDMI 2 เส้นให้</p>
      {missing && <div className="err">ไม่พบลูกค้าตัวอย่าง — รัน seed ข้อมูลตัวอย่างก่อน</div>}
      <form action={enterDemoShop}><button className="btn btn-primary">เข้าหน้าร้านในฐานะลูกค้าตัวอย่าง</button></form>
      <p className="muted" style={{ fontSize: 13 }}>หน้านี้มีเฉพาะเมื่อเปิดบัญชีทดลอง (SHOW_DEMO_ACCOUNTS=true) — ปิดใน production</p>
    </div>
  );
}
