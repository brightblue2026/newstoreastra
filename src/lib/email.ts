import 'server-only';

/*
  Resend — brief §5 locks it as the email provider, §10 says "Email via Resend
  for the invoice PDF", and §12 Phase 6 asks for "Resend confirmation with
  invoice attached".

  **No SDK.** `resend` wraps one REST call; CLAUDE.md asks before adding a
  dependency outside the locked stack, and §5 locks the *provider*, not a client
  library. Same reasoning as `razorpay.ts`.

  Nothing here throws. An email is not part of the sale — see the note in
  `notifications.ts`.

  The messages are plain HTML with inline styles and a text alternative. No
  React Email, no template engine: there are two emails, they are mostly a table
  of what was bought, and the invoice PDF carries the detail that matters.
  Gmail strips a `<style>` block anyway.
*/

const RESEND_API = 'https://api.resend.com/emails';
const REQUEST_TIMEOUT_MS = 10_000;

export interface ResendConfig {
  apiKey: string;
  from: string;
}

export function resendConfig(): ResendConfig | null {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return null;
  return {
    apiKey,
    from: process.env.RESEND_FROM_EMAIL?.trim() || 'orders@brightblue.in',
  };
}

export interface EmailAttachment {
  filename: string;
  content: Buffer;
}

export interface SendEmailResult {
  sent: boolean;
  id: string | null;
  reason: string | null;
}

/**
 * Send one email.
 *
 * Attachments go base64-encoded in the JSON body, which is Resend's own format
 * and is why the invoice is rendered to a Buffer rather than streamed.
 */
export async function sendEmail(input: {
  to: string;
  subject: string;
  html: string;
  text: string;
  attachments?: EmailAttachment[];
  replyTo?: string;
}): Promise<SendEmailResult> {
  const config = resendConfig();
  if (!config) {
    return { sent: false, id: null, reason: 'Resend is not configured' };
  }

  const to = input.to.trim();
  if (!to || !to.includes('@')) {
    return { sent: false, id: null, reason: 'no valid recipient address' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(RESEND_API, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: config.from,
        to: [to],
        subject: input.subject,
        html: input.html,
        text: input.text,
        ...(input.replyTo ? { reply_to: input.replyTo } : {}),
        ...(input.attachments?.length
          ? {
              attachments: input.attachments.map((attachment) => ({
                filename: attachment.filename,
                content: attachment.content.toString('base64'),
              })),
            }
          : {}),
      }),
      signal: controller.signal,
      cache: 'no-store',
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      return { sent: false, id: null, reason: `${response.status} ${detail.slice(0, 300)}` };
    }

    const body = (await response.json()) as { id?: string };
    return { sent: true, id: body.id ?? null, reason: null };
  } catch (error) {
    return { sent: false, id: null, reason: String(error) };
  } finally {
    clearTimeout(timer);
  }
}

/*
  ---------- Message bodies ----------

  Written to §9's voice: plain, specific, no exclamation marks, no marketing
  language, no emoji. A transactional email that reads like an advert is one a
  customer stops opening.
*/

const INK = '#111111';
const MUTED = '#555555';
const LINE = '#DDDDDD';

function shell(heading: string, body: string): string {
  return `<!doctype html>
<html lang="en"><body style="margin:0;padding:24px;background:#F7F7F7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:${INK};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#FFFFFF;">
    <tr><td style="padding:28px 28px 0;">
      <p style="margin:0;font-size:11px;letter-spacing:1.5px;color:${MUTED};text-transform:uppercase;">Bright Blue</p>
      <h1 style="margin:8px 0 0;font-size:20px;font-weight:600;line-height:1.3;">${heading}</h1>
    </td></tr>
    <tr><td style="padding:20px 28px 28px;font-size:14px;line-height:1.6;">${body}</td></tr>
    <tr><td style="padding:0 28px 28px;border-top:1px solid ${LINE};">
      <p style="margin:16px 0 0;font-size:12px;color:${MUTED};line-height:1.6;">
        Bright Blue Trading Corporation · Pullepady, Ernakulam, Kerala 682035<br>
        1800 123 0621 · info@brightblue.in
      </p>
    </td></tr>
  </table>
</body></html>`;
}

