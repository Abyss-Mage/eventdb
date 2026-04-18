import type { CSSProperties } from "react";
import Link from "next/link";

import styles from "./page.module.css";

const HOMEPAGE_IMAGE_SLOTS = {
  heroOne: "",
  heroTwo: "",
  heroThree: "",
  tourOne: "",
  tourTwo: "",
  tourThree: "",
  playerOne: "",
  playerTwo: "",
  playerThree: "",
} as const;

const TOUR_CARDS = [
  {
    title: "WEEKLY SCRIMS: THE CRUCIBLE OF PRACTICE",
    image: HOMEPAGE_IMAGE_SLOTS.tourOne,
  },
  {
    title: "QUALIFIERS: THE GAUNTLET OF CHAMPIONS",
    image: HOMEPAGE_IMAGE_SLOTS.tourTwo,
  },
  {
    title: "GRAND FINALS: THE APEX OF BATTLE",
    image: HOMEPAGE_IMAGE_SLOTS.tourThree,
  },
];

const FAME_PLAYERS = [
  {
    rank: "RANK 300",
    name: "PH_CLUTCHMASTER",
    tag: "UNSTOPPABLE FORCE",
    image: HOMEPAGE_IMAGE_SLOTS.playerOne,
  },
  {
    rank: "RANK 350",
    name: "VOID WALKERS",
    tag: "STRATEGIC MASTERMINDS",
    image: HOMEPAGE_IMAGE_SLOTS.playerTwo,
  },
  {
    rank: "RANK 300",
    name: "NEON SYNDICATE",
    tag: "STRATEGIC MASTERMINDS",
    image: HOMEPAGE_IMAGE_SLOTS.playerThree,
  },
];

function imageStyle(url: string): CSSProperties | undefined {
  const normalized = url.trim();
  if (!normalized) {
    return undefined;
  }

  return {
    backgroundImage: `url("${normalized}")`,
  };
}

export default function Home() {
  return (
    <main className={styles.page}>
      <nav className={styles.nav}>
        <Link className={styles.brand} href="/">
          PUB OF HOMIES
        </Link>
        <div className={styles.navLinks}>
          <Link href="/">HOME</Link>
          <Link href="/about">ABOUT</Link>
          <Link href="/event">EVENTS</Link>
          <Link href="/contact">CONTACT</Link>
        </div>
        <Link className={styles.btnOutline} href="/register">
          REGISTER NOW
        </Link>
      </nav>

      <section className={styles.hero}>
        <div className={styles.heroLeft}>
          <h1>
            PUB OF
            <br />
            HOMIES
            <br />
            LEAGUE
          </h1>
          <p className={styles.heroSub}>
            THE SAGA BEGINS.
            <br />
            SEASON 1.
          </p>
          <Link className={styles.btnMain} href="/register">
            REGISTER NOW
          </Link>
        </div>

        <div className={styles.heroRight}>
          <div className={styles.imgGrid}>
            <div className={styles.imageCard} style={imageStyle(HOMEPAGE_IMAGE_SLOTS.heroOne)} />
            <div className={styles.imageCard} style={imageStyle(HOMEPAGE_IMAGE_SLOTS.heroTwo)} />
            <div className={styles.imageCard} style={imageStyle(HOMEPAGE_IMAGE_SLOTS.heroThree)} />
          </div>
          <p className={styles.heroText}>
            Where Legends Are Forged.
            <br />
            Compete. Climb. Dominate.
            <br />
            The ultimate amateur proving grounds.
          </p>
        </div>
      </section>

      <section className={styles.tour}>
        <h2 className={styles.sectionTitle}>Tour Path</h2>
        <div className={styles.tourGrid}>
          {TOUR_CARDS.map((card) => (
            <article key={card.title} className={styles.tourCard} style={imageStyle(card.image)}>
              <span>{card.title}</span>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.fame}>
        <h2 className={styles.fameTitle}>WALL OF FAME</h2>
        <div className={styles.fameGrid}>
          {FAME_PLAYERS.map((player) => (
            <article key={player.name} className={styles.playerCard}>
              <div className={styles.playerImage} style={imageStyle(player.image)} />
              <div className={styles.rank}>{player.rank}</div>
              <h3>{player.name}</h3>
              <span>{player.tag}</span>
            </article>
          ))}
        </div>
        <Link className={styles.centerBtn} href="/wall-of-fame">
          VIEW FULL FAME WALL
        </Link>
      </section>

      <footer className={styles.footer}>
        <div className={styles.footerTop}>
          <div>
            <p className={styles.footerBrand}>PUB OF HOMIES LEAGUE</p>
            <p className={styles.footerTagline}>
              The ultimate amateur proving grounds. Where legends are forged one match at a time.
            </p>
          </div>
          <div className={styles.footerLinks}>
            <Link href="/">Home</Link>
            <Link href="/about">About</Link>
            <Link href="/event">Events</Link>
            <Link href="/contact">Contact</Link>
          </div>
        </div>
        <div className={styles.footerBottom}>
          <p className={styles.footerCopy}>
            © 2025 Pub of Homies. All rights reserved. Developed by Abyss Mage.
          </p>
          <Link className={styles.adminButton} href="/admin/login">
            Admin Login
          </Link>
        </div>
      </footer>
    </main>
  );
}
