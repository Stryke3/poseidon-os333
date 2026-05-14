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
    chips: pathwayChips,
  },
  {
    num: '02',
    tag: 'NORTHSTAR SURGICAL INNOVATIONS',
    title: 'Innovation built around\nthe operating room.',
    body: 'NSI advances surgical tools, device commercialization, Ex-Im pathways, and emerging medical technologies designed for real-world clinical flow.',
    cta: 'Explore NSI',
    href: '/northstar-surgical-innovations',
    image: '/images/surgical-equipment.svg',
    chips: null,
  },
  {
    num: '03',
    tag: 'SPEAR',
    title: 'Deployment intelligence\nbehind the platform.',
    body: 'SPEAR powers execution through integrated data capture, analysis, learning, and field deployment.',
    cta: 'Explore SPEAR',
    href: '/login',
    image: '/images/operating-framework.svg',
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
    image: '/images/soc13-logo.svg',
    chips: null,
  },
];

export default function HomePage() {
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const reveals = document.querySelectorAll('.sfm-reveal');
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
            <div className="nav-compass" aria-hidden="true">&#10022;</div>
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
        <div className="hero-content sfm-reveal visible">
          <div className="hero-logo-mark" aria-hidden="true">&#10022;</div>
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
            <div className="chapter-text sfm-reveal">
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
                  <span className="powered-icon">&Psi;</span> {ch.powered}
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
            <div className="chapter-image sfm-reveal sfm-reveal-delay-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={ch.image} alt={ch.tag} loading="lazy" />
            </div>
          </div>
        </section>
      ))}

      {/* ---- FOUNDER / PLATFORM LEADERSHIP ---- */}
      <section className="founder-section">
        <div className="section-container">
          <div className="sfm-reveal">
            <p className="section-label">Platform Leadership</p>
            <h2 className="section-heading">Leadership</h2>
          </div>
          <div className="founder-grid">
            <article className="founder-card sfm-reveal sfm-reveal-delay-1">
              <div className="founder-avatar"><span>AS</span></div>
              <h3 className="founder-name">Adam Stryker</h3>
              <p className="founder-role">Founder / Platform Architect</p>
              <p className="founder-bio">
                Healthcare operator, investor, and systems architect focused on integrated medical infrastructure,
                regulated healthcare platforms, surgical innovation, and operating leverage.
              </p>
              <a href="https://www.adamwstryker.com" target="_blank" rel="noopener noreferrer" className="founder-link">
                Personal Website <ChevronRight size={12} />
              </a>
            </article>
            <article className="founder-card sfm-reveal sfm-reveal-delay-2">
              <div className="founder-avatar"><span>BF</span></div>
              <h3 className="founder-name">Ben Fox</h3>
              <p className="founder-role">Co-Founder / Market Development</p>
              <p className="founder-bio">
                Healthcare growth operator focused on provider relationships, market execution,
                and field-level expansion across the StrykeFox Medical platform.
              </p>
              <a href="/" className="founder-link">
                StrykeFox Medical <ChevronRight size={12} />
              </a>
            </article>
          </div>
        </div>
      </section>

      {/* ---- FOOTER ---- */}
      <footer className="home-footer">
        <div className="footer-inner">
          <div className="footer-brand-col">
            <div className="footer-logo">
              <span className="nav-stryke">STRYKE</span><span className="nav-k">K</span><span className="nav-fox">FOX</span>
              <span className="nav-medical">MEDICAL</span>
            </div>
            <p className="footer-tagline">Healthcare infrastructure, engineered for what comes next.</p>
          </div>
          <div>
            <p className="footer-col-title">Platform</p>
            <ul className="footer-links">
              <li><a href="/carepath">CarePath</a></li>
              <li><a href="/northstar-surgical-innovations">Northstar Surgical Innovations</a></li>
              <li><a href="/login" aria-label="Open SPEAR login">SPEAR</a></li>
              <li><a href="/soc13">SoC13</a></li>
            </ul>
          </div>
          <div>
            <p className="footer-col-title">External</p>
            <ul className="footer-links">
              <li><a href="https://www.adamwstryker.com" target="_blank" rel="noopener noreferrer">Adam Stryker</a></li>
              <li><a href="https://www.sensars.com" target="_blank" rel="noopener noreferrer">Sensars</a></li>
            </ul>
          </div>
          <div>
            <p className="footer-col-title">Connect</p>
            <ul className="footer-links">
              <li><a href="mailto:adam.stryker@strykefox.com">Partner With StrykeFox</a></li>
            </ul>
          </div>
        </div>
        <div className="footer-bottom">
          <p className="footer-legal">&copy; 2026 StrykeFox Medical LLC &middot; Las Vegas, NV &middot; NPI: 1821959420</p>
          <p className="footer-motto">Healthcare infrastructure, engineered for what comes next.</p>
        </div>
      </footer>
    </main>
  );
}
