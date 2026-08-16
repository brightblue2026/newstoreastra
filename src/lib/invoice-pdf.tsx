import { Document, Page, StyleSheet, Text, View, renderToBuffer } from '@react-pdf/renderer';
import { amountInWords, formatINR } from '@/lib/money';
import { formatRate } from '@/lib/gst';
import type { InvoiceData, InvoiceLine } from '@/lib/invoice';

/*
  The GST tax invoice — brief §10 and §12 Phase 6's headline deliverable:
  "GST invoice PDF with per-HSN summary table, FSSAI number on food orders".

  Three things drive every decision in this file.

  1. **The per-HSN summary table is the point.** This catalogue spans 18%
     detergents, 12% ghee, 5% spices and nil-rated jaggery, and one order can
     hold all four. A single blended rate would be wrong on its face, so the
     table prints one row per HSN and rate, and its columns are the ones a GSTR
     return wants: taxable value, then CGST + SGST or IGST, never both.

  2. **Nothing is recalculated here.** Every figure comes from the order's own
     stored snapshot. A renderer that did its own arithmetic could disagree with
     what the customer was charged, and the invoice would be the thing that was
     wrong. `formatINR` is the only transformation applied to money.

  3. **No brand colour, no logo, no styling flourish.** §9's one-accent rule is
     about the storefront; this is a legal document that gets printed in black
     and white, faxed to an accountant, and read under a scanner. It is set in
     Helvetica — a PDF core font, so nothing has to be embedded and the file
     stays small and opens anywhere. Clash Display and Satoshi are for screens.

  Deliberately absent: a "reverse charge" row (BBTC sells B2C, and reverse
  charge does not apply), an IRN/QR code (e-invoicing is mandatory only above a
  turnover threshold BBTC is far below — its FSSAI Basic Registration caps it at
  ₹12 lakh), and a signature block, which is not required when an invoice is
  issued electronically.
*/

const PAGE_PADDING = 32;

const styles = StyleSheet.create({
  page: {
    paddingTop: PAGE_PADDING,
    paddingBottom: PAGE_PADDING + 16,
    paddingHorizontal: PAGE_PADDING,
    fontFamily: 'Helvetica',
    fontSize: 8.5,
    color: '#111111',
    lineHeight: 1.4,
  },

  title: { fontFamily: 'Helvetica-Bold', fontSize: 13, letterSpacing: 0.5 },
  subtitle: { fontSize: 7.5, color: '#555555', marginTop: 2 },

  bold: { fontFamily: 'Helvetica-Bold' },
  muted: { color: '#555555' },
  right: { textAlign: 'right' },

  rule: { borderBottomWidth: 1, borderBottomColor: '#111111', marginVertical: 8 },
  hairline: { borderBottomWidth: 0.5, borderBottomColor: '#BBBBBB' },

  row: { flexDirection: 'row' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },

  panel: { flex: 1, paddingRight: 12 },
  panelLabel: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 7,
    letterSpacing: 0.8,
    color: '#555555',
    marginBottom: 3,
  },

  section: { marginTop: 12 },
  sectionHeading: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 8,
    letterSpacing: 0.6,
    marginBottom: 4,
  },

  th: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 7.5,
    paddingVertical: 4,
    paddingHorizontal: 3,
    backgroundColor: '#F2F2F2',
  },
  td: { fontSize: 8, paddingVertical: 4, paddingHorizontal: 3 },

  totalsBlock: { marginTop: 10, flexDirection: 'row', justifyContent: 'flex-end' },
  totalsTable: { width: '58%' },
  totalsRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  grandTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 5,
    marginTop: 3,
    borderTopWidth: 1,
    borderTopColor: '#111111',
  },

  words: { marginTop: 10, padding: 6, backgroundColor: '#F7F7F7' },

  footer: {
    position: 'absolute',
    bottom: PAGE_PADDING - 8,
    left: PAGE_PADDING,
    right: PAGE_PADDING,
    fontSize: 6.5,
    color: '#777777',
    textAlign: 'center',
  },
});

/** Column widths for the line-item table. They must total 100. */
const ITEM_COLUMNS = {
  description: '38%',
  hsn: '11%',
  rate: '9%',
  quantity: '8%',
  unit: '15%',
  amount: '19%',
} as const;

/** Column widths for the per-HSN tax summary. Two layouts — intra-state splits into two heads. */
const TAX_COLUMNS_INTRA = {
  hsn: '18%',
  taxable: '22%',
  cgst: '30%',
  sgst: '30%',
} as const;

const TAX_COLUMNS_INTER = {
  hsn: '22%',
  taxable: '30%',
  igst: '48%',
} as const;

