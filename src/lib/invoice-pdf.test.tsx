import { describe, expect, it } from 'vitest';
import { mixedRateInvoiceFixture } from '@/lib/invoice-fixture';
import { renderInvoicePdf } from '@/lib/invoice-pdf';

/*
  These tests do two different jobs, and only one of them is about the PDF.

  The arithmetic assertions are the important half: they prove the numbers a
  mixed-rate invoice prints actually reconcile, which is what an accountant
  checks first and what §10 says a single blended rate cannot do.

  The render assertions are shallower on purpose. `renderToBuffer` throws on an
  invalid style or a malformed component tree, so getting a `%PDF` buffer back
  proves the document is structurally sound — but not that it *looks* right.
  Nothing here can prove that; `scripts/sample-invoice.ts` writes a file for a
  human to look at, which is the only way that gets checked.
*/

describe('mixed-rate invoice arithmetic', () => {
  it('splits four HSN codes into four rows, never one blended rate', () => {
    const invoice = mixedRateInvoiceFixture('Kerala');
    const hsnCodes = invoice.taxRows.map((row) => row.hsn).sort();

    expect(new Set(hsnCodes)).toEqual(new Set(['3402', '0405', '0904', '1701']));
    expect(new Set(invoice.taxRows.map((row) => row.rate))).toEqual(
      new Set([1800, 1200, 500, 0]),
    );
  });

  it('reconciles: taxable + tax equals the total charged', () => {
    const invoice = mixedRateInvoiceFixture('Kerala');
    const tax = invoice.cgstPaise + invoice.sgstPaise + invoice.igstPaise;

    expect(invoice.taxablePaise + tax).toBe(invoice.totalPaise);
  });

  it('reconciles per row as well as in total', () => {
    const invoice = mixedRateInvoiceFixture('Kerala');
    for (const row of invoice.taxRows) {
      expect(row.taxablePaise + row.taxPaise).toBe(row.inclusivePaise);
      expect(row.cgstPaise + row.sgstPaise + row.igstPaise).toBe(row.taxPaise);
    }
  });

  it('charges nothing on the nil-rated jaggery', () => {
    const jaggery = mixedRateInvoiceFixture('Kerala').taxRows.find((row) => row.hsn === '1701');
    expect(jaggery?.rate).toBe(0);
    expect(jaggery?.taxPaise).toBe(0);
    // Nil-rated is not the same as absent: the taxable value still has to
    // appear on the invoice and in the GST return.
    expect(jaggery?.taxablePaise).toBeGreaterThan(0);
  });

  it('is CGST + SGST inside Kerala and IGST outside it', () => {
    const kerala = mixedRateInvoiceFixture('Kerala');
    expect(kerala.intraState).toBe(true);
    expect(kerala.igstPaise).toBe(0);
    expect(kerala.cgstPaise + kerala.sgstPaise).toBeGreaterThan(0);

    const tamilNadu = mixedRateInvoiceFixture('Tamil Nadu');
    expect(tamilNadu.intraState).toBe(false);
    expect(tamilNadu.cgstPaise).toBe(0);
    expect(tamilNadu.sgstPaise).toBe(0);
    expect(tamilNadu.igstPaise).toBeGreaterThan(0);
  });

  it('collects the same total tax whichever side of the border it goes', () => {
    // The heads differ; the amount must not. A customer is never charged more
    // for living outside Kerala.
    const kerala = mixedRateInvoiceFixture('Kerala');
    const tamilNadu = mixedRateInvoiceFixture('Tamil Nadu');

    expect(kerala.cgstPaise + kerala.sgstPaise).toBe(tamilNadu.igstPaise);
    expect(kerala.totalPaise).toBe(tamilNadu.totalPaise);
  });
});

describe('renderInvoicePdf', () => {
  it('renders an intra-state invoice to a PDF', async () => {
    const pdf = await renderInvoicePdf(mixedRateInvoiceFixture('Kerala'));

    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(2000);
  }, 30_000);

  it('renders the inter-state layout, which is a different tax table', async () => {
    const pdf = await renderInvoicePdf(mixedRateInvoiceFixture('Tamil Nadu'));

    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(2000);
  }, 30_000);
});
