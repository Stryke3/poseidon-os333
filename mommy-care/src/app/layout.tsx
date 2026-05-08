import type { Metadata } from "next";
import "./globals.css";
import Header from "@/components/ui/Header";
import Footer from "@/components/ui/Footer";
import Analytics from "@/components/ui/Analytics";

export const metadata: Metadata = {
  title: "Mommy Care Kit for Pregnancy & Postpartum — Covered by Your Insurance | Mommy Care Kit",
  description: "Get your pregnancy and postpartum care kit covered by most medical insurance. FDA-approved, safe, drug-free products. We speak English.",
  keywords: "pregnancy kit, postpartum care, pregnancy insurance, free pregnancy products, belly band, compression stockings pregnancy, TENS pregnancy, mommy care kit, maternity care",
  openGraph: {
    title: "Mommy Care Kit — Covered by Your Insurance",
    description: "FDA-approved products for your pregnancy and postpartum journey. No cost with most insurance. English-speaking support.",
    locale: "en_US",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <Analytics />
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
