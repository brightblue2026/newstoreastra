import { describe, expect, it } from 'vitest';
import {
  ALLOWED_IMAGE_MIME_TYPES,
  IMAGE_FOLDER,
  MAX_UPLOAD_BYTES,
  buildImagePath,
  extensionForMimeType,
  isOwnedPath,
  isUploadPathFor,
} from './storage-shared';

/*
  These four are small, but they are the boundary the storage layer trusts.

  `isOwnedPath` is the only thing standing between a caller-supplied string and
  a signed upload URL or a delete — `createSignedUpload`, `statObject`,
  `removeObject` and `saveProductImageAction`'s Zod schema all gate on it. A
  hole here is a hole in every one of them at once, which is why the traversal
  cases below are spelled out rather than assumed.
*/

describe('isOwnedPath', () => {
  it('accepts a path inside the image folder', () => {
    expect(isOwnedPath(`${IMAGE_FOLDER}/abc123/def456.png`)).toBe(true);
  });

  it('refuses anything outside the image folder', () => {
    expect(isOwnedPath('avatars/me.png')).toBe(false);
    expect(isOwnedPath('other/products/me.png')).toBe(false);
    expect(isOwnedPath('')).toBe(false);
  });

  it('refuses a folder whose name merely starts with the right letters', () => {
    // "products-backup/..." starts with "products" but is a different folder;
    // the trailing slash in the check is what makes this a miss.
    expect(isOwnedPath(`${IMAGE_FOLDER}-backup/x.png`)).toBe(false);
  });

  it('refuses traversal, wherever the dots appear', () => {
    expect(isOwnedPath(`${IMAGE_FOLDER}/../secrets/key.png`)).toBe(false);
    expect(isOwnedPath(`${IMAGE_FOLDER}/a/../../b.png`)).toBe(false);
    expect(isOwnedPath(`${IMAGE_FOLDER}/..`)).toBe(false);
  });

  it('refuses a leading slash, which would read as the bucket root', () => {
    expect(isOwnedPath(`/${IMAGE_FOLDER}/x.png`)).toBe(false);
  });
});

describe('buildImagePath', () => {
  it('puts the product id in the path so an orphan can be traced back', () => {
    expect(buildImagePath('prod_1', 'png', 'rand')).toBe(`${IMAGE_FOLDER}/prod_1/rand.png`);
  });

  it('always produces a path the guard accepts', () => {
    expect(isOwnedPath(buildImagePath('prod_1', 'jpg', 'rand'))).toBe(true);
  });

  it('lowercases the extension', () => {
    expect(buildImagePath('p', 'PNG', 'r')).toBe(`${IMAGE_FOLDER}/p/r.png`);
  });

  it('strips anything that is not a letter or digit from the extension', () => {
    // The extension reaches here from `extensionForMimeType`, so this is a
    // second line rather than the first — but a path separator or a dot
    // smuggled through here would escape the per-product folder.
    expect(buildImagePath('p', '../x', 'r')).toBe(`${IMAGE_FOLDER}/p/r.x`);
    expect(buildImagePath('p', 'pn/g', 'r')).toBe(`${IMAGE_FOLDER}/p/r.png`);
  });

  it('falls back to png when nothing usable is left', () => {
    expect(buildImagePath('p', '...', 'r')).toBe(`${IMAGE_FOLDER}/p/r.png`);
    expect(buildImagePath('p', '', 'r')).toBe(`${IMAGE_FOLDER}/p/r.png`);
  });

  it('caps a long extension rather than carrying it through', () => {
    expect(buildImagePath('p', 'abcdefghij', 'r')).toBe(`${IMAGE_FOLDER}/p/r.abcde`);
  });
});

describe('isUploadPathFor', () => {
  const uuid = '3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0b';

  it('accepts exactly what buildImagePath signs for that product', () => {
    expect(isUploadPathFor(buildImagePath('prod_1', 'jpg', uuid), 'prod_1')).toBe(true);
  });

  it("refuses another product's object, even though it is owned", () => {
    const other = buildImagePath('prod_2', 'jpg', uuid);
    expect(isOwnedPath(other)).toBe(true);
    expect(isUploadPathFor(other, 'prod_1')).toBe(false);
  });

  it('refuses a product id that is a prefix of another', () => {
    expect(isUploadPathFor(buildImagePath('prod_10', 'jpg', uuid), 'prod_1')).toBe(false);
  });

  it('refuses nested folders, traversal and non-UUID names', () => {
    expect(isUploadPathFor(`${IMAGE_FOLDER}/prod_1/x/${uuid}.jpg`, 'prod_1')).toBe(false);
    expect(isUploadPathFor(`${IMAGE_FOLDER}/prod_1/../prod_2/${uuid}.jpg`, 'prod_1')).toBe(false);
    expect(isUploadPathFor(`${IMAGE_FOLDER}/prod_1/photo.jpg`, 'prod_1')).toBe(false);
    expect(isUploadPathFor(`${IMAGE_FOLDER}/prod_1/${uuid}.jpg`, '')).toBe(false);
  });
});

describe('extensionForMimeType', () => {
  it('maps every type the uploader accepts', () => {
    for (const mimeType of ALLOWED_IMAGE_MIME_TYPES) {
      expect(extensionForMimeType(mimeType)).not.toBeNull();
    }
  });

  it('gives jpeg the conventional jpg extension', () => {
    expect(extensionForMimeType('image/jpeg')).toBe('jpg');
  });

  it('ignores case, since a browser may send any', () => {
    expect(extensionForMimeType('IMAGE/PNG')).toBe('png');
  });

  it('refuses types that are images but not allowed here', () => {
    // SVG is the one that matters: it is an image, and it can carry script.
    expect(extensionForMimeType('image/svg+xml')).toBeNull();
    expect(extensionForMimeType('image/gif')).toBeNull();
  });

  it('refuses non-images outright', () => {
    expect(extensionForMimeType('application/pdf')).toBeNull();
    expect(extensionForMimeType('')).toBeNull();
  });
});

describe('the limits the bucket and the app share', () => {
  // `scripts/setup-storage.ts` configures the bucket from these same
  // constants. If either drifts, the bucket and the app disagree about what a
  // valid photo is — which is the bug this file exists to make loud.
  it('caps an upload at 20MB, in bytes', () => {
    expect(MAX_UPLOAD_BYTES).toBe(20 * 1024 * 1024);
  });

  it('does not allow SVG anywhere in the accepted types', () => {
    expect(ALLOWED_IMAGE_MIME_TYPES).not.toContain('image/svg+xml');
  });
});
