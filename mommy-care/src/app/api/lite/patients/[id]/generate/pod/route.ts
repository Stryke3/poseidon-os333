import { NextRequest, NextResponse } from 'next/server';

interface PODRequest {
  patient_id: string;
}

interface PODItem {
  hcpcs_code: string;
  description: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

interface PODResult {
  patient_info: {
    name: string;
    date_of_birth: string;
    phone: string;
    email: string;
  };
  provider_info: {
    npi: string;
    name: string;
  };
  items: PODItem[];
  total_amount: number;
  delivery_confirmation: string;
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: patientId } = await params;
    const body: PODRequest = await request.json();
    
    // Mock patient data (in real implementation, this would come from database)
    const mockPatientData = {
      name: 'María González',
      date_of_birth: '1990-05-15',
      phone: '(555) 123-4567',
      email: 'maria.gonzalez@email.com'
    };
    
    // Mock provider data
    const mockProviderData = {
      npi: '1234567890',
      name: 'Dr. Juan Pérez, OB-GYN'
    };
    
    // Mock optimized items (in real implementation, this would come from optimizer)
    const mockItems: PODItem[] = [
      {
        hcpcs_code: 'L1833',
        description: 'Knee Brace',
        quantity: 1,
        unit_price: 450.00,
        total_price: 450.00
      },
      {
        hcpcs_code: 'A4595',
        description: 'Lead Wires',
        quantity: 2,
        unit_price: 25.00,
        total_price: 50.00
      },
      {
        hcpcs_code: 'E0676',
        description: 'PlasmaFlow DVT Prevention',
        quantity: 1,
        unit_price: 850.00,
        total_price: 850.00
      }
    ];
    
    const total_amount = mockItems.reduce((sum, item) => sum + item.total_price, 0);
    
    const result: PODResult = {
      patient_info: mockPatientData,
      provider_info: mockProviderData,
      items: mockItems,
      total_amount,
      delivery_confirmation: `Pedido ${Date.now()} confirmado para entrega`
    };
    
    // In real implementation, this would generate a PDF
    // For now, return JSON with all the required data
    return NextResponse.json(result);
    
  } catch (error) {
    console.error('POD generation error:', error);
    return NextResponse.json(
      { error: 'Error generando prueba de entrega' },
      { status: 500 }
    );
  }
}
