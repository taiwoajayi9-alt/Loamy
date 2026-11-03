import Link from "next/link";
import type { Metadata } from "next";
import { LegalPage, Section } from "@/components/legal/legal-page";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = { title: "Privacy notice", description: "What Loamy collects, why, who we share it with and the choices you have." };

const COOKIES: [string, string, string][] = [
  ["Sign-in (sb-…)", "Keeps you signed in.", "Until you sign out"],
  ["loamy_plans", "Remembers plans you made before signing up, so you can keep them.", "30 days"],
  ["loamy_cart", "Remembers your shop basket before you sign in.", "30 days"],
  ["loamy_analytics", "Remembers your choice about anonymous visit counts.", "1 year"],
  ["loamy_aid", "A random id for anonymous visit counts. Only set if you say yes.", "1 year"],
];

export default function PrivacyNoticePage() {
  return (
    <LegalPage
      title="Privacy notice"
      intro={
        <p>
          This notice explains what personal data Loamy collects, why, who we share it with and the choices you have. It’s written to meet the Nigeria Data
          Protection Act 2023. The short version: we collect what we need to help you grow and to deliver your orders, we never sell your data, and we don’t
          show ads.
        </p>
      }
    >
      <Section n={1} title="Who is responsible for your data">
        <p>
          Loamy, a subsidiary of {LEGAL.parentCompany} based in Lagos, Nigeria, is the data controller. For anything about your data, email{" "}
          <a href={`mailto:${LEGAL.privacyEmail}`} className="underline">{LEGAL.privacyEmail}</a>. You can also message us on Instagram at{" "}
          <a href={`https://www.instagram.com/${LEGAL.instagram}/`} target="_blank" rel="noopener noreferrer" className="underline">@{LEGAL.instagram}</a>, but
          please don’t share personal details there.
        </p>
      </Section>

      <Section n={2} title="What we collect">
        <ul>
          <li><strong>Account:</strong> your email, first name, and a password (stored scrambled by our sign-in provider; we can’t see it).</li>
          <li><strong>Your growing space:</strong> your answers about space, sunlight, water and experience, and, if you give it, your area of Lagos (never your exact location).</li>
          <li><strong>Your garden:</strong> the plants you add, care tasks you tick off, notes, milestones, harvests and photos you upload.</li>
          <li><strong>Ask Loamy:</strong> the questions you ask, the answers, and any ratings or requests for help from our team.</li>
          <li><strong>Orders:</strong> your phone number, delivery address, what you bought and delivery notes.</li>
          <li>
            <strong>Payments:</strong> a payment reference, amount and status from Paystack. Paystack handles your card; Loamy never sees or stores your card
            number.
          </li>
          <li><strong>Anonymous visit counts (only if you say yes):</strong> which pages and buttons are used. This never includes what you type to Ask Loamy.</li>
          <li><strong>Technical:</strong> basic logs (such as time and error messages) to keep Loamy secure and working.</li>
        </ul>
      </Section>

      <Section n={3} title="Why we use it">
        <ul>
          <li><strong>To provide Loamy to you</strong> (our contract with you): your account, plans, garden, care tasks, Ask Loamy, membership and orders, including calling you to arrange delivery.</li>
          <li><strong>With your consent:</strong> anonymous visit counts. You can change your mind any time in <Link href="/profile/privacy" className="underline">Privacy and data</Link>.</li>
          <li><strong>For our legitimate interests:</strong> keeping Loamy secure, preventing fraud, fixing problems and improving our plant guides, in ways you’d reasonably expect.</li>
          <li><strong>Because the law requires it:</strong> keeping order and payment records for tax and accounting.</li>
        </ul>
        <p>We don’t sell your data, use it for advertising, or make decisions about you by automated means that have legal or similarly significant effects.</p>
      </Section>

      <Section n={4} title="Who we share it with">
        <p>Only the service providers who help us run Loamy, under contracts that require them to protect it:</p>
        <ul>
          <li><strong>Supabase</strong>: our database, sign-in and photo storage (servers in Frankfurt, Germany).</li>
          <li><strong>Paystack</strong>: membership and shop payments (Nigeria).</li>
          <li>
            <strong>DeepSeek</strong>: the AI service that drafts Ask Loamy answers (servers in China). We send your question and the relevant plant details,
            not your name, email or phone number.
          </li>
          <li><strong>Namecheap</strong>: hosting for the Loamy website and app (United States).</li>
          <li><strong>Our delivery partners</strong>: your name, phone number and address, only to deliver your order.</li>
        </ul>
        <p>
          We may also share data if the law requires it, or to protect someone’s safety. Where your data goes outside Nigeria, we rely on the safeguards the
          Nigeria Data Protection Act allows, such as contractual protections with each provider.
        </p>
      </Section>

      <Section n={5} title="How long we keep it">
        <ul>
          <li>Your account, garden, plans and Ask Loamy history: while your account is open. When you delete your account, we delete them.</li>
          <li>Order and payment records: 6 years, as tax law requires. If you delete your account, we remove your name, phone and address from them.</li>
          <li>Anonymous visit counts: up to 24 months.</li>
          <li>Security logs: up to 12 months.</li>
        </ul>
      </Section>

      <Section n={6} title="Your rights">
        <p>Under the Nigeria Data Protection Act you can:</p>
        <ul>
          <li><strong>See your data</strong> and take a copy: use <Link href="/profile/privacy" className="underline">Download my data</Link>.</li>
          <li><strong>Correct it</strong> if it’s wrong.</li>
          <li><strong>Delete it</strong>: use <Link href="/profile/privacy" className="underline">Delete my account</Link>.</li>
          <li><strong>Withdraw consent</strong>, for example to anonymous visit counts, at any time.</li>
          <li><strong>Object</strong> to how we use your data, or ask us to limit it.</li>
          <li><strong>Move it</strong> to another service (your download is a standard JSON file).</li>
        </ul>
        <p>
          For anything else, email <a href={`mailto:${LEGAL.privacyEmail}`} className="underline">{LEGAL.privacyEmail}</a>. We’ll reply within 30 days. If
          you’re not happy with our answer, you can complain to the Nigeria Data Protection Commission (ndpc.gov.ng).
        </p>
      </Section>

      <Section n={7} title="Cookies">
        <p>We use a few small cookies. Only the last one depends on your choice.</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-left text-small">
            <thead>
              <tr className="border-b border-line">
                <th className="py-2 pr-3 font-semibold">Cookie</th>
                <th className="py-2 pr-3 font-semibold">What it’s for</th>
                <th className="py-2 font-semibold">How long</th>
              </tr>
            </thead>
            <tbody>
              {COOKIES.map(([name, why, len]) => (
                <tr key={name} className="border-b border-line align-top">
                  <td className="py-2 pr-3 font-mono text-xs">{name}</td>
                  <td className="py-2 pr-3">{why}</td>
                  <td className="py-2">{len}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section n={8} title="Keeping your data safe">
        <p>
          Data is encrypted in transit and stored with providers that encrypt it at rest. Garden photos are private and only shown to you through links that
          expire. Only Loamy staff who need it can see your data, and admin actions are logged. If a breach ever puts you at risk, we’ll tell you and the
          Commission as the law requires.
        </p>
      </Section>

      <Section n={9} title="Children">
        <p>Loamy is for adults. You need to be 18 or older to create an account, and we don’t knowingly collect data from children.</p>
      </Section>

      <Section n={10} title="Changes to this notice">
        <p>If we change how we use your data in a way that matters, we’ll tell you in the app before the change applies. The date at the top shows the latest version.</p>
      </Section>
    </LegalPage>
  );
}
