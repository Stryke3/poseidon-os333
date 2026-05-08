'use client';

import Script from 'next/script';

export default function Analytics() {
  return (
    <>
      {/* Facebook Pixel */}
      <Script id="facebook-pixel" strategy="afterInteractive">
        {`
          !function(f,b,e,v,n,t,s)
          {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
          n.callMethod.apply(n,arguments):n.queue.push(arguments)};
          if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
          n.queue=[];t=b.createElement(e);t.async=!0;
          t.src=v;s=b.getElementsByTagName(e)[0];
          s.parentNode.insertBefore(t,s)}(window, document,'script',
          'https://connect.facebook.net/en_US/fbevents.js');
          fbq('init', '1103224047752393');
          fbq('track', 'PageView');
        `}
      </Script>
      <noscript>
        <img
          height="1"
          width="1"
          style={{ display: 'none' }}
          src="https://www.facebook.com/tr?id=1103224047752393&ev=PageView&noscript=1"
          alt=""
        />
      </noscript>

      {/* LinkedIn Insight Tag */}
      <Script id="linkedin-pixel" strategy="afterInteractive">
        {`
          _linkedin_partner_id = "6191793";
          window._linkedin_data_partner_ids = window._linkedin_data_partner_ids || [];
          window._linkedin_data_partner_ids.push(_linkedin_partner_id);
        `}
      </Script>
      <Script id="linkedin-pixel-2" strategy="afterInteractive">
        {`
          (function(l) {
            if (!l){window.lintrk = function(a,b){window.lintrk.q.push([a,b])};
            window.lintrk.q=[]}
            var s = document.getElementsByTagName("script")[0];
            var b = document.createElement("script");
            b.type = "text/javascript";b.async = true;
            b.src = "https://snap.licdn.com/li.lms-analytics/insight.min.js";
            s.parentNode.insertBefore(b, s);
          })(window.lintrk);
        `}
      </Script>
      <noscript>
        <img
          height="1"
          width="1"
          style={{ display: 'none' }}
          alt=""
          src="https://px.ads.linkedin.com/collect/?pid=6191793&fmt=gif"
        />
      </noscript>

      {/* Google Analytics 4 */}
      <Script
        src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX"
        strategy="afterInteractive"
      />
      <Script id="google-analytics" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', 'G-XXXXXXXXXX');
        `}
      </Script>

      {/* Custom Event Tracking */}
      <Script id="custom-events" strategy="afterInteractive">
        {`
          // Track CTA clicks
          function trackCTAClick(buttonText, location) {
            // Facebook Pixel
            if (typeof fbq !== 'undefined') {
              fbq('track', 'Lead', {
                button_text: buttonText,
                location: location
              });
            }
            
            // LinkedIn
            if (typeof window.lintrk !== 'undefined') {
              window.lintrk('track', { conversion_id: 1234567 });
            }
            
            // Google Analytics
            if (typeof gtag !== 'undefined') {
              gtag('event', 'cta_click', {
                button_text: buttonText,
                location: location
              });
            }
          }

          // Track form submissions
          function trackFormSubmission(formType) {
            if (typeof fbq !== 'undefined') {
              fbq('track', 'CompleteRegistration', {
                content_name: formType
              });
            }
            
            if (typeof gtag !== 'undefined') {
              gtag('event', 'form_submission', {
                form_type: formType
              });
            }
          }

          // Make functions globally available
          window.trackCTAClick = trackCTAClick;
          window.trackFormSubmission = trackFormSubmission;
        `}
      </Script>
    </>
  );
}
