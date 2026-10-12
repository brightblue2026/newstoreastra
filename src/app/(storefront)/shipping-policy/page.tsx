import PolicyView, { policyMetadata } from '@/components/PolicyView';

export const revalidate = 60;

export function generateMetadata() {
  return policyMetadata('shipping');
}

export default function ShippingPolicyPage() {
  return <PolicyView slug="shipping" />;
}
