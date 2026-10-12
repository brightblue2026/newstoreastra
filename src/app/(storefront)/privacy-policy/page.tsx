import PolicyView, { policyMetadata } from '@/components/PolicyView';

export const revalidate = 60;

export function generateMetadata() {
  return policyMetadata('privacy');
}

export default function PrivacyPolicyPage() {
  return <PolicyView slug="privacy" />;
}
