import { useState, useEffect } from "react";

// =============================================================================
// POSEIDON REP KANBAN — Toyota Production System × iOS Glass
// Ultra-white, sharp, idiot-proof workflow visualization
// =============================================================================

// ─── DESIGN SYSTEM ───────────────────────────────────────────────────────────

const COLORS = {
  // Backgrounds
  pageBg: "#F5F5F7",
  cardBg: "rgba(255, 255, 255, 0.72)",
  cardBgHover: "rgba(255, 255, 255, 0.88)",
  glassBorder: "rgba(255, 255, 255, 0.5)",
  
  // Text
  textPrimary: "#1D1D1F",
  textSecondary: "#6E6E73",
  textMuted: "#AEAEB2",
  
  // Stage colors — Toyota Andon-inspired
  stages: {
    intake: { bg: "#007AFF", light: "#E5F2FF", text: "#0055CC" },
    eligibility: { bg: "#FF9500", light: "#FFF4E5", text: "#CC6600" },
    auth: { bg: "#AF52DE", light: "#F5E6FF", text: "#8B3AAF" },
    submitted: { bg: "#5856D6", light: "#ECEAFF", text: "#4240A8" },
    pending: { bg: "#34C759", light: "#E8F9ED", text: "#248A3D" },
    denied: { bg: "#FF3B30", light: "#FFE5E4", text: "#C41E14" },
    paid: { bg: "#30D158", light: "#E3FCE9", text: "#1FA23A" },
  },
  
  // Priority signals
  urgentBg: "#FF3B30",
  warningBg: "#FF9500",
  infoBg: "#007AFF",
  successBg: "#34C759",
};

const STAGES = [
  { id: "intake", label: "INTAKE", icon: "📥", target: "Same day" },
  { id: "eligibility", label: "ELIGIBILITY", icon: "🔍", target: "24 hrs" },
  { id: "auth", label: "AUTH / CMN", icon: "📋", target: "48 hrs" },
  { id: "submitted", label: "SUBMITTED", icon: "📤", target: "—" },
  { id: "pending", label: "PENDING PAY", icon: "⏳", target: "—" },
  { id: "denied", label: "DENIED", icon: "⚠️", target: "Appeal ASAP" },
  { id: "paid", label: "PAID", icon: "✓", target: "—" },
];

// ─── SEED DATA ───────────────────────────────────────────────────────────────

