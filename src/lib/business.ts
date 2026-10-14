/**
 * Who the customer is buying from, and how to reach them — the one place the
 * footer, the contact page, the policies, the checkout and the product label
 * details all read from. Change a value here and it changes everywhere.
 *
 * **Every value must match the entity on the Razorpay account.** The legal
 * name, GSTIN and registered address below are the seller of record as set in
 * /admin/settings on 12 October 2026 (the proprietorship), which is also what
 * prints on tax invoices. Invoices read the seller from the database, not from
 * this file: if the seller changes, change it in /admin/settings *and* here.
 *
 * `null` means "not confirmed yet". Nothing is invented to fill a gap: a null
 * line is left off the page, and `missingBusinessDetails()` lists what is
 * still owed so it can be chased. A pure module with no secrets — safe to import
 * from client components.
 */

export interface GrievanceOfficer {
  name: string | null;
  designation: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
}

export const BUSINESS = {
  legalName: 'Bright Blue Trading Corporation',
  tradeName: 'Bright Blue',
  gstin: '32DCVPK7871P1ZI' as string | null,
  registeredAddress: '66/927 Pappurath, Krishnaswamy Road, Pullepady, Kochi, Kerala 682035',
  /** The Palakkad unit, as printed in the company brochure. */
  factoryAddress: '15/67 KVSN Compound, Chengaram, Palakkad, Kerala 678681' as string | null,
  /** A direct line, if there is one besides the toll-free number. */
  phone: null as string | null,
  tollFree: '1800 123 0621',
  /** `tel:` needs the digits unpunctuated. */
  tollFreeDigits: '18001230621',
  /**
   * The owner's own Gmail inbox, which they read (confirmed 14 October 2026;
   * the earlier `store-` address was not it). It should become an address on
   * the store's own domain once that mailbox exists: price enquiries land here,
   * and a made-up address would bounce every one of them.
   */
  email: 'brightbluefmcg@gmail.com',
  supportHours: null as string | null,
  /** Company-wide FSSAI licence. Each food brand also carries its own in the admin. */
  fssaiLicense: null as string | null,
  /** Where disputes are heard. Null reads as "the courts of Kerala". */
  jurisdiction: null as string | null,
  grievanceOfficer: {
    name: null,
    designation: null,
    email: null,
    phone: null,
    address: null,
  } as GrievanceOfficer,
  /*
    The five below are the terms the owner's brief proposed on 12 October 2026.
    They are commitments to customers: confirm each one, then leave it or
    change it here.
  */
  returnWindowDays: 7,
  dispatchDays: '1–3 business days',
  deliveryEstimate: '3–7 business days',
  refundDays: '5–7 business days',
  /**
   * Rupees. Null because checkout has no free-delivery threshold: delivery is
   * charged from the weight slabs in /admin/settings. The shipping policy
   * mentions a threshold only when this is set, so set it only if checkout
   * really honours it.
   */
  freeShippingAbove: null as number | null,
  lastUpdated: '2026-10-12',
} as const;

/** "12 October 2026", from `BUSINESS.lastUpdated`. */
export function lastUpdatedLabel(): string {
  return new Date(`${BUSINESS.lastUpdated}T00:00:00Z`).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * Who a complaint goes to. Until a Grievance Officer is named, complaints go
 * to the business's own contact details rather than to a blank.
 */
export function grievanceContact(): { name: string; email: string; phone: string; address: string } {
  const officer = BUSINESS.grievanceOfficer;
  return {
    name: officer.name ?? `Customer care, ${BUSINESS.legalName}`,
    email: officer.email ?? BUSINESS.email,
    phone: officer.phone ?? BUSINESS.phone ?? BUSINESS.tollFree,
    address: officer.address ?? BUSINESS.registeredAddress,
  };
}

/** Every detail still unconfirmed, in the owner's words — for the admin and for hand-over. */
export function missingBusinessDetails(): string[] {
  const missing: string[] = [];
  const officer = BUSINESS.grievanceOfficer;
  if (!officer.name) missing.push('Grievance Officer name');
  if (!officer.designation) missing.push('Grievance Officer designation');
  if (!officer.email) missing.push('Grievance Officer email');
  if (!officer.phone) missing.push('Grievance Officer phone');
  if (!officer.address) missing.push('Grievance Officer address');
  if (!BUSINESS.phone) missing.push('Business phone number');
  if (!BUSINESS.supportHours) missing.push('Support hours');
  if (!BUSINESS.fssaiLicense) missing.push('FSSAI licence number');
  if (!BUSINESS.jurisdiction) missing.push('Jurisdiction for disputes');
  if (BUSINESS.email.endsWith('@gmail.com')) missing.push('Business email on the store domain');
  return missing;
}
