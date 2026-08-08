# MSG91 WhatsApp templates — ready to submit

Brief §10: *"Submit MSG91 templates for approval during Phase 5, not Phase 6 — approval
takes time."* This file is that submission, written out so someone with the MSG91 login
can paste it in today. **Nothing here is wired up in code yet** — the sending layer is
Phase 6. Approval is the long pole, which is the only reason this exists now.

## What has to happen, and who does it

1. **BBTC** — someone with the MSG91 account and the WhatsApp Business number:
   - Register the sender number and complete Meta's business verification if it is not done.
   - Create the four templates below, verbatim, in the **Utility** category.
   - Send back each template's **name** and **namespace/ID** once approved.
2. **This codebase** — Phase 6 adds `src/lib/msg91.ts` and calls it from the order
   transitions that already exist in `src/lib/orders.ts`. Nothing else changes.

Two things worth knowing before submitting, because they cause most rejections:

- **Utility, not Marketing.** All four are transactional messages about an order the
  customer placed. Filed as Marketing they attract per-message marketing pricing and can be
  throttled by the customer's opt-out state.
- **No promotional language, no emoji.** A template that invites more shopping gets
  reclassified as Marketing. There is no emoji anywhere in this project (CLAUDE.md), which
  happens to be the same rule.

Variables are `{{1}}`, `{{2}}`… in Meta's format, in the order they appear. Every one is
listed with the field it comes from, so Phase 6 has no guesswork.

---

## 1. `bbtc_order_confirmed`

Sent when an order reaches `CONFIRMED` — a verified Razorpay webhook for a prepaid order,
or placement for a COD one.

> Hello {{1}}, your Bright Blue order {{2}} is confirmed. Total {{3}}, paid by {{4}}. We
> will send the tracking details as soon as it ships. Questions? Call 1800 123 0621.

| Variable | Source |
| --- | --- |
| `{{1}}` | `shippingAddress.fullName` — first name only if it is long |
| `{{2}}` | `Order.orderNumber`, e.g. `BB-2627-00001` |
| `{{3}}` | `formatINR(Order.totalPaise)`, e.g. `₹1,248.00` |
| `{{4}}` | `Cash on delivery` or `UPI / card` — from `Order.paymentMethod` |

For a COD order the amount is what the customer will hand over at the door, so `{{3}}`
already includes the COD handling fee. Do not add a second "amount due" line — one figure
is the whole point.

## 2. `bbtc_order_shipped`

Sent on the `PACKED → SHIPPED` transition, once Shiprocket has returned an AWB.

> Hello {{1}}, your Bright Blue order {{2}} has shipped with {{3}}. Tracking number {{4}}.
> Track it here: {{5}}

| Variable | Source |
| --- | --- |
| `{{1}}` | `shippingAddress.fullName` |
| `{{2}}` | `Order.orderNumber` |
| `{{3}}` | `Order.courierName` |
| `{{4}}` | `Order.awbNumber` |
| `{{5}}` | `Order.trackingUrl` |

If Meta requires the URL as a button rather than a body variable, use a dynamic URL button
carrying the AWB and drop `{{5}}` from the body.

## 3. `bbtc_out_for_delivery`

Sent from the Shiprocket tracking webhook, not from an admin action.

> Hello {{1}}, your Bright Blue order {{2}} is out for delivery today. {{3}}

| Variable | Source |
| --- | --- |
| `{{1}}` | `shippingAddress.fullName` |
| `{{2}}` | `Order.orderNumber` |
| `{{3}}` | For COD: `Please keep ₹1,248.00 ready.` · For prepaid: `Nothing to pay on delivery.` |

`{{3}}` is a full sentence rather than an amount, because the prepaid case has no amount and
a template variable cannot be conditionally absent.

## 4. `bbtc_order_delivered`

Sent on `SHIPPED → DELIVERED`.

> Hello {{1}}, your Bright Blue order {{2}} has been delivered. Your GST invoice is
> attached to the email we sent to {{3}}. If anything is not right, call 1800 123 0621
> within 7 days.

| Variable | Source |
| --- | --- |
| `{{1}}` | `shippingAddress.fullName` |
| `{{2}}` | `Order.orderNumber` |
| `{{3}}` | `Order.guestEmail` or the account email |

**This one is blocked on an answer, not on approval.** "Within 7 days" is a guess and must
not be submitted as-is: §14 Q18 asks for the return policy, *noting that food returns are
governed differently from detergent*. Get the real window — and whether it differs for
Kenzaniya and Ilfa Valley food lines — before this template goes in. If food differs, this
becomes two templates.

An order with no email address needs a variant of this template without `{{3}}`, since
email is optional at checkout. Simplest is to submit `bbtc_order_delivered_nomail` with the
invoice sentence removed.

---

## SMS fallback

WhatsApp is read in this market and email often is not (§10), but a WhatsApp send can still
fail — an unregistered number, or a customer who has blocked the sender. The fallback is
SMS through the same MSG91 account, and DLT registration in India is separate from WhatsApp
template approval: each SMS template needs its own **DLT content template ID** registered
against BBTC's principal entity ID on the operator DLT portal.

Submit the same four bodies as SMS templates, minus the tracking URL, which pushes an SMS
over one segment. Keep the order number, which is what a customer reads back over the phone.

## Open questions this raises for BBTC

- **Q18 (return policy)** blocks template 4 above, and differs for food.
- Which WhatsApp Business number is the sender: the toll-free 1800 123 0621 cannot be one
  (toll-free numbers cannot host WhatsApp Business), so a different number has to be
  nominated and verified.
- Is the sender name "Bright Blue" or "Bright Blue Trading Corporation"? It appears in
  Meta's display name and has to match the verified business name.
