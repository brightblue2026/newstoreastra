import 'server-only';
import { toMsg91Number } from '@/lib/phone';

/*
  MSG91 — WhatsApp with an SMS fallback. Brief §10 "Communications" and §12
  Phase 6, "WhatsApp notifications live with SMS fallback".

  The four templates this sends are already written out verbatim in
  `docs/msg91-templates.md`, with every variable mapped to the field it comes
  from. That document is the contract; this file is the wire.

  **Template names are configuration, not code.** Meta assigns a template a name
  and a namespace at approval time, and approval is BBTC's to obtain — nothing
  here can know those strings in advance. So each is read from an environment
  variable, and a template with no id configured is *skipped with a log* rather
  than substituted or faked. That matters for template 4 in particular, which
  `docs/msg91-templates.md` records as blocked on the return-policy question
  (§14 Q18) rather than on approval — it may legitimately not exist yet.

  Nothing in this module throws. A notification is not part of the sale: an
  order that is paid for and confirmed must not be rolled back because Meta
  returned a 500. Every path returns a result object and logs.
*/

const MSG91_API = 'https://control.msg91.com/api/v5';
const REQUEST_TIMEOUT_MS = 8_000;

export type NotificationTemplate =
  | 'ORDER_CONFIRMED'
  | 'ORDER_SHIPPED'
  | 'OUT_FOR_DELIVERY'
  | 'ORDER_DELIVERED';

/**
 * Environment variable holding each template's approved name.
 *
 * Named per template rather than one JSON blob so that a missing one is
 * obvious in `.env.example` and in the host's settings, and so BBTC can add them
 * one at a time as Meta approves them — which is how approvals actually
 * arrive.
 */
const TEMPLATE_ENV: Readonly<Record<NotificationTemplate, string>> = Object.freeze({
  ORDER_CONFIRMED: 'MSG91_TEMPLATE_ORDER_CONFIRMED',
  ORDER_SHIPPED: 'MSG91_TEMPLATE_ORDER_SHIPPED',
  OUT_FOR_DELIVERY: 'MSG91_TEMPLATE_OUT_FOR_DELIVERY',
  ORDER_DELIVERED: 'MSG91_TEMPLATE_ORDER_DELIVERED',
});

/** DLT-registered SMS template ids, which are separate from the WhatsApp ones. */
const SMS_TEMPLATE_ENV: Readonly<Record<NotificationTemplate, string>> = Object.freeze({
  ORDER_CONFIRMED: 'MSG91_SMS_TEMPLATE_ORDER_CONFIRMED',
  ORDER_SHIPPED: 'MSG91_SMS_TEMPLATE_ORDER_SHIPPED',
  OUT_FOR_DELIVERY: 'MSG91_SMS_TEMPLATE_OUT_FOR_DELIVERY',
  ORDER_DELIVERED: 'MSG91_SMS_TEMPLATE_ORDER_DELIVERED',
});

export interface Msg91Config {
  authKey: string;
  whatsappNumber: string;
  senderId: string | null;
}

export function msg91Config(): Msg91Config | null {
  const authKey = process.env.MSG91_AUTH_KEY?.trim();
  const whatsappNumber = process.env.MSG91_WHATSAPP_NUMBER?.trim();
  if (!authKey || !whatsappNumber) return null;
  return {
    authKey,
    whatsappNumber,
    senderId: process.env.MSG91_SENDER_ID?.trim() || null,
  };
}

export type SendChannel = 'whatsapp' | 'sms' | 'none';

export interface SendResult {
  sent: boolean;
  channel: SendChannel;
  /** Why nothing was sent, or why WhatsApp fell back to SMS. Never shown to a customer. */
  reason: string | null;
}

/*
  `toMsg91Number` lives in `phone.ts`, kept pure and free of `server-only` so it
  can be tested directly. Re-exported here so a caller has one import.
*/
export { toMsg91Number } from '@/lib/phone';

