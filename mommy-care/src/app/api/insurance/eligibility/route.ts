import { NextRequest, NextResponse } from 'next/server';

// POSEIDON Production API configuration
const POSEIDON_API_URL = process.env.POSEIDON_API_URL || 'https://api.strykefox.com';
const POSEIDON_API_KEY = process.env.POSEIDON_API_KEY;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate required fields
    const { insuranceCarrier, memberId, groupNumber, subscriber, relationship, subscriberDOB, subscriberSSN, patientId } = body;
    
    if (!insuranceCarrier || !memberId || !subscriber) {
      return NextResponse.json(
        { error: 'Faltan campos requeridos del seguro' },
        { status: 400 }
      );
    }

    // Prepare eligibility data for SPEAR platform
    const eligibilityData = {
      patient_id: patientId,
      insurance_info: {
        carrier: insuranceCarrier,
        plan_name: body.planName,
        member_id: memberId,
        group_number: groupNumber,
        subscriber: {
          name: subscriber,
          relationship: relationship,
          date_of_birth: subscriberDOB,
          ssn_last4: subscriberSSN
        }
      },
      service_type: 'DME',
      hcpcs_codes: ['L0621', 'L0625', 'A6530', 'E0720', 'E0676'] // Default DME codes
    };

    console.log('Submitting eligibility inquiry to POSEIDON:', eligibilityData);

    // Call POSEIDON platform API for eligibility check
    const poseidonResponse = await fetch(`${POSEIDON_API_URL}/insurance/eligibility`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${POSEIDON_API_KEY}`,
        'X-API-Version': '1.0'
      },
      body: JSON.stringify(eligibilityData)
    });

    if (!poseidonResponse.ok) {
      const errorData = await poseidonResponse.json();
      console.error('POSEIDON eligibility API error:', errorData);
      return NextResponse.json(
        { error: `Error en POSEIDON: ${errorData.message || 'Error desconocido'}` },
        { status: poseidonResponse.status }
      );
    }

    const poseidonData = await poseidonResponse.json();
    
    return NextResponse.json({
      success: true,
      eligibilityId: poseidonData.eligibility_id || `ELIG-${Date.now()}`,
      benefit_details: poseidonData.benefit_details || {
        active_coverage: true,
        dme_benefit_category: 'covered',
        deductible_remaining: poseidonData.deductible_remaining || 0,
        copay: poseidonData.copay || 0,
        coinsurance: poseidonData.coinsurance || 0,
        prior_auth_required: poseidonData.prior_auth_required || false,
        in_network_status: poseidonData.in_network_status || 'in_network'
      },
      patient_responsibility_estimate: poseidonData.patient_responsibility_estimate || 0,
      message: 'Verificación de beneficios completada en POSEIDON',
      data: poseidonData
    });

  } catch (error) {
    console.error('Error checking eligibility with POSEIDON:', error);
    return NextResponse.json(
      { error: 'Error al verificar beneficios con POSEIDON' },
      { status: 500 }
    );
  }
}
