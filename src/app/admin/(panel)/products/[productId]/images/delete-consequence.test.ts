import { describe, expect, it } from 'vitest';
import { deleteQuestion, deleteWarning, picturesLeftAfter, rowsOfSamePicture } from './delete-consequence';

// Two pictures: "a" on the product and on two variants, "b" on one variant.
const rows = [
  { id: 'r1', publicId: 'a' },
  { id: 'r2', publicId: 'a' },
  { id: 'r3', publicId: 'a' },
  { id: 'r4', publicId: 'b' },
];

describe('picturesLeftAfter', () => {
  it('counts pictures, not rows', () => {
    expect(picturesLeftAfter(rows, [])).toBe(2);
    expect(picturesLeftAfter(rows, ['r1', 'r2'])).toBe(2);
    expect(picturesLeftAfter(rows, ['r4'])).toBe(1);
    expect(picturesLeftAfter(rows, ['r1', 'r2', 'r3', 'r4'])).toBe(0);
  });
});

describe('rowsOfSamePicture', () => {
  it('finds every use of the picture', () => {
    expect(rowsOfSamePicture(rows, 'r2')).toEqual(['r1', 'r2', 'r3']);
    expect(rowsOfSamePicture(rows, 'missing')).toEqual([]);
  });
});

describe('deleteWarning', () => {
  it('says nothing while other photos remain', () => {
    expect(deleteWarning({ productIsActive: true, picturesLeft: 1 })).toBeNull();
  });

  it('warns about a published product left with no photo', () => {
    expect(deleteWarning({ productIsActive: true, picturesLeft: 0 })).toMatch(/on the store/);
  });

  it('warns that a draft cannot be published without one', () => {
    expect(deleteWarning({ productIsActive: false, picturesLeft: 0 })).toMatch(/cannot be published/);
  });
});

describe('deleteQuestion', () => {
  it('names a plain delete', () => {
    expect(deleteQuestion({ count: 1, scope: 'this', usedByOthers: 0 })).toBe(
      'Delete this photo? This cannot be undone.',
    );
  });

  it('says a shared photo stays where else it is used', () => {
    expect(deleteQuestion({ count: 1, scope: 'this', usedByOthers: 2 })).toMatch(/2 other places using it keep it/);
    expect(deleteQuestion({ count: 1, scope: 'this', usedByOthers: 1 })).toMatch(/one other place/);
  });

  it('counts every place for delete everywhere', () => {
    expect(deleteQuestion({ count: 1, scope: 'everywhere', usedByOthers: 3 })).toMatch(/\(4 places\)/);
  });

  it('counts a selection', () => {
    expect(deleteQuestion({ count: 3, scope: 'this', usedByOthers: 0 })).toBe(
      'Delete these 3 photos? This cannot be undone.',
    );
  });
});
