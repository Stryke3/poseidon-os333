import Head from 'next/head';

interface SEOHeadProps {
  title?: string;
  description?: string;
  keywords?: string;
  image?: string;
  url?: string;
  type?: string;
  schemaData?: Record<string, any>;
}

export default function SEOHead({
  title = "Kit de Cuidado para Embarazo y Posparto — Cubierto por tu Seguro | El Kit de Cuidado para Mamá",
  description = "Recibe tu kit de cuidado para embarazo y posparto cubierto por la mayoría de seguros médicos. Productos aprobados por la FDA, seguros y sin medicamentos. Hablamos español.",
  keywords = "kit embarazo, cuidado posparto, seguro médico embarazo, productos embarazo gratis, faja embarazo, medias compresión embarazo, TENS embarazo, cuidado mamá latina, mommy care kit español",
  image = "/api/placeholder/1200/630",
  url = "https://elkitdecuidado.com",
  type = "website",
  schemaData
}: SEOHeadProps) {
  
  const defaultSchema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": "El Kit de Cuidado para Mamá",
    "url": "https://elkitdecuidado.com",
    "logo": "https://elkitdecuidado.com/logo.png",
    "description": "Productos aprobados por la FDA para embarazo y posparto, cubiertos por seguro médico",
    "contactPoint": {
      "@type": "ContactPoint",
      "telephone": "+1-888-464-9015",
      "contactType": "customer service",
      "availableLanguage": ["Spanish", "English"]
    },
    "sameAs": [
      "https://www.facebook.com/mommycarekit",
      "https://www.instagram.com/mommycarekit"
    ]
  };

  const finalSchema = schemaData || defaultSchema;

  return (
    <>
      {/* Basic Meta Tags */}
      <title>{title}</title>
      <meta name="description" content={description} />
      <meta name="keywords" content={keywords} />
      <meta name="author" content="El Kit de Cuidado para Mamá" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <meta name="robots" content="index, follow" />
      <meta name="language" content="es" />
      <meta charSet="UTF-8" />

      {/* Open Graph / Facebook */}
      <meta property="og:type" content={type} />
      <meta property="og:url" content={url} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={image} />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:locale" content="es_US" />

      {/* Twitter */}
      <meta property="twitter:card" content="summary_large_image" />
      <meta property="twitter:url" content={url} />
      <meta property="twitter:title" content={title} />
      <meta property="twitter:description" content={description} />
      <meta property="twitter:image" content={image} />

      {/* Additional SEO */}
      <meta name="theme-color" content="#E67E5C" />
      <meta name="msapplication-TileColor" content="#E67E5C" />
      
      {/* Canonical URL */}
      <link rel="canonical" href={url} />

      {/* Structured Data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(finalSchema, null, 2)
        }}
      />

      {/* Preconnect to external domains */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
    </>
  );
}