function itemsTable(items: { name: string; quantity: number; total: string }[]): string {
  const rows = items
    .map(
      (item) =>
        `<tr>
          <td style="padding:8px 0;border-bottom:1px solid ${LINE};">${escapeHtml(item.name)}<br><span style="color:${MUTED};font-size:12px;">Quantity ${item.quantity}</span></td>
          <td style="padding:8px 0;border-bottom:1px solid ${LINE};text-align:right;white-space:nowrap;">${escapeHtml(item.total)}</td>
        </tr>`,
    )
    .join('');

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;font-size:14px;">${rows}</table>`;
}

/** Order details are customer-supplied and product names are admin-supplied; neither is trusted into HTML. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface OrderEmailContent {
  subject: string;
  html: string;
  text: string;
}

export function orderConfirmedEmail(input: {
  customerName: string;
  orderNumber: string;
  totalFormatted: string;
  paymentLine: string;
  items: { name: string; quantity: number; total: string }[];
  trackingUrl: string;
  hasInvoice: boolean;
}): OrderEmailContent {
  const invoiceSentence = input.hasInvoice
    ? 'Your GST invoice is attached to this email.'
    : 'Your GST invoice will follow separately.';

  const html = shell(
    `Order ${escapeHtml(input.orderNumber)} is confirmed`,
    `<p style="margin:0 0 4px;">Hello ${escapeHtml(input.customerName)},</p>
     <p style="margin:0;">We have your order and it is being packed. ${invoiceSentence}</p>
     ${itemsTable(input.items)}
     <p style="margin:0;"><strong>Total ${escapeHtml(input.totalFormatted)}</strong><br>
     <span style="color:${MUTED};">${escapeHtml(input.paymentLine)}</span></p>
     <p style="margin:20px 0 0;">
       <a href="${escapeHtml(input.trackingUrl)}" style="color:${INK};font-weight:600;">Track this order</a>
     </p>`,
  );

  const text = [
    `Hello ${input.customerName},`,
    '',
    `We have your order ${input.orderNumber} and it is being packed. ${invoiceSentence}`,
    '',
    ...input.items.map((item) => `  ${item.name} x${item.quantity} — ${item.total}`),
    '',
    `Total ${input.totalFormatted}`,
    input.paymentLine,
    '',
    `Track this order: ${input.trackingUrl}`,
    '',
    'Bright Blue Trading Corporation · 1800 123 0621 · info@brightblue.in',
  ].join('\n');

  return { subject: `Order ${input.orderNumber} is confirmed`, html, text };
}

export function orderShippedEmail(input: {
  customerName: string;
  orderNumber: string;
  courierName: string;
  awbNumber: string;
  trackingUrl: string;
}): OrderEmailContent {
  const html = shell(
    `Order ${escapeHtml(input.orderNumber)} has shipped`,
    `<p style="margin:0 0 4px;">Hello ${escapeHtml(input.customerName)},</p>
     <p style="margin:0;">Your order is on its way with ${escapeHtml(input.courierName)}.</p>
     <p style="margin:16px 0 0;">Tracking number <strong>${escapeHtml(input.awbNumber)}</strong></p>
     <p style="margin:16px 0 0;">
       <a href="${escapeHtml(input.trackingUrl)}" style="color:${INK};font-weight:600;">Track your parcel</a>
     </p>`,
  );

  const text = [
    `Hello ${input.customerName},`,
    '',
    `Your order ${input.orderNumber} is on its way with ${input.courierName}.`,
    `Tracking number ${input.awbNumber}`,
    '',
    `Track your parcel: ${input.trackingUrl}`,
    '',
    'Bright Blue Trading Corporation · 1800 123 0621 · info@brightblue.in',
  ].join('\n');

  return { subject: `Order ${input.orderNumber} has shipped`, html, text };
}
