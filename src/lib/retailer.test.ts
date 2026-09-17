import { describe, expect, it } from 'vitest';
import {
  MAX_IMPORT_ROWS,
  groupByDistrict,
  normaliseDistrict,
  parseCsv,
  parseRetailerCsv,
  planRetailerImport,
  retailerSchema,
  splitByPincode,
  type ExistingRetailer,
  type RetailerInput,
} from './retailer';

const SHOP: RetailerInput = {
  name: 'Anand Stores',
  address: 'Market Road',
  city: 'Kochi',
  district: 'Ernakulam',
  pincode: '682016',
  phone: null,
};

describe('normaliseDistrict', () => {
  it.each([
    ['ernakulam', 'Ernakulam'],
    ['  ERNAKULAM  district ', 'Ernakulam'],
    ['Calicut', 'Kozhikode'],
    ['trivandrum', 'Thiruvananthapuram'],
    ['nilgiris', 'Nilgiris'],
    ['  north   goa ', 'North Goa'],
  ])('%j → %j', (raw, expected) => {
    expect(normaliseDistrict(raw)).toBe(expected);
  });
});

describe('retailerSchema', () => {
  const raw = { ...SHOP, phone: '' };

  it('strips spaces from a pincode and turns a blank phone into null', () => {
    const parsed = retailerSchema.parse({ ...raw, pincode: '682 016' });
    expect(parsed.pincode).toBe('682016');
    expect(parsed.phone).toBeNull();
  });

  it.each(['082016', '68201', '6820161', 'abcdef'])('refuses pincode %j', (pincode) => {
    expect(retailerSchema.safeParse({ ...raw, pincode }).success).toBe(false);
  });

  it('refuses a phone with letters', () => {
    expect(retailerSchema.safeParse({ ...raw, phone: 'call the shop' }).success).toBe(false);
  });
});

describe('parseCsv', () => {
  it('handles quoted commas, doubled quotes, embedded newlines and CRLF', () => {
    const text = 'name,address\r\n"Shop, One","Line ""A""\nLine B"\r\n\r\n,\n';
    expect(parseCsv(text)).toEqual([
      ['name', 'address'],
      ['Shop, One', 'Line "A"\nLine B'],
    ]);
  });

  it('drops the byte-order mark Excel writes', () => {
    expect(parseCsv('﻿name,city\nA,B')).toEqual([
      ['name', 'city'],
      ['A', 'B'],
    ]);
  });

  it('keeps an empty quoted last cell', () => {
    expect(parseCsv('a,""')).toEqual([['a', '']]);
  });

  it('refuses a quote that is never closed', () => {
    expect(() => parseCsv('a,"b\nc')).toThrow(/never closed/);
  });
});

describe('parseRetailerCsv', () => {
  it('reads spreadsheet-style headings in any order and normalises values', () => {
    const text = [
      'PIN Code,Shop Name,Address,Town,District,Mobile',
      '682 016,Anand Stores,"Market Road, Ravipuram",Kochi,ernakulam district,0484 000 0000',
    ].join('\n');

    expect(parseRetailerCsv(text)).toEqual({
      ok: true,
      duplicatesMerged: 0,
      rows: [
        {
          name: 'Anand Stores',
          address: 'Market Road, Ravipuram',
          city: 'Kochi',
          district: 'Ernakulam',
          pincode: '682016',
          phone: '0484 000 0000',
        },
      ],
    });
  });

  it('does not need a phone column', () => {
    const result = parseRetailerCsv('name,address,city,district,pincode\nA,B,C,Thrissur,680001');
    expect(result.ok && result.rows[0].phone).toBeNull();
  });

  it('names the missing columns', () => {
    const result = parseRetailerCsv('name,address,city\nA,B,C');
    expect(result.ok).toBe(false);
    expect(!result.ok && result.errors[0]).toMatch(/Missing: district, pincode\./);
  });

  it('refuses a repeated column', () => {
    const result = parseRetailerCsv('name,shop,address,city,district,pincode');
    expect(result).toEqual({ ok: false, errors: ['The file has more than one "name" column.'] });
  });

  it('refuses an empty file and a header with no shops', () => {
    expect(parseRetailerCsv('\n\n')).toEqual({ ok: false, errors: ['The file is empty.'] });
    expect(parseRetailerCsv('name,address,city,district,pincode\n')).toEqual({
      ok: false,
      errors: ['The file names its columns but has no shops under them.'],
    });
  });

  it('imports nothing and lists every bad row by its spreadsheet row number', () => {
    const text = [
      'name,address,city,district,pincode',
      'Good Shop,Addr,Thrissur,Thrissur,680001',
      ',Addr,Thrissur,Thrissur,68000',
      'Other Shop,Addr,Thrissur,,680001',
    ].join('\n');

    expect(parseRetailerCsv(text)).toEqual({
      ok: false,
      errors: [
        'Row 3: Shop name is required. Pincode must be 6 digits.',
        'Row 4: District is required.',
      ],
    });
  });

  it('merges a shop listed twice, keeping the lower row', () => {
    const text = [
      'name,address,city,district,pincode',
      'Anand Stores,Old address,Kochi,Ernakulam,682016',
      'ANAND  stores,New address,Kochi,Ernakulam,682 016',
    ].join('\n');

    const result = parseRetailerCsv(text);
    expect(result.ok && result.duplicatesMerged).toBe(1);
    expect(result.ok && result.rows.map((row) => row.address)).toEqual(['New address']);
  });

  it('refuses a file over the row limit', () => {
    const rows = Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, i) => `Shop ${i},A,C,Thrissur,680001`);
    const result = parseRetailerCsv(['name,address,city,district,pincode', ...rows].join('\n'));
    expect(result.ok).toBe(false);
    expect(!result.ok && result.errors[0]).toContain(`${MAX_IMPORT_ROWS + 1}`);
  });

  it('caps the error list', () => {
    const rows = Array.from({ length: 40 }, () => 'Shop,A,C,Thrissur,1');
    const result = parseRetailerCsv(['name,address,city,district,pincode', ...rows].join('\n'));
    expect(!result.ok && result.errors).toHaveLength(26);
    expect(!result.ok && result.errors.at(-1)).toBe('…and 15 more rows with problems.');
  });
});

