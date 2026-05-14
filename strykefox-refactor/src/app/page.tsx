'use client';

import { useEffect, useState } from 'react';
import { ChevronRight, Menu, X } from 'lucide-react';

const navItems: [string, string][] = [
  ['CarePath', '/carepath'],
  ['Northstar Surgical Innovations', '/northstar-surgical-innovations'],
  ['SPEAR', '/login'],
  ['SoC13', '/soc13'],
];

const pathwayChips = [
  'Pre-Op', 'Surgical', 'Orthopedic', 'Spine', 'Biologics',
  'Maternal', 'Mobility', 'Wound', 'El Cuidado', 'Post-Acute',
];

const chapters = [
  {
    num: '01',
    tag: 'CAREPATH',
    title: 'Care that\nfollows the patient.',
    body: 'From pre-op to recovery, CarePath organizes the healthcare lineage around documentation, coordination, and continuity.',
    cta: 'Explore CarePath',
    href: '/carepath',
    image: '/images/operating-room.svg',
    imageType: 'svg' as const,
    chips: pathwayChips,
  },
  {
    num: '02',
    tag: 'NORTHSTAR SURGICAL INNOVATIONS',
    title: 'Innovation built around\nthe operating room.',
    body: 'NSI advances surgical tools, device commercialization, Ex-Im pathways, and emerging medical technologies designed for real-world clinical flow.',
    cta: 'Explore NSI',
    href: '/northstar-surgical-innovations',
    image: '/images/nsi-healthcare.jpg',
    imageType: 'photo' as const,
    chips: null,
  },
  {
    num: '03',
    tag: 'SPEAR',
    title: 'Deployment intelligence\nbehind the platform.',
    body: 'SPEAR powers execution through integrated data capture, analysis, learning, and field deployment.',
    cta: 'Explore SPEAR',
    href: '/login',
    image: '/images/spear-columns.jpg',
    imageType: 'photo' as const,
    chips: null,
    powered: 'Powered internally by Poseidon, Trident, and Aries.',
  },
  {
    num: '04',
    tag: 'SOC13',
    title: 'Expansion by design.',
    body: 'SoC13 aligns verticals, integrates capabilities, and reduces friction across healthcare delivery.',
    cta: 'Platform Expansion',
    href: '/soc13',
    image: '/images/xiii-medallion.svg',
    imageType: 'svg' as const,
    chips: null,
  },
];

