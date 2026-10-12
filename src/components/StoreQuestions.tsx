import Link from 'next/link';
import { CONTACT } from '@/lib/contact';
import { jsonLdString } from '@/lib/json-ld';

const questions = [
  { question: 'What can I shop at Bright Blue?', answer: 'Our brands cover dish care, fabric care, home care, personal care, car care, food, tea and fragrance. The shop shows the products currently published for online sale.' },
  { question: 'How do I check delivery and cash on delivery?', answer: 'Enter your delivery pincode on a product page or at checkout. Available delivery options, shipping charges and cash-on-delivery eligibility are shown before you place your order.' },
  { question: 'How can I track an order?', answer: 'Open Track your order and enter your order number and the full mobile number used at checkout. You can also use the private confirmation link provided after ordering.' },
  { question: 'Can I enquire about wholesale supply?', answer: `Yes. Contact Bright Blue on ${CONTACT.tollFreeDisplay} to discuss bulk orders and distributor enquiries.` },
] as const;

export default function StoreQuestions() {
  return (
    <section aria-labelledby="questions-title" className="mx-auto grid max-w-(--container-page) gap-12 px-6 py-16 lg:grid-cols-[1fr_2fr] lg:py-24">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString({
        '@context': 'https://schema.org', '@type': 'FAQPage',
        mainEntity: questions.map(({ question, answer }) => ({ '@type': 'Question', name: question, acceptedAnswer: { '@type': 'Answer', text: answer } })),
      }) }} />
      <div><p className="type-caption text-ink-soft">A little help</p><h2 id="questions-title" className="mt-4 type-display-sm">Before you shop.</h2><Link href="/order" className="mt-6 inline-flex min-h-11 items-center underline underline-offset-4">Track your order ↗</Link></div>
      <div>{questions.map(({ question, answer }) => (
        <details key={question} className="group border-b border-line py-6 first:border-t">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-6 type-subhead">{question}<span aria-hidden="true" className="group-open:rotate-45">+</span></summary>
          <p className="mt-4 max-w-2xl type-body text-ink-soft">{answer}</p>
        </details>
      ))}</div>
    </section>
  );
}
