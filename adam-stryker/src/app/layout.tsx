import type { Metadata } from "next";
import { Syne, DM_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const syne = Syne({
  subsets: ["latin"],
  variable: "--font-syne",
  display: "swap",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
});

const SITE_URL = "https://www.adamwstryker.com";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default:
      "Adam W. Stryker | Author, Healthcare Operator & Architect of Leverage",
    template: "%s | Adam W. Stryker",
  },
  description:
    "Official website of Adam W. Stryker, healthcare operator, private equity strategist, medical device platform builder, founder of StrykeFox Medical, and author of Candor Through Fire.",
  keywords: [
    "Adam Stryker",
    "Adam W Stryker",
    "Adam W. Stryker",
    "Adam Stryker author",
    "Adam Stryker healthcare",
    "Adam Stryker StrykeFox",
    "Adam Stryker Las Vegas",
    "StrykeFox Medical",
    "Candor Through Fire",
    "healthcare operator",
    "private equity strategist",
    "medical device platform builder",
    "healthcare infrastructure",
    "architect of leverage",
  ],
  authors: [{ name: "Adam W. Stryker", url: SITE_URL }],
  creator: "Adam W. Stryker",
  publisher: "Egeiro Holdings",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  alternates: {
    canonical: SITE_URL,
  },
  openGraph: {
    title: "Adam W. Stryker | Author & Architect of Leverage",
    description:
      "Healthcare operator. Private equity strategist. Medical device platform builder. Author of Candor Through Fire.",
    url: SITE_URL,
    siteName: "Adam W. Stryker",
    locale: "en_US",
    type: "website",
    images: [
      {
        url: `${SITE_URL}/og-image`,
        width: 1200,
        height: 630,
        alt: "Adam W. Stryker — author, healthcare operator, and private equity strategist",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Adam W. Stryker | Author & Architect of Leverage",
    description:
      "Healthcare operator. Private equity strategist. Medical device platform builder. Author of Candor Through Fire.",
    images: [`${SITE_URL}/og-image`],
  },
  other: {
    "geo.region": "US-NV",
    "geo.placename": "Las Vegas",
    "geo.position": "36.1699;-115.1398",
    ICBM: "36.1699, -115.1398",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${syne.variable} ${dmSans.variable} ${jetbrainsMono.variable}`}
    >
      <head>
        <PersonSchema />
        <WebSiteSchema />
      </head>
      <body>{children}</body>
    </html>
  );
}

function PersonSchema() {
  const schema = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: "Adam W. Stryker",
    alternateName: [
      "Adam Stryker",
      "Adam W Stryker",
      "Adam Stryker Author",
      "Architect of Leverage",
    ],
    url: "https://www.adamwstryker.com/",
    jobTitle: [
      "Author",
      "Healthcare Operator",
      "Private Equity Strategist",
      "Medical Device Platform Builder",
    ],
    description:
      "Adam W. Stryker is a healthcare operator, private equity strategist, medical device platform builder, founder of StrykeFox Medical, and author of Candor Through Fire.",
    address: {
      "@type": "PostalAddress",
      addressLocality: "Las Vegas",
      addressRegion: "NV",
      addressCountry: "US",
    },
    worksFor: {
      "@type": "Organization",
      name: "StrykeFox Medical",
      url: "https://www.strykefox.com/",
    },
    founder: [
      {
        "@type": "Organization",
        name: "StrykeFox Medical",
        url: "https://www.strykefox.com/",
      },
      {
        "@type": "Organization",
        name: "Northstar Surgical Innovations",
      },
    ],
    award: [
      "Inc. 5000 Fast-Growth Recognition",
      "Top 300 Healthcare Executives",
      "Top 10 GHM Infrastructure Leaders 2026",
    ],
    sameAs: [
      "https://www.strykefox.com/",
      "https://www.linkedin.com/in/adam-s-76a127265",
    ],
    knowsAbout: [
      "Healthcare operations",
      "Medical devices",
      "DME",
      "Biologics",
      "Surgical implants",
      "Healthcare compliance",
      "Private Equity",
      "Revenue cycle workflows",
      "Healthcare distribution",
      "Platform building",
      "Candor Through Fire",
    ],
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

function WebSiteSchema() {
  const schema = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Adam W. Stryker",
    alternateName: "Adam Stryker",
    url: "https://www.adamwstryker.com/",
    description:
      "Official website of Adam W. Stryker — author, healthcare operator, private equity strategist, and architect of leverage.",
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}