async function postJson(
  url: string,
  authKey: string,
  body: unknown,
): Promise<{ ok: boolean; detail: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        authkey: authKey,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
      cache: 'no-store',
    });

    const detail = await response.text().catch(() => '');

    /*
      MSG91 returns HTTP 200 with `{"type":"error"}` for several real failures,
      so the status code alone is not proof of delivery. Both are checked.
    */
    const failedInBody = detail.includes('"type":"error"');

    return { ok: response.ok && !failedInBody, detail: detail.slice(0, 400) };
  } catch (error) {
    return { ok: false, detail: String(error) };
  } finally {
    clearTimeout(timer);
  }
}

async function sendWhatsapp(
  config: Msg91Config,
  template: NotificationTemplate,
  to: string,
  variables: string[],
): Promise<{ ok: boolean; detail: string }> {
  const templateName = process.env[TEMPLATE_ENV[template]]?.trim();
  if (!templateName) {
    return { ok: false, detail: `${TEMPLATE_ENV[template]} is not set` };
  }

  return postJson(`${MSG91_API}/whatsapp/whatsapp-outbound-message/bulk/`, config.authKey, {
    integrated_number: config.whatsappNumber,
    content_type: 'template',
    payload: {
      messaging_product: 'whatsapp',
      type: 'template',
      template: {
        name: templateName,
        language: { code: 'en', policy: 'deterministic' },
        to_and_components: [
          {
            to: [to],
            components: Object.fromEntries(
              variables.map((value, index) => [
                `body_${index + 1}`,
                { type: 'text', value },
              ]),
            ),
          },
        ],
      },
    },
  });
}

async function sendSms(
  config: Msg91Config,
  template: NotificationTemplate,
  to: string,
  variables: string[],
): Promise<{ ok: boolean; detail: string }> {
  const templateId = process.env[SMS_TEMPLATE_ENV[template]]?.trim();
  if (!templateId) {
    return { ok: false, detail: `${SMS_TEMPLATE_ENV[template]} is not set` };
  }

  return postJson(`${MSG91_API}/flow/`, config.authKey, {
    template_id: templateId,
    ...(config.senderId ? { sender: config.senderId } : {}),
    recipients: [
      {
        mobiles: to,
        // DLT templates address variables by name; `var1`, `var2`… is the
        // convention `docs/msg91-templates.md` submits them under.
        ...Object.fromEntries(variables.map((value, index) => [`var${index + 1}`, value])),
      },
    ],
  });
}

/**
 * Send one notification: WhatsApp first, SMS if that fails.
 *
 * §10: "WhatsApp via MSG91 ... SMS fallback. WhatsApp is read in this market;
 * email often is not." The fallback fires on any WhatsApp failure including an
 * unconfigured template, because a customer who does not know their parcel
 * shipped is not helped by the reason.
 */
export async function sendNotification(input: {
  template: NotificationTemplate;
  phone: string;
  variables: string[];
}): Promise<SendResult> {
  const config = msg91Config();
  if (!config) {
    return { sent: false, channel: 'none', reason: 'MSG91 is not configured' };
  }

  const to = toMsg91Number(input.phone);
  if (!to) {
    return { sent: false, channel: 'none', reason: 'not a valid Indian mobile number' };
  }

  const whatsapp = await sendWhatsapp(config, input.template, to, input.variables);
  if (whatsapp.ok) {
    return { sent: true, channel: 'whatsapp', reason: null };
  }

  console.warn('[msg91] WhatsApp failed for', input.template, '—', whatsapp.detail);

  const sms = await sendSms(config, input.template, to, input.variables);
  if (sms.ok) {
    return { sent: true, channel: 'sms', reason: `WhatsApp failed: ${whatsapp.detail}` };
  }

  console.error('[msg91] SMS fallback also failed for', input.template, '—', sms.detail);
  return {
    sent: false,
    channel: 'none',
    reason: `WhatsApp: ${whatsapp.detail}; SMS: ${sms.detail}`,
  };
}
