import type { Metadata } from 'next';

const SITE_URL = 'https://www.strykefox.com';

export const metadata: Metadata = {
  title: 'NorthStar Surgical Innovations | Surgical Innovation Platform',
  description:
    'NorthStar Surgical Innovations advances surgical tools, device commercialization, Ex-Im pathways, and emerging medical technologies designed for real-world clinical flow. TKA surgical instruments, ASC workflow support, and orthopedic device distribution.',
  alternates: {
    canonical: `${SITE_URL}/northstar-surgical-innovations`,
  },
  openGraph: {
    title: 'NorthStar Surgical Innovations | Surgical Innovation Platform',
    description:
      'NSI advances surgical tools, device commercialization, Ex-Im pathways, and emerging medical technologies designed for real-world clinical flow.',
    url: `${SITE_URL}/northstar-surgical-innovations`,
  },
  keywords: [
    'northstar surgical innovations',
    'TKA surgical instruments ASC',
    'MIS total knee arthroplasty instruments',
    'surgical device commercialization',
    'ASC surgical instrument supplier',
    'orthopedic device distribution',
    'spine implant workflow support',
  ],
};

export default function NorthstarLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
