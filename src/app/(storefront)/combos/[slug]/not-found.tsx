import NotFoundView from '@/components/NotFoundView';

export default function ComboNotFound() {
  return (
    <NotFoundView
      heading="We couldn't find that pack"
      body="This bundle may have ended or been renamed. The individual products are still available in the catalogue."
    />
  );
}