function money(paise: number): string {
  return formatINR(paise, { symbol: false });
}

/**
 * CGST and SGST are each half the total rate — 18% splits into 9% + 9%.
 *
 * Every rate in the CBIC schedule is an even number of basis points, so the
 * halving is exact. An odd one would make `bps / 2` fractional, and
 * `formatRate` rejects a non-integer — inside a PDF render that would be a
 * throw rather than a wrong label, so it is handled here instead of assumed
 * away. Note this only ever labels a column; the *amounts* come from the
 * stored split and are never derived from a halved rate.
 */
function halfRateLabel(bps: number): string {
  return bps % 2 === 0 ? formatRate(bps / 2) : `${(bps / 200).toFixed(2)}%`;
}

function formatDate(date: Date): string {
  // dd-MM-yyyy — how a date is read on an Indian invoice, and unambiguous
  // against the US ordering in a way that a slash-separated date is not.
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${day}-${month}-${date.getFullYear()}`;
}

function AddressPanel({
  label,
  address,
}: {
  label: string;
  address: InvoiceData['billTo'];
}) {
  return (
    <View style={styles.panel}>
      <Text style={styles.panelLabel}>{label}</Text>
      <Text style={styles.bold}>{address?.fullName ?? '—'}</Text>
      {address?.line1 ? <Text>{address.line1}</Text> : null}
      {address?.line2 ? <Text>{address.line2}</Text> : null}
      <Text>
        {[address?.city, address?.state, address?.pincode].filter(Boolean).join(', ')}
      </Text>
      {address?.phone ? <Text style={styles.muted}>Phone {address.phone}</Text> : null}
    </View>
  );
}

function ItemRow({ line, index }: { line: InvoiceLine; index: number }) {
  return (
    <View style={[styles.row, styles.hairline]} wrap={false}>
      <View style={{ width: ITEM_COLUMNS.description }}>
        <Text style={styles.td}>
          {index + 1}. {line.name}
        </Text>
        <Text style={[styles.td, styles.muted, { paddingTop: 0 }]}>
          SKU {line.sku}
          {line.choices
            ? ` · ${line.choices
                .map((slot) => `${slot.slotLabel}: ${slot.picks.join(', ')}`)
                .join(' · ')}`
            : ''}
        </Text>
      </View>
      <Text style={[styles.td, styles.right, { width: ITEM_COLUMNS.hsn }]}>{line.hsnCode}</Text>
      <Text style={[styles.td, styles.right, { width: ITEM_COLUMNS.rate }]}>
        {formatRate(line.gstRate)}
      </Text>
      <Text style={[styles.td, styles.right, { width: ITEM_COLUMNS.quantity }]}>
        {line.quantity}
      </Text>
      <Text style={[styles.td, styles.right, { width: ITEM_COLUMNS.unit }]}>
        {money(line.unitPricePaise)}
      </Text>
      <Text style={[styles.td, styles.right, { width: ITEM_COLUMNS.amount }]}>
        {money(line.totalPaise)}
      </Text>
    </View>
  );
}

/**
 * The per-HSN tax summary — the table §10 calls "not optional for a mixed
 * catalogue".
 *
 * Intra-state and inter-state get different columns rather than one table with
 * empty cells, because an invoice showing a zeroed CGST column next to a filled
 * IGST one invites the reader to wonder which is right.
 */
function TaxSummary({ data }: { data: InvoiceData }) {
  const { intraState, taxRows } = data;

  if (taxRows.length === 0) return null;

  return (
    <View style={styles.section} wrap={false}>
      <Text style={styles.sectionHeading}>TAX SUMMARY BY HSN</Text>

      {intraState ? (
        <>
          <View style={styles.row}>
            <Text style={[styles.th, { width: TAX_COLUMNS_INTRA.hsn }]}>HSN</Text>
            <Text style={[styles.th, styles.right, { width: TAX_COLUMNS_INTRA.taxable }]}>
              Taxable value
            </Text>
            <Text style={[styles.th, styles.right, { width: TAX_COLUMNS_INTRA.cgst }]}>
              CGST
            </Text>
            <Text style={[styles.th, styles.right, { width: TAX_COLUMNS_INTRA.sgst }]}>
              SGST
            </Text>
          </View>
          {taxRows.map((row) => (
            <View style={[styles.row, styles.hairline]} key={`${row.hsn}-${row.rate}`}>
              <Text style={[styles.td, { width: TAX_COLUMNS_INTRA.hsn }]}>{row.hsn}</Text>
              <Text style={[styles.td, styles.right, { width: TAX_COLUMNS_INTRA.taxable }]}>
                {money(row.taxablePaise)}
              </Text>
              <Text style={[styles.td, styles.right, { width: TAX_COLUMNS_INTRA.cgst }]}>
                {halfRateLabel(row.rate)} · {money(row.cgstPaise)}
              </Text>
              <Text style={[styles.td, styles.right, { width: TAX_COLUMNS_INTRA.sgst }]}>
                {halfRateLabel(row.rate)} · {money(row.sgstPaise)}
              </Text>
            </View>
          ))}
          <View style={styles.row}>
            <Text style={[styles.td, styles.bold, { width: TAX_COLUMNS_INTRA.hsn }]}>Total</Text>
            <Text
              style={[styles.td, styles.bold, styles.right, { width: TAX_COLUMNS_INTRA.taxable }]}
            >
              {money(data.taxablePaise)}
            </Text>
            <Text
              style={[styles.td, styles.bold, styles.right, { width: TAX_COLUMNS_INTRA.cgst }]}
            >
              {money(data.cgstPaise)}
            </Text>
            <Text
              style={[styles.td, styles.bold, styles.right, { width: TAX_COLUMNS_INTRA.sgst }]}
            >
              {money(data.sgstPaise)}
            </Text>
          </View>
        </>
      ) : (
        <>
          <View style={styles.row}>
            <Text style={[styles.th, { width: TAX_COLUMNS_INTER.hsn }]}>HSN</Text>
            <Text style={[styles.th, styles.right, { width: TAX_COLUMNS_INTER.taxable }]}>
              Taxable value
            </Text>
            <Text style={[styles.th, styles.right, { width: TAX_COLUMNS_INTER.igst }]}>IGST</Text>
          </View>
          {taxRows.map((row) => (
            <View style={[styles.row, styles.hairline]} key={`${row.hsn}-${row.rate}`}>
              <Text style={[styles.td, { width: TAX_COLUMNS_INTER.hsn }]}>{row.hsn}</Text>
              <Text style={[styles.td, styles.right, { width: TAX_COLUMNS_INTER.taxable }]}>
                {money(row.taxablePaise)}
              </Text>
              <Text style={[styles.td, styles.right, { width: TAX_COLUMNS_INTER.igst }]}>
                {formatRate(row.rate)} · {money(row.igstPaise)}
              </Text>
            </View>
          ))}
          <View style={styles.row}>
            <Text style={[styles.td, styles.bold, { width: TAX_COLUMNS_INTER.hsn }]}>Total</Text>
            <Text
              style={[styles.td, styles.bold, styles.right, { width: TAX_COLUMNS_INTER.taxable }]}
            >
              {money(data.taxablePaise)}
            </Text>
            <Text
              style={[styles.td, styles.bold, styles.right, { width: TAX_COLUMNS_INTER.igst }]}
            >
              {money(data.igstPaise)}
            </Text>
          </View>
        </>
      )}
    </View>
  );
}

function TotalsRow({
  label,
  paise,
  negative = false,
}: {
  label: string;
  paise: number;
  negative?: boolean;
}) {
  if (paise === 0) return null;
  return (
    <View style={styles.totalsRow}>
      <Text style={styles.muted}>{label}</Text>
      <Text>
        {negative ? '−' : ''}
        {money(paise)}
      </Text>
    </View>
  );
}

export function InvoiceDocument({ data }: { data: InvoiceData }) {
  const { seller } = data;

  return (
    <Document
      title={`Tax invoice ${data.invoiceNumber}`}
      author={seller.legalName}
      subject={`Tax invoice for order ${data.orderNumber}`}
    >
      <Page size="A4" style={styles.page}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>TAX INVOICE</Text>
            <Text style={styles.subtitle}>Original for recipient</Text>
          </View>
          <View style={{ width: '45%' }}>
            <View style={styles.totalsRow}>
              <Text style={styles.muted}>Invoice number</Text>
              <Text style={styles.bold}>{data.invoiceNumber}</Text>
            </View>
            <View style={styles.totalsRow}>
              <Text style={styles.muted}>Invoice date</Text>
              <Text>{formatDate(data.invoicedAt)}</Text>
            </View>
            <View style={styles.totalsRow}>
              <Text style={styles.muted}>Order number</Text>
              <Text>{data.orderNumber}</Text>
            </View>
            <View style={styles.totalsRow}>
              <Text style={styles.muted}>Order date</Text>
              <Text>{formatDate(data.placedAt)}</Text>
            </View>
          </View>
        </View>

        <View style={styles.rule} />

        <View style={styles.row}>
          <View style={styles.panel}>
            <Text style={styles.panelLabel}>SOLD BY</Text>
            <Text style={styles.bold}>{seller.tradeName ?? seller.legalName}</Text>
            {seller.tradeName ? (
              <Text style={styles.muted}>{seller.legalName}</Text>
            ) : null}
            <Text>{seller.address}</Text>
            <Text>
              {[seller.city, seller.state, seller.pincode].filter(Boolean).join(', ')}
            </Text>
            <Text style={[styles.bold, { marginTop: 3 }]}>GSTIN {seller.gstin}</Text>
            {seller.stateCode ? (
              <Text style={styles.muted}>
                State code {seller.stateCode} · {seller.state}
              </Text>
            ) : null}
          </View>

          <AddressPanel label="BILL TO" address={data.billTo} />
          <AddressPanel label="SHIP TO" address={data.shipTo} />
        </View>

        <View style={[styles.row, { marginTop: 8 }]}>
          <Text style={styles.muted}>
            Place of supply: <Text style={styles.bold}>{data.placeOfSupply}</Text>
            {data.placeOfSupplyCode ? ` (${data.placeOfSupplyCode})` : ''} · Payment:{' '}
            <Text style={styles.bold}>
              {data.paymentMethod === 'COD' ? 'Cash on delivery' : 'Prepaid (Razorpay)'}
            </Text>{' '}
            · {data.paymentStatus}
          </Text>
        </View>

        <View style={styles.section}>
          <View style={styles.row}>
            <Text style={[styles.th, { width: ITEM_COLUMNS.description }]}>Description</Text>
            <Text style={[styles.th, styles.right, { width: ITEM_COLUMNS.hsn }]}>HSN</Text>
            <Text style={[styles.th, styles.right, { width: ITEM_COLUMNS.rate }]}>GST</Text>
            <Text style={[styles.th, styles.right, { width: ITEM_COLUMNS.quantity }]}>Qty</Text>
            <Text style={[styles.th, styles.right, { width: ITEM_COLUMNS.unit }]}>Rate</Text>
            <Text style={[styles.th, styles.right, { width: ITEM_COLUMNS.amount }]}>Amount</Text>
          </View>
          {data.lines.map((line, index) => (
            <ItemRow line={line} index={index} key={`${line.sku}-${index}`} />
          ))}
        </View>

        <View style={styles.totalsBlock}>
          <View style={styles.totalsTable}>
            <TotalsRow label="Items subtotal" paise={data.subtotalPaise} />
            <TotalsRow label="Discount" paise={data.discountPaise} negative />
            <TotalsRow label="Delivery" paise={data.shippingPaise} />
            <TotalsRow label="Cash-on-delivery fee" paise={data.codFeePaise} />
            <TotalsRow label="Taxable value" paise={data.taxablePaise} />
            <TotalsRow label="CGST" paise={data.cgstPaise} />
            <TotalsRow label="SGST" paise={data.sgstPaise} />
            <TotalsRow label="IGST" paise={data.igstPaise} />
            <View style={styles.grandTotalRow}>
              <Text style={styles.bold}>Total (INR)</Text>
              <Text style={styles.bold}>{money(data.totalPaise)}</Text>
            </View>
          </View>
        </View>

        <View style={styles.words}>
          <Text>
            <Text style={styles.muted}>Amount in words: </Text>
            <Text style={styles.bold}>{amountInWords(data.totalPaise)}</Text>
          </Text>
        </View>

        <TaxSummary data={data} />

        {data.fssaiLicences.length > 0 || data.cosmeticLicences.length > 0 ? (
          <View style={styles.section} wrap={false}>
            <Text style={styles.sectionHeading}>LICENCES</Text>
            {data.fssaiLicences.length > 0 ? (
              <Text>FSSAI registration {data.fssaiLicences.join(' · ')}</Text>
            ) : null}
            {data.cosmeticLicences.length > 0 ? (
              <Text>Cosmetics manufacturing licence {data.cosmeticLicences.join(' · ')}</Text>
            ) : null}
          </View>
        ) : null}

        <Text style={styles.footer} fixed>
          Prices are inclusive of GST. This is a computer-generated invoice and needs no
          signature. Bright Blue Trading Corporation · 1800 123 0621 · info@brightblue.in
        </Text>
      </Page>
    </Document>
  );
}

/**
 * Render an invoice to a PDF buffer.
 *
 * Node-only: `@react-pdf/renderer` needs a Node runtime, so every route that
 * calls this declares `runtime = 'nodejs'`. It is intentionally *not* streamed —
 * an invoice is a few kilobytes, and a buffer is what both the download
 * response and the Resend attachment need.
 */
export async function renderInvoicePdf(data: InvoiceData): Promise<Buffer> {
  return renderToBuffer(<InvoiceDocument data={data} />);
}
