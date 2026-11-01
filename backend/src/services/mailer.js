// Sends email through SMTP (any provider: Gmail app password, Brevo, Mailgun, ...). Configure with SMTP_HOST, SMTP_PORT,
// SMTP_USER, SMTP_PASS and MAIL_FROM. With no SMTP_HOST, outside production the message is printed in the server
// console instead, so password reset can still be tried on a laptop. In production nothing is printed (it would leak links).
import nodemailer from 'nodemailer';

let override = null;
let cached = null; // { key, transport }

// Tests inject a function ({ to, subject, text }) => Promise. Pass null to restore the real mailer.
export const setMailer = (fn) => { override = fn; };

export const mailConfigured = () => Boolean(process.env.SMTP_HOST);

function transportFor() {
  const key = [process.env.SMTP_HOST, process.env.SMTP_PORT, process.env.SMTP_USER, process.env.SMTP_PASS, process.env.SMTP_SECURE].join('|');
  if (!cached || cached.key !== key) {
    const port = Number(process.env.SMTP_PORT) || 587;
    cached = {
      key,
      transport: nodemailer.createTransport({
        host: process.env.SMTP_HOST, port, secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : port === 465,
        auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
        connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 15_000
      })
    };
  }
  return cached.transport;
}

export async function sendMail({ to, subject, text }) {
  if (override) return override({ to, subject, text });
  if (!mailConfigured()) {
    if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test') console.log(`\n[email not configured: printing instead]\nTo: ${to}\nSubject: ${subject}\n\n${text}\n`);
    else if (process.env.NODE_ENV === 'production') console.error('Email is not configured (set SMTP_HOST, SMTP_USER, SMTP_PASS, MAIL_FROM); a message was not sent.');
    return;
  }
  await transportFor().sendMail({ from: process.env.MAIL_FROM || process.env.SMTP_USER, to, subject, text });
}
