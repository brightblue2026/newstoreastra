import { BUSINESS, grievanceContact } from '@/lib/business';
import type { PolicySlug } from '@/lib/content-schema';

/*
  The standing policy text, used until a policy is written in the admin.

  Until 12 October 2026 a policy that had not been written in /admin/content
  had no page at all, on the grounds that a legal statement BBTC never made is
  worse than none. Razorpay then refused live keys because the pages were
  missing, and the owner asked for them. So each policy now has the text below
  as its default, and a policy published from the admin still replaces it
  word for word.

  Everything specific — names, addresses, the return window, the dispatch
  time — comes from `business.ts`, so the four pages cannot disagree with each
  other or with the footer. Where a detail there is still unconfirmed the
  sentence is written to stay true without it, never with a blank in it.

  The body uses the same syntax as an admin-written policy (`policyBlocks` in
  content-schema.ts): a blank line between paragraphs, `#` for a heading.

  This wording has not been reviewed by a lawyer.
*/

export interface PolicyDocument {
  title: string;
  description: string;
  body: string;
}

/** Where each policy lives on the storefront. */
export const POLICY_ROUTES: Record<PolicySlug, { path: string; label: string }> = {
  shipping: { path: '/shipping-policy', label: 'Shipping policy' },
  returns: { path: '/refund-policy', label: 'Refund and cancellation' },
  privacy: { path: '/privacy-policy', label: 'Privacy policy' },
  terms: { path: '/terms', label: 'Terms and conditions' },
};

const BRANDS = 'MX-3, Rafasi, Landfloro, Fairoze, ANSAF, Ilfa Valley, Kenzaniya and MAKAFA';

function join(parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join('\n\n');
}

function reachUs(): string {
  return [
    `Email: ${BUSINESS.email}`,
    `Toll free: ${BUSINESS.tollFree}`,
    BUSINESS.phone && `Phone: ${BUSINESS.phone}`,
    BUSINESS.supportHours && `Hours: ${BUSINESS.supportHours}`,
  ]
    .filter(Boolean)
    .join('\n');
}

function grievanceBlock(): string {
  const contact = grievanceContact();
  const officer = BUSINESS.grievanceOfficer;
  return [
    officer.designation ? `${contact.name}, ${officer.designation}` : contact.name,
    `Email: ${contact.email}`,
    `Phone: ${contact.phone}`,
    contact.address,
  ].join('\n');
}

function privacy(): PolicyDocument {
  return {
    title: 'Privacy policy',
    description: `How ${BUSINESS.legalName} collects, uses and protects the personal data of people who shop at the ${BUSINESS.tradeName} store.`,
    body: join([
      `This policy explains what personal data we collect when you use this store, why we collect it, who we share it with, and the rights you have over it. It is written to meet the Digital Personal Data Protection Act, 2023 and the rules made under it.`,

      '# 1. Who we are',
      `This store is run by ${BUSINESS.legalName} ("${BUSINESS.tradeName}", "we", "us"), ${BUSINESS.registeredAddress}.${BUSINESS.gstin ? ` GSTIN ${BUSINESS.gstin}.` : ''} We decide how your personal data is used, which makes us the data fiduciary for it.`,
      reachUs(),

      '# 2. What we collect',
      `When you place an order or contact us we collect your name, phone number, email address, and your delivery and billing addresses. We keep a record of what you ordered, what you paid and how the order was delivered.`,
      `When you browse the store we receive basic device and usage data, such as your IP address, browser type and the pages you open. Cookies are described in section 9.`,
      `We do not receive or store your card number, UPI PIN, net-banking password or any other payment credential. Payments are processed by Razorpay, and those details go from your device to Razorpay directly.`,

      '# 3. Why we collect it',
      [
        'We use your data to:',
        '• take, pack and deliver your order, and tell you how it is progressing',
        '• raise a GST tax invoice, which the law requires us to issue and keep',
        '• answer your questions and handle returns, refunds and complaints',
        '• prevent fraud and misuse of the store',
        '• meet our legal, tax and accounting obligations',
      ].join('\n'),
      `We send marketing messages only if you have asked for them, and you can stop them at any time.`,

      '# 4. Who we share it with',
      [
        'We share only what each of these needs to do its job:',
        '• Razorpay, to take your payment and to send refunds',
        '• Shiprocket and the courier it assigns, to deliver your order: your name, phone number and delivery address',
        '• the companies that host this website and its database, and that send our order emails and text messages',
        '• government and law-enforcement authorities, when the law requires it',
      ].join('\n'),
      `We do not sell your personal data, and we do not share it with anyone for their own marketing.`,

      '# 5. How long we keep it',
      `We keep your data for as long as it is needed for the purpose it was collected for. Order and invoice records are kept for as long as tax and accounting law requires, even if you ask us to delete your other data. When data is no longer needed we delete it.`,

      '# 6. Your rights',
      [
        'You have the right to:',
        '• ask what personal data we hold about you and how we have used it',
        '• have incorrect or incomplete data corrected or updated',
        '• have your data erased, where we are not required by law to keep it',
        '• withdraw a consent you have given',
        '• nominate someone to exercise these rights for you if you die or become unable to',
        '• have a complaint dealt with',
      ].join('\n'),
      `To use any of these rights, write to the contact named in section 11 from the email address or phone number you ordered with. We may ask you to confirm your identity before acting.`,

      '# 7. Withdrawing consent',
      `Where we use your data because you consented, you may withdraw that consent at any time by writing to us. Withdrawing does not undo anything done before you withdrew, and it does not affect data we must keep by law, such as invoices. If the data is needed to complete an order, we may not be able to complete it once consent is withdrawn.`,

      '# 8. How we protect it',
      `This website is served only over an encrypted (HTTPS) connection. Access to customer data is limited to staff who need it, each signed in with their own account. Payment, delivery and hosting are handled by established providers with their own security obligations. No system is perfectly secure; if a breach affects your data we will tell you and the Data Protection Board of India as the law requires.`,

      '# 9. Cookies',
      `We do not use advertising or tracking cookies. Your cart is remembered in your own browser's storage, not on our servers. Razorpay sets its own cookies when its payment window opens, and our hosting provider may set a security cookie. You can block or clear these in your browser, but the cart and checkout may not work without them.`,

      '# 10. Children',
      `This store is not directed at anyone under 18, and we do not knowingly collect a child's personal data. A person under 18 may use the store only with the involvement and consent of a parent or guardian, who places the order.`,

      '# 11. Complaints and the Grievance Officer',
      `If you have a question or a complaint about how your data is handled, contact:`,
      grievanceBlock(),
      `Complaints are acknowledged within 48 hours and redressed within one month of receipt. We will explain the escalation options available under applicable law.`,

      '# 12. Changes to this policy',
      `We may update this policy as the store or the law changes. The date at the top of this page shows when it was last changed. A significant change will be made clear on the store before it takes effect.`,
    ]),
  };
}

