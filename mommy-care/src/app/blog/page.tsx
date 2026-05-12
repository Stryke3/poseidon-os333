import Link from 'next/link';
import Image from 'next/image';

const blogPosts = [
  {
    id: 1,
    title: "10 Alimentos Superiores para un Embarazo Saludable",
    excerpt: "Descubre los alimentos esenciales que nutren a ti y a tu bebé durante el embarazo, con opciones fáciles de encontrar en cualquier supermercado latino.",
    category: "Nutrición",
    date: "15 de abril, 2026",
    readTime: "5 min",
    imageAlt: "Alimentos saludables para embarazo",
    featured: true
  },
  {
    id: 2,
    title: "Cómo Manejar el Dolor de Espalda Durante el Embarazo",
    excerpt: "Consejos prácticos y ejercicios seguros para aliviar el dolor de espalda, uno de los malestares más comunes en el embarazo.",
    category: "Bienestar",
    date: "10 de abril, 2026",
    readTime: "7 min",
    imageAlt: "Mujer embarazada con dolor de espalda"
  },
  {
    id: 3,
    title: "Guía de Segunda Trimestre: Lo que Necesitas Saber",
    excerpt: "El segundo trimestre trae muchos cambios. Te explicamos qué esperar y cómo prepararte para la etapa final del embarazo.",
    category: "Embarazo",
    date: "5 de abril, 2026",
    readTime: "8 min",
    imageAlt: "Mujer en segundo trimestre de embarazo"
  },
  {
    id: 4,
    title: "Lactancia: Consejos para las Primeras Semanas",
    excerpt: "Todo lo que necesitas saber sobre la lactancia materna, desde la técnica correcta hasta cómo aumentar tu producción de leche.",
    category: "Lactancia",
    date: "1 de abril, 2026",
    readTime: "6 min",
    imageAlt: "Mamá lactando a su bebé"
  },
  {
    id: 5,
    title: "Ejercicios Seguros Durante el Embarazo",
    excerpt: "Mantente activa y saludable con estos ejercicios aprobados por médicos para cada etapa del embarazo.",
    category: "Bienestar",
    date: "28 de marzo, 2026",
    readTime: "10 min",
    imageAlt: "Mujer embarazada haciendo ejercicios"
  },
  {
    id: 6,
    title: "Preparando el Hogar para la Llegada del Bebé",
    excerpt: "Una guía completa para preparar tu hogar y tu vida para la llegada de tu bebé, con consejos prácticos y organizacionales.",
    category: "Posparto",
    date: "25 de marzo, 2026",
    readTime: "12 min",
    imageAlt: "Hogar preparado para bebé"
  }
];

const categories = ["Todos", "Embarazo", "Posparto", "Lactancia", "Bienestar", "Nutrición"];

export default function BlogPage() {
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
              Blog para Mamás
            </h1>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto mb-8">
              Consejos, guías y apoyo para cada etapa de tu embarazo y maternidad. 
              Escrito por expertos, pensado para ti.
            </p>
            <a 
              href="https://www.mommycarekits.com/mommycarekit?src=scancenter"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center space-x-2 bg-secondary text-white px-8 py-3 rounded-full hover:bg-opacity-90 transition-colors font-medium"
            >
              <span>Obtén tu Kit Gratuito</span>
            </a>
          </div>
        </div>
      </section>

      {/* Category Filter */}
      <section className="py-8">
        <div className="container mx-auto px-4">
          <div className="flex flex-wrap justify-center gap-2">
            {categories.map((category) => (
              <button
                key={category}
                className="px-4 py-2 rounded-full text-sm font-medium transition-colors bg-white text-gray-600 hover:bg-gray-100"
              >
                {category}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Featured Post */}
      <section className="py-8">
        <div className="container mx-auto px-4">
          {blogPosts.filter(post => post.featured).map((post) => (
            <div key={post.id} className="bg-white rounded-3xl shadow-xl overflow-hidden mb-12">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="relative h-64 lg:h-auto">
                  <Image
                    src="/assets/mommy-care-logo.png"
                    alt={post.imageAlt}
                    fill
                    className="object-cover"
                  />
                </div>
                <div className="p-8 lg:p-12 flex flex-col justify-center">
                  <div className="flex items-center space-x-3 mb-4">
                    <span className="bg-secondary text-white text-xs px-3 py-1 rounded-full font-medium">
                      Destacado
                    </span>
                    <span className="bg-primary/20 text-primary text-xs px-3 py-1 rounded-full font-medium">
                      {post.category}
                    </span>
                  </div>
                  <h2 className="text-3xl font-serif text-warm mb-4">
                    {post.title}
                  </h2>
                  <p className="text-gray-600 mb-6 leading-relaxed">
                    {post.excerpt}
                  </p>
                  <div className="flex items-center justify-between mb-6">
                    <div className="text-sm text-gray-500">
                      {post.date} • {post.readTime} de lectura
                    </div>
                  </div>
                  <Link 
                    href={`/blog/${post.id}`}
                    className="inline-flex items-center space-x-2 text-secondary font-medium hover:text-secondary/80 transition-colors"
                  >
                    <span>Leer artículo completo</span>
                    <span>→</span>
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Blog Grid */}
      <section className="py-8">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {blogPosts.filter(post => !post.featured).map((post) => (
              <article key={post.id} className="bg-white rounded-2xl shadow-lg overflow-hidden hover:shadow-xl transition-shadow">
                <div className="relative h-48">
                  <Image
                    src="/assets/mommy-care-logo.png"
                    alt={post.imageAlt}
                    fill
                    className="object-cover"
                  />
                  <div className="absolute top-4 left-4">
                    <span className="bg-primary/20 text-primary text-xs px-3 py-1 rounded-full font-medium">
                      {post.category}
                    </span>
                  </div>
                </div>
                
                <div className="p-6">
                  <h3 className="text-xl font-serif text-warm mb-3 line-clamp-2">
                    {post.title}
                  </h3>
                  <p className="text-gray-600 text-sm mb-4 line-clamp-3">
                    {post.excerpt}
                  </p>
                  <div className="flex items-center justify-between text-sm text-gray-500 mb-4">
                    <span>{post.date}</span>
                    <span>{post.readTime} de lectura</span>
                  </div>
                  <Link 
                    href={`/blog/${post.id}`}
                    className="text-secondary font-medium hover:text-secondary/80 transition-colors text-sm"
                  >
                    Leer más →
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Newsletter CTA */}
      <section className="py-16 bg-accent/20">
        <div className="container mx-auto px-4">
          <div className="max-w-2xl mx-auto text-center">
            <h2 className="text-3xl font-serif text-warm mb-4">
              Recibe Consejos Semanales en tu Email
            </h2>
            <p className="text-gray-600 mb-8">
              Únete a miles de mamás que reciben nuestros consejos semanales sobre embarazo, 
              posparto y cuidado del bebé. Todo en español.
            </p>
            
            <form className="flex flex-col sm:flex-row gap-4 max-w-md mx-auto">
              <input
                type="email"
                placeholder="Tu email"
                className="flex-1 px-4 py-3 rounded-full border border-gray-300 focus:outline-none focus:ring-2 focus:ring-secondary"
                required
              />
              <button
                type="submit"
                className="bg-secondary text-white px-6 py-3 rounded-full hover:bg-opacity-90 transition-colors font-medium"
              >
                Suscribirse
              </button>
            </form>
            
            <p className="text-sm text-gray-500 mt-4">
              Prometemos no enviar spam. Puedes cancelar cuando quieras.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
