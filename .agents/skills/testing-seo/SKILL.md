---
name: testing-seo-strykefox
description: Test SEO changes on strykefox.com. Use when verifying meta tags, JSON-LD, sitemap, robots.txt, or page content after deployment.
---

# Testing SEO on strykefox.com

## Live Site

- **Production URL**: https://strykefox.com (redirects to non-www, but canonical is `https://www.strykefox.com`)
- **Deployment**: Vercel project `sfm` with Root Directory set to `frontend`
- **Framework**: Next.js (App Router) deployed on Vercel

## Pre-Flight Checks (curl)

Before opening the browser, verify SEO elements via curl — this is faster and gives raw HTML:

```bash
# Check title tag and meta tags
curl -sL https://strykefox.com | head -80

# Check robots.txt
curl -sL https://strykefox.com/robots.txt

# Check sitemap.xml
curl -sL https://strykefox.com/sitemap.xml

# Check for spelling issues (should show no STRYKEKFOX)
curl -sL https://strykefox.com | grep -oi 'STRYKE[A-Z]*FOX' | sort | uniq -c

# Check JSON-LD presence
curl -sL https://strykefox.com | grep -o 'application/ld+json[^<]*' | head -5
```

## Browser Verification

Use JavaScript console to extract and verify all meta tags at once:

```javascript
console.log(JSON.stringify({
  title: document.title,
  description: document.querySelector('meta[name="description"]')?.content,
  canonical: document.querySelector('link[rel="canonical"]')?.href,
  ogTitle: document.querySelector('meta[property="og:title"]')?.content,
  ogImage: document.querySelector('meta[property="og:image"]')?.content,
  ogUrl: document.querySelector('meta[property="og:url"]')?.content,
  twitterCard: document.querySelector('meta[name="twitter:card"]')?.content,
  robots: document.querySelector('meta[name="robots"]')?.content,
  jsonLdCount: document.querySelectorAll('script[type="application/ld+json"]').length,
  jsonLdTypes: Array.from(document.querySelectorAll('script[type="application/ld+json"]')).map(s => JSON.parse(s.textContent)['@type'])
}, null, 2));
```

## Expected Values

### Homepage
- **Title**: Should contain "StrykeFox Medical" and healthcare-related keywords
- **Canonical**: `https://www.strykefox.com/`
- **JSON-LD**: Should include Organization and WebSite schemas at minimum
- **OG Image**: Should point to a valid image URL under strykefox.com
- **Twitter Card**: `summary_large_image`

### robots.txt
- Should reference `Host: https://www.strykefox.com`
- Should reference `Sitemap: https://www.strykefox.com/sitemap.xml`
- Should NOT reference `adamwstryker.com`

### sitemap.xml
- All URLs should be under `www.strykefox.com`
- Should include all public pages (homepage, carepath, northstar-surgical, spear, soc13, stryke-pac-exim, sensars, mommy-care-kit, el-cuidado-mommy, contact)
- Should NOT reference `adamwstryker.com`

### Spelling
- The brand name is "StrykeFox" (one word, capital S and F)
- There should be zero instances of "STRYKEKFOX" (double K bug from old wordmark split)

## Key Pages to Check

| Page | URL |
|------|-----|
| Homepage | https://strykefox.com/ |
| CarePath | https://strykefox.com/carepath |
| NorthStar Surgical | https://strykefox.com/northstar-surgical |
| SPEAR | https://strykefox.com/spear |
| SoC13 | https://strykefox.com/soc13 |
| StrykePac Ex-Im | https://strykefox.com/stryke-pac-exim |
| Sensars | https://strykefox.com/sensars |
| Contact | https://strykefox.com/contact |
| Mommy Care Kit | https://strykefox.com/mommy-care-kit |
| El Cuidado | https://strykefox.com/el-cuidado-mommy |

## CI Notes

- The `adam-stryker` Vercel project may show failures — this is a separate, pre-existing issue (different Vercel project, not `sfm`)
- The `sfm` Vercel deployment is the one that matters for strykefox.com
- Frontend Type Check and Lite Service Syntax are the GitHub Actions CI checks

## Devin Secrets Needed

No secrets required for testing the live site. The site is publicly accessible.