const SEED_ORDERS = [
  // INTAKE
  { id: "ORD-2041", patient: "Maria Gutierrez", dob: "04/11/1962", hcpcs: "L1833", payer: "Medicare", amount: 980, stage: "intake", daysInStage: 0, action: "Verify brace documentation", priority: "normal", icd: "M17.11" },
  { id: "ORD-2042", patient: "James Wilson", dob: "08/22/1958", hcpcs: "L1906", payer: "UHC", amount: 3200, stage: "intake", daysInStage: 1, action: "Missing Rx", priority: "warning", icd: "M79.621" },
  
  // ELIGIBILITY
  { id: "ORD-2035", patient: "Dorothy Mills", dob: "03/07/1948", hcpcs: "K0001", payer: "Aetna", amount: 2200, stage: "eligibility", daysInStage: 1, action: "Run Availity check", priority: "normal", icd: "M54.5" },
  { id: "ORD-2036", patient: "Robert Chen", dob: "09/23/1955", hcpcs: "E0260", payer: "BCBS TX", amount: 890, stage: "eligibility", daysInStage: 2, action: "COB issue — call member", priority: "urgent", icd: "G89.29" },
  
  // AUTH / CMN
  { id: "ORD-2029", patient: "Helen Park", dob: "07/30/1959", hcpcs: "A4253", payer: "Humana", amount: 440, stage: "auth", daysInStage: 3, action: "Fax CMN to physician", priority: "normal", icd: "E11.9" },
  { id: "ORD-2030", patient: "Frank Russo", dob: "01/19/1944", hcpcs: "E0148", payer: "Medicare", amount: 1750, stage: "auth", daysInStage: 5, action: "CMN signature pending", priority: "warning", icd: "M62.81" },
  { id: "ORD-2031", patient: "Angela White", dob: "05/05/1967", hcpcs: "L3700", payer: "Cigna", amount: 610, stage: "auth", daysInStage: 8, action: "Prior auth — call payer", priority: "urgent", icd: "M79.671" },
  
  // SUBMITTED
  { id: "ORD-2018", patient: "Thomas Brown", dob: "12/01/1952", hcpcs: "E1399", payer: "UHC", amount: 5200, stage: "submitted", daysInStage: 4, action: "Tracking", priority: "normal", icd: "G47.30" },
  { id: "ORD-2019", patient: "Linda Martinez", dob: "06/15/1961", hcpcs: "L1686", payer: "Aetna", amount: 1450, stage: "submitted", daysInStage: 7, action: "Tracking", priority: "normal", icd: "M16.11" },
  
  // PENDING PAYMENT
  { id: "ORD-2010", patient: "Richard Lee", dob: "11/28/1949", hcpcs: "K0823", payer: "Medicare", amount: 4800, stage: "pending", daysInStage: 18, action: "Payment in transit", priority: "normal", icd: "M54.5" },
  { id: "ORD-2011", patient: "Susan Taylor", dob: "02/14/1956", hcpcs: "E0260", payer: "BCBS FL", amount: 890, stage: "pending", daysInStage: 32, action: "Follow up — 30+ days", priority: "warning", icd: "G89.29" },
  
  // DENIED
  { id: "ORD-2005", patient: "Patricia Davis", dob: "09/03/1963", hcpcs: "L1906", payer: "Cigna", amount: 3200, stage: "denied", daysInStage: 5, action: "Appeal — Missing CMN", carc: "CO-4", priority: "urgent", icd: "M79.621" },
  { id: "ORD-2006", patient: "Michael Johnson", dob: "04/27/1951", hcpcs: "E0148", payer: "Humana", amount: 1750, stage: "denied", daysInStage: 12, action: "Appeal — Med necessity", carc: "CO-50", priority: "urgent", icd: "M62.81" },
  
  // PAID (recent wins)
  { id: "ORD-1998", patient: "Barbara Anderson", dob: "10/10/1947", hcpcs: "L1833", payer: "Medicare", amount: 980, stage: "paid", daysInStage: 2, action: "Closed", priority: "normal", icd: "M17.11" },
  { id: "ORD-1999", patient: "William Thompson", dob: "07/08/1954", hcpcs: "K0001", payer: "UHC", amount: 2100, stage: "paid", daysInStage: 1, action: "Closed", priority: "normal", icd: "M54.5" },
];

// ─── FONTS (Apple-style) ─────────────────────────────────────────────────────

const fontStack = `-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Helvetica Neue", Helvetica, Arial, sans-serif`;
const monoStack = `"SF Mono", "Menlo", "Monaco", "Courier New", monospace`;

// ─── STYLES ──────────────────────────────────────────────────────────────────

