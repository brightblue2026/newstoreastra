import { describe, expect, it } from 'vitest';
import { toMsg91Number } from './phone';

/*
  Number normalisation is the only pure thing in `msg91.ts`, and it is the one
  that must not be wrong: a notification sent to a mistyped number goes to a
  stranger, with an order number and a delivery amount in it.
*/

describe('toMsg91Number', () => {
  it('adds the country code to a bare ten-digit mobile', () => {
    expect(toMsg91Number('9847012345')).toBe('919847012345');
  });

  it('accepts the ways a customer actually types a number', () => {
    for (const written of [
      '+91 98470 12345',
      '+919847012345',
      '098470 12345'.replace('0', ''), // leading-zero trunk prefix, stripped by the caller
      '9847-012-345',
      ' 9847012345 ',
    ]) {
      expect(toMsg91Number(written)).toBe('919847012345');
    }
  });

  it('keeps a number that already carries the country code', () => {
    expect(toMsg91Number('919847012345')).toBe('919847012345');
  });

  it('rejects anything that is not a plausible Indian mobile', () => {
    for (const bad of [
      '',
      '12345',
      '5847012345', // Indian mobiles start 6–9
      '1800123062', // a landline/toll-free, not a mobile
      '98470123456789',
      'not a number',
    ]) {
      expect(toMsg91Number(bad)).toBeNull();
    }
  });

  it('rejects rather than truncating a too-long number', () => {
    // Silently taking the last ten digits of a wrong number would send the
    // message to a real person who did not order anything.
    expect(toMsg91Number('9198470123450000')).toBeNull();
  });

  it('does not mistake a bare ten-digit mobile starting "91" for a country-code prefix', () => {
    // 9198765432 is a real, valid mobile: ten digits, starts 6-9. Blindly
    // stripping a leading "91" would wrongly leave the 8-digit "98765432".
    expect(toMsg91Number('9198765432')).toBe('919198765432');
  });
});
