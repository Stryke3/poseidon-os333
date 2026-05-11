import { CheckCircle, FileCheck, Package, Heart } from 'lucide-react';

const steps = [
  {
    icon: FileCheck,
    title: "Complete the Form",
    description: "Answer a few simple questions about your pregnancy and insurance. Takes just 5 minutes.",
    detail: "Safe and secure"
  },
  {
    icon: CheckCircle,
    title: "We Verify Your Coverage",
    description: "Our team checks your coverage and confirms if you qualify — at no cost to you.",
    detail: "Response within 24–48 hours"
  },
  {
    icon: Package,
    title: "Receive Your Kit",
    description: "Your kit ships directly to your door with clear instructions included.",
    detail: "Free shipping in 3–5 days"
  }
];

export default function StepTimeline() {
  return (
    <section id="como-funciona" className="py-16 bg-warm">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-serif text-warm mb-4">
            How It Works
          </h2>
          <p className="text-gray-600 max-w-2xl mx-auto">
            Getting your Mommy Care Kit is simple. Three easy steps and you're on your way to a more comfortable pregnancy.
          </p>
        </div>

        {/* Desktop Timeline */}
        <div className="hidden lg:block">
          <div className="relative">
            {/* Timeline Line */}
            <div className="absolute top-1/2 left-0 right-0 h-1 bg-gradient-to-r from-primary via-secondary to-accent transform -translate-y-1/2"></div>
            
            <div className="grid grid-cols-3 gap-8 relative">
              {steps.map((step, index) => {
                const Icon = step.icon;
                return (
                  <div key={index} className="relative">
                    {/* Circle with number */}
                    <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-12 h-12 bg-white border-4 border-secondary rounded-full flex items-center justify-center z-10">
                      <span className="text-secondary font-bold">{index + 1}</span>
                    </div>
                    
                    {/* Content */}
                    <div className="bg-white rounded-2xl shadow-lg p-8 pt-16 text-center">
                      <div className="w-16 h-16 bg-primary/20 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Icon className="w-8 h-8 text-primary" />
                      </div>
                      <h3 className="text-xl font-serif text-warm mb-3">{step.title}</h3>
                      <p className="text-gray-600 mb-3">{step.description}</p>
                      <p className="text-sm text-secondary font-medium">{step.detail}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Mobile Timeline */}
        <div className="lg:hidden space-y-8">
          {steps.map((step, index) => {
            const Icon = step.icon;
            return (
              <div key={index} className="relative">
                {/* Step Number */}
                <div className="flex items-start space-x-4">
                  <div className="flex-shrink-0">
                    <div className="w-12 h-12 bg-secondary rounded-full flex items-center justify-center">
                      <span className="text-white font-bold">{index + 1}</span>
                    </div>
                    {index < steps.length - 1 && (
                      <div className="w-0.5 h-20 bg-gray-300 mx-auto mt-2"></div>
                    )}
                  </div>
                  
                  {/* Content */}
                  <div className="flex-1 bg-white rounded-xl shadow-lg p-6">
                    <div className="flex items-center space-x-3 mb-3">
                      <div className="w-10 h-10 bg-primary/20 rounded-full flex items-center justify-center">
                        <Icon className="w-5 h-5 text-primary" />
                      </div>
                      <h3 className="text-lg font-serif text-warm">{step.title}</h3>
                    </div>
                    <p className="text-gray-600 text-sm mb-2">{step.description}</p>
                    <p className="text-xs text-secondary font-medium">{step.detail}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Important Note */}
        <div className="mt-12 bg-accent/20 rounded-2xl p-8 max-w-3xl mx-auto">
          <div className="flex items-start space-x-3">
            <Heart className="w-6 h-6 text-accent flex-shrink-0 mt-1" />
            <div>
              <h4 className="font-semibold text-warm mb-2">Importante:</h4>
              <p className="text-gray-600 text-sm leading-relaxed">
                We'll let you know if there's any cost before shipping your kit. You always have the option to decide whether to continue.
                No surprises, no hidden charges. Your peace of mind is our priority.
              </p>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="text-center mt-12">
          <a 
            href="https://www.mommycarekits.com/mommycarekit?src=scancenter"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center space-x-2 bg-secondary text-white px-8 py-4 rounded-full hover:bg-opacity-90 transition-colors font-medium text-lg shadow-lg"
          >
            <span>Get Started Now</span>
          </a>
          <p className="text-sm text-gray-500 mt-3">
            Just 5 minutes to change your pregnancy experience
          </p>
        </div>
      </div>
    </section>
  );
}