const styles = {
  page: {
    minHeight: "100vh",
    background: COLORS.pageBg,
    fontFamily: fontStack,
    padding: "24px 32px",
    color: COLORS.textPrimary,
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 28,
    paddingBottom: 20,
    borderBottom: `1px solid rgba(0,0,0,0.06)`,
  },
  logo: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  logoMark: {
    width: 36,
    height: 36,
    borderRadius: 10,
    background: "linear-gradient(135deg, #007AFF 0%, #5856D6 100%)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#fff",
    fontWeight: 700,
    fontSize: 16,
    boxShadow: "0 2px 8px rgba(0,122,255,0.3)",
  },
  logoText: {
    fontSize: 20,
    fontWeight: 700,
    letterSpacing: "-0.02em",
    color: COLORS.textPrimary,
  },
  logoSub: {
    fontSize: 11,
    color: COLORS.textSecondary,
    fontWeight: 500,
    letterSpacing: "0.02em",
  },
  userBadge: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    background: COLORS.cardBg,
    backdropFilter: "blur(20px)",
    WebkitBackdropFilter: "blur(20px)",
    border: `1px solid ${COLORS.glassBorder}`,
    borderRadius: 12,
    padding: "8px 14px",
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: "50%",
    background: "linear-gradient(135deg, #FF9500 0%, #FF3B30 100%)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#fff",
    fontWeight: 600,
    fontSize: 13,
  },
  // Focus bar — what rep should do RIGHT NOW
  focusBar: {
    background: "linear-gradient(135deg, #FF3B30 0%, #FF9500 100%)",
    borderRadius: 16,
    padding: "16px 24px",
    marginBottom: 24,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    boxShadow: "0 4px 20px rgba(255,59,48,0.25)",
  },
  focusText: {
    color: "#fff",
  },
  focusLabel: {
    fontSize: 11,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    opacity: 0.9,
    marginBottom: 4,
  },
  focusMain: {
    fontSize: 18,
    fontWeight: 700,
    letterSpacing: "-0.01em",
  },
  focusAction: {
    background: "rgba(255,255,255,0.2)",
    backdropFilter: "blur(10px)",
    border: "1px solid rgba(255,255,255,0.3)",
    borderRadius: 10,
    padding: "10px 18px",
    color: "#fff",
    fontWeight: 600,
    fontSize: 14,
    cursor: "pointer",
    transition: "all 0.15s ease",
  },
  // KPI strip
  kpiStrip: {
    display: "grid",
    gridTemplateColumns: "repeat(5, 1fr)",
    gap: 16,
    marginBottom: 28,
  },
  kpiCard: {
    background: COLORS.cardBg,
    backdropFilter: "blur(20px)",
    WebkitBackdropFilter: "blur(20px)",
    border: `1px solid ${COLORS.glassBorder}`,
    borderRadius: 16,
    padding: "16px 20px",
    boxShadow: "0 2px 12px rgba(0,0,0,0.04)",
  },
  kpiLabel: {
    fontSize: 11,
    fontWeight: 600,
    color: COLORS.textSecondary,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    marginBottom: 6,
  },
  kpiValue: {
    fontSize: 28,
    fontWeight: 700,
    letterSpacing: "-0.02em",
    color: COLORS.textPrimary,
  },
  kpiSub: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 4,
  },
  // Kanban container
  kanbanContainer: {
    display: "flex",
    gap: 16,
    overflowX: "auto",
    paddingBottom: 16,
  },
  column: {
    minWidth: 280,
    maxWidth: 300,
    flex: "0 0 280px",
    background: "rgba(0,0,0,0.02)",
    borderRadius: 20,
    padding: 12,
    display: "flex",
    flexDirection: "column",
    maxHeight: "calc(100vh - 340px)",
  },
  columnHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "8px 12px",
    marginBottom: 12,
  },
  columnTitle: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  stageDot: {
    width: 10,
    height: 10,
    borderRadius: "50%",
  },
  stageLabel: {
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.04em",
    color: COLORS.textPrimary,
  },
  countBadge: {
    fontSize: 11,
    fontWeight: 600,
    padding: "3px 10px",
    borderRadius: 20,
  },
  targetTime: {
    fontSize: 10,
    color: COLORS.textMuted,
    fontWeight: 500,
    marginTop: 2,
    paddingLeft: 18,
  },
  columnCards: {
    flex: 1,
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  // Order card
  card: {
    background: COLORS.cardBg,
    backdropFilter: "blur(20px)",
    WebkitBackdropFilter: "blur(20px)",
    border: `1px solid ${COLORS.glassBorder}`,
    borderRadius: 14,
    padding: 14,
    cursor: "grab",
    transition: "all 0.2s ease",
    boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
  },
  cardHover: {
    background: COLORS.cardBgHover,
    transform: "translateY(-2px)",
    boxShadow: "0 8px 24px rgba(0,0,0,0.08)",
  },
  cardHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  orderId: {
    fontFamily: monoStack,
    fontSize: 11,
    fontWeight: 600,
    color: COLORS.textSecondary,
  },
  priorityDot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    flexShrink: 0,
  },
  patientName: {
    fontSize: 15,
    fontWeight: 600,
    color: COLORS.textPrimary,
    letterSpacing: "-0.01em",
    marginBottom: 2,
  },
  patientDob: {
    fontSize: 11,
    color: COLORS.textMuted,
  },
  cardMeta: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginTop: 10,
    flexWrap: "wrap",
  },
  metaTag: {
    fontSize: 10,
    fontWeight: 600,
    padding: "3px 8px",
    borderRadius: 6,
    background: "rgba(0,0,0,0.04)",
    color: COLORS.textSecondary,
  },
  payerTag: {
    fontSize: 10,
    fontWeight: 600,
    padding: "3px 8px",
    borderRadius: 6,
    background: "#E5F2FF",
    color: "#0055CC",
  },
  amountTag: {
    fontSize: 11,
    fontWeight: 700,
    color: COLORS.textPrimary,
    marginLeft: "auto",
  },
  // Action box — THE KEY ELEMENT
  actionBox: {
    marginTop: 12,
    padding: "10px 12px",
    borderRadius: 10,
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  actionIcon: {
    fontSize: 14,
    flexShrink: 0,
  },
  actionText: {
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: "-0.01em",
  },
  daysInStage: {
    fontSize: 10,
    fontWeight: 600,
    padding: "2px 6px",
    borderRadius: 4,
    marginLeft: "auto",
  },
  // CARC badge for denials
  carcBadge: {
    fontFamily: monoStack,
    fontSize: 10,
    fontWeight: 600,
    padding: "3px 8px",
    borderRadius: 6,
    background: "#FFE5E4",
    color: "#C41E14",
  },
};