function terms(): PolicyDocument {
  const courts = BUSINESS.jurisdiction
    ? `the courts at ${BUSINESS.jurisdiction}`
    : 'the courts of Kerala, India';

  return {
    title: 'Terms and conditions',
    description: `The terms that apply when you order from the ${BUSINESS.tradeName} store, run by ${BUSINESS.legalName}.`,
    body: join([
      `These terms apply to every order placed on this store. By placing an order you agree to them.`,

      '# About the seller',
      `The seller is ${BUSINESS.legalName}, ${BUSINESS.registeredAddress}.${BUSINESS.gstin ? ` GSTIN ${BUSINESS.gstin}.` : ''} "${BUSINESS.tradeName}", "we" and "us" mean this seller.`,

      '# Eligibility',
      `You must be at least 18 years old and able to enter into a binding contract under Indian law to place an order. The details you give us must be accurate and your own.`,

      '# Products and descriptions',
      `We describe and photograph our products as accurately as we can. Images are indicative: packaging, colour and label design may differ slightly from what is shown. Always read and follow the instructions on the product's own label, which take priority over anything on this website.`,

      '# Pricing',
      `Prices are in Indian rupees (₹) and include GST. The maximum retail price (MRP) is shown where the selling price is lower. A product marked "Price on request" cannot be ordered online; contact us for a quote. If a product is listed at a wrong price by mistake, we may cancel the order and refund you in full.`,

      '# Orders and acceptance',
      `Your order is an offer to buy. We accept it when we confirm it and take payment, or, for cash on delivery, when we confirm it. We may decline or cancel an order, for example if a product is out of stock, the delivery address cannot be served, or we suspect fraud. If we cancel a paid order you are refunded in full.`,

      '# Payments',
      `Online payments are processed securely by Razorpay. We do not see or store your card, UPI or bank details. Where cash on delivery is offered at checkout, any handling fee is shown before you place the order.`,

      '# Shipping',
      `Delivery times, charges and what to do about a damaged parcel are set out in our Shipping policy at /shipping-policy.`,

      '# Returns and refunds',
      `Cancellations, returns and refunds are set out in our Refund and cancellation policy at /refund-policy.`,

      '# Product use and safety',
      `Our cleaning and car-care products are chemical preparations. Keep them out of the reach of children, avoid contact with eyes, do not swallow them, and do not mix them with other chemicals. Use each product only for the purpose and in the way its label describes. Check the ingredients of any food, tea or personal-care product if you have an allergy.`,

      '# Intellectual property',
      `The brands ${BRANDS}, their logos, and the text, photographs and design of this website belong to ${BUSINESS.legalName} or its group companies. You may not copy or use them without written permission.`,

      '# Limitation of liability',
      `Nothing in these terms limits a right you have under the Consumer Protection Act, 2019 or any other law that cannot be excluded. Subject to that, our liability for any order is limited to the amount you paid for it, and we are not liable for indirect or consequential loss, or for loss caused by using a product other than as its label directs.`,

      '# Governing law',
      `These terms are governed by the laws of India. Any dispute is subject to the exclusive jurisdiction of ${courts}.`,

      '# Complaints',
      `If something has gone wrong, tell us first so we can put it right. How to reach us, and our Grievance Officer, is on the Contact page at /contact.`,

      '# Changes to these terms',
      `We may change these terms. The version that applies to your order is the one shown on this page on the day you placed it.`,
    ]),
  };
}

