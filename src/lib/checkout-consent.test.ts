import { expect, it } from 'vitest';
import { checkoutSubmissionSchema } from './cart-schema';
const valid = { lines: [{ kind: 'VARIANT', id: 'fixture', quantity: 1 }], phone: '9847012345', paymentMethod: 'COD', shipping: { fullName: 'Test Buyer', phone: '9847012345', line1: '12 Test Road', city: 'Kochi', state: 'Kerala', pincode: '682001' } };
it.each([undefined, false, 'true'])('refuses checkout without explicit boolean agreement: %s', (acceptedTerms) => {
  expect(checkoutSubmissionSchema.safeParse({ ...valid, acceptedTerms }).success).toBe(false);
});
it('accepts explicit agreement alongside valid checkout data', () => {
  expect(checkoutSubmissionSchema.safeParse({ ...valid, acceptedTerms: true }).success).toBe(true);
});
