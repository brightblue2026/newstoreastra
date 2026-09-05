-- MAKAFA, the eighth brand. Named on bbtcglobal.com but absent from the master
-- brief's §3/§11 brand list, so it needs a segment no existing value covers:
-- perfume is not personal care, and the storefront filters by segment.
--
-- Appended rather than inserted in category order because ALTER TYPE ... ADD VALUE
-- can only append or position relative to an existing value, and reordering an enum
-- in place would mean recreating the type and rewriting every column using it.
-- Display order comes from Brand.sortOrder, not from enum ordinal, so this is
-- invisible to the storefront.
ALTER TYPE "Segment" ADD VALUE 'FRAGRANCE';
