import { liteServerFetch } from "@/lib/lite-api"

export type SpearCommandData = {
  workflow: {
    intake: { count: number; active: boolean }
    poseidon: { count: number; active: boolean }
    trident: { count: number; active: boolean }
    execution: { count: number; active: boolean }
    revenue: { count: number; active: boolean }
    ledger: { count: number; active: boolean }
  }
  metrics: {
    open_cases: number
    missing_docs: number
    trident_review: number
    ready_fulfillment: number
    pod_needed: number
    revenue_support: number
    tebra_ready: number
    high_risk: number
  }
  poseidon: {
    total_records: number
    storage_used: string
    last_sync: string
  }
  trident: {
    cases_reviewed: number
    risk_flags: number
    next_actions: number
  }
  spear_execution: {
    active_tasks: number
    fulfillment_pending: number
    completed_today: number
  }
  revenue_support: {
    tebra_ready: number
    packet_prep: number
    revenue_at_risk: number
  }
}

async function fetchWorkflowData() {
  // Mock implementation - replace with actual API calls
  return {
    intake: { count: 12, active: true },
    poseidon: { count: 8, active: true },
    trident: { count: 5, active: true },
    execution: { count: 15, active: true },
    revenue: { count: 7, active: true },
    ledger: { count: 23, active: true },
  }
}

async function fetchMetricsData() {
  // Mock implementation - replace with actual API calls
  return {
    open_cases: 12,
    missing_docs: 3,
    trident_review: 5,
    ready_fulfillment: 8,
    pod_needed: 4,
    revenue_support: 7,
    tebra_ready: 6,
    high_risk: 2,
  }
}

async function fetchPoseidonData() {
  // Mock implementation - replace with actual API calls
  return {
    total_records: 1247,
    storage_used: "18.4 GB",
    last_sync: "2 min ago",
  }
}

async function fetchTridentData() {
  // Mock implementation - replace with actual API calls
  return {
    cases_reviewed: 892,
    risk_flags: 47,
    next_actions: 124,
  }
}

async function fetchSpearExecutionData() {
  // Mock implementation - replace with actual API calls
  return {
    active_tasks: 156,
    fulfillment_pending: 23,
    completed_today: 41,
  }
}

async function fetchRevenueSupportData() {
  // Mock implementation - replace with actual API calls
  return {
    tebra_ready: 67,
    packet_prep: 19,
    revenue_at_risk: 8,
  }
}

export async function getSpearCommandData(): Promise<SpearCommandData> {
  try {
    const [workflow, metrics, poseidon, trident, spearExecution, revenueSupport] = await Promise.all([
      fetchWorkflowData(),
      fetchMetricsData(),
      fetchPoseidonData(),
      fetchTridentData(),
      fetchSpearExecutionData(),
      fetchRevenueSupportData(),
    ])

    return {
      workflow,
      metrics,
      poseidon,
      trident,
      spear_execution: spearExecution,
      revenue_support: revenueSupport,
    }
  } catch (error) {
    console.error("Failed to fetch SPEAR command data:", error)
    
    // Return fallback data
    return {
      workflow: {
        intake: { count: 0, active: false },
        poseidon: { count: 0, active: false },
        trident: { count: 0, active: false },
        execution: { count: 0, active: false },
        revenue: { count: 0, active: false },
        ledger: { count: 0, active: false },
      },
      metrics: {
        open_cases: 0,
        missing_docs: 0,
        trident_review: 0,
        ready_fulfillment: 0,
        pod_needed: 0,
        revenue_support: 0,
        tebra_ready: 0,
        high_risk: 0,
      },
      poseidon: {
        total_records: 0,
        storage_used: "0 GB",
        last_sync: "Never",
      },
      trident: {
        cases_reviewed: 0,
        risk_flags: 0,
        next_actions: 0,
      },
      spear_execution: {
        active_tasks: 0,
        fulfillment_pending: 0,
        completed_today: 0,
      },
      revenue_support: {
        tebra_ready: 0,
        packet_prep: 0,
        revenue_at_risk: 0,
      },
    }
  }
}
