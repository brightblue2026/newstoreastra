import Link from 'next/link';
import { db } from '@/lib/db';
import { paiseToRupeesInput } from '@/lib/money';
import { readCheckoutSettings } from '@/lib/settings';
import { requireAdministrator } from '@/lib/session';
import { isRazorpayConfigured } from '@/lib/razorpay';
import { isShiprocketConfigured, listPickupLocations } from '@/lib/shiprocket';
import {
  CodSettingsForm,
  SellerEntityForm,
  ShippingSettingsForm,
  ShiprocketSettingsForm,
} from './settings-forms';

export const dynamic = 'force-dynamic';

/*
  Settings — ADMIN only.

  Three of §14's open questions land here rather than in code, because they are
  BBTC's decisions and not this codebase's: who is the seller of record (Q6), and
  the COD and delivery numbers (Q17). Nothing is defaulted to a plausible-looking
  figure, so the panel says plainly what is not configured and what that means
  right now — free delivery on every order, and no COD option at all.
*/
export default async function SettingsPage() {
  await requireAdministrator();

  const [settings, entities, sellers] = await Promise.all([
    readCheckoutSettings(),
    db.entity.findMany({
      where: { isActive: true },
      orderBy: { legalName: 'asc' },
      select: { id: true, legalName: true, role: true, city: true },
    }),
    db.entity.findMany({
      where: { isSeller: true, isActive: true },
      select: { id: true, legalName: true, gstin: true },
    }),
  ]);

  const seller = sellers.length === 1 ? sellers[0] : null;

  // Asked on every visit: a login that stopped working should show up here, on
  // the screen the admin is already looking at, not first as a failed push.
  const shiprocketConfigured = isShiprocketConfigured();
  const pickupLocations = shiprocketConfigured ? await listPickupLocations() : null;
  const shiprocketConnected = pickupLocations !== null;
  const webhookSecretSet = Boolean(process.env.SHIPROCKET_WEBHOOK_TOKEN?.trim());
  const siteUrl = (process.env.AUTH_URL || 'https://brightbluefmcg.com').replace(/\/$/, '');

  return (
    <div>
      <h1 className="type-display-sm">Settings</h1>
      <p className="mt-4 max-w-prose type-body text-ink-soft">
        What is set here decides what a customer is charged and what an invoice says. Every
        change is written to the audit log.
      </p>

      {/* Whether orders can be taken at all, stated once at the top rather than
          discovered by a customer at the end of checkout. */}
      <ul className="mt-12 space-y-2 border-y border-line py-6">
        <Status
          ok={sellers.length === 1 && Boolean(seller?.gstin)}
          done="A seller of record with a GSTIN is set — orders can be taken."
          notDone={
            sellers.length > 1
              ? 'More than one entity is marked as the seller of record. Orders are refused until exactly one is.'
              : 'No seller of record is set. Orders are refused until one is, because an order that cannot be invoiced should not be taken.'
          }
        />
        <Status
          ok={isRazorpayConfigured()}
          done="Razorpay keys are present, so online payment is offered."
          notDone="Razorpay keys are not set on this deployment, so online payment cannot be offered. Add them to the environment."
        />
        <Status
          ok={!settings.shippingUnconfigured}
          done="A delivery rate table is set."
          notDone="No delivery rates are set, so every order ships free of charge."
        />
        <Status
          ok={shiprocketConnected && Boolean(settings.shipping.shiprocketPickupLocation)}
          done="Shiprocket is connected and a pickup location is chosen, so orders can be pushed for dispatch."
          notDone={
            !shiprocketConfigured
              ? 'Shiprocket is not connected. Orders can still be taken and shipped by entering the AWB by hand.'
              : !shiprocketConnected
                ? 'Shiprocket login is failing. Check the API user email and password in the environment.'
                : 'Shiprocket is connected, but no pickup location is chosen yet, so orders cannot be pushed.'
          }
        />
        <Status
          ok={settings.cod.enabled}
          done="Cash on delivery is being offered."
          notDone="Cash on delivery is switched off, so it does not appear at checkout."
        />
      </ul>

      <Section
        title="Seller of record"
        note="brightblue.in publishes one GSTIN for two different entities, which cannot be right — §14 Q6. Whichever entity is legally the online seller goes here, and its GSTIN is what prints on every invoice."
      >
        <SellerEntityForm
          entities={entities}
          currentEntityId={seller?.id ?? null}
          currentGstin={seller?.gstin ?? null}
        />
      </Section>

      <Section
        title="Cash on delivery"
        note="COD carries return-to-origin cost, and it is worse on food. The brief recommends launching on a Kerala-and-adjacent allowlist and measuring for two months before widening it."
      >
        <CodSettingsForm
          enabled={settings.cod.enabled}
          feeRupees={paiseToRupeesInput(settings.cod.feePaise)}
          minOrderRupees={paiseToRupeesInput(settings.cod.minOrderPaise)}
          // The "no ceiling" default is ₹1 crore, which is not a number to show
          // an admin as if someone had chosen it.
          maxOrderRupees={
            settings.cod.maxOrderPaise >= 1_000_000_000
              ? '0'
              : paiseToRupeesInput(settings.cod.maxOrderPaise)
          }
          pincodeAllowlist={settings.cod.pincodeAllowlist}
        />
      </Section>

      <Section
        title="Delivery rates"
        note="The flat-rate weight slab table. In Phase 6 Shiprocket quotes the rate and this becomes the fallback for when it is unreachable — the brief is explicit that an order must never be blocked because a third party is down."
      >
        <ShippingSettingsForm
          slabs={settings.shipping.slabs.map((slab) => ({
            uptoGrams: slab.uptoGrams,
            priceRupees: paiseToRupeesInput(slab.pricePaise),
          }))}
          overflowPriceRupees={paiseToRupeesInput(settings.shipping.overflowPricePaise)}
          defaultUnitGrams={settings.shipping.defaultUnitGrams}
          serviceablePincodePrefixes={settings.shipping.serviceablePincodePrefixes}
        />
      </Section>

      <Section
        title="Shiprocket"
        note="Shiprocket books the courier, prints the label and sends tracking updates back here. Without it, staff can still record a DTDC AWB by hand on each order."
      >
        {!shiprocketConfigured && (
          <p className="mb-8 max-w-prose type-body text-ink-soft">
            To connect: in the Shiprocket dashboard go to Settings → API → Configure and create an
            API user (a separate login from your own). Put its email and password in the
            environment as SHIPROCKET_API_EMAIL and SHIPROCKET_API_PASSWORD, restart the site, and
            come back here to choose a pickup location.
          </p>
        )}
        <ShiprocketSettingsForm
          locations={pickupLocations}
          pickupLocation={settings.shipping.shiprocketPickupLocation}
          originPincode={settings.shipping.originPincode}
          preferLiveRates={settings.shipping.preferLiveRates}
          autoPushOrders={settings.shipping.autoPushOrders}
        />
        <div className="mt-10 max-w-prose">
          <h3 className="type-caption text-ink-soft">Tracking updates</h3>
          <p className="mt-2 type-body">
            In Shiprocket, Settings → API → Webhooks, set the URL to{' '}
            <code className="type-mono break-all">{siteUrl}/api/webhooks/courier-tracking</code>{' '}
            and the token to the value of SHIPROCKET_WEBHOOK_TOKEN.
          </p>
          <p className="mt-2 type-caption text-ink-soft">
            {webhookSecretSet
              ? 'The token is set on this deployment, so tracking updates will be accepted.'
              : 'SHIPROCKET_WEBHOOK_TOKEN is not set, so every tracking update is refused until it is.'}
          </p>
        </div>
      </Section>

      <p className="mt-16 border-t border-line pt-6 type-caption text-ink-soft">
        Free delivery above a threshold is not set here. It is a{' '}
        <Link href="/admin/discounts" className="underline">
          FREE_SHIPPING discount
        </Link>
        , so the cart can name it as an offer and show progress towards it — two places holding
        the same threshold would disagree the first time one changed.
      </p>
    </div>
  );
}

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-16 border-t border-line pt-8">
      <h2 className="type-heading">{title}</h2>
      <p className="mt-2 max-w-prose type-caption text-ink-soft">{note}</p>
      <div className="mt-8">{children}</div>
    </section>
  );
}

function Status({ ok, done, notDone }: { ok: boolean; done: string; notDone: string }) {
  return (
    <li className="flex gap-3 type-body">
      <span aria-hidden className={ok ? 'text-success' : 'text-warning'}>
        {ok ? '✓' : '•'}
      </span>
      <span className={ok ? 'text-ink-soft' : 'text-ink'}>{ok ? done : notDone}</span>
    </li>
  );
}
