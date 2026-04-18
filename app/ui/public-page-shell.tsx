"use client";

import type { ReactNode } from "react";
import Link from "next/link";

import styles from "@/app/public-pages.module.css";

type PublicPageKey = "event" | "about" | "contact" | "wall-of-fame" | "leaderboard";

type PublicPageShellProps = {
  activePage: PublicPageKey;
  eyebrow: string;
  title: string;
  description: string;
  heroImageUrl?: string;
  children: ReactNode;
};

function imageStyle(url?: string) {
  const normalized = url?.trim();
  if (!normalized) {
    return undefined;
  }

  return { backgroundImage: `url("${normalized}")` };
}

export function PublicPageShell({
  activePage,
  eyebrow,
  title,
  description,
  heroImageUrl,
  children,
}: PublicPageShellProps) {
  return (
    <main className={styles.page}>
      <nav className={styles.nav}>
        <Link className={styles.navBrand} href="/">
          Pub of Homies
        </Link>
        <ul className={styles.navLinks}>
          <li><Link href="/">Home</Link></li>
          <li><Link href="/event" className={activePage === "event" ? styles.activeLink : ""}>Event</Link></li>
          <li><Link href="/about" className={activePage === "about" ? styles.activeLink : ""}>About</Link></li>
          <li><Link href="/contact" className={activePage === "contact" ? styles.activeLink : ""}>Contact</Link></li>
          <li><Link href="/wall-of-fame" className={activePage === "wall-of-fame" ? styles.activeLink : ""}>Wall of Fame</Link></li>
          <li><Link href="/leaderboard" className={activePage === "leaderboard" ? styles.activeLink : ""}>Leaderboard</Link></li>
        </ul>
        <Link className={`${styles.btn} ${styles.btnPrimary}`} href="/register">
          Register
        </Link>
      </nav>

      <section className={styles.hero}>
        <div className={styles.heroText}>
          <p className={styles.eyebrow}>{eyebrow}</p>
          <h1 className={styles.title}>{title}</h1>
          <p className={styles.description}>{description}</p>
        </div>
        <div className={styles.heroImage} style={imageStyle(heroImageUrl)} />
      </section>

      <section className={styles.content}>{children}</section>

      <footer className={styles.footer}>
        <div className={styles.footerTop}>
          <div className={styles.footerLinks}>
            <Link href="/event">Event</Link>
            <Link href="/about">About</Link>
            <Link href="/contact">Contact</Link>
            <Link href="/wall-of-fame">Wall of Fame</Link>
            <Link href="/leaderboard">Leaderboard</Link>
          </div>
        </div>
        <div className={styles.footerBottom}>
          <p className={styles.footerFinePrint}>
            © 2025 Pub of Homies. All rights reserved. Developed by Abyss Mage.
          </p>
          <Link className={`${styles.btn} ${styles.adminButton}`} href="/admin/login">
            Admin Login
          </Link>
        </div>
      </footer>
    </main>
  );
}
