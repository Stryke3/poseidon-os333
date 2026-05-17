import { ImageResponse } from "next/og";

export const runtime = "edge";

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          background: "linear-gradient(145deg, #0a0a0a 0%, #1a0a0a 50%, #0a0a0a 100%)",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "sans-serif",
          color: "#f5f4f1",
          position: "relative",
        }}
      >
        {/* Subtle border accents */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: "3px",
            background:
              "linear-gradient(to right, transparent, #8b1e1e, transparent)",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: "3px",
            background:
              "linear-gradient(to right, transparent, #8b1e1e, transparent)",
          }}
        />

        {/* Name */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            fontSize: "72px",
            fontWeight: 800,
            letterSpacing: "-0.03em",
            lineHeight: 0.95,
            textAlign: "center",
            marginBottom: "24px",
          }}
        >
          <span>ADAM W.</span>
          <span style={{ color: "#8b1e1e" }}>STRYKER</span>
        </div>

        {/* Subtitle */}
        <div
          style={{
            fontSize: "20px",
            fontWeight: 400,
            color: "rgba(245,244,241,0.5)",
            textAlign: "center",
            fontStyle: "italic",
            marginBottom: "32px",
          }}
        >
          Healthcare Operator · Investor · Systems Architect
        </div>

        {/* Book tag */}
        <div
          style={{
            fontSize: "14px",
            fontWeight: 500,
            color: "#8b1e1e",
            textAlign: "center",
            padding: "8px 20px",
            border: "1px solid rgba(139,30,30,0.4)",
            letterSpacing: "0.15em",
            textTransform: "uppercase",
          }}
        >
          Author · Candor Through Fire
        </div>

        {/* Footer */}
        <div
          style={{
            position: "absolute",
            bottom: "28px",
            fontSize: "12px",
            color: "rgba(245,244,241,0.2)",
            letterSpacing: "0.2em",
            textTransform: "uppercase",
          }}
        >
          adamwstryker.com
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    },
  );
}
