import type { Metadata } from 'next';

const SITE_URL = 'https://www.strykefox.com';

export const metadata: Metadata = {
  title: 'SPEAR | Healthcare Technology Deployment System',
  description:
    'SPEAR powers healthcare execution through integrated data capture, analysis, learning, and field deployment. Powered by Poseidon, Trident, and Aries — healthcare workflow automation, EDI 835 claim adjudication, and RCM intelligence.',
  alternates: {
    canonical: `${SITE_URL}/spear`,
  },
  openGraph: {
    title: 'SPEAR | Healthcare Technology Deployment System',
    description:
      'SPEAR powers execution through integrated data capture, analysis, learning, and field deployment.',
    url: `${SITE_URL}/spear`,
  },
  keywords: [
    'SPEAR healthcare platform',
    'Poseidon healthcare data',
    'Trident AI revenue risk scoring',
    'healthcare deployment intelligence',
    'EDI 835 claim adjudication',
    'healthcare RCM intelligence',
    'healthcare workflow automation',
    'healthcare data orchestration',
  ],
};

export default function SpearLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
