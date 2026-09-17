import NotFoundView from '@/components/NotFoundView';

/**
 * An unwritten or unpublished policy has no page. Until BBTC supplies the
 * text (§14 Q17/Q18) every policy address lands here — now with a 404 rather
 * than a 200, so it is never indexed as a real page.
 */
export default function PolicyNotFound() {
  return (
    <NotFoundView
      heading="That policy isn't published yet"
      body="This page will carry Bright Blue's own shipping, returns, privacy and terms statements once they are published. In the meantime the catalogue is still here."
    />
  );
}
