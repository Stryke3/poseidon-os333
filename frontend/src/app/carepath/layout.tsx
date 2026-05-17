import type { Metadata } from 'next';

const SITE_URL = 'https://www.strykefox.com';

export const metadata: Metadata = {
  title: 'CarePath by StrykeFox | Recovery Coordination Infrastructure',
  description:
    'CarePath organizes recovery products, documentation, fulfillment coordination, proof-of-delivery capture, and billing-ready packets across the patient journey. DMEPOS documentation compliance and HIPAA-compliant patient pathways.',
  alternates: {
    canonical: `${SITE_URL}/carepath`,
  },
  openGraph: {
    title: 'CarePath by StrykeFox | Recovery Coordination Infrastructure',
    description:
      'From pre-op to recovery, CarePath organizes the healthcare lineage around documentation, coordination, and continuity.',
    url: `${SITE_URL}/carepath`,
  },
  keywords: [
    'carepath healthcare',
    'patient pathway coordination',
    'DMEPOS documentation compliance',
    'healthcare continuity of care platform',
    'EDI 837P billing healthcare',
    'HIPAA compliant patient pathway',
    'recovery coordination',
    'care pathway infrastructure',
  ],
};

export default function CarePathLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
