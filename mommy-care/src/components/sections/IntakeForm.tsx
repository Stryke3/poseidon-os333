'use client';

import { useState } from 'react';
import { X, Check, ChevronLeft, ChevronRight, Upload, Shield, Clock, Phone, Mail } from 'lucide-react';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
const apiPath = (path: string) => `${basePath}${path}`;

interface FormData {
  // Step 1: Patient Demographics
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  preferredLanguage: string;
  howFound: string;
  
  // Step 2: Pregnancy + Provider
  estimatedDueDate: string;
  weeksPregnant: string;
  firstPregnancy: string;
  highRiskPregnancy: string;
  doctorName: string;
  providerNPI: string;
  clinic: string;
  doctorPhone: string;
  symptoms: string;
  
  // Step 3: Insurance
  insuranceCarrier: string;
  planName: string;
  memberId: string;
  groupNumber: string;
  subscriber: string;
  relationship: string;
  subscriberDOB: string;
  subscriberSSN: string;
  
  // Step 4: Product Selection
  selectedProducts: string[];
  bellyBandSize: string;
  compressionSize: string;
  orderNotes: string;
  
  // Step 5: Consent
  abnConsent: boolean;
  patientConsent: boolean;
  hipaaConsent: boolean;
  financialConsent: boolean;
  signature: string;
}

