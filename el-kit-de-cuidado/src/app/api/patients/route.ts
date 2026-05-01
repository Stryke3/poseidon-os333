import { NextRequest, NextResponse } from 'next/server';

// POSEIDON Production API configuration
const POSEIDON_API_URL = process.env.POSEIDON_API_URL || 'https://api.strykefox.com';
const POSEIDON_API_KEY = process.env.POSEIDON_API_KEY;

interface PoseidonPatient {
  first_name: string;
  last_name: string;
  date_of_birth: string;
  phone: string;
  email: string;
  address: {
    street: string;
    city: string;
    state: string;
    zip_code: string;
  };
  preferred_language: string;
  how_found: string;
  pregnancy_info?: {
    estimated_due_date: string;
    weeks_pregnant: number;
    first_pregnancy: boolean;
    high_risk_pregnancy: boolean;
  };
  provider_info?: {
    doctor_name: string;
    provider_npi: string;
    clinic: string;
    doctor_phone: string;
    symptoms: string;
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate required fields
    const { firstName, lastName, dateOfBirth, phone, email, address, city, state, zipCode } = body;
    
    if (!firstName || !lastName || !dateOfBirth || !phone || !email || !address || !city || !state || !zipCode) {
      return NextResponse.json(
        { error: 'Faltan campos requeridos' },
        { status: 400 }
      );
    }

    // Prepare patient data for POSEIDON platform
    const poseidonPatient: PoseidonPatient = {
      first_name: firstName,
      last_name: lastName,
      date_of_birth: dateOfBirth,
      phone: phone,
      email: email,
      address: {
        street: address,
        city: city,
        state: state,
        zip_code: zipCode
      },
      preferred_language: body.preferredLanguage || 'es',
      how_found: body.howFound || 'web'
    };

    // Add pregnancy information if available
    if (body.estimatedDueDate || body.weeksPregnant) {
      poseidonPatient.pregnancy_info = {
        estimated_due_date: body.estimatedDueDate,
        weeks_pregnant: parseInt(body.weeksPregnant) || 0,
        first_pregnancy: body.firstPregnancy === 'yes',
        high_risk_pregnancy: body.highRiskPregnancy === 'yes'
      };
    }

    // Add provider information if available
    if (body.doctorName || body.providerNPI) {
      poseidonPatient.provider_info = {
        doctor_name: body.doctorName,
        provider_npi: body.providerNPI,
        clinic: body.clinic,
        doctor_phone: body.doctorPhone,
        symptoms: body.symptoms
      };
    }

    console.log('Creating patient in POSEIDON platform:', poseidonPatient);

    // Call POSEIDON platform API
    const poseidonResponse = await fetch(`${POSEIDON_API_URL}/patients`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${POSEIDON_API_KEY}`,
        'X-API-Version': '1.0'
      },
      body: JSON.stringify(poseidonPatient)
    });

    if (!poseidonResponse.ok) {
      const errorData = await poseidonResponse.json();
      console.error('POSEIDON API error:', errorData);
      return NextResponse.json(
        { error: `Error en POSEIDON: ${errorData.message || 'Error desconocido'}` },
        { status: poseidonResponse.status }
      );
    }

    const poseidonData = await poseidonResponse.json();
    
    return NextResponse.json({
      success: true,
      patientId: poseidonData.patient_id || poseidonData.id,
      poseidonPatientId: poseidonData.poseidon_patient_id,
      message: 'Paciente creado exitosamente en POSEIDON',
      data: poseidonData
    });

  } catch (error) {
    console.error('Error creating patient in POSEIDON:', error);
    return NextResponse.json(
      { error: 'Error al procesar la información con POSEIDON' },
      { status: 500 }
    );
  }
}

// GET endpoint to retrieve patient information
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const patientId = searchParams.get('id');
    const email = searchParams.get('email');
    const phone = searchParams.get('phone');

    if (!patientId && !email && !phone) {
      return NextResponse.json(
        { error: 'Se requiere ID de paciente, email o teléfono' },
        { status: 400 }
      );
    }

    // Build query parameters for POSEIDON API
    const params = new URLSearchParams();
    if (patientId) params.append('patient_id', patientId);
    if (email) params.append('email', email);
    if (phone) params.append('phone', phone);

    // Call POSEIDON platform API
    const poseidonResponse = await fetch(`${POSEIDON_API_URL}/patients?${params}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${POSEIDON_API_KEY}`,
        'X-API-Version': '1.0'
      }
    });

    if (!poseidonResponse.ok) {
      const errorData = await poseidonResponse.json();
      console.error('POSEIDON API error:', errorData);
      return NextResponse.json(
        { error: `Error en POSEIDON: ${errorData.message || 'Error desconocido'}` },
        { status: poseidonResponse.status }
      );
    }

    const poseidonData = await poseidonResponse.json();
    
    return NextResponse.json({
      success: true,
      patients: poseidonData,
      message: 'Información del paciente recuperada exitosamente'
    });

  } catch (error) {
    console.error('Error retrieving patient from POSEIDON:', error);
    return NextResponse.json(
      { error: 'Error al recuperar información del paciente' },
      { status: 500 }
    );
  }
}
