import { NextRequest, NextResponse } from 'next/server';

interface GeneratedRequest {
  patient_id: string;
}

interface GeneratedResult {
  patient_data: any;
  optimization_score: number;
  reimbursement_probability: number;
  pdf_preview_url: string;
  status: 'draft' | 'ready' | 'submitted';
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: patientId } = await params;
    
    // Mock patient data with optimization results
    const mockPatientData = {
      id: patientId,
      name: 'María González',
      status: 'SWO Ready',
      created_date: '2026-04-15',
      optimization_score: 87,
      reimbursement_probability: 92,
      items: [
        {
          hcpcs_code: 'L1833',
          description: 'Knee Brace',
          quantity: 1,
          unit_price: 450.00
        },
        {
          hcpcs_code: 'A4595',
          description: 'Lead Wires',
          quantity: 2,
          unit_price: 25.00
        }
      ]
    };
    
    const result: GeneratedResult = {
      patient_data: mockPatientData,
      optimization_score: mockPatientData.optimization_score,
      reimbursement_probability: mockPatientData.reimbursement_probability,
      pdf_preview_url: `/api/lite/patients/${patientId}/preview`,
      status: 'ready'
    };
    
    return NextResponse.json(result);
    
  } catch (error) {
    console.error('Generated data error:', error);
    return NextResponse.json(
      { error: 'Error obteniendo datos generados' },
      { status: 500 }
    );
  }
}
