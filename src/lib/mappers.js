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
    baseSalary: Number(row.base_salary ?? 0),
    socialSecurityAllowance: Number(row.social_security_allowance ?? 0),
    fullAttendanceBonus: Number(row.full_attendance_bonus ?? 0),
    senioritySalary: Number(row.seniority_salary ?? 0),
    entryDate: row.entry_date || '',
    isActive: row.is_active !== false,
    isTechnicalDepartment: Boolean(row.is_technical_department),
    salaryPlanType: row.salary_plan_type || '',
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

export function toEmployee(row, profile) {
  return {
    name: row.name || '',
    phone: row.phone || '',
    store: normalizeStoreForWrite(row.store, profile?.store),
    role: row.role || 'beautician',
    note: row.note || '',
    base_salary: Number(row.baseSalary || 0),
    social_security_allowance: Number(row.socialSecurityAllowance || 0),
    full_attendance_bonus: Number(row.fullAttendanceBonus || 0),
    seniority_salary: Number(row.senioritySalary || 0),
    entry_date: row.entryDate || null,
    is_active: row.isActive !== false,
    is_technical_department: Boolean(row.isTechnicalDepartment),
    salary_plan_type: row.salaryPlanType || '',
    updated_at: new Date().toISOString(),
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

export function fromStoreTarget(row) {
  return {
    id: row.id,
    month: row.month || '',
    store: normalizeStoreName(row.store),
    monthlyTarget: Number(row.monthly_target || 0),
    dailyTarget: Number(row.daily_target || 0),
    currentSales: Number(row.current_sales || 0),
    completionRate: Number(row.completion_rate || 0),
    remainingAmount: Number(row.remaining_amount || 0),
    createdAt: row.created_at,
  }
}

export function toStoreTarget(row, profile) {
  return {
    month: row.month,
    store: normalizeStoreForWrite(row.store, profile?.store),
    monthly_target: Number(row.monthlyTarget || 0),
    daily_target: Number(row.dailyTarget || 0),
    current_sales: Number(row.currentSales || 0),
    completion_rate: Number(row.completionRate || 0),
    remaining_amount: Number(row.remainingAmount || 0),
  }
}

export function fromProjectCommission(row) {
  return {
    id: row.id,
    projectName: row.project_name || '',
    category: row.category || 'other',
    manualCommission: Number(row.manual_commission || 0),
    durationMinutes: row.duration_minutes ?? '',
    unit: row.unit || '次',
    isActive: row.is_active !== false,
    remark: row.remark || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function toProjectCommission(row) {
  return {
    project_name: row.projectName || '',
    category: row.category || 'other',
    manual_commission: Number(row.manualCommission || 0),
    duration_minutes: row.durationMinutes === '' || row.durationMinutes == null ? null : Number(row.durationMinutes),
    unit: row.unit || '次',
    is_active: row.isActive !== false,
    remark: row.remark || '',
    updated_at: new Date().toISOString(),
  }
}

export function fromPerformanceRecord(row) {
  return {
    id: row.id,
    date: row.date || '',
    month: row.month || String(row.date || '').slice(0, 7),
    storeId: row.store_id,
    storeName: normalizeStoreName(row.store_name || row.store),
    customerId: row.customer_id,
    customerName: row.customer_name || '',
    projectId: row.project_id,
    projectName: row.project_name || '',
    projectCategory: row.project_category || '',
    amount: Number(row.amount || 0),
    consumeAmount: Number(row.consume_amount || 0),
    paymentType: row.payment_type || 'cash',
    serviceEmployeeId: row.service_employee_id,
    serviceEmployeeName: row.service_employee_name || '',
    salesEmployeeId: row.sales_employee_id,
    salesEmployeeName: row.sales_employee_name || '',
    consultantId: row.consultant_id,
    consultantName: row.consultant_name || '',
    quantity: Number(row.quantity || 0),
    manualCommissionAmount: Number(row.manual_commission_amount || 0),
    remark: row.remark || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function fromCashierOrder(row) {
  const storeName = normalizeStoreName(row.store_name || row.store)
  return {
    id: row.id,
    orderNo: row.order_no || '',
    date: row.date || '',
    month: row.month || String(row.date || '').slice(0, 7),
    storeId: row.store_id,
    storeName,
    store: storeName,
    customerId: row.customer_id,
    customerName: row.customer_name || '',
    customerPhone: row.customer_phone || '',
    projectId: row.project_id,
    projectName: row.project_name || '',
    projectCategory: row.project_category || '',
    quantity: Number(row.quantity || 1),
    originalAmount: Number(row.original_amount || 0),
    discountAmount: Number(row.discount_amount || 0),
    actualAmount: Number(row.actual_amount || 0),
    amount: Number(row.actual_amount || 0),
    consumeAmount: Number(row.consume_amount || 0),
    paymentType: row.payment_type || 'cash',
    serviceEmployeeId: row.service_employee_id,
    serviceEmployeeName: row.service_employee_name || '',
    salesEmployeeId: row.sales_employee_id,
    salesEmployeeName: row.sales_employee_name || '',
    consultantId: row.consultant_id,
    consultantName: row.consultant_name || '',
    manualCommissionAmount: Number(row.manual_commission_amount || 0),
    remark: row.remark || '',
    status: row.status || 'active',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function toCashierOrder(row, profile) {
  const date = row.date || new Date().toISOString().slice(0, 10)
  const quantity = Number(row.quantity || 1)
  const manualCommission = Number(row.manualCommission || 0)
  const originalAmount = Number(row.originalAmount || 0)
  const discountAmount = Number(row.discountAmount || 0)
  const actualAmount = row.actualAmount === '' || row.actualAmount == null
    ? Math.max(originalAmount - discountAmount, 0)
    : Number(row.actualAmount || 0)
  return {
    order_no: row.orderNo || '',
    date,
    month: String(date).slice(0, 7),
    store_id: row.storeId || null,
    store_name: normalizeStoreForWrite(row.storeName || row.store, profile?.store),
    customer_id: row.customerId || null,
    customer_name: row.customerName || '',
    customer_phone: row.customerPhone || '',
    project_id: row.projectId || null,
    project_name: row.projectName || '',
    project_category: row.projectCategory || '',
    quantity,
    original_amount: originalAmount,
    discount_amount: discountAmount,
    actual_amount: actualAmount,
    consume_amount: Number(row.consumeAmount || 0),
    payment_type: row.paymentType || 'cash',
    service_employee_id: row.serviceEmployeeId || null,
    service_employee_name: row.serviceEmployeeName || '',
    sales_employee_id: row.salesEmployeeId || null,
    sales_employee_name: row.salesEmployeeName || '',
    consultant_id: row.consultantId || null,
    consultant_name: row.consultantName || '',
    manual_commission_amount: manualCommission * quantity,
    remark: row.remark || '',
    status: row.status || 'active',
    updated_at: new Date().toISOString(),
  }
}

export function cashierOrderToPerformanceRecord(order) {
  return {
    id: order.id,
    date: order.date,
    month: order.month || String(order.date || '').slice(0, 7),
    storeId: order.storeId,
    storeName: normalizeStoreName(order.storeName || order.store),
    customerId: order.customerId,
    customerName: order.customerName,
    projectId: order.projectId,
    projectName: order.projectName,
    projectCategory: order.projectCategory,
    amount: Number(order.actualAmount || 0),
    consumeAmount: Number(order.consumeAmount || 0),
    paymentType: order.paymentType,
    serviceEmployeeId: order.serviceEmployeeId,
    serviceEmployeeName: order.serviceEmployeeName,
    salesEmployeeId: order.salesEmployeeId,
    salesEmployeeName: order.salesEmployeeName,
    consultantId: order.consultantId,
    consultantName: order.consultantName,
    quantity: Number(order.quantity || 1),
    manualCommissionAmount: Number(order.manualCommissionAmount || 0),
    remark: order.remark || '',
    status: order.status || 'active',
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  }
}
