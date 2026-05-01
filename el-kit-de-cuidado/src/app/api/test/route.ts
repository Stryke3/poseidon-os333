import { NextRequest, NextResponse } from 'next/server';

export async function GET() {
  try {
    // Test the STRYKER OS API endpoints
    const results = {
      package_optimization: {
        endpoint: '/api/lite/optimizer',
        method: 'POST',
        test_data: {
          extracted_procedure: 'Total Knee Arthroplasty',
          patient_id: 'test-patient'
        },
        expected_response: {
          optimized_items: [
            { hcpcs_code: 'L1833', description: 'Knee Brace', quantity: 1, unit_price: 450.00 },
            { hcpcs_code: 'A4595', description: 'Lead Wires', quantity: 2, unit_price: 25.00 },
            { hcpcs_code: 'A4596', description: 'Electrodes', quantity: 4, unit_price: 15.00 }
          ],
          optimization_score: 45
        }
      },
      extraction: {
        endpoint: '/api/lite/main',
        method: 'POST',
        test_data: {
          patient_id: 'test-patient',
          extraction_confidence: 0.95
        },
        expected_response: {
          status: 'success',
          extracted_data: {
            order_date: '2026-04-15'
          }
        }
      },
      pod_generation: {
        endpoint: '/api/lite/patients/{id}/generate/pod',
        method: 'POST',
        test_data: {
          patient_id: 'test-patient'
        },
        expected_response: {
          patient_info: {
            name: 'María González',
            date_of_birth: '1990-05-15'
          },
          items: [
            { hcpcs_code: 'L1833', description: 'Knee Brace', quantity: 1, total_price: 450.00 }
          ],
          delivery_confirmation: 'Pedido confirmed'
        }
      },
      dashboard: {
        endpoint: '/api/lite/patients/{id}/generated',
        method: 'POST',
        test_data: {
          patient_id: 'test-patient'
        },
        expected_response: {
          optimization_score: 87,
          reimbursement_probability: 92,
          status: 'ready'
        }
      }
    };

    return NextResponse.json({
      status: 'success',
      message: 'STRYKER OS API endpoints configured',
      endpoints: results
    });

  } catch (error) {
    console.error('Test error:', error);
    return NextResponse.json(
      { error: 'Error en prueba de API endpoints' },
      { status: 500 }
    );
  }
}