export default function HomePage() {
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const reveals = document.querySelectorAll('.reveal');
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) entry.target.classList.add('visible');
        });
      },
      { threshold: 0.12 },
    );
    reveals.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <main className="home-main">
      {/* ---- NAV ---- */}
      <nav className="home-nav">
        <div className="nav-inner">
          <a href="/" className="nav-brand" aria-label="StrykeFox Medical home">
            <div className="nav-compass" aria-hidden="true">✦</div>
            <div className="nav-wordmark">
              <span className="nav-stryke">STRYKE</span><span className="nav-k">K</span><span className="nav-fox">FOX</span>
              <span className="nav-medical">MEDICAL</span>
            </div>
          </a>
          <ul className="nav-links">
            {navItems.map(([label, href]) => (
              <li key={label}>
                <a
                  href={href}
                  {...(href === '/login' ? { 'aria-label': 'Open SPEAR login' } : {})}
                >{label}</a>
              </li>
            ))}
          </ul>
          <button className="mobile-menu-btn" onClick={() => setMenuOpen((o) => !o)} aria-label="Toggle navigation">
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
        {menuOpen && (
          <div className="mobile-menu">
            {navItems.map(([label, href]) => (
              <a
                key={label}
                href={href}
                onClick={() => setMenuOpen(false)}
                {...(href === '/login' ? { 'aria-label': 'Open SPEAR login' } : {})}
              >{label}</a>
            ))}
          </div>
        )}
      </nav>

      {/* ---- HERO ---- */}
      <section className="hero-section">
        <div className="hero-gradient" />
        <div className="hero-content reveal visible">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/compass-rose.svg" alt="" className="hero-compass-img" aria-hidden="true" />
          <h1 className="hero-wordmark">
            <span className="hw-stryke">STRYKE</span><span className="hw-k">K</span><span className="hw-fox">FOX</span>
            <span className="hw-medical">MEDICAL</span>
          </h1>
          <p className="hero-headline">
            Healthcare infrastructure,<br />engineered for what comes next.
          </p>
          <p className="hero-sub">CarePath. NSI. SPEAR. One operating platform.</p>
          <a href="/carepath" className="hero-cta">
            Enter Platform <ChevronRight size={16} />
          </a>
        </div>
      </section>

      {/* ---- CHAPTER SECTIONS ---- */}
      {chapters.map((ch, i) => (
        <section
          className={`chapter-section ${i % 2 === 1 ? 'chapter-alt' : ''}`}
          key={ch.num}
        >
          <div className="chapter-inner">
            <div className="chapter-text reveal">
              <p className="chapter-label">
                <span className="chapter-num">{ch.num}</span>
                <span className="chapter-divider" />
                <span className="chapter-tag">{ch.tag}</span>
                <span className="chapter-line" />
              </p>
              <h2 className="chapter-title">{ch.title}</h2>
              <p className="chapter-body">{ch.body}</p>
              {'powered' in ch && ch.powered && (
                <p className="chapter-powered">
                  <span className="powered-icon">Ψ</span> {ch.powered}
                </p>
              )}
              {ch.chips && (
                <div className="chapter-chips">
                  {ch.chips.map((chip) => (
                    <span className="chip" key={chip}>{chip}</span>
                  ))}
                </div>
              )}
              <a
                href={ch.href}
                className="chapter-cta"
                {...(ch.href === '/login' ? { 'aria-label': 'Open SPEAR login' } : {})}
              >
                {ch.cta} <ChevronRight size={14} />
              </a>
            </div>
            <div className={`chapter-image ${ch.imageType === 'photo' ? 'chapter-image-photo' : ''} reveal reveal-delay-2`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={ch.image} alt={ch.tag} loading="lazy" />
            </div>
          </div>
        </section>
      ))}

      {/* ---- PLATFORM LEADERSHIP ---- */}
      <section className="founder-section">
        <div className="section-container">
          <div className="reveal">
            <h2 className="leadership-heading">Platform Leadership</h2>
          </div>
          <div className="founder-grid-compact">
            <article className="founder-card-compact reveal reveal-delay-1">
              <div className="founder-avatar-round"><span>AS</span></div>
              <div className="founder-info">
                <h3 className="founder-name">Adam Stryker</h3>
                <p className="founder-role">Founder / Platform Architect</p>
                <a href="https://www.adamwstryker.com" target="_blank" rel="noopener noreferrer" className="founder-link">
                  adamwstryker.com <ChevronRight size={10} />
                </a>
              </div>
            </article>
            <article className="founder-card-compact reveal reveal-delay-2">
              <div className="founder-avatar-round"><span>BF</span></div>
              <div className="founder-info">
                <h3 className="founder-name">Ben Fox</h3>
                <p className="founder-role">Co-Founder / Market Development</p>
              </div>
            </article>
          </div>
        </div>
      </section>

      {/* ---- FOOTER ---- */}
      <footer className="home-footer">
        <div className="footer-inner-compact">
          <div className="footer-brand-col">
            <div className="footer-logo">
              <div className="nav-compass" aria-hidden="true">✦</div>
              <div>
                <span className="nav-stryke">STRYKE</span><span className="nav-k">K</span><span className="nav-fox">FOX</span>
                <span className="nav-medical">MEDICAL</span>
              </div>
            </div>
          </div>
          <nav className="footer-nav">
            <a href="/carepath">CarePath</a>
            <a href="/northstar-surgical-innovations">Northstar Surgical Innovations</a>
            <a href="/login" aria-label="Open SPEAR login">SPEAR</a>
            <a href="/soc13">SoC13</a>
          </nav>
        </div>
        <div className="footer-bottom">
          <p className="footer-legal">&copy; 2025 StrykeFox Medical. All rights reserved.</p>
          <div className="footer-legal-links">
            <a href="/privacy" className="footer-legal-link">Privacy Policy</a>
            <a href="/terms" className="footer-legal-link">Terms of Use</a>
          </div>
        </div>
      </footer>
    </main>
  );
}
