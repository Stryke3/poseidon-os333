import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const size = { width: 1200, height: 630 }

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          background: 'linear-gradient(135deg, #05070B 0%, #0E1726 100%)',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'Syne, sans-serif',
          color: '#F5F7FA',
        }}
      >
        <div
          style={{
            fontSize: '64px',
            fontWeight: 800,
            letterSpacing: '-0.02em',
            marginBottom: '20px',
            textAlign: 'center',
          }}
        >
          Adam W. Stryker
        </div>
        <div
          style={{
            fontSize: '24px',
            fontWeight: 500,
            color: '#A7B0C0',
            textAlign: 'center',
            marginBottom: '40px',
          }}
        >
          Architect of Leverage
        </div>
        <div
          style={{
            fontSize: '18px',
            fontWeight: 400,
            color: '#00E5FF',
            textAlign: 'center',
            padding: '12px 24px',
            border: '1px solid rgba(0, 229, 255, 0.3)',
            borderRadius: '8px',
            background: 'rgba(0, 229, 255, 0.1)',
          }}
        >
          Healthcare Platform Builder · StrykeFox Medical
        </div>
      </div>
    ),
    {
      ...size,
    }
  )
}
