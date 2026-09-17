import NotFoundView from '@/components/NotFoundView';

export default function CategoryNotFound() {
  return (
    <NotFoundView
      heading="We couldn't find that category"
      body="The link may be out of date. The whole catalogue is still browsable, and search will find anything by name."
    />
  );
}
