import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate required fields
    const { orderId, patientId, eligibilityId, payerId, lineItems } = body;
    
    if (!orderId || !patientId || !eligibilityId || !lineItems) {
      return NextResponse.json(
        { error: 'Faltan campos requeridos para el reclamo' },
        { status: 400 }
      );
    }

    // Pre-stage claim for each line item
    console.log('Pre-staging claims:', {
      order_id: orderId,
      patient_id: patientId,
      eligibility_id: eligibilityId,
      payer_id: payerId,
      line_items: lineItems.map((item: any) => ({
        hcpcs: item.hcpcs,
        icd10: item.icd10,
        modifiers: ['NU'], // new purchase
        qty: item.quantity,
        size: item.size,
        pos: '12', // Home
        diagnosis_code: item.diagnosisCode
      }))
    });

    // Mock response - in production, this would submit 837P claim
    const claimDraftId = `CLAIM-${Date.now()}`;

    return NextResponse.json({
      success: true,
      claimDraftId,
      status: 'awaiting_eligibility_confirmation',
      message: 'Reclamo preparado para envío'
    });

  } catch (error) {
    console.error('Error staging claim:', error);
    return NextResponse.json(
      { error: 'Error al preparar reclamo' },
      { status: 500 }
    );
  }
}