describe('planRetailerImport', () => {
  const existing = (patch: Partial<ExistingRetailer>): ExistingRetailer => ({
    ...SHOP,
    id: 'r1',
    isActive: true,
    ...patch,
  });

  it('creates new shops, updates changed ones and counts identical ones', () => {
    const plan = planRetailerImport(
      [existing({}), existing({ id: 'r2', name: 'Beta Mart', phone: '0484 1' })],
      [
        SHOP,
        { ...SHOP, name: 'Beta Mart', phone: '0484 2' },
        { ...SHOP, name: 'New Shop' },
      ],
    );

    expect(plan.unchanged).toBe(1);
    expect(plan.update.map((change) => [change.id, change.data.phone])).toEqual([['r2', '0484 2']]);
    expect(plan.create.map((row) => row.name)).toEqual(['New Shop']);
  });

  it('matches on name and pincode regardless of case and spacing', () => {
    const plan = planRetailerImport([existing({})], [{ ...SHOP, name: '  anand   STORES ' }]);
    expect(plan.create).toHaveLength(0);
    expect(plan.update).toHaveLength(1);
  });

  it('reactivates a deactivated shop that appears on the sheet unchanged', () => {
    const plan = planRetailerImport([existing({ isActive: false })], [SHOP]);
    expect(plan.unchanged).toBe(0);
    expect(plan.update.map((change) => change.id)).toEqual(['r1']);
  });

  it('never touches shops that are not on the sheet', () => {
    const plan = planRetailerImport([existing({ id: 'kept', name: 'Elsewhere' })], [SHOP]);
    expect(plan.update).toHaveLength(0);
    expect(plan.create).toHaveLength(1);
  });

  it('updates only the first of two identical hand-entered shops', () => {
    const plan = planRetailerImport(
      [existing({ id: 'first' }), existing({ id: 'second' })],
      [{ ...SHOP, address: 'Moved' }],
    );
    expect(plan.update.map((change) => change.id)).toEqual(['first']);
  });
});

describe('storefront search helpers', () => {
  const shops = [
    { name: 'A', district: 'Ernakulam', pincode: '682016' },
    { name: 'B', district: 'Ernakulam', pincode: '682035' },
    { name: 'C', district: 'Thrissur', pincode: '680001' },
    { name: 'D', district: 'Ernakulam', pincode: '682016' },
  ];

  it('puts exact pincode matches first and the same postal area after', () => {
    const { exact, nearby } = splitByPincode(shops, '682016');
    expect(exact.map((shop) => shop.name)).toEqual(['A', 'D']);
    expect(nearby.map((shop) => shop.name)).toEqual(['B']);
  });

  it('shows nothing from another postal area', () => {
    expect(splitByPincode(shops, '695001')).toEqual({ exact: [], nearby: [] });
  });

  it('groups by district in first-seen order', () => {
    expect(groupByDistrict(shops).map((group) => [group.district, group.stockists.length])).toEqual([
      ['Ernakulam', 3],
      ['Thrissur', 1],
    ]);
  });
});
