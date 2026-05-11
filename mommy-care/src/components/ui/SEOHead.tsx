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
  title = "Pregnancy and Postpartum Care Kit — Covered by Your Insurance | Mommy Care Kit",
  description = "Get your pregnancy and postpartum care kit covered by most insurance plans. FDA-approved, safe and medication-free products. Bilingual English and Spanish support.",
  keywords = "pregnancy kit, postpartum care, pregnancy insurance, free pregnancy products, belly band, compression stockings pregnancy, TENS pregnancy, mommy care, bilingual pregnancy care",
  image = "/api/placeholder/1200/630",
  url = "https://mommycarekit.com",
  type = "website",
  schemaData
}: SEOHeadProps) {
  
  const defaultSchema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": "Mommy Care Kit",
    "url": "https://mommycarekit.com",
    "logo": "https://mommycarekit.com/logo.png",
    "description": "FDA-approved products for pregnancy and postpartum care, covered by insurance",
    "contactPoint": {
      "@type": "ContactPoint",
      "telephone": "+1-888-464-9015",
      "contactType": "customer service",
      "availableLanguage": ["English", "Spanish"]
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
      <meta name="author" content="Mommy Care Kit" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <meta name="robots" content="index, follow" />
      <meta name="language" content="en" />
      <meta charSet="UTF-8" />

      {/* Open Graph / Facebook */}
      <meta property="og:type" content={type} />
      <meta property="og:url" content={url} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={image} />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:locale" content="en_US" />

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