// ─── COMPONENTS ──────────────────────────────────────────────────────────────

function KPICard({ label, value, sub, accent }) {
  return (
    <div style={styles.kpiCard}>
      <div style={styles.kpiLabel}>{label}</div>
      <div style={{ ...styles.kpiValue, color: accent || COLORS.textPrimary }}>{value}</div>
      {sub && <div style={styles.kpiSub}>{sub}</div>}
    </div>
  );
}

function OrderCard({ order, stageColor, onDragStart, onClick }) {
  const [hovered, setHovered] = useState(false);
  
  const priorityColors = {
    urgent: COLORS.urgentBg,
    warning: COLORS.warningBg,
    normal: COLORS.successBg,
  };
  
  const actionBgColors = {
    urgent: "#FFE5E4",
    warning: "#FFF4E5",
    normal: "#F5F5F7",
  };
  
  const actionTextColors = {
    urgent: "#C41E14",
    warning: "#CC6600",
    normal: COLORS.textSecondary,
  };
  
  const daysColor = order.daysInStage > 7 ? "#FF3B30" : order.daysInStage > 3 ? "#FF9500" : COLORS.textMuted;
  
  return (
    <div
      style={{
        ...styles.card,
        ...(hovered ? styles.cardHover : {}),
        borderLeft: `3px solid ${priorityColors[order.priority]}`,
      }}
      draggable
      onDragStart={(e) => onDragStart(e, order)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => onClick(order)}
    >
      {/* Header */}
      <div style={styles.cardHeader}>
        <div style={styles.orderId}>{order.id}</div>
        <div
          style={{
            ...styles.priorityDot,
            background: priorityColors[order.priority],
            boxShadow: order.priority === "urgent" ? `0 0 8px ${COLORS.urgentBg}` : "none",
          }}
        />
      </div>
      
      {/* Patient */}
      <div style={styles.patientName}>{order.patient}</div>
      <div style={styles.patientDob}>DOB: {order.dob}</div>
      
      {/* Meta tags */}
      <div style={styles.cardMeta}>
        <span style={styles.metaTag}>{order.hcpcs}</span>
        <span style={styles.payerTag}>{order.payer}</span>
        {order.carc && <span style={styles.carcBadge}>{order.carc}</span>}
        <span style={styles.amountTag}>${order.amount.toLocaleString()}</span>
      </div>
      
      {/* ACTION BOX — What the rep needs to do */}
      <div
        style={{
          ...styles.actionBox,
          background: actionBgColors[order.priority],
        }}
      >
        <span style={styles.actionIcon}>
          {order.priority === "urgent" ? "🚨" : order.priority === "warning" ? "⚡" : "→"}
        </span>
        <span style={{ ...styles.actionText, color: actionTextColors[order.priority] }}>
          {order.action}
        </span>
        <span
          style={{
            ...styles.daysInStage,
            background: `${daysColor}20`,
            color: daysColor,
          }}
        >
          {order.daysInStage}d
        </span>
      </div>
    </div>
  );
}

