import { PublicPageShell } from "@/app/ui/public-page-shell";
import { PUBLIC_PAGE_IMAGE_SLOTS } from "@/app/ui/public-image-slots";
import styles from "@/app/public-pages.module.css";

export default function ContactPage() {
  return (
    <PublicPageShell
      activePage="contact"
      eyebrow="Season 1 · Contact"
      title="Get In Touch"
      description="Reach out for league participation, sponsorship, and community partnership inquiries."
      heroImageUrl={PUBLIC_PAGE_IMAGE_SLOTS.contactHero}
    >
      <div className={styles.cardGrid}>
        <article className={styles.card}>
          <h3>General Inquiries</h3>
          <p>contact@pubofhomies.gg</p>
        </article>
        <article className={styles.card}>
          <h3>League Operations</h3>
          <p>ops@pubofhomies.gg</p>
        </article>
        <article className={styles.card}>
          <h3>Partnerships</h3>
          <p>partners@pubofhomies.gg</p>
        </article>
      </div>
      <div className={styles.panel}>
        <h2>Community Channels</h2>
        <p>
          Join the official channels for announcement drops, registration windows, and match-day
          updates. If you already registered, include your team name and event code in your message.
        </p>
      </div>
    </PublicPageShell>
  );
}
