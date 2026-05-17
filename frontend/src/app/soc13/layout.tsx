import type { Metadata } from 'next';

const SITE_URL = 'https://www.strykefox.com';

export const metadata: Metadata = {
  title: 'SoC13 | Healthcare Acquisition & Integration Platform',
  description:
    'SoC13 evaluates, integrates, and scales healthcare assets that strengthen the StrykeFox platform operating base. Healthcare acquisition platform for vertical integration, compliance, and operating leverage.',
  alternates: {
    canonical: `${SITE_URL}/soc13`,
  },
  openGraph: {
    title: 'SoC13 | Healthcare Acquisition & Integration Platform',
    description:
      'SoC13 aligns verticals, integrates capabilities, and reduces friction across healthcare delivery.',
    url: `${SITE_URL}/soc13`,
  },
  keywords: [
    'healthcare acquisition platform',
    'SoC13 compliance',
    'healthcare vertical integration',
    'healthcare M&A compliance',
    'healthcare operating leverage',
    'healthcare lineage platform',
  ],
};

export default function SoC13Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
