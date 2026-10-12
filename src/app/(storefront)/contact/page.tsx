import type { Metadata } from 'next';
import Link from 'next/link';
import { BUSINESS, grievanceContact, lastUpdatedLabel } from '@/lib/business';
import { CONTACT } from '@/lib/contact';

export const metadata: Metadata = {
  title: 'Contact us',
  description: `How to reach ${BUSINESS.legalName}: phone, email, registered office and the Grievance Officer.`,
  alternates: { canonical: '/contact' },
};

/*
  Contact, and who the customer is dealing with.

  Everything on this page is read from `business.ts`. A detail that is not
  confirmed there is left off rather than shown as a blank, and complaints
  fall back to the business's own contact details until an officer is named.
*/

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:gap-6">
      <dt className="shrink-0 type-caption text-ink-soft sm:w-48">{label}</dt>
      <dd className="min-w-0 break-words type-body-lg">{children}</dd>
    </div>
  );
}

export default function ContactPage() {
  const officer = BUSINESS.grievanceOfficer;
  const grievance = grievanceContact();

  return (
    <article className="mx-auto max-w-(--container-page) px-6 py-24">
      <p className="type-caption text-ink-soft">Help</p>
      <h1 className="mt-6 type-display-sm">Contact us</h1>
      <p className="mt-4 type-caption normal-case text-ink-soft">Last updated {lastUpdatedLabel()}</p>

      <div className="mt-12 max-w-2xl">
        <h2 className="type-heading">Talk to us</h2>
        <p className="mt-6 type-body-lg text-ink-soft">
          Questions about a product, an order or a bulk enquiry: call or write, and a person at
          Bright Blue will answer.
        </p>
        <div className="mt-8 flex flex-wrap gap-4">
          <a href={CONTACT.tollFreeHref} className="btn btn-primary tabular-nums">
            Call {CONTACT.tollFreeDisplay}
          </a>
          <a href={`mailto:${CONTACT.email}`} className="btn btn-secondary">
            Email us
          </a>
        </div>

        <dl className="mt-12 space-y-6">
          <Row label="Toll free">
            <a href={CONTACT.tollFreeHref} className="underline tabular-nums">
              {CONTACT.tollFreeDisplay}
            </a>
          </Row>
          {BUSINESS.phone && (
            <Row label="Phone">
              <a href={`tel:${BUSINESS.phone.replace(/[^+\d]/g, '')}`} className="underline tabular-nums">
                {BUSINESS.phone}
              </a>
            </Row>
          )}
          <Row label="Email">
            <a href={`mailto:${CONTACT.email}`} className="underline">
              {CONTACT.email}
            </a>
          </Row>
          {BUSINESS.supportHours && <Row label="Support hours">{BUSINESS.supportHours}</Row>}
        </dl>

        <h2 className="mt-16 type-heading">Who you are buying from</h2>
        <dl className="mt-8 space-y-6">
          <Row label="Legal name">{BUSINESS.legalName}</Row>
          <Row label="Trading as">{BUSINESS.tradeName}</Row>
          {BUSINESS.gstin && (
            <Row label="GSTIN">
              <span className="type-mono">{BUSINESS.gstin}</span>
            </Row>
          )}
          <Row label="Registered office">{BUSINESS.registeredAddress}</Row>
          {BUSINESS.factoryAddress && <Row label="Manufacturing unit">{BUSINESS.factoryAddress}</Row>}
          {BUSINESS.fssaiLicense && (
            <Row label="FSSAI licence">
              <span className="type-mono">{BUSINESS.fssaiLicense}</span>
            </Row>
          )}
        </dl>

        <h2 className="mt-16 type-heading">Grievance Officer</h2>
        <p className="mt-6 type-body-lg text-ink-soft">
          If something has gone wrong and you want it looked at formally, write to the contact
          below with your order number. Complaints are acknowledged within 48 hours and resolved
          within 30 days of receipt.
        </p>
        <dl className="mt-8 space-y-6">
          <Row label="Name">{grievance.name}</Row>
          {officer.designation && <Row label="Designation">{officer.designation}</Row>}
          <Row label="Email">
            <a href={`mailto:${grievance.email}`} className="underline">
              {grievance.email}
            </a>
          </Row>
          <Row label="Phone">
            <a href={`tel:${grievance.phone.replace(/[^+\d]/g, '')}`} className="underline tabular-nums">
              {grievance.phone}
            </a>
          </Row>
          <Row label="Address">{grievance.address}</Row>
        </dl>

        <p className="mt-16 type-body text-ink-soft">
          See also our{' '}
          <Link href="/shipping-policy" className="underline">
            Shipping policy
          </Link>
          ,{' '}
          <Link href="/refund-policy" className="underline">
            Refund and cancellation policy
          </Link>
          ,{' '}
          <Link href="/privacy-policy" className="underline">
            Privacy policy
          </Link>{' '}
          and{' '}
          <Link href="/terms" className="underline">
            Terms and conditions
          </Link>
          .
        </p>
      </div>
    </article>
  );
}
