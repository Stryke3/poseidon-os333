# Current StrykeFox Site Structure Report

## Routes and Files

### Homepage (Root)
- **File**: `/Volumes/WORKSPACE/poseidon 2/strykefox-homepage.html`
- **Component Structure**: Static HTML with embedded CSS
- **Section Order**: 
  1. Navigation (fixed)
  2. Hero Section
  3. Credibility Strip
  4. Why We Exist Section
  5. Platform Architecture Section
  6. Core Capabilities Section
  7. Operating Philosophy Section
  8. Founder Bridge Section
  9. Patient Programs Section
  10. CTA Section
  11. Footer

### Mommy Care Route
- **File**: `/Volumes/WORKSPACE/poseidon 2/mommy-care/`
- **Structure**: Next.js App Router
- **Main Page**: `src/app/page.tsx`
- **Components**: `src/components/sections/`

### El Kit de Cuidado Route
- **File**: `/Volumes/WORKSPACE/poseidon 2/el-kit-de-cuidado/`
- **Structure**: Next.js App Router
- **Main Page**: `src/app/page.tsx`
- **Components**: `src/components/sections/`

## Current Design System

### Colors (CSS Variables)
```css
--navy: #0B1F3A
--navy-dark: #05080F
--navy-light: #08111F
--gold: #F0B432
--gold-light: #FFD7D3
--white: #FFFFFF
--white-80: rgba(255, 255, 255, 0.8)
--white-60: rgba(255, 255, 255, 0.6)
--white-40: rgba(255, 255, 255, 0.4)
--white-20: rgba(255, 255, 255, 0.2)
--white-10: rgba(255, 255, 255, 0.1)
--border: rgba(255, 255, 255, 0.08)
```

### Typography
- **Font Family**: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", Arial, sans-serif
- **Monospace**: "SF Mono", ui-monospace, Monaco, Consolas, monospace
- **Hero Headline**: clamp(48px, 8vw, 72px), font-weight: 700
- **Section Headline**: clamp(36px, 6vw, 56px), font-weight: 700
- **Body Text**: 18px, line-height: 1.6-1.7

### Component Classes

#### Navigation
- `.nav-container`: Flex container with justify-between
- `.logo`: Font-size: 24px, font-weight: 700
- `.nav-primary`: Display flex, gap: 32px
- `.nav-secondary`: Display flex, gap: 24px
- `.dropdown`: Position relative with hover menu
- `.dropdown-menu`: Absolute positioned, background: rgba(11, 31, 58, 0.98)

#### Hero Section
- `.hero`: Min-height: 100vh, flex items-center
- `.hero-content`: Max-width: 800px, text-align: center
- `.hero-label`: Font-family: SF Mono, font-size: 11px, text-transform: uppercase
- `.hero-headline`: Gradient text, font-weight: 700
- `.hero-subhead`: Font-size: 18px, color: var(--white-80)
- `.cta-button`: Background: var(--gold), color: var(--navy), padding: 16px 32px
- `.cta-button-secondary`: Transparent background, border: 1px solid var(--white-40)

#### Section Components
- `.credibility-strip`: Background gradient, padding: 80px 0
- `.credibility-grid`: Grid with auto-fit columns
- `.credibility-item`: Border: 1px solid var(--border), background: rgba(255, 255, 255, 0.03)
- `.platform-entity`: Border: 1px solid var(--border), hover: border-color: var(--gold)
- `.capability`: Border-left: 2px solid var(--gold), padding-left: 32px
- `.philosophy-principle`: Grid with 80px 1fr columns

## Current Copy and CTAs

### Homepage Hero
- **Label**: "Platform"
- **Headline**: "Precision Infrastructure for Regulated Healthcare"
- **Subhead**: "StrykeFox brings structural control, documented workflows, and execution discipline to healthcare environments where compliance and precision matter."
- **CTAs**: "Explore Platform", "View Patient Programs"

### Current Navigation Links
- **Patient Programs Dropdown**: Mommy Care Kit, El Kit de Cuidado
- **Secondary Nav**: Direct links to both programs

### Current Footer
- **Brand**: "StrykeFox"
- **Description**: "Precision infrastructure for regulated healthcare environments. Platform architecture that scales with discipline."

## Asset Paths
- **Mommy Care Logo**: `/assets/mommy-care-logo.png`
- **El Kit Logo**: `/assets/mommy-care-logo.png` (same asset)

## CSS Structure
- **Methodology**: Embedded CSS in HTML file
- **Organization**: Component-based classes with consistent naming
- **Responsive**: Media queries for mobile (max-width: 768px)

## Current Working Routes
- `/` (homepage)
- `/mommy-care/` → Next.js app
- `/el-kit-de-cuidado/` → Next.js app

## Founder Section
- **Current CTA**: `<a href="#founder-page" class="cta-button">Learn About Founder</a>`
- **Target**: Internal anchor (needs external link)
