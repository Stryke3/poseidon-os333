'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';

const navItems: [string, string][] = [
  ['CarePath', '/carepath'],
  ['NorthStar Surgical', '/northstar-surgical-innovations'],
  ['SPEAR', '/spear'],
  ['SoC13', '/soc13'],
];

export function HomepageNav() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <nav className="home-nav">
      <div className="nav-inner">
        <Link href="/" className="nav-brand" aria-label="StrykeFox Medical home">
          <div className="nav-brand-logo">
            <Image
              src="/images/sfm-logo.jpeg"
              alt="StrykeFox Medical logo"
              width={28}
              height={28}
            />
          </div>
          <div className="nav-wordmark">
            <span className="nav-stryke">STRY</span>
            <span className="nav-k">K</span>
            <span className="nav-fox">EFOX</span>
            <span className="nav-medical">MEDICAL</span>
          </div>
        </Link>
        <ul className="nav-links">
          {navItems.map(([label, href]) => (
            <li key={label}>
              <Link href={href}>{label}</Link>
            </li>
          ))}
        </ul>
        <button
          className="mobile-menu-btn"
          onClick={() => setMenuOpen((o) => !o)}
          aria-label="Toggle navigation"
        >
          {menuOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>
      {menuOpen && (
        <div className="mobile-menu">
          {navItems.map(([label, href]) => (
            <Link key={label} href={href} onClick={() => setMenuOpen(false)}>
              {label}
            </Link>
          ))}
        </div>
      )}
    </nav>
  );
}