export default function IntakeForm() {
  const [isOpen, setIsOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [orderNumber, setOrderNumber] = useState('#MCK-2026-48291');
  
  const [formData, setFormData] = useState<FormData>({
    // Initialize all fields with empty strings
    firstName: '', lastName: '', dateOfBirth: '', phone: '', email: '',
    address: '', city: '', state: '', zipCode: '',
    preferredLanguage: 'es', howFound: '',
    estimatedDueDate: '', weeksPregnant: '', firstPregnancy: '',
    highRiskPregnancy: '', doctorName: '', providerNPI: '',
    clinic: '', doctorPhone: '', symptoms: '',
    insuranceCarrier: '', planName: '', memberId: '', groupNumber: '',
    subscriber: '', relationship: '', subscriberDOB: '', subscriberSSN: '',
    selectedProducts: ['belly-band', 'back-brace', 'compression-stockings', 'tens-unit', 'plasmaflow'],
    bellyBandSize: '', compressionSize: '', orderNotes: '',
    abnConsent: false, patientConsent: false, hipaaConsent: false, financialConsent: false, signature: ''
  });

  const products = [
    { id: 'belly-band', name: '🩱 Faja de Soporte 3-en-1', description: 'Soporte abdominal embarazo y recuperación posparto', hcpcs: 'HCPCS: L0621 · ICD-10: O26.89' },
    { id: 'back-brace', name: '🦺 Soporte Lumbar', description: 'Faja espalda baja con soporte ajustable', hcpcs: 'HCPCS: L0625 · ICD-10: M54.5' },
    { id: 'compression-stockings', name: '🧦 Medias de Compresión', description: 'Compresión graduada, circulación y edema', hcpcs: 'HCPCS: A6530 · ICD-10: O22.0' },
    { id: 'tens-unit', name: '⚡ TENS Unit + Suministros', description: 'Estimulación eléctrica, alivio sin medicamentos', hcpcs: 'HCPCS: E0720 / A4595 · ICD-10: M54.5' },
    { id: 'plasmaflow', name: '🔄 PlasmaFlow (DVT)', description: 'Compresión secuencial, prevención trombosis', hcpcs: 'HCPCS: E0676 · ICD-10: Z86.718' },
    { id: 'lactation-kit', name: '🤱🏽 Kit de Lactancia', description: 'Protectores, compresas térmicas, accesorios', hcpcs: 'HCPCS: E0602 / A4281 · ICD-10: O92.79' }
  ];

  const stepTitles = {
    1: ['Comencemos con tu información', 'Toma solo 3 minutos. Tu información está protegida y segura.'],
    2: ['Cuéntanos sobre tu embarazo', 'Para personalizar tu kit y coordinar con tu doctor.'],
    3: ['Tu seguro médico', 'Verificamos cobertura directamente. Sin sorpresas.'],
    4: ['Selecciona tus productos', 'Elige los productos para tu embarazo y posparto.'],
    5: ['Revisa y confirma', 'Último paso — revisa todo y envía tu solicitud.']
  };

  const updateProgress = (step: number) => {
    // Progress dots would be updated here
  };

  const nextStep = () => {
    if (currentStep < 5) {
      setCurrentStep(currentStep + 1);
      updateProgress(currentStep + 1);
    }
  };

  const prevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
      updateProgress(currentStep - 1);
    }
  };

  const toggleProduct = (productId: string) => {
    setFormData(prev => ({
      ...prev,
      selectedProducts: prev.selectedProducts.includes(productId)
        ? prev.selectedProducts.filter(id => id !== productId)
        : [...prev.selectedProducts, productId]
    }));
  };

  const toggleConsent = (type: keyof FormData) => {
    setFormData(prev => ({
      ...prev,
      [type]: !prev[type] as boolean
    }));
  };

  const submitIntake = async () => {
    // Track form submission
    if (typeof window !== 'undefined' && window.trackFormSubmission) {
      window.trackFormSubmission('Intake Form');
    }
    
    try {
      // Step 1: Create patient in SPEAR platform
      const patientResponse = await fetch(apiPath('/api/patients'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          firstName: formData.firstName,
          lastName: formData.lastName,
          dateOfBirth: formData.dateOfBirth,
          phone: formData.phone,
          email: formData.email,
          address: formData.address,
          city: formData.city,
          state: formData.state,
          zipCode: formData.zipCode,
          preferredLanguage: formData.preferredLanguage,
          howFound: formData.howFound,
          estimatedDueDate: formData.estimatedDueDate,
          weeksPregnant: formData.weeksPregnant,
          firstPregnancy: formData.firstPregnancy,
          highRiskPregnancy: formData.highRiskPregnancy,
          doctorName: formData.doctorName,
          providerNPI: formData.providerNPI,
          clinic: formData.clinic,
          doctorPhone: formData.doctorPhone,
          symptoms: formData.symptoms
        })
      });

      const patientData = await patientResponse.json();
      
      if (!patientData.success) {
        console.error('Error creating patient:', patientData.error);
        alert('Error al crear paciente: ' + patientData.error);
        return;
      }

      const patientId = patientData.patientId;
      console.log('Patient created in SPEAR:', patientData);

      // Step 2: Check insurance eligibility
      const eligibilityResponse = await fetch(apiPath('/api/insurance/eligibility'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          insuranceCarrier: formData.insuranceCarrier,
          planName: formData.planName,
          memberId: formData.memberId,
          groupNumber: formData.groupNumber,
          subscriber: formData.subscriber,
          relationship: formData.relationship,
          subscriberDOB: formData.subscriberDOB,
          subscriberSSN: formData.subscriberSSN,
          patientId: patientId
        })
      });

      const eligibilityData = await eligibilityResponse.json();
      
      if (!eligibilityData.success) {
        console.error('Error checking eligibility:', eligibilityData.error);
        alert('Error al verificar beneficios: ' + eligibilityData.error);
        return;
      }

      const eligibilityId = eligibilityData.eligibilityId;
      console.log('Eligibility checked:', eligibilityData);

      // Step 3: Create order
      const lineItems = formData.selectedProducts.map(productId => {
        const product = products.find(p => p.id === productId);
        return {
          hcpcs: product?.hcpcs?.split('·')[0].trim() || '',
          icd10: ['O26.89', 'M54.5', 'O22.0', 'Z86.718'], // Default ICD-10 codes
          quantity: 1,
          size: productId === 'belly-band' || productId === 'back-brace' ? formData.bellyBandSize : 
                 productId === 'compression-stockings' ? formData.compressionSize : null
        };
      });

      const orderResponse = await fetch(apiPath('/api/orders'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          patientId: patientId,
          eligibilityId: eligibilityId,
          lineItems: lineItems,
          referringNpi: formData.providerNPI,
          notes: formData.orderNotes,
          requiresPriorAuth: eligibilityData.benefit_details?.prior_auth_required
        })
      });

      const orderData = await orderResponse.json();
      
      if (!orderData.success) {
        console.error('Error creating order:', orderData.error);
        alert('Error al crear pedido: ' + orderData.error);
        return;
      }

      console.log('Order created:', orderData);

      // Step 4: Store consent documents
      const consentResponse = await fetch(apiPath('/api/documents/consent'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          patientId: patientId,
          consentTypes: ['ABN', 'patient_consent', 'HIPAA', 'financial_policy'],
          signatureImage: formData.signature || 'digital_signature_placeholder',
          ipAddress: '127.0.0.1' // In production, get real IP
        })
      });

      const consentData = await consentResponse.json();
      
      if (!consentData.success) {
        console.error('Error storing consent:', consentData.error);
        alert('Error al guardar consentimiento: ' + consentData.error);
        return;
      }

      console.log('Consent stored:', consentData);

      // Set order number for success state
      setOrderNumber(orderData.orderNumber);
      
      // Show success state
      setIsSubmitted(true);
      
      console.log('Intake form submitted successfully:', {
        patient: patientData,
        eligibility: eligibilityData,
        order: orderData,
        consent: consentData
      });

    } catch (error) {
      console.error('Error submitting intake form:', error);
      alert('Error al enviar formulario. Por favor intenta de nuevo.');
    }
  };

  const closeIntake = () => {
    setIsOpen(false);
    if (isSubmitted) {
      // Reset form after successful submission
      setCurrentStep(1);
      setIsSubmitted(false);
    }
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="cta-button"
      >
        Obtener Mommy Care Kit
      </button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl w-full max-w-4xl max-h-[95vh] overflow-y-auto relative animate-in">
        <button
          onClick={closeIntake}
          className="absolute top-4 right-4 w-10 h-10 bg-cream rounded-full flex items-center justify-center hover:bg-rose-pale transition-colors z-10"
        >
          <X className="w-5 h-5 text-gray-400" />
        </button>

        {!isSubmitted ? (
          <>
            {/* Header */}
            <div className="text-center p-8 pb-4">
              <h2 className="text-2xl font-serif text-warm mb-2">
                {stepTitles[currentStep as keyof typeof stepTitles][0]}
              </h2>
              <p className="text-gray-600">
                {stepTitles[currentStep as keyof typeof stepTitles][1]}
              </p>
            </div>

            {/* Progress Bar */}
            <div className="flex items-center justify-center gap-0 px-8 mb-4">
              {[1, 2, 3, 4, 5].map((step) => (
                <div key={step} className="flex items-center gap-0">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                    step < currentStep 
                      ? 'bg-sage text-white' 
                      : step === currentStep 
                        ? 'bg-secondary text-white shadow-lg' 
                        : 'bg-cream-dark text-gray-400'
                  }`}>
                    {step < currentStep ? '✓' : step}
                  </div>
                  {step < 5 && (
                    <div className={`w-10 h-0.5 transition-colors ${
                      step < currentStep ? 'bg-sage' : 'bg-cream-dark'
                    }`} />
                  )}
                </div>
              ))}
            </div>

            <div className="flex justify-between px-8 pb-2">
              {['Paciente', 'Embarazo', 'Seguro', 'Productos', 'Confirmar'].map((label, index) => (
                <div key={label} className={`text-xs uppercase tracking-wider font-semibold ${
                  index + 1 === currentStep ? 'text-secondary' : 'text-gray-400'
                }`}>
                  {label}
                </div>
              ))}
            </div>

            {/* Form Body */}
            <div className="px-8 pb-8">
              {/* Step 1: Patient Demographics */}
              {currentStep === 1 && (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-warm mb-2">
                        Nombre <span className="text-secondary">*</span>
                      </label>
                      <input
                        type="text"
                        value={formData.firstName}
                        onChange={(e) => setFormData(prev => ({ ...prev, firstName: e.target.value }))}
                        className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-secondary focus:outline-none transition-colors"
                        placeholder="Tu nombre"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-warm mb-2">
                        Apellido <span className="text-secondary">*</span>
                      </label>
                      <input
                        type="text"
                        value={formData.lastName}
                        onChange={(e) => setFormData(prev => ({ ...prev, lastName: e.target.value }))}
                        className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-secondary focus:outline-none transition-colors"
                        placeholder="Tu apellido"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-warm mb-2">
                        Fecha de Nacimiento <span className="text-secondary">*</span>
                      </label>
                      <input
                        type="date"
                        value={formData.dateOfBirth}
                        onChange={(e) => setFormData(prev => ({ ...prev, dateOfBirth: e.target.value }))}
                        className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-secondary focus:outline-none transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-warm mb-2">
                        Teléfono <span className="text-secondary">*</span>
                      </label>
                      <input
                        type="tel"
                        value={formData.phone}
                        onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                        className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-secondary focus:outline-none transition-colors"
                        placeholder="(555) 123-4567"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-warm mb-2">
                      Correo Electrónico <span className="text-secondary">*</span>
                    </label>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                      className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-secondary focus:outline-none transition-colors"
                      placeholder="tu@correo.com"
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div className="col-span-3">
                      <label className="block text-sm font-semibold text-warm mb-2">
                        Dirección <span className="text-secondary">*</span>
                      </label>
                      <input
                        type="text"
                        value={formData.address}
                        onChange={(e) => setFormData(prev => ({ ...prev, address: e.target.value }))}
                        className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-secondary focus:outline-none transition-colors"
                        placeholder="Calle y número"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-warm mb-2">
                        Ciudad <span className="text-secondary">*</span>
                      </label>
                      <input
                        type="text"
                        value={formData.city}
                        onChange={(e) => setFormData(prev => ({ ...prev, city: e.target.value }))}
                        className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-secondary focus:outline-none transition-colors"
                        placeholder="Ciudad"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-warm mb-2">
                        Estado <span className="text-secondary">*</span>
                      </label>
                      <select
                        value={formData.state}
                        onChange={(e) => setFormData(prev => ({ ...prev, state: e.target.value }))}
                        className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-secondary focus:outline-none transition-colors"
                      >
                        <option value="">Seleccionar</option>
                        <option value="AL">Alabama</option>
                        <option value="AK">Alaska</option>
                        <option value="AZ">Arizona</option>
                        <option value="AR">Arkansas</option>
                        <option value="CA">California</option>
                        <option value="CO">Colorado</option>
                        <option value="CT">Connecticut</option>
                        <option value="DE">Delaware</option>
                        <option value="FL">Florida</option>
                        <option value="GA">Georgia</option>
                        <option value="HI">Hawaii</option>
                        <option value="ID">Idaho</option>
                        <option value="IL">Illinois</option>
                        <option value="IN">Indiana</option>
                        <option value="IA">Iowa</option>
                        <option value="KS">Kansas</option>
                        <option value="KY">Kentucky</option>
                        <option value="LA">Louisiana</option>
                        <option value="ME">Maine</option>
                        <option value="MD">Maryland</option>
                        <option value="MA">Massachusetts</option>
                        <option value="MI">Michigan</option>
                        <option value="MN">Minnesota</option>
                        <option value="MS">Mississippi</option>
                        <option value="MO">Missouri</option>
                        <option value="MT">Montana</option>
                        <option value="NE">Nebraska</option>
                        <option value="NV">Nevada</option>
                        <option value="NH">New Hampshire</option>
                        <option value="NJ">New Jersey</option>
                        <option value="NM">New Mexico</option>
                        <option value="NY">New York</option>
                        <option value="NC">North Carolina</option>
                        <option value="ND">North Dakota</option>
                        <option value="OH">Ohio</option>
                        <option value="OK">Oklahoma</option>
                        <option value="OR">Oregon</option>
                        <option value="PA">Pennsylvania</option>
                        <option value="RI">Rhode Island</option>
                        <option value="SC">South Carolina</option>
                        <option value="SD">South Dakota</option>
                        <option value="TN">Tennessee</option>
                        <option value="TX">Texas</option>
                        <option value="UT">Utah</option>
                        <option value="VT">Vermont</option>
                        <option value="VA">Virginia</option>
                        <option value="WA">Washington</option>
                        <option value="WV">West Virginia</option>
                        <option value="WI">Wisconsin</option>
                        <option value="WY">Wyoming</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-warm mb-2">
                        Código Postal <span className="text-secondary">*</span>
                      </label>
                      <input
                        type="text"
                        value={formData.zipCode}
                        onChange={(e) => setFormData(prev => ({ ...prev, zipCode: e.target.value }))}
                        className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-secondary focus:outline-none transition-colors"
                        placeholder="12345"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-warm mb-2">Idioma Preferido</label>
                      <select
                        value={formData.preferredLanguage}
                        onChange={(e) => setFormData(prev => ({ ...prev, preferredLanguage: e.target.value }))}
                        className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-secondary focus:outline-none transition-colors"
                      >
                        <option value="es">Español</option>
                        <option value="en">English</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-warm mb-2">¿Cómo nos encontraste?</label>
                      <select
                        value={formData.howFound}
                        onChange={(e) => setFormData(prev => ({ ...prev, howFound: e.target.value }))}
                        className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-secondary focus:outline-none transition-colors"
                      >
                        <option value="">Seleccionar</option>
                        <option value="social">Redes sociales</option>
                        <option value="doctor">Doctor / Clínica</option>
                        <option value="referral">Amiga o familiar</option>
                        <option value="search">Búsqueda en internet</option>
                        <option value="other">Otro</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* Step 2: Pregnancy + Provider */}
              {currentStep === 2 && (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-warm mb-2">
                        Fecha Estimada de Parto <span className="text-secondary">*</span>
                      </label>
                      <input
                        type="date"
                        value={formData.estimatedDueDate}
                        onChange={(e) => setFormData(prev => ({ ...prev, estimatedDueDate: e.target.value }))}
                        className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-secondary focus:outline-none transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-warm mb-2">Semanas de Embarazo</label>
                      <input
                        type="number"
                        value={formData.weeksPregnant}
                        onChange={(e) => setFormData(prev => ({ ...prev, weeksPregnant: e.target.value }))}
                        className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-secondary focus:outline-none transition-colors"
                        placeholder="Ej: 24"
                        min="1"
                        max="42"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-warm mb-2">¿Primer embarazo?</label>
                      <select
                        value={formData.firstPregnancy}
                        onChange={(e) => setFormData(prev => ({ ...prev, firstPregnancy: e.target.value }))}
                        className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-secondary focus:outline-none transition-colors"
                      >
                        <option value="">Seleccionar</option>
                        <option value="yes">Sí</option>
                        <option value="no">No</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-warm mb-2">¿Embarazo de alto riesgo?</label>
                      <select
                        value={formData.highRiskPregnancy}
                        onChange={(e) => setFormData(prev => ({ ...prev, highRiskPregnancy: e.target.value }))}
                        className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-secondary focus:outline-none transition-colors"
                      >
                        <option value="">Seleccionar</option>
                        <option value="yes">Sí</option>
                        <option value="no">No</option>
                        <option value="unsure">No estoy segura</option>
                      </select>
                    </div>
                  </div>

                  <div className="border-t pt-6">
                    <h3 className="font-semibold text-warm mb-4">Proveedor de Salud (Referring Physician)</h3>
                    <p className="text-sm text-gray-600 mb-4">Para coordinar órdenes médicas y prescripciones DME.</p>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-semibold text-warm mb-2">
                          Nombre del Doctor / OB-GYN <span className="text-secondary">*</span>
                        </label>
                        <input
                          type="text"
                          value={formData.doctorName}
                          onChange={(e) => setFormData(prev => ({ ...prev, doctorName: e.target.value }))}
                          className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-secondary focus:outline-none transition-colors"
                          placeholder="Dr. / Dra."
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-warm mb-2">NPI del Proveedor</label>
                        <input
                          type="text"
                          value={formData.providerNPI}
                          onChange={(e) => setFormData(prev => ({ ...prev, providerNPI: e.target.value }))}
                          className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-secondary focus:outline-none transition-colors"
                          placeholder="10 dígitos"
                        />
                        <p className="text-xs text-gray-500 mt-1">Si no lo tienes, nosotros lo buscamos por ti</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-semibold text-warm mb-2">Clínica / Hospital</label>
                        <input
                          type="text"
                          value={formData.clinic}
                          onChange={(e) => setFormData(prev => ({ ...prev, clinic: e.target.value }))}
                          className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-secondary focus:outline-none transition-colors"
                          placeholder="Nombre de la clínica"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-warm mb-2">Teléfono del Doctor</label>
                        <input
                          type="tel"
                          value={formData.doctorPhone}
                          onChange={(e) => setFormData(prev => ({ ...prev, doctorPhone: e.target.value }))}
                          className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-secondary focus:outline-none transition-colors"
                          placeholder="(555) 123-4567"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-warm mb-2">Síntomas / Diagnósticos Actuales</label>
                      <textarea
                        value={formData.symptoms}
                        onChange={(e) => setFormData(prev => ({ ...prev, symptoms: e.target.value }))}
                        rows={3}
                        className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-secondary focus:outline-none transition-colors resize-vertical"
                        placeholder="Ej: Dolor lumbar, edema en piernas, riesgo DVT, náuseas..."
                      />
                      <p className="text-xs text-gray-500 mt-1">Nos ayuda a seleccionar productos y mapear ICD-10 para facturación</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Step 3: Insurance */}
              {currentStep === 3 && (
                <div className="space-y-6">
                  <p className="text-sm text-gray-600 mb-4">
                    Verificamos cobertura directamente con tu aseguradora. Si hay algún costo, te avisamos <strong>antes</strong> de enviar.
                  </p>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-warm mb-2">
                        Aseguradora <span className="text-secondary">*</span>
                      </label>
                      <select
                        value={formData.insuranceCarrier}
                        onChange={(e) => setFormData(prev => ({ ...prev, insuranceCarrier: e.target.value }))}
                        className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-secondary focus:outline-none transition-colors"
                      >
                        <option value="">Seleccionar</option>
                        <option value="aetna">Aetna</option>
                        <option value="anthem">Anthem / BCBS</option>
                        <option value="cigna">Cigna</option>
                        <option value="humana">Humana</option>
                        <option value="kaiser">Kaiser Permanente</option>
                        <option value="medicaid">Medicaid</option>
                        <option value="medicare">Medicare</option>
                        <option value="molina">Molina Healthcare</option>
                        <option value="united">UnitedHealthcare</option>
                        <option value="tricare">Tricare</option>
                        <option value="other">Otro</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-warm mb-2">Nombre del Plan</label>
                      <input
                        type="text"
                        value={formData.planName}
                        onChange={(e) => setFormData(prev => ({ ...prev, planName: e.target.value }))}
                        className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-secondary focus:outline-none transition-colors"
                        placeholder="Ej: Gold PPO, Medicaid MCO"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-warm mb-2">
                        Número de Miembro / ID <span className="text-secondary">*</span>
                      </label>
                      <input
                        type="text"
                        value={formData.memberId}
                        onChange={(e) => setFormData(prev => ({ ...prev, memberId: e.target.value }))}
                        className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-secondary focus:outline-none transition-colors"
                        placeholder="En tu tarjeta de seguro"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-warm mb-2">Número de Grupo</label>
                      <input
                        type="text"
                        value={formData.groupNumber}
                        onChange={(e) => setFormData(prev => ({ ...prev, groupNumber: e.target.value }))}
                        className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-secondary focus:outline-none transition-colors"
                        placeholder="Si aplica"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-warm mb-2">
                        Suscriptor Principal <span className="text-secondary">*</span>
                      </label>
                      <input
                        type="text"
                        value={formData.subscriber}
                        onChange={(e) => setFormData(prev => ({ ...prev, subscriber: e.target.value }))}
                        className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-secondary focus:outline-none transition-colors"
                        placeholder="Si eres tú, escribe tu nombre"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-warm mb-2">Relación con Suscriptor</label>
                      <select
                        value={formData.relationship}
                        onChange={(e) => setFormData(prev => ({ ...prev, relationship: e.target.value }))}
                        className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-secondary focus:outline-none transition-colors"
                      >
                        <option value="self">Yo misma</option>
                        <option value="spouse">Esposo / Pareja</option>
                        <option value="parent">Padre / Madre</option>
                        <option value="other">Otro</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-warm mb-2">Fecha Nacimiento Suscriptor</label>
                      <input
                        type="date"
                        value={formData.subscriberDOB}
                        onChange={(e) => setFormData(prev => ({ ...prev, subscriberDOB: e.target.value }))}
                        className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-secondary focus:outline-none transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-warm mb-2">SSN Suscriptor (últimos 4)</label>
                      <input
                        type="text"
                        value={formData.subscriberSSN}
                        onChange={(e) => setFormData(prev => ({ ...prev, subscriberSSN: e.target.value }))}
                        className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-secondary focus:outline-none transition-colors"
                        placeholder="XXXX"
                        maxLength={4}
                      />
                      <p className="text-xs text-gray-500 mt-1">Solo últimos 4 — para verificación con aseguradora</p>
                    </div>
                  </div>

                  <div className="border-t pt-6">
                    <h3 className="font-semibold text-warm mb-4">📸 Tarjeta de Seguro</h3>
                    <p className="text-sm text-gray-600 mb-4">Foto del frente y reverso de tu tarjeta.</p>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-secondary hover:bg-rose-pale/10 transition-colors">
                        <Upload className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                        <p className="text-sm text-gray-600">
                          <span className="text-secondary font-semibold">Sube FRENTE</span>
                        </p>
                        <p className="text-xs text-gray-500">o arrastra aquí</p>
                      </div>
                      <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-secondary hover:bg-rose-pale/10 transition-colors">
                        <Upload className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                        <p className="text-sm text-gray-600">
                          <span className="text-secondary font-semibold">Sube REVERSO</span>
                        </p>
                        <p className="text-xs text-gray-500">o arrastra aquí</p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-cream/50 rounded-2xl p-6 border-2 border-sage-light">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-8 h-8 bg-gold rounded-full flex items-center justify-center">
                        <Clock className="w-4 h-4 text-white" />
                      </div>
                      <h4 className="font-semibold text-warm">Verificación de Beneficios (270/271)</h4>
                    </div>
                    <p className="text-sm text-gray-600 leading-relaxed">
                      Al enviar, verificamos con tu aseguradora: <strong>cobertura DME activa, deducible restante, copago/coaseguro, y si requiere autorización previa (PA).</strong> Te contactamos en 1-2 días hábiles.
                    </p>
                  </div>
                </div>
              )}

              {/* Step 4: Product Selection */}
              {currentStep === 4 && (
                <div className="space-y-6">
                  <p className="text-sm text-gray-600 mb-4">
                    Basado en tus síntomas y cobertura. Cada producto tiene su código HCPCS para facturación a tu seguro.
                  </p>

                  <div className="grid grid-cols-2 gap-4">
                    {products.map((product) => (
                      <div
                        key={product.id}
                        onClick={() => toggleProduct(product.id)}
                        className={`border-2 rounded-2xl p-4 cursor-pointer transition-all ${
                          formData.selectedProducts.includes(product.id)
                            ? 'border-sage bg-sage/10'
                            : 'border-gray-200 hover:border-rose-light'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div className={`w-6 h-6 rounded-md border-2 flex items-center justify-center text-xs transition-colors ${
                            formData.selectedProducts.includes(product.id)
                              ? 'bg-sage border-sage text-white'
                              : 'border-rose-light'
                          }`}>
                            {formData.selectedProducts.includes(product.id) && '✓'}
                          </div>
                          <div className="flex-1">
                            <h4 className="font-semibold text-sm mb-1">{product.name}</h4>
                            <p className="text-xs text-gray-600 leading-relaxed mb-2">{product.description}</p>
                            <p className="text-xs text-secondary font-semibold">{product.hcpcs}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-warm mb-2">Talla (Faja / Soporte)</label>
                      <select
                        value={formData.bellyBandSize}
                        onChange={(e) => setFormData(prev => ({ ...prev, bellyBandSize: e.target.value }))}
                        className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-secondary focus:outline-none transition-colors"
                      >
                        <option value="">Seleccionar</option>
                        <option value="XS">XS (0-2)</option>
                        <option value="S">S (4-6)</option>
                        <option value="M">M (8-10)</option>
                        <option value="L">L (12-14)</option>
                        <option value="XL">XL (16-18)</option>
                        <option value="XXL">XXL (20-22)</option>
                      </select>
                      <p className="text-xs text-gray-500 mt-1">Basado en talla pre-embarazo</p>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-warm mb-2">Talla Medias (Compresión)</label>
                      <select
                        value={formData.compressionSize}
                        onChange={(e) => setFormData(prev => ({ ...prev, compressionSize: e.target.value }))}
                        className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-secondary focus:outline-none transition-colors"
                      >
                        <option value="">Seleccionar</option>
                        <option value="S">S</option>
                        <option value="M">M</option>
                        <option value="L">L</option>
                        <option value="XL">XL</option>
                      </select>
                      <p className="text-xs text-gray-500 mt-1">Medir circunferencia de pantorrilla</p>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-warm mb-2">Notas para el Pedido</label>
                    <textarea
                      value={formData.orderNotes}
                      onChange={(e) => setFormData(prev => ({ ...prev, orderNotes: e.target.value }))}
                      rows={2}
                      className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-secondary focus:outline-none transition-colors resize-vertical"
                      placeholder="Instrucciones especiales, alergias a materiales, etc."
                    />
                  </div>
                </div>
              )}

              {/* Step 5: Consent + Billing + Signature */}
              {currentStep === 5 && (
                <div className="space-y-6">
                  <div className="bg-gradient-to-br from-sage-light to-cream rounded-2xl p-6 border border-sage/30">
                    <h4 className="font-semibold text-warm mb-4">📋 Resumen de Facturación Estimada</h4>
                    <div className="space-y-3">
                      {formData.selectedProducts.map(productId => {
                        const product = products.find(p => p.id === productId);
                        return product ? (
                          <div key={productId} className="flex justify-between items-center py-2 border-b border-sage/20 last:border-0">
                            <span className="text-sm text-gray-600">{product.name.split(' ')[1]}</span>
                            <span className="font-semibold text-warm">Cubierto*</span>
                          </div>
                        ) : null;
                      })}
                      <div className="flex justify-between items-center py-3 border-t-2 border-sage font-semibold">
                        <span className="text-sm">Tu Costo Estimado</span>
                        <span className="text-sage-deep text-lg">$0.00*</span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-secondary/10 rounded-2xl p-6 border border-secondary/20">
                    <div className="flex gap-3">
                      <Shield className="w-5 h-5 text-secondary flex-shrink-0" />
                      <p className="text-sm text-gray-600 leading-relaxed">
                        * Costo final sujeto a verificación de beneficios (deducible, copago, coaseguro). <strong>Te contactamos ANTES de enviar si hay costo fuera de bolsillo.</strong> Nunca enviamos sin tu aprobación.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="bg-cream rounded-2xl p-6 border border-gray-200">
                      <h4 className="font-semibold text-warm mb-3">Asignación de Beneficios (ABN)</h4>
                      <p className="text-sm text-gray-600 mb-3">
                        Autorizo a The Mommy Care Kit / Innovative DME Solutions, LLC a facturar a mi seguro médico por los productos seleccionados. Entiendo que soy responsable de copago, deducible, o coaseguro según mi plan.
                      </p>
                      <div className="flex items-start gap-3 cursor-pointer" onClick={() => toggleConsent('abnConsent')}>
                        <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center text-xs transition-colors ${
                          formData.abnConsent
                            ? 'bg-sage border-sage text-white'
                            : 'border-rose-light'
                        }`}>
                          {formData.abnConsent && '✓'}
                        </div>
                        <span className="text-sm">Acepto la asignación de beneficios <span className="text-secondary">*</span></span>
                      </div>
                    </div>

                    <div className="bg-cream rounded-2xl p-6 border border-gray-200">
                      <h4 className="font-semibold text-warm mb-3">Consentimiento del Paciente</h4>
                      <p className="text-sm text-gray-600 mb-3">
                        Confirmo que la información es correcta. Autorizo a mi proveedor a compartir información médica necesaria para procesar mi pedido.
                      </p>
                      <div className="flex items-start gap-3 cursor-pointer" onClick={() => toggleConsent('patientConsent')}>
                        <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center text-xs transition-colors ${
                          formData.patientConsent
                            ? 'bg-sage border-sage text-white'
                            : 'border-rose-light'
                        }`}>
                          {formData.patientConsent && '✓'}
                        </div>
                        <span className="text-sm">Acepto el consentimiento <span className="text-secondary">*</span></span>
                      </div>
                    </div>

                    <div className="bg-cream rounded-2xl p-6 border border-gray-200">
                      <h4 className="font-semibold text-warm mb-3">Autorización HIPAA</h4>
                      <p className="text-sm text-gray-600 mb-3">
                        Autorizo el uso de mi PHI para verificar beneficios, procesar pedido, y facturar. Válida por 12 meses.
                      </p>
                      <div className="flex items-start gap-3 cursor-pointer" onClick={() => toggleConsent('hipaaConsent')}>
                        <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center text-xs transition-colors ${
                          formData.hipaaConsent
                            ? 'bg-sage border-sage text-white'
                            : 'border-rose-light'
                        }`}>
                          {formData.hipaaConsent && '✓'}
                        </div>
                        <span className="text-sm">Acepto autorización HIPAA <span className="text-secondary">*</span></span>
                      </div>
                    </div>

                    <div className="bg-cream rounded-2xl p-6 border border-gray-200">
                      <h4 className="font-semibold text-warm mb-3">Política Financiera</h4>
                      <p className="text-sm text-gray-600 mb-3">
                        Entiendo que verificarán beneficios antes de enviar. Si mi seguro no cubre el total, seré notificada antes del envío y podré decidir si continuar.
                      </p>
                      <div className="flex items-start gap-3 cursor-pointer" onClick={() => toggleConsent('financialConsent')}>
                        <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center text-xs transition-colors ${
                          formData.financialConsent
                            ? 'bg-sage border-sage text-white'
                            : 'border-rose-light'
                        }`}>
                          {formData.financialConsent && '✓'}
                        </div>
                        <span className="text-sm">Acepto la política financiera <span className="text-secondary">*</span></span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h4 className="font-semibold text-warm mb-3">Firma Electrónica</h4>
                    <p className="text-sm text-gray-600 mb-3">Firma con tu dedo o mouse para confirmar.</p>
                    <div className="border-2 border-gray-300 rounded-2xl h-24 bg-white flex items-center justify-center text-gray-400 cursor-crosshair mb-2">
                      Toca o haz clic aquí para firmar
                    </div>
                    <button className="text-xs text-secondary font-semibold hover:text-secondary/80 transition-colors">
                      Borrar firma
                    </button>
                  </div>
                </div>
              )}

              {/* Navigation */}
              <div className="flex justify-between items-center pt-6 border-t border-gray-200">
                {currentStep > 1 && (
                  <button
                    onClick={prevStep}
                    className="flex items-center gap-2 text-gray-400 hover:text-secondary transition-colors font-semibold"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    Atrás
                  </button>
                )}
                <div className="flex-1" />
                {currentStep < 5 ? (
                  <button
                    onClick={nextStep}
                    className="bg-secondary text-white px-8 py-3 rounded-full hover:bg-terracotta-deep transition-colors font-semibold shadow-lg"
                  >
                    Siguiente →
                  </button>
                ) : (
                  <button
                    onClick={submitIntake}
                    className="bg-sage-deep text-white px-10 py-4 rounded-full hover:bg-sage/90 transition-colors font-semibold shadow-lg w-full"
                  >
                    ✓ Enviar Solicitud — Verificar Beneficios — Crear Pedido
                  </button>
                )}
              </div>

              <div className="text-center text-xs text-gray-500 mt-4 flex items-center justify-center gap-2">
                <Shield className="w-3 h-3" />
                HIPAA Compliant · SSL 256-bit · Tu información es confidencial
              </div>
            </div>
          </>
        ) : (
          /* Success State */
          <div className="text-center p-12">
            <div className="text-6xl mb-6">🎉</div>
            <h2 className="text-2xl font-serif text-warm mb-4">¡Solicitud Enviada!</h2>
            <p className="text-gray-600 mb-8 max-w-md mx-auto">
              Verificando beneficios con tu aseguradora. Te contactamos en <strong>1-2 días hábiles</strong> para confirmar cobertura y coordinar envío.
            </p>

            <div className="bg-cream rounded-2xl p-6 text-left mb-8 max-w-md mx-auto">
              <div className="space-y-3">
                <div className="flex justify-between py-2 border-b border-gray-200">
                  <span className="text-sm text-gray-600">Nº Solicitud</span>
                  <span className="font-semibold text-warm">{orderNumber}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-gray-200">
                  <span className="text-sm text-gray-600">Estado</span>
                  <span className="text-gold font-semibold">⏳ Verificando Beneficios</span>
                </div>
                <div className="flex justify-between py-2 border-b border-gray-200">
                  <span className="text-sm text-gray-600">Productos</span>
                  <span className="font-semibold text-warm">{formData.selectedProducts.length} items en cola</span>
                </div>
                <div className="flex justify-between py-2 border-b border-gray-200">
                  <span className="text-sm text-gray-600">Facturación</span>
                  <span className="font-semibold text-warm">Pendiente verificación</span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-sm text-gray-600">Próximo Paso</span>
                  <span className="font-semibold text-warm">Confirmación por teléfono</span>
                </div>
              </div>
            </div>

            <p className="text-sm text-gray-600 mb-6">
              ¿Preguntas? <strong>(888) 464-9015</strong> — hablamos español.
            </p>
            <button
              onClick={closeIntake}
              className="bg-secondary text-white px-8 py-3 rounded-full hover:bg-terracotta-deep transition-colors font-semibold"
            >
              Cerrar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
