'use client';

import { useState, useEffect } from 'react';
import { Menu, X, Check, Activity, Shield, Package, Truck, FileText } from 'lucide-react';

export default function HomePage() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [activeWorkflowStep, setActiveWorkflowStep] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveWorkflowStep((prev) => (prev + 1) % 6);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const workflowSteps = [
    { id: 'clinical', label: 'Clinical Trigger', icon: Activity, status: 'Pathway Initiated' },
    { id: 'eligibility', label: 'Eligibility Verification', icon: Shield, status: 'Pathway Verified' },
    { id: 'documentation', label: 'Documentation Generation', icon: FileText, status: 'Documentation Ready' },
    { id: 'pathway', label: 'Product Pathway Selection', icon: Package, status: 'Product Selected' },
    { id: 'fulfillment', label: 'Fulfillment Coordination', icon: Truck, status: 'Fulfillment Coordinated' },
    { id: 'pod', label: 'POD Capture', icon: Check, status: 'POD Captured' },
  ];

  return (
    <div className="min-h-screen bg-spear-bg text-spear-ivory relative overflow-hidden">
      <div className="fixed inset-0 opacity-10 pointer-events-none">
        <div 
          className="absolute inset-0" 
          style={{
            backgroundImage: 'linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)',
            backgroundSize: '50px 50px'
          }} 
        />
      </div>

      <nav className="fixed top-0 w-full glass-panel z-50">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="flex items-center justify-between h-20">
            <div className="flex items-center">
              <div className="text-2xl font-bold tracking-tight text-spear-white">
                STRYKE<span className="text-spear-gold">FOX</span>
              </div>
              <div className="ml-4 text-xs font-medium text-spear-muted uppercase tracking-wider">
                CAREPATH
              </div>
            </div>

            <div className="hidden lg:flex lg:items-center lg:space-x-10">
              <a href="#carepath" className="nav-link-gloss text-sm font-medium">
                CarePath
              </a>
              <a href="#workflow" className="nav-link-gloss text-sm font-medium">
                Workflow
              </a>
              <a href="#providers" className="nav-link-gloss text-sm font-medium">
                Providers
              </a>
              <a href="#platform" className="nav-link-gloss text-sm font-medium">
                Poseidon + Trident
              </a>
              <a href="#lineage" className="nav-link-gloss text-sm font-medium">
                Healthcare Lineage
              </a>
              <a href="#ecosystem" className="nav-link-gloss text-sm font-medium">
                Ecosystem
              </a>
            </div>

            <button 
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="lg:hidden p-2 text-spear-muted hover:text-spear-white"
            >
              <Menu className="w-6 h-6" />
            </button>
          </div>
        </div>
      </nav>

      <section className="relative min-h-screen flex items-center justify-center bg-gradient-to-br from-spear-bg via-spear-bg-soft to-spear-bg">
        <div className="absolute inset-0 bg-gradient-to-br from-spear-blue/5 via-transparent to-transparent opacity-50" />
        
        <div className="container mx-auto px-6 py-24 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <div className="space-y-8">
              <div className="text-xs font-mono text-spear-gold uppercase tracking-wider">
                STRYKEFOX CAREPATH
              </div>
              
              <h1 className="text-5xl lg:text-7xl font-bold text-spear-white mb-8 leading-tight tracking-tight">
                Verified.<br />Documented.<br />Delivered.
              </h1>
              
              <p className="text-lg lg:text-xl text-spear-muted mb-12 leading-relaxed">
                Care-pathway infrastructure for modern healthcare recovery coordination.
              </p>
              
              <p className="text-spear-muted mb-12 leading-relaxed">
                StrykeFox CarePath helps provider teams coordinate medically necessary recovery products through eligibility verification, documentation control, fulfillment coordination, proof-of-delivery capture, and billing-ready packet generation.
              </p>
              
              <div className="flex flex-col lg:flex-row gap-6 justify-start">
                <a 
                  href="#carepath" 
                  className="btn-gloss"
                >
                  Partner With StrykeFox
                </a>
                <a 
                  href="#workflow" 
                  className="btn-ghost-gloss"
                >
                  See Workflow
                </a>
              </div>
            </div>

            <div className="relative">
              <div className="glass-panel rounded-2xl p-8 shadow-2xl">
                <div className="text-center mb-8">
                  <div className="text-sm font-mono text-spear-gold uppercase tracking-wider mb-6">
                    LIVE WORKFLOW STATUS
                  </div>
                  <h3 className="text-xl font-semibold text-spear-white mb-2">
                    CarePath Coordination System
                  </h3>
                  <p className="text-spear-muted text-sm">
                    Real-time pathway orchestration
                  </p>
                </div>

                <div className="space-y-4">
                  {workflowSteps.map((step, index) => {
                    const Icon = step.icon;
                    const isActive = index === activeWorkflowStep;
                    
                    return (
                      <div key={step.id} className="relative glass-panel rounded-xl p-4 transition-all duration-700">
                        <div className="flex items-center space-x-4">
                          <div className={`relative w-12 h-12 rounded-full flex items-center justify-center transition-all duration-700 ${
                            isActive 
                              ? 'bg-spear-blue shadow-lg shadow-spear-blue/40' 
                              : 'bg-spear-panel'
                          }`}>
                            {isActive && (
                              <div className="absolute inset-0 bg-spear-blue rounded-full animate-pulse opacity-20" />
                            )}
                            <Icon className={
                              isActive ? 'w-6 h-6 text-spear-white transition-all duration-700' : 'w-6 h-6 text-spear-muted transition-all duration-700'
                            } />
                          </div>
                          
                          <div className="flex-1">
                            <div className="flex items-center justify-between mb-1">
                              <h4 className={`font-medium text-spear-white mb-1 transition-all duration-700 ${
                                isActive ? 'text-spear-white' : 'text-spear-muted'
                              }`}>
                                {step.label}
                              </h4>
                              {isActive && (
                                <div className="flex items-center space-x-2">
                                  <div className="w-2 h-2 bg-spear-blue rounded-full animate-pulse" />
                                  <span className="text-xs text-spear-blue font-mono">ACTIVE</span>
                                </div>
                              )}
                            </div>
                            <p className={`text-sm transition-all duration-700 ${
                              isActive ? 'text-spear-muted' : 'text-spear-muted/60'
                            }`}>
                              {index === 0 && 'Clinical trigger detected and pathway initiated'}
                              {index === 1 && 'Eligibility verification in progress with coverage validation'}
                              {index === 2 && 'Documentation generation active with medical necessity establishment'}
                              {index === 3 && 'Product pathway selection complete with fulfillment coordination'}
                              {index === 4 && 'Fulfillment coordination started with delivery logistics management'}
                              {index === 5 && 'Proof of delivery captured with patient receipt confirmation'}
                            </p>
                          </div>
                        </div>
                        
                        {index < workflowSteps.length - 1 && (
                          <div className="absolute left-16 top-12 w-0.5 h-16 -z-10">
                            <div className={`w-full transition-all duration-700 ${
                              isActive || index < activeWorkflowStep 
                                ? 'bg-spear-blue/60' 
                                : 'bg-spear-border'
                            }`} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="mt-8 glass-panel rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-mono text-spear-muted">PATHWAY PROGRESSION</span>
                    <span className="text-sm font-mono text-spear-blue">
                      {Math.round(((activeWorkflowStep + 1) / workflowSteps.length) * 100)}%
                    </span>
                  </div>
                  <div className="w-full bg-spear-panel rounded-full h-2">
                    <div 
                      className="bg-spear-blue h-2 rounded-full transition-all duration-700"
                      style={{ width: `${((activeWorkflowStep + 1) / workflowSteps.length) * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="carepath" className="py-32 bg-gradient-to-b from-spear-bg to-spear-bg-soft">
        <div className="container mx-auto px-6">
          <div className="text-center mb-20">
            <div className="text-sm font-mono text-spear-gold uppercase tracking-wider mb-8">
              CARE-PATHWAY INFRASTRUCTURE
            </div>
            <h2 className="text-4xl lg:text-6xl font-bold text-spear-white mb-8 leading-tight">
              Care-Pathway Infrastructure.
            </h2>
            <p className="text-xl text-spear-muted mb-16 max-w-4xl mx-auto leading-relaxed">
              Different patients require different recovery pathways. CarePath coordinates the operational layer around clinical need: verification, documentation, fulfillment coordination, proof-of-delivery capture, and billing-ready packet preparation.
            </p>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="glass-panel rounded-2xl p-8 hover:border-spear-blue/30 transition-all duration-700">
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-spear-blue/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Shield className="w-8 h-8 text-spear-blue" />
                </div>
                <h3 className="text-xl font-semibold text-spear-white mb-4">
                  Verification
                </h3>
                <p className="text-spear-muted mb-6">
                  Clinical eligibility verification and documentation readiness assessment before pathway initiation.
                </p>
              </div>
              <div className="space-y-3">
                <div className="flex items-center">
                  <div className="w-2 h-2 bg-spear-blue rounded-full flex-shrink-0" />
                  <span className="ml-3 text-spear-muted text-sm">Eligibility Confirmed</span>
                </div>
                <div className="flex items-center">
                  <div className="w-2 h-2 bg-spear-blue rounded-full flex-shrink-0" />
                  <span className="ml-3 text-spear-muted text-sm">Documentation Ready</span>
                </div>
                <div className="flex items-center">
                  <div className="w-2 h-2 bg-spear-blue rounded-full flex-shrink-0" />
                  <span className="ml-3 text-spear-muted text-sm">Pathway Initiated</span>
                </div>
              </div>
            </div>

            <div className="glass-panel rounded-2xl p-8 hover:border-spear-gold/30 transition-all duration-700">
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-spear-gold/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Package className="w-8 h-8 text-spear-gold" />
                </div>
                <h3 className="text-xl font-semibold text-spear-white mb-4">
                  Coordination
                </h3>
                <p className="text-spear-muted mb-6">
                  Product pathway selection, fulfillment coordination, and delivery management across recovery continuum.
                </p>
              </div>
              <div className="space-y-3">
                <div className="flex items-center">
                  <div className="w-2 h-2 bg-spear-gold rounded-full flex-shrink-0" />
                  <span className="ml-3 text-spear-muted text-sm">Product Pathway Selected</span>
                </div>
                <div className="flex items-center">
                  <div className="w-2 h-2 bg-spear-gold rounded-full flex-shrink-0" />
                  <span className="ml-3 text-spear-muted text-sm">Fulfillment Coordinated</span>
                </div>
                <div className="flex items-center">
                  <div className="w-2 h-2 bg-spear-gold rounded-full flex-shrink-0" />
                  <span className="ml-3 text-spear-muted text-sm">Delivery Managed</span>
                </div>
              </div>
            </div>

            <div className="glass-panel rounded-2xl p-8 hover:border-spear-muted/30 transition-all duration-700">
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-spear-muted/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <FileText className="w-8 h-8 text-spear-muted" />
                </div>
                <h3 className="text-xl font-semibold text-spear-white mb-4">
                  Completion
                </h3>
                <p className="text-spear-muted mb-6">
                  Proof-of-delivery capture and billing-ready packet generation for reimbursement submission.
                </p>
              </div>
              <div className="space-y-3">
                <div className="flex items-center">
                  <div className="w-2 h-2 bg-spear-muted rounded-full flex-shrink-0" />
                  <span className="ml-3 text-spear-muted text-sm">POD Captured</span>
                </div>
                <div className="flex items-center">
                  <div className="w-2 h-2 bg-spear-muted rounded-full flex-shrink-0" />
                  <span className="ml-3 text-spear-muted text-sm">Billing-Ready Packet</span>
                </div>
                <div className="flex items-center">
                  <div className="w-2 h-2 bg-spear-muted rounded-full flex-shrink-0" />
                  <span className="ml-3 text-spear-muted text-sm">Pathway Complete</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="bg-spear-bg border-t border-spear-border">
        <div className="container mx-auto px-6 py-20">
          <div className="text-center">
            <h3 className="text-2xl font-bold text-spear-white mb-6">
              StrykeFox CarePath
            </h3>
            <p className="text-spear-muted mb-8 leading-relaxed">
              Precision infrastructure for regulated healthcare environments.
            </p>
            <div className="text-spear-muted/40 text-sm pt-8 border-t border-spear-border">
              <p>&copy; 2026 Egeiro Holdings Co. All rights reserved.</p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
