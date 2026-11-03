import Link from "next/link";
import type { Metadata } from "next";
import { LegalPage, Section } from "@/components/legal/legal-page";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = { title: "Terms of use", description: "The agreement between you and Loamy when you use the app, become a member or shop with us." };

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of use"
      intro={
        <p>
          These terms are the agreement between you and Loamy (“we”, “us”) when you use the Loamy app, become a member or buy from the
          Loamy shop. We’ve kept them as plain as we can. By creating an account you agree to them, so please read them, along with our{" "}
          <Link href="/privacy" className="underline">privacy notice</Link>.
        </p>
      }
    >
      <Section n={1} title="Who we are">
        <p>
          Loamy is a home gardening service based in Lagos, Nigeria. You can reach us by email at{" "}
          <a href={`mailto:${LEGAL.email}`} className="underline">{LEGAL.email}</a> or on Instagram at{" "}
          <a href={`https://www.instagram.com/${LEGAL.instagram}/`} target="_blank" rel="noopener noreferrer" className="underline">@{LEGAL.instagram}</a>.
        </p>
      </Section>

      <Section n={2} title="Your account">
        <ul>
          <li>You need to be 18 or older to create an account, become a member or place an order.</li>
          <li>Give us accurate details, and keep them up to date, especially your phone number and delivery address.</li>
          <li>Keep your password to yourself. You’re responsible for what happens in your account unless someone got in through no fault of yours.</li>
          <li>An account is free. Creating one doesn’t start a membership or charge you anything.</li>
        </ul>
      </Section>

      <Section n={3} title="Membership">
        <ul>
          <li>Membership unlocks growing plans, My Garden, care schedules, Ask Loamy and progress tracking. We show you the price and what’s included before you pay.</li>
          <li>
            <strong>It renews automatically until you cancel.</strong> We charge the same card at the end of each quarter or year, at the price you signed up for.
            If the price ever changes, we’ll tell you at least 30 days before your next renewal, and you can cancel before it applies.
          </li>
          <li>
            Cancel any time from <Link href="/profile" className="underline">Profile</Link>. You keep access until the end of the period you’ve paid for, and
            you won’t be charged again.
          </li>
          <li>
            We don’t refund part-used periods, except where the law requires it or we made a mistake (for example, charging you twice). If a renewal fails, you
            keep access for a few days while you update your card.
          </li>
          <li>If your membership ends, your garden and notes are kept, so you can pick up where you left off if you come back.</li>
        </ul>
      </Section>

      <Section n={4} title="Buying from the Loamy shop">
        <ul>
          <li>To order, you need an account, a phone number and a Lagos delivery address. Everything we sell is supplied by Loamy.</li>
          <li>
            You pay for the items at checkout. We then call you to agree a delivery time and the delivery fee, which you pay as agreed on the call. If we can’t
            reach you or can’t deliver to your area, we’ll cancel the order and refund you in full.
          </li>
          <li>We hold your items for 30 minutes while you pay. Prices include any tax that applies.</li>
          <li>
            <strong>Damaged or wrong items:</strong> tell us within {LEGAL.damagedReportHours} hours of delivery, with a photo, and we’ll replace the item or
            refund you.
          </li>
          <li>
            <strong>Changed your mind:</strong> you can return unused tools, pots and other non-living items within {LEGAL.changeOfMindDays} days of delivery for
            a refund of the item price. Live plants, seedlings and opened soil or seed can’t be returned for a change of mind, because they don’t keep.
          </li>
          <li>Refunds go back to the card or account you paid with, usually within 10 working days.</li>
        </ul>
        <p>Nothing in these terms takes away your rights under the Federal Competition and Consumer Protection Act or other Nigerian consumer law.</p>
      </Section>

      <Section n={5} title="Promo codes">
        <p>
          Promo codes have no cash value, can’t be swapped for money and may have limits (such as one use per customer, a minimum spend or an end date) shown
          when you use them. We may withdraw a code that’s being misused.
        </p>
      </Section>

      <Section n={6} title="Plant guidance and Ask Loamy">
        <ul>
          <li>
            Our plant guides and care tasks are reviewed by a plant expert, but plants are living things. Results depend on weather, light, soil, pests and care,
            so we can’t promise a particular harvest.
          </li>
          <li>
            Ask Loamy answers with the help of artificial intelligence. Answers can be wrong or incomplete, so use your judgement, and ask the Loamy team if
            something doesn’t look right.
          </li>
          <li>
            <strong>Loamy is not medical advice.</strong> Where we mention how people use a plant, that’s general information. Don’t use plants to treat a
            health condition without asking a doctor, and keep plants you’re unsure about away from children and pets.
          </li>
        </ul>
      </Section>

      <Section n={7} title="Using Loamy fairly">
        <p>Please don’t misuse Loamy. In particular, don’t:</p>
        <ul>
          <li>break the law, or use Loamy to harm, harass or mislead anyone;</li>
          <li>try to get into accounts or parts of Loamy that aren’t yours, or interfere with how it works;</li>
          <li>copy our content or data in bulk, or use automated tools to do so;</li>
          <li>upload photos or text that aren’t yours to share, or that are offensive.</li>
        </ul>
        <p>We may suspend or close an account that does these things. If we do, we’ll tell you why, unless the law stops us.</p>
      </Section>

      <Section n={8} title="Your photos and notes; our content">
        <p>
          Photos and notes you add to your garden stay yours. You let us store them and show them to you so the app works. We don’t share them or use them
          in marketing without asking you first.
        </p>
        <p>
          The Loamy name, logo, plant guides, photos, care routines and app design belong to us or the people who license them to us. You can use them for
          your own gardening, but not copy or sell them.
        </p>
      </Section>

      <Section n={9} title="Our responsibility to you">
        <ul>
          <li>We’ll provide Loamy with reasonable care and skill. We’re responsible for loss you suffer that was a foreseeable result of us breaking these terms or being careless.</li>
          <li>
            We’re not responsible for loss that wasn’t foreseeable, for business losses, or for things outside our reasonable control (such as power or network
            outages, severe weather or strikes).
          </li>
          <li>Apart from where the law doesn’t allow a limit, our total responsibility to you is limited to what you paid us in the 12 months before the problem.</li>
          <li>Nothing here limits our responsibility for death or injury caused by our negligence, for fraud, or for anything else the law doesn’t let us limit.</li>
        </ul>
      </Section>

      <Section n={10} title="Ending your account">
        <p>
          You can stop using Loamy at any time, and ask us to delete your account from{" "}
          <Link href="/profile/privacy" className="underline">Privacy and data</Link> in your profile. We can close accounts as set out in section 7, and
          we’ll give you notice and refund any unused membership if we ever close Loamy.
        </p>
      </Section>

      <Section n={11} title="Changes and the law">
        <ul>
          <li>We may update these terms as Loamy grows. If a change matters, we’ll tell you in the app before it takes effect.</li>
          <li>These terms are governed by the laws of the Federal Republic of Nigeria. If we can’t sort out a problem together, the courts of Lagos State can decide it.</li>
          <li>
            Questions or complaints: <a href={`mailto:${LEGAL.email}`} className="underline">{LEGAL.email}</a>. We aim to reply within 2 working days.
          </li>
        </ul>
      </Section>
    </LegalPage>
  );
}