function returns(): PolicyDocument {
  const days = BUSINESS.returnWindowDays;
  return {
    title: 'Cancellation and refund policy',
    description: `How to cancel an order, return a product and get a refund from the ${BUSINESS.tradeName} store.`,
    body: join([
      '# Cancelling an order',
      `You may cancel an order free of charge at any time before it is dispatched. Contact us with your order number and we will cancel it and refund anything you have paid.`,
      `Once an order has been dispatched it cannot be cancelled. You may refuse the parcel when it arrives, or accept it and ask for a return under the terms below.`,

      '# Returns',
      `You may ask for a return within ${days} days of delivery if a product arrives damaged, defective, leaking, is not what you ordered, or is missing from the parcel. Please take a photograph or video while unboxing: it lets us settle the claim quickly.`,

      '# What cannot be returned',
      [
        'For hygiene and safety reasons we cannot take back:',
        '• any product that has been opened or used',
        '• food, tea and personal-care products once the seal is broken',
      ].join('\n'),
      `These limits do not apply to a product that arrived damaged, defective or wrong.`,

      '# How to ask for a return or refund',
      `Write to ${BUSINESS.email} or call ${BUSINESS.tollFree} with your order number, a short description of the problem and your photographs or video. We will reply with what happens next. Please do not send a product back before we have confirmed the return.`,

      '# Refunds',
      `Once a return or cancellation is approved, the refund is made to your original payment method through Razorpay within ${BUSINESS.refundDays}. Your bank may take a few more days to show it. An order paid in cash on delivery is refunded by bank transfer or UPI to the account you give us.`,

      '# Replacements',
      `Where we have stock, you may choose a replacement instead of a refund. It is sent at no extra charge.`,

      '# Delivery charges',
      `Delivery charges are not refunded, unless the return is because of our error: a damaged, defective, wrong or missing product.`,

      '# Questions',
      reachUs(),
    ]),
  };
}

function shipping(): PolicyDocument {
  return {
    title: 'Shipping and delivery policy',
    description: `Where the ${BUSINESS.tradeName} store delivers, how long delivery takes and what it costs.`,
    body: join([
      '# Where we deliver',
      `We deliver across India through Shiprocket and its courier partners. A small number of pincodes cannot be served by any courier; enter your pincode at checkout and we will tell you before you pay. We do not deliver outside India.`,

      '# Dispatch and delivery times',
      `Orders are dispatched within ${BUSINESS.dispatchDays} of being confirmed. Delivery usually takes a further ${BUSINESS.deliveryEstimate}, depending on where you are. Remote pincodes can take longer. These are estimates, not guarantees.`,

      '# Delivery charges',
      BUSINESS.freeShippingAbove !== null
        ? `Delivery is free on orders above ₹${BUSINESS.freeShippingAbove}. Below that, the charge depends on the weight of your order and where it is going, and is shown at checkout before you pay.`
        : `The delivery charge depends on the weight of your order and where it is going. It is shown at checkout before you pay, and is the only delivery charge you will be asked for.`,

      '# Tracking your order',
      `When your order is dispatched we send you a tracking link by email or SMS. You can also open your order page from the link in your confirmation message.`,

      '# Damaged or tampered parcels',
      `If a parcel arrives visibly damaged or opened, you may refuse it. If you only find the damage after accepting it, tell us promptly, preferably within 48 hours of delivery, with photographs where available. We will assess replacement or refund under our Refund and cancellation policy at /refund-policy. This reporting request does not limit your statutory rights.`,

      '# Delays',
      `Deliveries can be delayed by the courier, by weather, strikes, public holidays or other events outside our control. If your order is running late, contact us and we will find out where it is.`,

      '# How we pack',
      `Many of our products are liquids. Caps are sealed and bottles are packed to travel upright and cushioned.`,

      '# Questions',
      reachUs(),
    ]),
  };
}

export function defaultPolicy(slug: PolicySlug): PolicyDocument {
  switch (slug) {
    case 'privacy':
      return privacy();
    case 'terms':
      return terms();
    case 'returns':
      return returns();
    case 'shipping':
      return shipping();
  }
}
