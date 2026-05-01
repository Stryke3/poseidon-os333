import type { Metadata } from "next";
import "./globals.css";
import Header from "@/components/ui/Header";
import Footer from "@/components/ui/Footer";
import Analytics from "@/components/ui/Analytics";

export const metadata: Metadata = {
  title: "Kit de Cuidado para Embarazo y Posparto — Cubierto por tu Seguro | El Kit de Cuidado para Mamá",
  description: "Recibe tu kit de cuidado para embarazo y posparto cubierto por la mayoría de seguros médicos. Productos aprobados por la FDA, seguros y sin medicamentos. Hablamos español.",
  keywords: "kit embarazo, cuidado posparto, seguro médico embarazo, productos embarazo gratis, faja embarazo, medias compresión embarazo, TENS embarazo, cuidado mamá latina, mommy care kit español",
  openGraph: {
    title: "El Kit de Cuidado para Mamá — Cubierto por tu Seguro",
    description: "Productos aprobados por la FDA para tu embarazo y posparto. Sin costo con la mayoría de seguros. Hablamos español.",
    locale: "es_US",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <Analytics />
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
