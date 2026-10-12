import { permanentRedirect } from 'next/navigation';

/** "About" is the company page at /story; this address exists so a link to /about lands there. */
export default function AboutPage() {
  permanentRedirect('/story');
}
