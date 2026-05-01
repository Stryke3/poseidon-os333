import { NextResponse } from "next/server"

import { getLiteBaseUrl, liteAuthHeaders, liteServerFetch } from "@/lib/lite-api"

export async function GET(
  req: Request,
  { params }: { params: Promise<{ patientId: string; genId: string }> },
) {
  const { patientId, genId } = await params
  
  try {
    const response = await liteServerFetch(
      `/patients/${patientId}/generated/${genId}/preview`,
      {
        method: "GET",
        headers: liteAuthHeaders(),
      }
    )

    if (!response.ok) {
      return NextResponse.json(
        { error: `Document preview failed: ${response.statusText}` },
        { status: response.status }
      )
    }

    // Check if response is PDF
    const contentType = response.headers.get("content-type")
    if (contentType?.includes("application/pdf")) {
      const pdfBytes = await response.arrayBuffer()
      return new NextResponse(pdfBytes, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename="document.pdf"`,
        },
      })
    }

    // Handle text content
    const text = await response.text()
    return new NextResponse(text, {
      headers: {
        "Content-Type": "text/plain",
      },
    })
  } catch (error) {
    console.error("Document preview error:", error)
    return NextResponse.json(
      { error: "Failed to fetch document preview" },
      { status: 503 }
    )
  }
}
