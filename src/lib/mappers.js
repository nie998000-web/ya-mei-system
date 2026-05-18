export const validStoreNames = ['龙泉1店', '龙泉2店', '龙泉金龙店', '郫县1店']

export function normalizeStoreName(value, fallback = '') {
  if (!value) return fallback

  const name = String(value).trim()
  const compactName = name.replace(/\s+/g, '')

  if (compactName.includes('龙泉1')) return '龙泉1店'
  if (compactName.includes('龙泉2')) return '龙泉2店'
  if (compactName.includes('金龙')) return '龙泉金龙店'
  if (compactName.includes('郫县')) return '郫县1店'

  return validStoreNames.includes(name) ? name : fallback
}

function normalizeStoreForWrite(rowStore, profileStore) {
  return normalizeStoreName(rowStore) || normalizeStoreName(profileStore) || validStoreNames[0]
}

export function fromCustomer(row) {
  const storeName = normalizeStoreName(row.store) || validStoreNames[0]
  return {
    id: row.id,
    name: String(row.name ?? ''),
    phone: String(row.phone ?? ''),
    age: row.age ?? '',
    birthday: row.birthday ?? '',
    store: storeName,
    owner: String(row.owner ?? ''),
    level: String(row.level || ''),
    lastVisit: row.last_visit ?? '',
    lastFollowResult: row.last_follow_result || '未联系',
    lastFollowTime: row.last_follow_time || '',
    nextFollowTime: row.next_follow_time || '',
    followStatus: row.follow_status || '未联系',
    followNote: row.follow_note || '',
    todayTaskCompletedAt: row.today_task_completed_at || '',
  }
}

export function fromEmployee(row) {
  return {
    id: row.id,
    name: row.name || '',
    phone: row.phone || '',
    store: row.store || '',
    role: row.role || 'beautician',
    today_followups: row.today_followups ?? 0,
    today_appointments: row.today_appointments ?? 0,
    today_arrivals: row.today_arrivals ?? 0,
    today_deals: row.today_deals ?? 0,
    today_sales: row.today_sales ?? null,
    note: row.note || '',
    userId: row.user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function fromFollowup(row) {
  return {
    id: row.id,
    customerId: row.customer_id == null ? '' : Number(row.customer_id),
    customerName: row.customer_name || '',
    customerPhone: row.customer_phone || '',
    date: row.created_at ? String(row.created_at).slice(0, 10) : '',
    method: row.method,
    owner: row.owner,
    content: row.content,
    feedback: row.feedback,
    hasAppointment: row.has_appointment,
    appointmentTime: row.appointment_time,
    hasDeal: row.has_deal,
    dealAmount: row.deal_amount,
    nextFollowTime: row.next_follow_time,
    issueType: row.issue_type,
    store: normalizeStoreName(row.store),
    createdAt: row.created_at,
  }
}

export function toFollowup(row, profile) {
  const customerId = row.customerId === undefined || row.customerId === null || row.customerId === ''
    ? null
    : Number(row.customerId)

  return {
    customer_id: Number.isFinite(customerId) ? customerId : null,
    customer_name: row.customerName || '',
    customer_phone: row.customerPhone || '',
    store: normalizeStoreForWrite(row.store, profile?.store),
    method: row.method,
    owner: profile?.role === 'beautician' ? profile.name : row.owner,
    content: row.content,
    feedback: row.feedback,
    has_appointment: Boolean(row.hasAppointment),
    appointment_time: row.appointmentTime || null,
    has_deal: Boolean(row.hasDeal),
    deal_amount: Number(row.dealAmount || 0),
    next_follow_time: row.nextFollowTime || null,
    issue_type: row.issueType,
  }
}

export function fromReview(row) {
  return {
    id: row.id,
    date: row.date,
    store: normalizeStoreName(row.store),
    inviteRate: row.invite_rate,
    appointmentRate: row.appointment_rate,
    arrivalRate: row.arrival_rate,
    dealRate: row.deal_rate,
    dealAmount: row.deal_amount,
    unfinishedReason: row.unfinished_reason,
    tomorrowAction: row.tomorrow_action,
  }
}

export function toReview(row, profile) {
  return {
    date: row.date,
    store: normalizeStoreForWrite(row.store, profile?.store),
    invite_rate: Number(row.inviteRate || 0),
    appointment_rate: Number(row.appointmentRate || 0),
    arrival_rate: Number(row.arrivalRate || 0),
    deal_rate: Number(row.dealRate || 0),
    deal_amount: Number(row.dealAmount || 0),
    unfinished_reason: row.unfinishedReason || '',
    tomorrow_action: row.tomorrowAction || '',
  }
}

export function fromPerformanceReport(row) {
  const serviceSales = Number(row.service_sales || 0)
  const consumeSales = Number(row.consume_sales || 0)
  const cashSales = Number(row.cash_sales || 0)
  const upsellAmount = Number(row.upsell_amount || 0)
  const arrivals = Number(row.arrivals || 0)
  const calculatedTotalSales = serviceSales + consumeSales + cashSales + upsellAmount
  const totalSales = row.total_sales == null ? calculatedTotalSales : Number(row.total_sales || 0)
  return {
    id: row.id,
    date: row.date || '',
    store: normalizeStoreName(row.store),
    employee: row.employee || '',
    arrivals,
    serviceSales,
    consumeSales,
    cashSales,
    newCustomers: Number(row.new_customers || 0),
    repeatCustomers: Number(row.repeat_customers || 0),
    upsellAmount,
    totalSales,
    unitPrice: row.unit_price == null ? (arrivals > 0 ? totalSales / arrivals : 0) : Number(row.unit_price || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function toPerformanceReport(row, profile) {
  const serviceSales = Number(row.serviceSales || 0)
  const consumeSales = Number(row.consumeSales || 0)
  const cashSales = Number(row.cashSales || 0)
  const upsellAmount = Number(row.upsellAmount || 0)
  const arrivals = Number(row.arrivals || 0)
  const totalSales = serviceSales + consumeSales + cashSales + upsellAmount
  return {
    date: row.date,
    store: normalizeStoreForWrite(row.store, profile?.store),
    employee: row.employee || '',
    arrivals,
    service_sales: serviceSales,
    consume_sales: consumeSales,
    cash_sales: cashSales,
    new_customers: Number(row.newCustomers || 0),
    repeat_customers: Number(row.repeatCustomers || 0),
    upsell_amount: upsellAmount,
    total_sales: totalSales,
    unit_price: arrivals > 0 ? totalSales / arrivals : 0,
    updated_at: new Date().toISOString(),
  }
}
