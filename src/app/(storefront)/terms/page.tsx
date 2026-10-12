import PolicyView, { policyMetadata } from '@/components/PolicyView';

export const revalidate = 60;

export function generateMetadata() {
  return policyMetadata('terms');
}

export default function TermsPage() {
  return <PolicyView slug="terms" />;
}
