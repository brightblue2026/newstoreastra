import PolicyView, { policyMetadata } from '@/components/PolicyView';

export const revalidate = 60;

export function generateMetadata() {
  return policyMetadata('returns');
}

export default function RefundPolicyPage() {
  return <PolicyView slug="returns" />;
}
