import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"

import { authOptions } from "@/lib/auth"

type RegistryAddress = {
  address_purpose?: string
  telephone_number?: string
  fax_number?: string
}

type RegistryTaxonomy = {
  desc?: string
  primary?: boolean
}

type RegistryRecord = {
  number?: string
  basic?: {
    first_name?: string
    last_name?: string
    organization_name?: string
  }
  addresses?: RegistryAddress[]
  taxonomies?: RegistryTaxonomy[]
}

function normalize(value: string | null | undefined) {
  return (value || "").trim()
}

function parseRegistryPhysician(record: RegistryRecord) {
  const basic = record.basic || {}
  const addresses = Array.isArray(record.addresses) ? record.addresses : []
  const practiceAddress =
    addresses.find((item) => String(item.address_purpose || "").toUpperCase() === "LOCATION") || addresses[0] || {}
  const taxonomies = Array.isArray(record.taxonomies) ? record.taxonomies : []
  const primaryTaxonomy = taxonomies.find((item) => item.primary) || taxonomies[0] || {}
  const fullName = [basic.first_name, basic.last_name].map((part) => normalize(part)).filter(Boolean).join(" ")

  return {
    npi: normalize(record.number),
    full_name: fullName || normalize(basic.organization_name),
    first_name: normalize(basic.first_name),
    last_name: normalize(basic.last_name),
    specialty: normalize(primaryTaxonomy.desc),
    phone: normalize(practiceAddress.telephone_number),
    fax: normalize(practiceAddress.fax_number),
  }
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const query = normalize(req.nextUrl.searchParams.get("query"))
  if (query.length < 2) {
    return NextResponse.json({ items: [] })
  }

  const registryUrl = new URL("https://npiregistry.cms.hhs.gov/api/")
  registryUrl.searchParams.set("version", "2.1")
  registryUrl.searchParams.set("enumeration_type", "NPI-1")
  registryUrl.searchParams.set("limit", "8")

  if (/^\d{10}$/.test(query)) {
    registryUrl.searchParams.set("number", query)
  } else {
    const parts = query.split(/\s+/).filter(Boolean)
    if (parts.length === 1) {
      registryUrl.searchParams.set("last_name", parts[0]!)
    } else {
      registryUrl.searchParams.set("first_name", parts[0]!)
      registryUrl.searchParams.set("last_name", parts.slice(1).join(" "))
    }
  }

  const res = await fetch(registryUrl.toString(), { cache: "no-store" }).catch(() => null)
  if (!res) {
    return NextResponse.json({ error: "Unable to reach physician directory" }, { status: 502 })
  }
  if (!res.ok) {
    return NextResponse.json({ error: "Physician lookup failed" }, { status: 502 })
  }

  const payload = (await res.json().catch(() => ({}))) as { results?: RegistryRecord[] }
  const items = Array.isArray(payload.results) ? payload.results.map(parseRegistryPhysician).filter((item) => item.npi && item.full_name) : []

  return NextResponse.json({ items })
}
