import type { Metadata } from "next"
import Script from "next/script"

import { getSafeServerSession } from "@/lib/auth"

import "./globals.css"
import Providers from "./providers"

const SITE_URL = "https://www.strykefox.com"

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default:
      "StrykeFox Medical | Healthcare Infrastructure, CarePath & Medical Technology Platform",
    template: "%s | StrykeFox Medical",
  },
  description:
    "StrykeFox Medical operates CarePath, NorthStar Surgical Innovations, SPEAR, SoC13, and StrykePac Ex-Im SA — integrated healthcare infrastructure for surgical commercialization, DMEPOS, recovery coordination, and device deployment across Las Vegas, Dallas, and Panama Pacífico.",
  keywords: [
    "healthcare infrastructure",
    "medical technology platform",
    "care pathway infrastructure",
    "healthcare operating platform",
    "recovery coordination platform",
    "provider workflow support",
    "healthcare documentation infrastructure",
    "reimbursement ready documentation",
    "medical device workflow platform",
    "DMEPOS supplier Las Vegas Nevada",
    "surgical commercialization platform",
  ],
  authors: [{ name: "Adam W. Stryker" }],
  creator: "StrykeFox Medical",
  publisher: "StrykeFox Medical",
  alternates: {
    canonical: SITE_URL,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-snippet": -1,
      "max-image-preview": "large",
      "max-video-preview": -1,
    },
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: SITE_URL,
    siteName: "StrykeFox Medical",
    title:
      "StrykeFox Medical | Healthcare Infrastructure & Medical Technology Platform",
    description:
      "Integrated healthcare infrastructure for surgical commercialization, DMEPOS, recovery coordination, and medical device deployment.",
    images: [
      {
        url: `${SITE_URL}/images/sfm-logo.jpeg`,
        width: 1200,
        height: 630,
        alt: "StrykeFox Medical — Healthcare Infrastructure Platform",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "StrykeFox Medical | Healthcare Infrastructure Platform",
    description:
      "Integrated healthcare infrastructure for surgical commercialization, DMEPOS, recovery coordination, and medical device deployment.",
    images: [`${SITE_URL}/images/sfm-logo.jpeg`],
  },
}

const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": `${SITE_URL}#organization`,
  name: "StrykeFox Medical",
  legalName: "StrykeFox Medical LLC",
  url: SITE_URL,
  logo: `${SITE_URL}/images/sfm-logo.jpeg`,
  description:
    "Healthcare infrastructure and medical technology operating platform supporting care pathway coordination, recovery product workflows, surgical support, biologics logistics, reimbursement-ready documentation, healthcare technology deployment, and acquisition-led platform expansion.",
  foundingDate: "2019",
  founder: [
    {
      "@type": "Person",
      name: "Adam W. Stryker",
      jobTitle: "Founder & CEO",
      url: `${SITE_URL}/founder`,
    },
    {
      "@type": "Person",
      name: "Benjamin Fox",
      jobTitle: "Co-Founder & SVP",
    },
  ],
  address: {
    "@type": "PostalAddress",
    addressLocality: "Las Vegas",
    addressRegion: "NV",
    addressCountry: "US",
  },
  contactPoint: {
    "@type": "ContactPoint",
    email: "patients@strykefox.com",
    contactType: "customer service",
  },
  sameAs: [],
  knowsAbout: [
    "Medical devices",
    "Durable medical equipment",
    "Healthcare infrastructure",
    "Surgical commercialization",
    "Recovery coordination",
    "Reimbursement infrastructure",
    "Healthcare platform development",
  ],
}

const websiteJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  "@id": `${SITE_URL}#website`,
  name: "StrykeFox Medical",
  url: SITE_URL,
  publisher: { "@id": `${SITE_URL}#organization` },
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getSafeServerSession()

  return (
    <html lang="en">
      <head>
        <meta name="geo.region" content="US-NV" />
        <meta name="geo.placename" content="Las Vegas" />
        <Script
          id="organization-jsonld"
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(organizationJsonLd),
          }}
        />
        <Script
          id="website-jsonld"
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
        />
      </head>
      <body>
        <Providers session={session}>{children}</Providers>
      </body>
    </html>
  )
}
