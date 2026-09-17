import 'server-only';
import { db } from '@/lib/db';
import { groupByDistrict, pincodeArea, splitByPincode } from '@/lib/retailer';

/*
  The storefront's reads for /stockists. Every one degrades to empty rather
  than throwing: a database hiccup should fall back to the toll-free number,
  not a 500 on the page people use to find a shop.
*/

export type Stockist = {
  id: string;
  name: string;
  address: string;
  city: string;
  district: string;
  pincode: string;
  phone: string | null;
};

const STOCKIST_SELECT = {
  id: true,
  name: true,
  address: true,
  city: true,
  district: true,
  pincode: true,
  phone: true,
} as const;

/** Active stockists grouped by district, optionally one district only. */
export async function getStockistsByDistrict(
  district?: string,
): Promise<{ district: string; stockists: Stockist[] }[]> {
  try {
    const retailers = await db.retailer.findMany({
      where: { isActive: true, ...(district ? { district } : {}) },
      orderBy: [{ district: 'asc' }, { city: 'asc' }, { name: 'asc' }],
      select: STOCKIST_SELECT,
    });
    return groupByDistrict(retailers);
  } catch (error) {
    console.warn('[stockists] unavailable:', error);
    return [];
  }
}

/** Districts that have at least one active stockist, for the district links. */
export async function getStockistDistricts(): Promise<string[]> {
  try {
    const rows = await db.retailer.findMany({
      where: { isActive: true },
      distinct: ['district'],
      select: { district: true },
      orderBy: { district: 'asc' },
    });
    return rows.map((row) => row.district);
  } catch (error) {
    console.warn('[stockists] districts unavailable:', error);
    return [];
  }
}

/** Stockists at a pincode, then elsewhere in its postal area. */
export async function findStockistsNearPincode(
  pincode: string,
): Promise<{ exact: Stockist[]; nearby: Stockist[] }> {
  try {
    const retailers = await db.retailer.findMany({
      where: { isActive: true, pincode: { startsWith: pincodeArea(pincode) } },
      orderBy: [{ pincode: 'asc' }, { city: 'asc' }, { name: 'asc' }],
      select: STOCKIST_SELECT,
    });
    return splitByPincode(retailers, pincode);
  } catch (error) {
    console.warn('[stockists] pincode search unavailable:', error);
    return { exact: [], nearby: [] };
  }
}
