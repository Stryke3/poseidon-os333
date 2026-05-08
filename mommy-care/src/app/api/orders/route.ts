import { NextRequest, NextResponse } from 'next/server';

// POSEIDON Production API configuration
const POSEIDON_API_URL = process.env.POSEIDON_API_URL || 'https://api.strykefox.com';
const POSEIDON_API_KEY = process.env.POSEIDON_API_KEY;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate required fields
    const { patientId, eligibilityId, lineItems, referringNpi, notes } = body;
    
    if (!patientId || !eligibilityId || !lineItems || !referringNpi) {
      return NextResponse.json(
        { error: 'Faltan campos requeridos del pedido' },
        { status: 400 }
      );
    }

    // Prepare order data for SPEAR platform
    const orderData = {
      patient_id: patientId,
      eligibility_id: eligibilityId,
      line_items: lineItems.map((item: any) => ({
        hcpcs: item.hcpcs,
        icd10: item.icd10,
        modifiers: ['NU'], // new purchase
        quantity: item.quantity,
        size: item.size,
        pos: '12', // Home
        diagnosis_code: item.diagnosis_code || item.icd10?.[0]
      })),
      referring_npi: referringNpi,
      notes: notes,
      supplier_npi: process.env.SUPPLIER_NPI || '1234567890', // Your supplier NPI
      order_type: 'DME_KIT'
    };

    console.log('Creating order in POSEIDON platform:', orderData);

    // Call POSEIDON platform API for order creation
    const poseidonResponse = await fetch(`${POSEIDON_API_URL}/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${POSEIDON_API_KEY}`,
        'X-API-Version': '1.0'
      },
      body: JSON.stringify(orderData)
    });

    if (!poseidonResponse.ok) {
      const errorData = await poseidonResponse.json();
      console.error('POSEIDON orders API error:', errorData);
      return NextResponse.json(
        { error: `Error en POSEIDON: ${errorData.message || 'Error desconocido'}` },
        { status: poseidonResponse.status }
      );
    }

    const poseidonData = await poseidonResponse.json();
    
    // Generate order number using POSEIDON data or fallback
    const orderNumber = poseidonData.order_number || `#MCK-2026-${Math.floor(Math.random() * 10000)}`;
    
    // Determine status based on eligibility and POSEIDON response
    let finalStatus = poseidonData.status || 'pending_benefit_verification';
    if (body.requiresPriorAuth || poseidonData.requires_prior_auth) {
      finalStatus = 'pending_prior_auth';
    }

    return NextResponse.json({
      success: true,
      orderId: poseidonData.order_id || `ORD-${Date.now()}`,
      orderNumber: orderNumber,
      status: finalStatus,
      poseidonOrderId: poseidonData.poseidon_order_id,
      message: 'Pedido creado exitosamente en POSEIDON',
      data: poseidonData
    });

  } catch (error) {
    console.error('Error creating order in POSEIDON:', error);
    return NextResponse.json(
      { error: 'Error al crear pedido con POSEIDON' },
      { status: 500 }
    );
  }
}

// GET endpoint to retrieve order information
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get('id');
    const patientId = searchParams.get('patient_id');
    const orderNumber = searchParams.get('order_number');

    if (!orderId && !patientId && !orderNumber) {
      return NextResponse.json(
        { error: 'Se requiere ID de pedido, ID de paciente o número de pedido' },
        { status: 400 }
      );
    }

    // Build query parameters for POSEIDON API
    const params = new URLSearchParams();
    if (orderId) params.append('order_id', orderId);
    if (patientId) params.append('patient_id', patientId);
    if (orderNumber) params.append('order_number', orderNumber);

    // Call POSEIDON platform API
    const poseidonResponse = await fetch(`${POSEIDON_API_URL}/orders?${params}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${POSEIDON_API_KEY}`,
        'X-API-Version': '1.0'
      }
    });

    if (!poseidonResponse.ok) {
      const errorData = await poseidonResponse.json();
      console.error('POSEIDON orders API error:', errorData);
      return NextResponse.json(
        { error: `Error en POSEIDON: ${errorData.message || 'Error desconocido'}` },
        { status: poseidonResponse.status }
      );
    }

    const poseidonData = await poseidonResponse.json();
    
    return NextResponse.json({
      success: true,
      orders: poseidonData,
      message: 'Información del pedido recuperada exitosamente'
    });

  } catch (error) {
    console.error('Error retrieving orders from POSEIDON:', error);
    return NextResponse.json(
      { error: 'Error al recuperar información del pedido' },
      { status: 500 }
    );
  }
}
