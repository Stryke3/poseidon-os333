'use client';

import { useState } from 'react';
import { Phone, Mail, MapPin, Clock, Send } from 'lucide-react';

export default function ContactPage() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    message: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState('');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    // Simulate form submission
    setTimeout(() => {
      setSubmitMessage('¡Gracias por tu mensaje! Te responderemos en 24-48 horas.');
      setIsSubmitting(false);
      
      // Track form submission
      if (typeof window !== 'undefined' && window.trackFormSubmission) {
        window.trackFormSubmission('Contact Form');
      }
      
      setFormData({ name: '', email: '', phone: '', message: '' });
    }, 2000);
  };

  return (
    <div className="min-h-screen bg-warm">
      {/* Hero Section */}
      <section className="py-16 bg-gradient-to-br from-primary/20 to-accent/20">
        <div className="container mx-auto px-4">
          <div className="text-center">
            {/* Logo */}
            <div className="flex justify-center mb-6">
              <img 
                src="/assets/mommy-care-logo.png" 
                alt="Mommy Care Kit Logo" 
                className="w-16 h-16"
              />
            </div>
            <h1 className="text-4xl md:text-5xl font-serif text-warm mb-6">
              Contacto
            </h1>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto mb-8">
              Estamos aquí para ayudarte. Nuestro equipo bilingüe está listo para responder todas tus preguntas 
              sobre el kit de cuidado para mamá.
            </p>
            <div className="bg-accent/20 rounded-2xl p-6 max-w-2xl mx-auto">
              <div className="flex items-center justify-center space-x-2 text-accent">
                <span className="text-2xl">🌟</span>
                <span className="font-semibold text-warm">Hablamos Español - Atención en tu idioma</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Contact Content */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 max-w-6xl mx-auto">
            
            {/* Contact Form */}
            <div className="bg-white rounded-2xl shadow-xl p-8">
              <h2 className="text-2xl font-serif text-warm mb-6">
                Envíanos un Mensaje
              </h2>
              
              {submitMessage && (
                <div className="bg-green-100 text-green-800 p-4 rounded-lg mb-6">
                  {submitMessage}
                </div>
              )}
              
              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
                    Nombre Completo *
                  </label>
                  <input
                    type="text"
                    id="name"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    required
                    className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-secondary focus:border-transparent"
                    placeholder="Tu nombre completo"
                  />
                </div>
                
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                    Correo Electrónico *
                  </label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    required
                    className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-secondary focus:border-transparent"
                    placeholder="tu@email.com"
                  />
                </div>
                
                <div>
                  <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-2">
                    Teléfono (Opcional)
                  </label>
                  <input
                    type="tel"
                    id="phone"
                    name="phone"
                    value={formData.phone}
                    onChange={handleChange}
                    className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-secondary focus:border-transparent"
                    placeholder="(555) 123-4567"
                  />
                </div>
                
                <div>
                  <label htmlFor="message" className="block text-sm font-medium text-gray-700 mb-2">
                    Mensaje *
                  </label>
                  <textarea
                    id="message"
                    name="message"
                    value={formData.message}
                    onChange={handleChange}
                    required
                    rows={6}
                    className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-secondary focus:border-transparent"
                    placeholder="Cuéntanos cómo podemos ayudarte..."
                  />
                </div>
                
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full bg-secondary text-white py-3 rounded-lg hover:bg-opacity-90 transition-colors font-medium flex items-center justify-center space-x-2 disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      <span>Enviando...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-5 h-5" />
                      <span>Enviar Mensaje</span>
                    </>
                  )}
                </button>
              </form>
            </div>

            {/* Contact Information */}
            <div className="space-y-8">
              {/* Direct Contact */}
              <div className="bg-white rounded-2xl shadow-xl p-8">
                <h2 className="text-2xl font-serif text-warm mb-6">
                  Contacto Directo
                </h2>
                
                <div className="space-y-6">
                  <div className="flex items-start space-x-4">
                    <div className="w-10 h-10 bg-secondary/20 rounded-full flex items-center justify-center flex-shrink-0">
                      <Phone className="w-5 h-5 text-secondary" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-warm mb-1">Teléfono</h3>
                      <p className="text-gray-600 mb-1">(888) 464-9015</p>
                      <p className="text-sm text-gray-500">Lunes a Viernes: 9 AM - 6 PM EST</p>
                    </div>
                  </div>
                  
                  <div className="flex items-start space-x-4">
                    <div className="w-10 h-10 bg-secondary/20 rounded-full flex items-center justify-center flex-shrink-0">
                      <Mail className="w-5 h-5 text-secondary" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-warm mb-1">Correo Electrónico</h3>
                      <p className="text-gray-600">hola@elkitdecuidado.com</p>
                      <p className="text-sm text-gray-500">Respuesta en 24-48 horas</p>
                    </div>
                  </div>
                  
                  <div className="flex items-start space-x-4">
                    <div className="w-10 h-10 bg-secondary/20 rounded-full flex items-center justify-center flex-shrink-0">
                      <Clock className="w-5 h-5 text-secondary" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-warm mb-1">Horarios de Atención</h3>
                      <p className="text-gray-600">Lunes - Viernes: 9:00 AM - 6:00 PM EST</p>
                      <p className="text-gray-600">Sábado: 10:00 AM - 2:00 PM EST</p>
                      <p className="text-sm text-gray-500">Servicio en español disponible</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="bg-accent/20 rounded-2xl p-8">
                <h2 className="text-xl font-serif text-warm mb-4">
                  ¿Necesitas Ayuda Inmediata?
                </h2>
                <div className="space-y-4">
                  <a 
                    href="https://www.mommycarekits.com/mommycarekit?src=scancenter"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block bg-secondary text-white text-center py-3 rounded-lg hover:bg-opacity-90 transition-colors font-medium"
                  >
                    Verificar si Califico
                  </a>
                  <a 
                    href="/preguntas-frecuentes"
                    className="block bg-white text-secondary text-center py-3 rounded-lg border-2 border-secondary hover:bg-secondary hover:text-white transition-colors font-medium"
                  >
                    Ver Preguntas Frecuentes
                  </a>
                </div>
              </div>

              {/* Emergency Info */}
              <div className="bg-red-50 border border-red-200 rounded-2xl p-6">
                <h3 className="font-semibold text-red-800 mb-2">
                  Emergencias Médicas
                </h3>
                <p className="text-red-700 text-sm">
                  Si tienes una emergencia médica, llama al 911 o contacta a tu médico de inmediato. 
                  Nuestro equipo no puede atender emergencias médicas.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Preview */}
      <section className="py-16 bg-warm">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-serif text-warm mb-4">
              Preguntas Comunes
            </h2>
            <p className="text-gray-600 max-w-2xl mx-auto">
              Revisa nuestras respuestas a las preguntas más frecuentes
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            <div className="bg-white rounded-xl shadow-lg p-6 text-center">
              <h3 className="font-semibold text-warm mb-2">¿Es gratis el kit?</h3>
              <p className="text-gray-600 text-sm">
                Sí, cubierto por la mayoría de seguros. Te avisamos si hay costos.
              </p>
            </div>
            <div className="bg-white rounded-xl shadow-lg p-6 text-center">
              <h3 className="font-semibold text-warm mb-2">¿Cuánto tarda?</h3>
              <p className="text-gray-600 text-sm">
                Una vez aprobado, el kit llega en 3-5 días hábiles.
              </p>
            </div>
            <div className="bg-white rounded-xl shadow-lg p-6 text-center">
              <h3 className="font-semibold text-warm mb-2">¿Hablan español?</h3>
              <p className="text-gray-600 text-sm">
                ¡Sí! Todo nuestro equipo habla español y puede atenderte en tu idioma.
              </p>
            </div>
          </div>
          
          <div className="text-center mt-8">
            <a 
              href="/preguntas-frecuentes"
              className="inline-flex items-center space-x-2 text-secondary font-medium hover:text-secondary/80 transition-colors"
            >
              <span>Ver todas las preguntas frecuentes</span>
              <span>→</span>
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
