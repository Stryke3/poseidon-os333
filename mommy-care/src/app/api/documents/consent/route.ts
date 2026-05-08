import { NextRequest, NextResponse } from 'next/server';

// POSEIDON Production API configuration
const POSEIDON_API_URL = process.env.POSEIDON_API_URL || 'https://api.strykefox.com';
const POSEIDON_API_KEY = process.env.POSEIDON_API_KEY;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate required fields
    const { patientId, consentTypes, signatureImage, ipAddress } = body;
    
    if (!patientId || !consentTypes || !signatureImage) {
      return NextResponse.json(
        { error: 'Faltan campos requeridos para consentimiento' },
        { status: 400 }
      );
    }

    // Prepare consent data for SPEAR platform
    const consentData = {
      patient_id: patientId,
      consent_documents: consentTypes.map((type: string) => ({
        type: type,
        signed_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(), // 12 months
        signature_image: signatureImage,
        ip_address: ipAddress,
        user_agent: request.headers.get('user-agent') || 'unknown'
      }))
    };

    console.log('Storing consent documents in POSEIDON:', consentData);

    // Call POSEIDON platform API for consent storage
    const poseidonResponse = await fetch(`${POSEIDON_API_URL}/documents/consent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${POSEIDON_API_KEY}`,
        'X-API-Version': '1.0'
      },
      body: JSON.stringify(consentData)
    });

    if (!poseidonResponse.ok) {
      const errorData = await poseidonResponse.json();
      console.error('POSEIDON consent API error:', errorData);
      return NextResponse.json(
        { error: `Error en POSEIDON: ${errorData.message || 'Error desconocido'}` },
        { status: poseidonResponse.status }
      );
    }

    const poseidonData = await poseidonResponse.json();
    
    return NextResponse.json({
      success: true,
      consentRecordIds: poseidonData.consent_record_ids || consentTypes.map((type: string) => `CONSENT-${type}-${Date.now()}`),
      poseidonConsentIds: poseidonData.poseidon_consent_ids,
      message: 'Documentos de consentimiento guardados exitosamente en POSEIDON',
      data: poseidonData
    });

  } catch (error) {
    console.error('Error storing consent in POSEIDON:', error);
    return NextResponse.json(
      { error: 'Error al guardar documentos de consentimiento con POSEIDON' },
      { status: 500 }
    );
  }
}

// GET endpoint to retrieve consent documents
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const patientId = searchParams.get('patient_id');
    const consentId = searchParams.get('consent_id');

    if (!patientId && !consentId) {
      return NextResponse.json(
        { error: 'Se requiere ID de paciente o ID de consentimiento' },
        { status: 400 }
      );
    }

    // Build query parameters for POSEIDON API
    const params = new URLSearchParams();
    if (patientId) params.append('patient_id', patientId);
    if (consentId) params.append('consent_id', consentId);

    // Call POSEIDON platform API
    const poseidonResponse = await fetch(`${POSEIDON_API_URL}/documents/consent?${params}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${POSEIDON_API_KEY}`,
        'X-API-Version': '1.0'
      }
    });

    if (!poseidonResponse.ok) {
      const errorData = await poseidonResponse.json();
      console.error('POSEIDON consent API error:', errorData);
      return NextResponse.json(
        { error: `Error en POSEIDON: ${errorData.message || 'Error desconocido'}` },
        { status: poseidonResponse.status }
      );
    }

    const poseidonData = await poseidonResponse.json();
    
    return NextResponse.json({
      success: true,
      consents: poseidonData,
      message: 'Documentos de consentimiento recuperados exitosamente'
    });

  } catch (error) {
    console.error('Error retrieving consent from POSEIDON:', error);
    return NextResponse.json(
      { error: 'Error al recuperar documentos de consentimiento' },
      { status: 500 }
    );
  }
}
