import 'server-only';
import nodemailer from 'nodemailer';

/**
 * Outgoing email over SMTP (works with Gmail/Workspace app passwords, Office 365, Resend, company mail servers…).
 * Without SMTP_HOST, development prints the message to the server console instead of sending it.
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

export async function sendMail(to: string, subject: string, text: string, html: string) {
  if (!transport) {
    if (process.env.NODE_ENV === 'production') throw new Error('SMTP_HOST is not configured');
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
