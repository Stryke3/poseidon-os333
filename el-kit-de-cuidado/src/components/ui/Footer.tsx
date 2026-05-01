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
                src="/assets/mommy-care-logo.png" 
                alt="Mommy Care Kit Logo" 
                className="w-10 h-10"
              />
              <div>
                <h3 className="text-lg font-serif text-warm">El Kit de Cuidado</h3>
                <p className="text-sm text-gray-600">para Mamá</p>
              </div>
            </div>
            <p className="text-gray-600 mb-4 max-w-md">
              Productos aprobados por la FDA para tu embarazo y posparto, cubiertos por la mayoría de seguros médicos. 
              Porque tu bienestar importa.
            </p>
            <div className="space-y-2">
              <div className="flex items-center space-x-2 text-gray-600">
                <Phone className="w-4 h-4" />
                <span className="text-sm">(888) 464-9015</span>
              </div>
              <div className="flex items-center space-x-2 text-gray-600">
                <Mail className="w-4 h-4" />
                <span className="text-sm">hola@elkitdecuidado.com</span>
              </div>
              <div className="flex items-center space-x-2 text-accent">
                <MapPin className="w-4 h-4" />
                <span className="text-sm font-medium">Hablamos Español</span>
              </div>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="font-serif text-warm mb-4">Enlaces Rápidos</h4>
            <ul className="space-y-2">
              <li>
                <Link href="/" className="text-gray-600 hover:text-primary transition-colors text-sm">
                  Inicio
                </Link>
              </li>
              <li>
                <Link href="/blog" className="text-gray-600 hover:text-primary transition-colors text-sm">
                  Blog
                </Link>
              </li>
              <li>
                <Link href="/resenas" className="text-gray-600 hover:text-primary transition-colors text-sm">
                  Reseñas
                </Link>
              </li>
              <li>
                <Link href="/preguntas-frecuentes" className="text-gray-600 hover:text-primary transition-colors text-sm">
                  Preguntas Frecuentes
                </Link>
              </li>
              <li>
                <Link href="/contacto" className="text-gray-600 hover:text-primary transition-colors text-sm">
                  Contacto
                </Link>
              </li>
              <li>
                <Link href="/ser-socio" className="text-gray-600 hover:text-primary transition-colors text-sm">
                  Ser Socio
                </Link>
              </li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h4 className="font-serif text-warm mb-4">Legal</h4>
            <ul className="space-y-2">
              <li>
                <Link href="/privacidad" className="text-gray-600 hover:text-primary transition-colors text-sm">
                  Política de Privacidad
                </Link>
              </li>
              <li>
                <Link href="/terminos" className="text-gray-600 hover:text-primary transition-colors text-sm">
                  Términos y Condiciones
                </Link>
              </li>
              <li>
                <Link href="/politica-quejas" className="text-gray-600 hover:text-primary transition-colors text-sm">
                  Política de Quejas
                </Link>
              </li>
              <li>
                <Link href="/derechos-paciente" className="text-gray-600 hover:text-primary transition-colors text-sm">
                  Derechos del Paciente
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
              <span className="text-sm">Aprobado por FDA</span>
            </div>
            <div className="flex items-center space-x-2 text-gray-600">
              <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
                <span className="text-white text-xs font-bold">🛡</span>
              </div>
              <span className="text-sm">Cubierto por Seguros</span>
            </div>
            <div className="flex items-center space-x-2 text-gray-600">
              <div className="w-6 h-6 bg-purple-500 rounded-full flex items-center justify-center">
                <span className="text-white text-xs font-bold">⭐</span>
              </div>
              <span className="text-sm">6+ Años de Excelencia</span>
            </div>
          </div>
        </div>

        {/* Copyright */}
        <div className="border-t border-gray-200 mt-8 pt-8 text-center">
          <p className="text-gray-500 text-sm">
            © {new Date().getFullYear()} El Kit de Cuidado para Mamá. Todos los derechos reservados.
          </p>
        </div>
      </div>
    </footer>
  );
}