function KanbanColumn({ stage, orders, onDrop, onDragOver, onDragStart, onCardClick }) {
  const stageConfig = COLORS.stages[stage.id] || COLORS.stages.intake;
  const total = orders.reduce((sum, o) => sum + o.amount, 0);
  const urgentCount = orders.filter(o => o.priority === "urgent").length;
  
  return (
    <div
      style={styles.column}
      onDragOver={onDragOver}
      onDrop={(e) => onDrop(e, stage.id)}
    >
      {/* Column header */}
      <div style={styles.columnHeader}>
        <div>
          <div style={styles.columnTitle}>
            <div style={{ ...styles.stageDot, background: stageConfig.bg }} />
            <span style={styles.stageLabel}>{stage.label}</span>
          </div>
          <div style={styles.targetTime}>Target: {stage.target}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {urgentCount > 0 && (
            <span
              style={{
                ...styles.countBadge,
                background: "#FFE5E4",
                color: "#C41E14",
              }}
            >
              {urgentCount} urgent
            </span>
          )}
          <span
            style={{
              ...styles.countBadge,
              background: stageConfig.light,
              color: stageConfig.text,
            }}
          >
            {orders.length}
          </span>
        </div>
      </div>
      
      {/* Cards */}
      <div style={styles.columnCards}>
        {orders.length === 0 && (
          <div style={{ textAlign: "center", padding: 24, color: COLORS.textMuted, fontSize: 13 }}>
            No orders
          </div>
        )}
        {orders
          .sort((a, b) => {
            // Sort: urgent first, then by days in stage descending
            if (a.priority === "urgent" && b.priority !== "urgent") return -1;
            if (b.priority === "urgent" && a.priority !== "urgent") return 1;
            if (a.priority === "warning" && b.priority === "normal") return -1;
            if (b.priority === "warning" && a.priority === "normal") return 1;
            return b.daysInStage - a.daysInStage;
          })
          .map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              stageColor={stageConfig}
              onDragStart={onDragStart}
              onClick={onCardClick}
            />
          ))}
      </div>
      
      {/* Column footer total */}
      <div
        style={{
          padding: "10px 12px",
          borderTop: `1px solid rgba(0,0,0,0.04)`,
          marginTop: 8,
          display: "flex",
          justifyContent: "space-between",
          fontSize: 12,
          color: COLORS.textMuted,
        }}
      >
        <span>Pipeline</span>
        <span style={{ fontWeight: 700, color: COLORS.textPrimary }}>${total.toLocaleString()}</span>
      </div>
    </div>
  );
}

// ─── MAIN APP ────────────────────────────────────────────────────────────────

