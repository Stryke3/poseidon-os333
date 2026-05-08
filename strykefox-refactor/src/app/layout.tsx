import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'StrykeFox CarePath | Verified. Documented. Delivered.',
  description: 'Care-pathway infrastructure for modern healthcare recovery coordination.',
  keywords: 'healthcare infrastructure, care pathway coordination, medical recovery',
  authors: [{ name: 'StrykeFox Medical' }],
  creator: 'Egeiro Holdings Co.',
  publisher: 'StrykeFox Medical',
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  openGraph: {
    title: 'StrykeFox CarePath | Verified. Documented. Delivered.',
    description: 'Care-pathway infrastructure for modern healthcare recovery coordination.',
    url: 'https://strykefox.com',
    siteName: 'StrykeFox CarePath',
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'StrykeFox CarePath | Verified. Documented. Delivered.',
    description: 'Care-pathway infrastructure for modern healthcare recovery coordination.',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
