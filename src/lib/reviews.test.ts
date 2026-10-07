import { describe, expect, it } from 'vitest';
import {
  formatReviewDate,
  isValidRating,
  looksLikeSpam,
  reviewSubmissionSchema,
  sharePercent,
  summariseRatings,
} from './reviews';

describe('summariseRatings', () => {
  it('averages to one decimal place', () => {
    const summary = summariseRatings([{ rating: 5 }, { rating: 4 }, { rating: 4 }]);
    expect(summary.count).toBe(3);
    expect(summary.average).toBe(4.3);
  });

  it('gives null, never zero, when nothing has been reviewed', () => {
    const summary = summariseRatings([]);
    expect(summary.average).toBeNull();
    expect(summary.count).toBe(0);
  });

  it('counts every star band, including the empty ones', () => {
    const summary = summariseRatings([{ rating: 5 }, { rating: 5 }, { rating: 1 }]);
    expect(summary.distribution).toEqual([
      { stars: 5, count: 2 },
      { stars: 4, count: 0 },
      { stars: 3, count: 0 },
      { stars: 2, count: 0 },
      { stars: 1, count: 1 },
    ]);
  });

  it('ignores a rating outside the star range rather than averaging it in', () => {
    const summary = summariseRatings([{ rating: 5 }, { rating: 9 }, { rating: 0 }, { rating: 3 }]);
    expect(summary.count).toBe(2);
    expect(summary.average).toBe(4);
  });

  it('ignores a fractional rating — there are no half stars', () => {
    expect(summariseRatings([{ rating: 4.5 }]).count).toBe(0);
  });
});

describe('isValidRating', () => {
  it('accepts one through five', () => {
    for (const rating of [1, 2, 3, 4, 5]) expect(isValidRating(rating)).toBe(true);
  });

  it('rejects anything else', () => {
    for (const rating of [0, 6, -1, 2.5, NaN, '4', null, undefined]) {
      expect(isValidRating(rating)).toBe(false);
    }
  });
});

describe('sharePercent', () => {
  it('works out the bar width', () => {
    expect(sharePercent(1, 4)).toBe(25);
    expect(sharePercent(3, 3)).toBe(100);
  });

  it('does not divide by zero', () => {
    expect(sharePercent(0, 0)).toBe(0);
  });
});

describe('reviewSubmissionSchema', () => {
  const good = {
    productId: 'abc123',
    authorName: 'Faisal',
    rating: '5',
    title: 'Cuts grease fast',
    body: 'Used it for a month on a very greasy kitchen and it still smells of lemon.',
  };

  it('accepts a real submission and coerces the rating to a number', () => {
    const parsed = reviewSubmissionSchema.safeParse(good);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.rating).toBe(5);
  });

  it('requires a name', () => {
    const parsed = reviewSubmissionSchema.safeParse({ ...good, authorName: 'X' });
    expect(parsed.success).toBe(false);
  });

  it('asks for more than a couple of words', () => {
    const parsed = reviewSubmissionSchema.safeParse({ ...good, body: 'Good' });
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(parsed.error.issues[0].message).toMatch(/a little more/);
  });

  it('rejects a rating outside the stars', () => {
    expect(reviewSubmissionSchema.safeParse({ ...good, rating: '0' }).success).toBe(false);
    expect(reviewSubmissionSchema.safeParse({ ...good, rating: '6' }).success).toBe(false);
  });

  it('treats the headline as optional', () => {
    expect(reviewSubmissionSchema.safeParse({ ...good, title: '' }).success).toBe(true);
  });
});

describe('looksLikeSpam', () => {
  it('flags a body that is mostly links', () => {
    expect(looksLikeSpam('Buy at http://a.example and http://b.example now')).toBe(true);
  });

  it('leaves a genuine review that happens to mention a site alone', () => {
    expect(
      looksLikeSpam('Bought it after reading about the record on www.bbtcglobal.com — really good.'),
    ).toBe(false);
  });

  it('leaves ordinary prose alone', () => {
    expect(looksLikeSpam('Smells lovely and lasts a long time.')).toBe(false);
  });
});

describe('formatReviewDate', () => {
  // `en-IN` abbreviates September as "Sept", and every other date in this app
  // (orders, content, policies) already renders that way. Matching the house
  // output matters more than matching the four-letter form in the style note.
  it('writes the Indian short format', () => {
    expect(formatReviewDate(new Date('2026-09-17T10:00:00Z'))).toBe('17 Sept 2026');
    expect(formatReviewDate(new Date('2026-01-05T10:00:00Z'))).toBe('5 Jan 2026');
  });

  // The reason this helper exists rather than another inline `toLocaleDateString`:
  // a review left late in the evening IST is written just before midnight UTC,
  // and would otherwise be dated to the previous day for the person who left it.
  it('dates a review by Indian time, not the server’s', () => {
    expect(formatReviewDate(new Date('2026-09-17T19:30:00Z'))).toBe('18 Sept 2026');
  });
});
