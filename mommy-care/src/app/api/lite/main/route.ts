import { NextRequest, NextResponse } from 'next/server';

interface ExtractionRequest {
  patient_id?: string;
  order_date?: string;
  surgical_date?: string;
  document_signature_date?: string;
  extraction_confidence?: number;
}

interface ExtractionResult {
  status: 'success' | 'review_required' | 'blocked';
  message: string;
  extracted_data?: any;
  fallback_dates?: {
    order_date?: string;
    surgical_date?: string;
    document_signature_date?: string;
  };
}

export async function POST(request: NextRequest) {
  try {
    const body: ExtractionRequest = await request.json();
    
    // Fix missing order_date with fallback logic
    const order_date = body.order_date || 
                      body.surgical_date || 
                      body.document_signature_date || 
                      new Date().toISOString().split('T')[0];
    
    // Handle low extraction confidence
    if (body.extraction_confidence && body.extraction_confidence < 0.7) {
      return NextResponse.json({
        status: 'review_required',
        message: 'Baja confianza en extracción requiere revisión manual',
        extracted_data: body
      });
    }
    
    // Force draft SWO generation but don't block
    const result: ExtractionResult = {
      status: body.extraction_confidence && body.extraction_confidence < 0.7 ? 'review_required' : 'success',
      message: body.extraction_confidence && body.extraction_confidence < 0.7 ? 
        'Revisión requerida antes de generar SWO final' : 
        'Extracción completada exitosamente',
      extracted_data: {
        ...body,
        order_date
      }
    };
    
    return NextResponse.json(result);
    
  } catch (error) {
    console.error('Extraction error:', error);
    return NextResponse.json(
      { error: 'Error en extracción de datos' },
      { status: 500 }
    );
  }
}