export default function POSEIDONRepKanban() {
  const [orders, setOrders] = useState(SEED_ORDERS);
  const [draggedOrder, setDraggedOrder] = useState(null);
  const [selectedOrder, setSelectedOrder] = useState(null);
  
  // Compute KPIs
  const totalPipeline = orders.filter(o => o.stage !== "paid").reduce((s, o) => s + o.amount, 0);
  const urgentCount = orders.filter(o => o.priority === "urgent").length;
  const todayActions = orders.filter(o => o.priority !== "normal" && o.stage !== "paid").length;
  const deniedCount = orders.filter(o => o.stage === "denied").length;
  const avgDays = Math.round(orders.filter(o => o.stage !== "paid").reduce((s, o) => s + o.daysInStage, 0) / orders.filter(o => o.stage !== "paid").length);
  
  // Find highest priority action for focus bar
  const focusOrder = orders
    .filter(o => o.priority === "urgent")
    .sort((a, b) => b.daysInStage - a.daysInStage)[0];
  
  const handleDragStart = (e, order) => {
    setDraggedOrder(order);
    e.dataTransfer.effectAllowed = "move";
  };
  
  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };
  
  const handleDrop = (e, targetStage) => {
    e.preventDefault();
    if (draggedOrder && draggedOrder.stage !== targetStage) {
      setOrders(prev =>
        prev.map(o =>
          o.id === draggedOrder.id
            ? { ...o, stage: targetStage, daysInStage: 0, priority: "normal", action: getDefaultAction(targetStage) }
            : o
        )
      );
    }
    setDraggedOrder(null);
  };
  
  const getDefaultAction = (stage) => {
    const actions = {
      intake: "Verify insurance",
      eligibility: "Run Availity check",
      auth: "Obtain authorization",
      submitted: "Tracking",
      pending: "Awaiting payment",
      denied: "Review denial",
      paid: "Closed",
    };
    return actions[stage] || "—";
  };
  
  const handleCardClick = (order) => {
    setSelectedOrder(order);
    // In production, this would open a detail drawer/modal
  };
  
  return (
    <div style={styles.page}>
      {/* Header */}
      <header style={styles.header}>
        <div style={styles.logo}>
          <div style={styles.logoMark}>P</div>
          <div>
            <div style={styles.logoText}>POSEIDON</div>
            <div style={styles.logoSub}>Revenue Cycle • Rep Worklist</div>
          </div>
        </div>
        <div style={styles.userBadge}>
          <div style={styles.avatar}>JR</div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>Jessica Rivera</div>
            <div style={{ fontSize: 11, color: COLORS.textMuted }}>DME Rep • West Region</div>
          </div>
        </div>
      </header>
      
      {/* FOCUS BAR — What to do RIGHT NOW */}
      {focusOrder && (
        <div style={styles.focusBar}>
          <div style={styles.focusText}>
            <div style={styles.focusLabel}>🚨 Priority Action Required</div>
            <div style={styles.focusMain}>
              {focusOrder.patient} — {focusOrder.action}
            </div>
          </div>
          <button
            style={styles.focusAction}
            onClick={() => handleCardClick(focusOrder)}
            onMouseEnter={(e) => (e.target.style.background = "rgba(255,255,255,0.35)")}
            onMouseLeave={(e) => (e.target.style.background = "rgba(255,255,255,0.2)")}
          >
            Open {focusOrder.id} →
          </button>
        </div>
      )}
      
      {/* KPI Strip */}
      <div style={styles.kpiStrip}>
        <KPICard label="Active Pipeline" value={`$${(totalPipeline / 1000).toFixed(1)}K`} sub={`${orders.filter(o => o.stage !== "paid").length} orders`} />
        <KPICard label="Urgent Items" value={urgentCount} sub="Needs action today" accent={urgentCount > 0 ? "#FF3B30" : undefined} />
        <KPICard label="Actions Today" value={todayActions} sub="Warnings + urgent" accent={todayActions > 0 ? "#FF9500" : undefined} />
        <KPICard label="Denied" value={deniedCount} sub="Appeal queue" accent={deniedCount > 0 ? "#FF3B30" : undefined} />
        <KPICard label="Avg Days" value={avgDays} sub="In pipeline" accent={avgDays > 10 ? "#FF9500" : "#34C759"} />
      </div>
      
      {/* Kanban Board */}
      <div style={styles.kanbanContainer}>
        {STAGES.map((stage) => (
          <KanbanColumn
            key={stage.id}
            stage={stage}
            orders={orders.filter((o) => o.stage === stage.id)}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragStart={handleDragStart}
            onCardClick={handleCardClick}
          />
        ))}
      </div>
      
      {/* Legend */}
      <div
        style={{
          marginTop: 24,
          display: "flex",
          alignItems: "center",
          gap: 24,
          padding: "12px 16px",
          background: COLORS.cardBg,
          backdropFilter: "blur(20px)",
          borderRadius: 12,
          border: `1px solid ${COLORS.glassBorder}`,
          fontSize: 12,
          color: COLORS.textSecondary,
        }}
      >
        <span style={{ fontWeight: 600, color: COLORS.textPrimary }}>Priority Legend:</span>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#FF3B30", boxShadow: "0 0 6px #FF3B30" }} />
          Urgent — action today
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#FF9500" }} />
          Warning — needs attention
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#34C759" }} />
          On track
        </span>
        <span style={{ marginLeft: "auto", fontWeight: 500 }}>Drag cards to move stages • Click to open details</span>
      </div>
    </div>
  );
}
