import 'server-only';
import nodemailer from 'nodemailer';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

/**
 * Outgoing email over SMTP (works with Gmail/Workspace app passwords, Office 365, Resend, company mail servers…).
 * Without SMTP_HOST, development prints the message to the server console instead of sending it, and also
 * writes it to the outbox folder (default ./storage/outbox in development; set MAIL_OUTBOX_DIR to enable it
 * elsewhere, e.g. in CI) so e2e tests can read what would have been sent.
 */
const host = process.env.SMTP_HOST;
const transport = host
  ? nodemailer.createTransport({
      host,
      port: Number(process.env.SMTP_PORT || 587),
      secure: Number(process.env.SMTP_PORT || 587) === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    })
  : null;

export const mailConfigured = () => !!transport;

const outbox = process.env.MAIL_OUTBOX_DIR || (process.env.NODE_ENV !== 'production' ? './storage/outbox' : '');
/** Where unsent mail is captured instead of sent (no SMTP). Empty in production unless MAIL_OUTBOX_DIR is set. */
export const outboxDir = () => (transport ? '' : outbox);

export async function sendMail(to: string, subject: string, text: string, html: string) {
  if (!transport) {
    if (outbox) {
      const dir = path.resolve(/*turbopackIgnore: true*/ outbox);
      await mkdir(dir, { recursive: true });
      await writeFile(path.join(/*turbopackIgnore: true*/ dir, `${Date.now()}-${randomBytes(4).toString('hex')}.json`), JSON.stringify({ at: new Date().toISOString(), to, subject, text, html }));
    }
    if (process.env.NODE_ENV === 'production') {
      if (outbox) return;
      throw new Error('SMTP_HOST is not configured');
    }
    console.info(`\n[mail:dev] To: ${to}\nSubject: ${subject}\n\n${text}\n`);
    return;
  }
  await transport.sendMail({ from: process.env.MAIL_FROM || process.env.SMTP_USER, to, subject, text, html });
}

/**
 * Absolute base URL for links in emails. Must come from config, never from the request's Host header
 * (a forged Host would otherwise send reset links pointing at an attacker's site).
 */
export function appUrl(): string | null {
  const u = process.env.APP_URL || (process.env.NODE_ENV !== 'production' ? 'http://localhost:3000' : '');
  return u ? u.replace(/\/+$/, '') : null;
}
