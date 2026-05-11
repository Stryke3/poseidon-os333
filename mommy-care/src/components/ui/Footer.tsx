import Link from 'next/link';
import { Phone, Mail, MapPin } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="bg-warm border-t border-gray-200 mt-16">
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Company Info */}
          <div className="col-span-1 md:col-span-2">
            <div className="flex items-center space-x-3 mb-4">
              <img 
                src={`${process.env.NEXT_PUBLIC_BASE_PATH || ''}/assets/mommy-care-logo.png`} 
                alt="Mommy Care Kit Logo" 
                className="w-10 h-10"
              />
              <div>
                <h3 className="text-lg font-serif text-warm">Mommy Care Kit</h3>
                <p className="text-sm text-gray-600">For Mom</p>
              </div>
            </div>
            <p className="text-gray-600 mb-4 max-w-md">
              FDA-approved products for your pregnancy and postpartum care, covered by most insurance plans. 
              Because your wellness matters.
            </p>
            <div className="space-y-2">
              <div className="flex items-center space-x-2 text-gray-600">
                <Phone className="w-4 h-4" />
                <span className="text-sm">(888) 464-9015</span>
              </div>
              <div className="flex items-center space-x-2 text-gray-600">
                <Mail className="w-4 h-4" />
                <span className="text-sm">hello@mommycarekit.com</span>
              </div>
              <div className="flex items-center space-x-2 text-accent">
                <MapPin className="w-4 h-4" />
                <span className="text-sm font-medium">We Speak English</span>
              </div>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="font-serif text-warm mb-4">Quick Links</h4>
            <ul className="space-y-2">
              <li>
                <Link href="/" className="text-gray-600 hover:text-primary transition-colors text-sm">
                  Home
                </Link>
              </li>
              <li>
                <Link href="/blog" className="text-gray-600 hover:text-primary transition-colors text-sm">
                  Blog
                </Link>
              </li>
              <li>
                <Link href="/reviews" className="text-gray-600 hover:text-primary transition-colors text-sm">
                  Reviews
                </Link>
              </li>
              <li>
                <Link href="/faq" className="text-gray-600 hover:text-primary transition-colors text-sm">
                  FAQ
                </Link>
              </li>
              <li>
                <Link href="/contact" className="text-gray-600 hover:text-primary transition-colors text-sm">
                  Contact
                </Link>
              </li>
              <li>
                <Link href="/ser-socio" className="text-gray-600 hover:text-primary transition-colors text-sm">
                  Partner With Us
                </Link>
              </li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h4 className="font-serif text-warm mb-4">Legal</h4>
            <ul className="space-y-2">
              <li>
                <Link href="/privacy" className="text-gray-600 hover:text-primary transition-colors text-sm">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link href="/terms" className="text-gray-600 hover:text-primary transition-colors text-sm">
                  Terms and Conditions
                </Link>
              </li>
              <li>
                <Link href="/complaint-policy" className="text-gray-600 hover:text-primary transition-colors text-sm">
                  Complaint Policy
                </Link>
              </li>
              <li>
                <Link href="/patient-rights" className="text-gray-600 hover:text-primary transition-colors text-sm">
                  Patient Rights
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Trust Badges */}
        <div className="border-t border-gray-200 mt-8 pt-8">
          <div className="flex flex-wrap items-center justify-center space-x-8 space-y-4">
            <div className="flex items-center space-x-2 text-gray-600">
              <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                <span className="text-white text-xs font-bold">✓</span>
              </div>
              <span className="text-sm">FDA Approved</span>
            </div>
            <div className="flex items-center space-x-2 text-gray-600">
              <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
                <span className="text-white text-xs font-bold">🛡</span>
              </div>
              <span className="text-sm">Insurance Covered</span>
            </div>
            <div className="flex items-center space-x-2 text-gray-600">
              <div className="w-6 h-6 bg-purple-500 rounded-full flex items-center justify-center">
                <span className="text-white text-xs font-bold">⭐</span>
              </div>
              <span className="text-sm">6+ Years of Excellence</span>
            </div>
          </div>
        </div>

        {/* Copyright */}
        <div className="border-t border-gray-200 mt-8 pt-8 text-center">
          <p className="text-gray-500 text-sm">
            © {new Date().getFullYear()} Mommy Care Kit. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
