import { PublicPageShell } from "@/app/ui/public-page-shell";
import { PUBLIC_PAGE_IMAGE_SLOTS } from "@/app/ui/public-image-slots";
import styles from "@/app/public-pages.module.css";

export default function AboutPage() {
  return (
    <PublicPageShell
      activePage="about"
      eyebrow="Season 1 · About Us"
      title="About Pub of Homies League"
      description="A competitive community where amateur teams can train, compete, and grow into champions."
      heroImageUrl={PUBLIC_PAGE_IMAGE_SLOTS.aboutHero}
    >
      <div className={styles.panel}>
        <h2>Our Mission</h2>
        <p>
          We run organized competitive experiences for rising players and teams. The league is built
          around fair competition, consistent match operations, and clear progression from scrims to
          finals.
        </p>
      </div>
      <div className={styles.cardGrid}>
        <article className={styles.card}>
          <h3>Competitive Integrity</h3>
          <p>Structured formats, transparent standings, and reliable scheduling.</p>
        </article>
        <article className={styles.card}>
          <h3>Player Development</h3>
          <p>Regular competition loops that reward teamwork, adaptation, and discipline.</p>
        </article>
        <article className={styles.card}>
          <h3>Community First</h3>
          <p>A welcoming environment for upcoming talent to build their legacy in Season 1.</p>
        </article>
      </div>
    </PublicPageShell>
  );
}
