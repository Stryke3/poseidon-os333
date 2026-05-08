import { Shield, Star, Award, Users } from 'lucide-react';

const trustItems = [
  {
    icon: Shield,
    title: "FDA-Cleared",
    description: "All our products meet safety standards"
  },
  {
    icon: Star,
    title: "4.9/5 Stars",
    description: "Over 50,000 satisfied mothers"
  },
  {
    icon: Award,
    title: "6+ Years of Excellence",
    description: "Leaders in maternal care"
  },
  {
    icon: Users,
    title: "English Support",
    description: "We speak English, we understand you"
  }
];

export default function TrustBar() {
  return (
    <section className="py-12 bg-gradient-to-r from-primary/10 to-accent/10">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
          {trustItems.map((item, index) => {
            const Icon = item.icon;
            return (
              <div key={index} className="text-center">
                <div className="w-16 h-16 bg-white rounded-full shadow-lg flex items-center justify-center mx-auto mb-4">
                  <Icon className="w-8 h-8 text-secondary" />
                </div>
                <h3 className="font-semibold text-warm mb-2">{item.title}</h3>
                <p className="text-sm text-gray-600 max-w-xs mx-auto">{item.description}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
