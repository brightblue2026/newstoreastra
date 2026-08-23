/*
  Write sample tax invoices to disk, for a human to look at.

    pnpm invoice:sample [outputDirectory]

  Phase 6's acceptance criterion is that BBTC's accountant approves a generated
  mixed-rate invoice. No test can do that — a test proves the numbers reconcile
  and the document renders, not that the layout is readable, the wording is
  right, or the tax table is the one a GSTR return wants. This produces the two
  files that actually have to be sent to them.

  It needs no database and no environment variables: the fixture is the same
  one `invoice-pdf.test.tsx` asserts against, so the reviewed document and the
  tested document cannot drift apart.
*/

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { mixedRateInvoiceFixture } from '../src/lib/invoice-fixture';
import { renderInvoicePdf } from '../src/lib/invoice-pdf';

const SAMPLES = [
  {
    file: 'sample-invoice-kerala-cgst-sgst.pdf',
    state: 'Kerala',
    describes: 'delivery inside Kerala — CGST + SGST, four HSN codes',
  },
  {
    file: 'sample-invoice-tamilnadu-igst.pdf',
    state: 'Tamil Nadu',
    describes: 'delivery outside Kerala — IGST, same four HSN codes',
  },
];

async function main(): Promise<void> {
  const outputDir = path.resolve(process.argv[2] ?? 'tmp/invoices');
  await mkdir(outputDir, { recursive: true });

  for (const sample of SAMPLES) {
    const invoice = mixedRateInvoiceFixture(sample.state);
    const pdf = await renderInvoicePdf(invoice);
    const target = path.join(outputDir, sample.file);
    await writeFile(target, pdf);

    const tax = invoice.cgstPaise + invoice.sgstPaise + invoice.igstPaise;
    console.info(
      [
        target,
        `  ${sample.describes}`,
        `  taxable ${invoice.taxablePaise} + tax ${tax} = ${invoice.totalPaise} paise`,
        `  reconciles: ${invoice.taxablePaise + tax === invoice.totalPaise ? 'yes' : 'NO'}`,
      ].join('\n'),
    );
  }

  console.info(`\n${SAMPLES.length} invoices written. Send these to the accountant.`);
}

main().catch((error: unknown) => {
  console.error('Could not write the sample invoices:', error);
  process.exitCode = 1;
});
