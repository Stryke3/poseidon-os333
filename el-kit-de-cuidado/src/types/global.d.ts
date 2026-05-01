export {};

declare global {
  interface Window {
    trackCTAClick?: (buttonText: string, location: string) => void;
    trackFormSubmission?: (formType: string) => void;
    fbq?: (command: string, eventName: string, parameters?: Record<string, any>) => void;
    lintrk?: (command: string, parameters?: Record<string, any>) => void;
    gtag?: (command: string, eventName: string, parameters?: Record<string, any>) => void;
    dataLayer?: any[];
  }
}
