import { buildTaxByHsn } from '@/lib/gst';
import type { InvoiceData } from '@/lib/invoice';

/*
  A mixed-rate invoice fixture.

  Phase 6's acceptance criterion is "BBTC's accountant approves one generated
  mixed-rate invoice", and this is that invoice: four HSN codes at four
  different rates, which is the case §10 says a blended rate cannot represent —
  an 18% detergent, a 12% ghee, a 5% spice and a nil-rated jaggery in one order.

  It lives in `src/lib` rather than in a test file because two things need it:
  the render test, and `scripts/sample-invoice.ts`, which writes a PDF a human
  can actually put in front of an accountant. A fixture that only the test
  could reach would mean the reviewed document and the tested document were
  different documents.

  Every figure is *derived*, never typed in — `buildTaxByHsn` computes the tax
  from the same line amounts the item rows print, so the fixture reconciles for
  the same reason a real order does. Hand-written totals would let the sample
  invoice balance in a way a real one might not.
*/

interface FixtureLine {
  name: string;
  sku: string;
  hsnCode: string;
  /** Basis points: 1800 = 18%. */
  gstRate: number;
  quantity: number;
  /** GST-inclusive, per unit, as the storefront displays it. */
  unitPricePaise: number;
}

const LINES: FixtureLine[] = [
  {
    name: 'MX Three Dish Wash Liquid — Green Lemon, 900 ml',
    sku: '7860005',
    hsnCode: '3402',
    gstRate: 1800,
    quantity: 2,
    unitPricePaise: 20700,
  },
  {
    name: 'MX Three Dish Wash Liquid — Strawberry, 450 ml',
    sku: '7860001',
    hsnCode: '3402',
    gstRate: 1800,
    quantity: 1,
    unitPricePaise: 10400,
  },
  {
    name: 'Kenzaniya Premium Ghee, 500 ml',
    sku: 'KNZ-GHEE-500',
    hsnCode: '0405',
    gstRate: 1200,
    quantity: 1,
    unitPricePaise: 46000,
  },
  {
    name: 'Kenzaniya Kerala Black Pepper, 100 g',
    sku: 'KNZ-PEPPER-100',
    hsnCode: '0904',
    gstRate: 500,
    quantity: 3,
    unitPricePaise: 13500,
  },
  {
    name: 'Kenzaniya Marayoor Sharkara (jaggery), 500 g',
    sku: 'KNZ-SHARKARA-500',
    hsnCode: '1701',
    gstRate: 0,
    quantity: 2,
    unitPricePaise: 9000,
  },
];

/**
 * Build the fixture for a given destination.
 *
 * `deliveryState` is the whole point of the parameter: Kerala produces a
 * CGST + SGST invoice, anywhere else an IGST one, and those are two visibly
 * different tax tables that both have to be right.
 */
export function mixedRateInvoiceFixture(deliveryState = 'Kerala'): InvoiceData {
  const lineTotals = LINES.map((line) => line.unitPricePaise * line.quantity);
  const subtotalPaise = lineTotals.reduce((sum, value) => sum + value, 0);

  const shippingPaise = 6000;
  const codFeePaise = 3000;

  // Delivery and the COD fee are taxable supplies in their own right and are
  // charged at the rate of the principal supply. Rather than model composite
  // supply here, both are folded into the highest-rated HSN present — which is
  // the conservative direction, and is what the accountant needs to confirm.
  const taxable = [
    ...LINES.map((line, index) => ({
      hsnCode: line.hsnCode,
      gstRate: line.gstRate,
      inclusivePaise: lineTotals[index],
    })),
    { hsnCode: '3402', gstRate: 1800, inclusivePaise: shippingPaise + codFeePaise },
  ];

  const tax = buildTaxByHsn(taxable, deliveryState);
  const totalPaise = subtotalPaise + shippingPaise + codFeePaise;

  const address = (fullName: string) => ({
    fullName,
    phone: '9847012345',
    line1: 'Pappurath Building, 66/927',
    line2: 'Krishnaswamy Road, Pullepady',
    city: deliveryState === 'Kerala' ? 'Kochi' : 'Coimbatore',
    state: deliveryState,
    pincode: deliveryState === 'Kerala' ? '682035' : '641001',
    country: 'India',
  });

  return {
    invoiceNumber: 'BBTC/2627/00001',
    invoicedAt: new Date('2026-08-10T10:30:00+05:30'),
    orderNumber: 'BB-2627-00001',
    placedAt: new Date('2026-08-10T09:58:00+05:30'),

    seller: {
      legalName: 'Faisal Vathyedath Kunjimuhammed',
      tradeName: 'Bright Blue Trading Corporation',
      address: '66/927 Pappurath Building, Krishnaswamy Road, Pullepady',
      city: 'Kochi',
      state: 'Kerala',
      pincode: '682035',
      gstin: '32DCVPK7871P1ZI',
      stateCode: '32',
    },
    billTo: address('Adhil Rahman'),
    shipTo: address('Adhil Rahman'),

    placeOfSupply: deliveryState,
    placeOfSupplyCode: deliveryState === 'Kerala' ? '32' : '33',
    intraState: tax.intraState,

    lines: LINES.map((line, index) => ({
      name: line.name,
      sku: line.sku,
      hsnCode: line.hsnCode,
      gstRate: line.gstRate,
      quantity: line.quantity,
      unitPricePaise: line.unitPricePaise,
      totalPaise: lineTotals[index],
      choices: null,
    })),
    taxRows: tax.rows,

    subtotalPaise,
    discountPaise: 0,
    shippingPaise,
    codFeePaise,
    taxablePaise: tax.taxablePaise,
    cgstPaise: tax.cgstPaise,
    sgstPaise: tax.sgstPaise,
    igstPaise: tax.igstPaise,
    totalPaise,

    paymentMethod: 'COD',
    paymentStatus: 'PENDING',

    // Both Basic Registrations, since this order spans ghee/spices (one) and
    // would span tea (the other). Real numbers, from the supplied certificates.
    fssaiLicences: ['21326201000001'],
    cosmeticLicences: [],
  };
}
