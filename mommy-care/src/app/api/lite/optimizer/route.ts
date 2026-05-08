import { NextRequest, NextResponse } from 'next/server';

interface OptimizationRequest {
  extracted_procedure: string;
  surgical_context?: string;
  patient_id?: string;
}

interface OptimizationResult {
  optimized_items: Array<{
    hcpcs_code: string;
    description: string;
    quantity: number;
    unit_price: number;
  }>;
  pre_selected_items?: Array<{
    hcpcs_code: string;
    description: string;
    reason: string;
  }>;
  total_reimbursement: number;
  optimization_score: number;
}

export async function POST(request: NextRequest) {
  try {
    const body: OptimizationRequest = await request.json();
    
    // Auto-inject HCPCS codes based on surgical context
    const optimized_items = [];
    const pre_selected_items = [];
    
    // Pregnancy-related ICD-10 codes to pre-select
    const pregnancy_icd10 = ['O26.90', 'O99.89'];
    const isPregnancyRelated = pregnancy_icd10.some(code => 
      body.extracted_procedure.includes(code)
    );
    
    if (isPregnancyRelated) {
      pre_selected_items.push({
        hcpcs_code: 'L0650',
        description: 'ManaMomma Breast Pump',
        reason: 'Pregnancy-related ICD-10 detected'
      });
      pre_selected_items.push({
        hcpcs_code: 'E0603',
        description: 'Breast Pump Supplies',
        reason: 'Pregnancy-related ICD-10 detected'
      });
    }
    
    // Auto-inject based on procedure keywords
    if (body.extracted_procedure.includes('TKA') || body.extracted_procedure.includes('Total Knee')) {
      optimized_items.push({
        hcpcs_code: 'L1833',
        description: 'Knee Brace',
        quantity: 1,
        unit_price: 450.00
      });
      optimized_items.push({
        hcpcs_code: 'A4595',
        description: 'Lead Wires',
        quantity: 2,
        unit_price: 25.00
      });
      optimized_items.push({
        hcpcs_code: 'A4596',
        description: 'Electrodes',
        quantity: 4,
        unit_price: 15.00
      });
    }
    
    if (body.extracted_procedure.includes('THA') || body.extracted_procedure.includes('Total Hip')) {
      optimized_items.push({
        hcpcs_code: 'L3000',
        description: 'Hip Orthosis',
        quantity: 1,
        unit_price: 650.00
      });
      optimized_items.push({
        hcpcs_code: 'E0676',
        description: 'PlasmaFlow DVT Prevention',
        quantity: 1,
        unit_price: 850.00
      });
    }
    
    // Calculate total reimbursement
    const total_reimbursement = optimized_items.reduce(
      (sum, item) => sum + (item.quantity * item.unit_price), 
      0
    );
    
    // Calculate optimization score (simplified algorithm)
    const optimization_score = Math.min(95, Math.round(
      (optimized_items.length * 15) + 
      (pre_selected_items.length * 10) + 
      (isPregnancyRelated ? 20 : 0)
    ));
    
    const result: OptimizationResult = {
      optimized_items,
      pre_selected_items: pre_selected_items.length > 0 ? pre_selected_items : undefined,
      total_reimbursement,
      optimization_score
    };
    
    return NextResponse.json(result);
    
  } catch (error) {
    console.error('Optimization error:', error);
    return NextResponse.json(
      { error: 'Error en optimización del paquete' },
      { status: 500 }
    );
  }
}
