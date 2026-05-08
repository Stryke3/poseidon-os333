import Link from 'next/link';
import { CheckCircle, Users, TrendingUp, Shield, Heart, Award } from 'lucide-react';

export default function PartnerPage() {
  const benefits = [
    {
      icon: Users,
      title: "Expande tu Alcance",
      description: "Ofrece un valor adicional a tus pacientes y atrae nuevos clientes con un servicio diferenciador."
    },
    {
      icon: TrendingUp,
      title: "Incrementa Ingresos",
      description: "Genera ingresos adicionales a través de nuestro programa de referidos sin costo inicial."
    },
    {
      icon: Shield,
      title: "Producto Confiable",
      description: "Todos nuestros productos están aprobados por la FDA y cuentan con respaldo médico."
    },
    {
      icon: Heart,
      title: "Mejora Resultados",
      description: "Ayuda a tus pacientes a tener embarazos más saludables con productos preventivos."
    },
    {
      icon: Award,
      title: "Reconocimiento",
      description: "Únete a una red de proveedores de salud comprometidos con la excelencia maternal."
    },
    {
      icon: CheckCircle,
      title: "Proceso Simple",
      description: "Implementación fácil con capacitación completa y soporte continuo."
    }
  ];

  const stats = [
    { value: "500+", label: "Proveedores Activos" },
    { value: "50,000+", label: "Pacientes Ayudados" },
    { value: "98%", label: "Satisfacción" },
    { value: "24/7", label: "Soporte" }
  ];

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
              Sé Socio de El Kit de Cuidado
            </h1>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto mb-8">
              Únete a nuestra red de proveedores médicos y clínicas que están transformando el cuidado maternal. 
              Ofrece a tus pacientes productos premium cubiertos por seguro mientras creces tu práctica.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <a 
                href="https://www.mommycarekits.com/ScanCenter/SignUp"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center space-x-2 bg-secondary text-white px-8 py-4 rounded-full hover:bg-opacity-90 transition-colors font-medium text-lg shadow-lg"
              >
                <span>Registrarse como Socio</span>
              </a>
              <a 
                href="#contacto-socios"
                className="inline-flex items-center space-x-2 border-2 border-primary text-primary px-8 py-4 rounded-full hover:bg-primary hover:text-white transition-colors font-medium text-lg"
              >
                <span>Saber Más</span>
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-16 bg-warm">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 max-w-4xl mx-auto">
            {stats.map((stat, index) => (
              <div key={index} className="text-center">
                <div className="text-4xl font-bold text-secondary mb-2">{stat.value}</div>
                <div className="text-gray-600">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="py-16 bg-warm">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-serif text-warm mb-4">
              Beneficios de Ser Socio
            </h2>
            <p className="text-gray-600 max-w-2xl mx-auto">
              Descubre por qué más de 500 proveedores ya confían en nuestro programa
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {benefits.map((benefit, index) => {
              const Icon = benefit.icon;
              return (
                <div key={index} className="bg-white rounded-2xl shadow-lg p-8 hover:shadow-xl transition-shadow">
                  <div className="w-16 h-16 bg-secondary/20 rounded-full flex items-center justify-center mb-6">
                    <Icon className="w-8 h-8 text-secondary" />
                  </div>
                  <h3 className="text-xl font-serif text-warm mb-4">{benefit.title}</h3>
                  <p className="text-gray-600 leading-relaxed">{benefit.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-16 bg-accent/20">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-serif text-warm mb-4">
              Cómo Funciona el Programa
            </h2>
            <p className="text-gray-600 max-w-2xl mx-auto">
              Un proceso simple para comenzar a ofrecer el kit a tus pacientes
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            <div className="text-center">
              <div className="w-16 h-16 bg-secondary text-white rounded-full flex items-center justify-center mx-auto mb-6 text-2xl font-bold">
                1
              </div>
              <h3 className="text-xl font-serif text-warm mb-3">Regístrate</h3>
              <p className="text-gray-600">
                Completa el formulario de registro y verifica tu credencial médica. Proceso takes 5-10 minutos.
              </p>
            </div>
            
            <div className="text-center">
              <div className="w-16 h-16 bg-secondary text-white rounded-full flex items-center justify-center mx-auto mb-6 text-2xl font-bold">
                2
              </div>
              <h3 className="text-xl font-serif text-warm mb-3">Capacitación</h3>
              <p className="text-gray-600">
                Recibe capacitación completa sobre los productos y el proceso de referencia.
              </p>
            </div>
            
            <div className="text-center">
              <div className="w-16 h-16 bg-secondary text-white rounded-full flex items-center justify-center mx-auto mb-6 text-2xl font-bold">
                3
              </div>
              <h3 className="text-xl font-serif text-warm mb-3">Comienza a Referir</h3>
              <p className="text-gray-600">
                Empieza a referir pacientes y recibe comisiones por cada kit aprobado.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Who Can Join */}
      <section className="py-16 bg-warm">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-serif text-warm mb-4">
              ¿Quién Puede Ser Socio?
            </h2>
            <p className="text-gray-600 max-w-2xl mx-auto">
              Trabajamos con una variedad de profesionales de la salud
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {[
              "Médicos Obstetras/Ginecólogos",
              "Enfermeras Practicantes",
              "Parteras Certificadas",
              "Doulas y Doula de Posparto",
              "Clínicas de Salud Maternal",
              "Centros de Atención Prenatal"
            ].map((specialty, index) => (
              <div key={index} className="bg-white rounded-xl shadow-md p-6 text-center">
                <div className="w-12 h-12 bg-primary/20 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle className="w-6 h-6 text-primary" />
                </div>
                <h3 className="font-medium text-warm">{specialty}</h3>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-16 bg-warm">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-serif text-warm mb-4">
              Testimonios de Socios
            </h2>
            <p className="text-gray-600 max-w-2xl mx-auto">
              Escucha lo que dicen nuestros socios sobre el programa
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            <div className="bg-white rounded-2xl shadow-lg p-8">
              <div className="flex items-center space-x-1 mb-4">
                {[...Array(5)].map((_, i) => (
                  <span key={i} className="text-yellow-400">★</span>
                ))}
              </div>
              <p className="text-gray-600 mb-6 leading-relaxed">
                "El programa ha transformado mi práctica. Mis pacientes están más felices y yo he incrementado mis ingresos significativamente. El soporte del equipo es excepcional."
              </p>
              <div>
                <h4 className="font-semibold text-warm">Dra. María Sánchez</h4>
                <p className="text-sm text-gray-500">Obstetra, Houston TX</p>
              </div>
            </div>
            
            <div className="bg-white rounded-2xl shadow-lg p-8">
              <div className="flex items-center space-x-1 mb-4">
                {[...Array(5)].map((_, i) => (
                  <span key={i} className="text-yellow-400">★</span>
                ))}
              </div>
              <p className="text-gray-600 mb-6 leading-relaxed">
                "Como doula, poder ofrecer el kit a mis clientas ha sido increíble. Veo resultados reales en su bienestar durante el embarazo. Recomiendo 100% el programa."
              </p>
              <div>
                <h4 className="font-semibold text-warm">Ana Morales</h4>
                <p className="text-sm text-gray-500">Doula Certificada, Los Angeles CA</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section id="contacto-socios" className="py-20 bg-secondary">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-4xl font-serif text-white mb-6">
            ¿Listo para Transformar tu Práctica?
          </h2>
          <p className="text-white/90 text-lg mb-8 max-w-2xl mx-auto">
            Únete a cientos de proveedores que ya están mejorando la salud maternal 
            y creciendo sus ingresos con nuestro programa.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a 
              href="https://www.mommycarekits.com/ScanCenter/SignUp"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center space-x-2 bg-white text-secondary px-8 py-4 rounded-full hover:bg-gray-100 transition-colors font-medium text-lg shadow-xl"
            >
              <span>Registrarse Ahora</span>
            </a>
            <Link 
              href="/contacto"
              className="inline-flex items-center space-x-2 border-2 border-white text-white px-8 py-4 rounded-full hover:bg-white hover:text-secondary transition-colors font-medium text-lg"
            >
              <span>Contactar Ventas</span>
            </Link>
          </div>
          <p className="text-white/80 text-sm mt-6">
            Sin costo de registro • Comisiones competitivas • Soporte completo
          </p>
        </div>
      </section>

      {/* FAQ Preview */}
      <section className="py-16 bg-warm">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-serif text-warm mb-4">
              Preguntas Frecuentes para Socios
            </h2>
            <p className="text-gray-600 max-w-2xl mx-auto">
              Resolvemos tus dudas sobre el programa de socios
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            <div className="bg-white rounded-xl shadow-lg p-6">
              <h3 className="font-semibold text-warm mb-3">¿Hay costo para registrarme?</h3>
              <p className="text-gray-600 text-sm">
                No, el registro es completamente gratuito. Solo ganas cuando tus pacientes reciben sus kits.
              </p>
            </div>
            
            <div className="bg-white rounded-xl shadow-lg p-6">
              <h3 className="font-semibold text-warm mb-3">¿Cuánto puedo ganar?</h3>
              <p className="text-gray-600 text-sm">
                Las comisiones varían según el volumen. Contacta a nuestro equipo de ventas para detalles específicos.
              </p>
            </div>
            
            <div className="bg-white rounded-xl shadow-lg p-6">
              <h3 className="font-semibold text-warm mb-3">¿Qué soporte reciben?</h3>
              <p className="text-gray-600 text-sm">
                Ofrecemos capacitación completa, materiales de marketing y soporte técnico 24/7.
              </p>
            </div>
            
            <div className="bg-white rounded-xl shadow-lg p-6">
              <h3 className="font-semibold text-warm mb-3">¿Puedo referir pacientes sin seguro?</h3>
              <p className="text-gray-600 text-sm">
                Sí, tenemos opciones para pacientes sin seguro o con planes que no cubren el kit.
              </p>
            </div>
          </div>
          
          <div className="text-center mt-8">
            <Link 
              href="/contacto"
              className="inline-flex items-center space-x-2 text-secondary font-medium hover:text-secondary/80 transition-colors"
            >
              <span>Más preguntas? Contáctanos</span>
              <span>→</span>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
