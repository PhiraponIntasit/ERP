// Password rules shared by every place a password is set (admin create/reset, self-service change, email reset).
// Existing passwords shorter than this keep working; the rule applies when a password is set.
export const MIN_PASSWORD = 8;
export const MAX_PASSWORD = 128;

export function passwordProblem(p: string): string | null {
  if (p.length < MIN_PASSWORD) return `รหัสผ่านอย่างน้อย ${MIN_PASSWORD} ตัวอักษร`;
  if (p.length > MAX_PASSWORD) return `รหัสผ่านยาวได้ไม่เกิน ${MAX_PASSWORD} ตัวอักษร`;
  return null;
}
