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

export function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || '').trim())
}

export function isDbId(value) {
  const text = String(value ?? '').trim()
  return Boolean(text) && (isUuid(text) || /^\d+$/.test(text))
}

function uuidOrNull(value) {
  return isUuid(value) ? String(value).trim() : null
}

function dbIdOrNull(value) {
  const text = String(value ?? '').trim()
  if (!isDbId(text)) return null
  return /^\d+$/.test(text) ? Number(text) : text
}

function toBoolean(value, fallback = false) {
  if (value === true || value === false) return value
  const text = String(value ?? '').trim().toLowerCase()
  if (['true', '1', 'yes', 'y', '新客', '是'].includes(text)) return true
  if (['false', '0', 'no', 'n', '否', '老客'].includes(text)) return false
  return fallback
}

export function fromCustomer(row, storeById = new Map()) {
  const storeId = row.store_id || row.storeId || row.current_store_id || row.shop_id || row.branch_id || ''
  const rawStore = storeById.get(String(storeId)) || row.store || row.store_name || row.branch || row.shopName || row.shop_name || ''
  const storeName = normalizeStoreName(rawStore) || rawStore || ''
  return {
    id: row.id,
    name: String(row.name ?? row.customer_name ?? row.customerName ?? ''),
    phone: String(row.phone ?? row.mobile ?? row.customer_phone ?? row.tel ?? ''),
    age: row.age ?? '',
    birthday: row.birthday ?? row.birth_date ?? row.birthDate ?? '',
    isNewCustomer: toBoolean(row.is_new_customer ?? row.isNewCustomer, false),
    storeId,
    store: storeName,
    owner: String(row.owner ?? row.beautician ?? row.staff_name ?? row.employee_name ?? row.owner_name ?? row.responsible_staff ?? ''),
    level: String(row.level || row.customer_level || ''),
    lastVisit: row.last_visit ?? row.last_visit_date ?? row.recent_visit ?? row.lastVisit ?? '',
    lastFollowResult: row.last_follow_result || row.follow_status || '未联系',
    lastFollowTime: row.last_follow_time || '',
    nextFollowTime: row.next_follow_time || row.next_follow_date || '',
    followStatus: row.follow_status || row.last_follow_result || '未联系',
    followNote: row.follow_note || row.note || '',
    todayTaskCompletedAt: row.today_task_completed_at || '',
    createdAt: row.created_at || row.createdAt || '',
    updatedAt: row.updated_at || row.updatedAt || '',
  }
}

export function fromEmployee(row, storeById = new Map()) {
  const storeId = row.store_id || row.storeId || row.shop_id || row.branch_id || ''
  const rawStore = storeById.get(String(storeId)) || row.store || row.store_name || row.shop_name || row.branch || ''
  return {
    id: row.id,
    name: row.name || row.employee_name || row.staff_name || '',
    phone: row.phone || row.mobile || '',
    storeId,
    store: normalizeStoreName(rawStore) || rawStore || '',
    role: row.role || row.staff_role || row.position || row.job_title || 'beautician',
    entryDate: row.entry_date || '',
    isActive: row.is_active !== false,
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
    store_id: dbIdOrNull(row.storeId || profile?.storeId),
    store: normalizeStoreForWrite(row.store, profile?.store),
    role: row.role || 'beautician',
    note: row.note || '',
    entry_date: row.entryDate || null,
    is_active: row.isActive !== false,
    updated_at: new Date().toISOString(),
  }
}

export function fromFollowup(row) {
  return {
    id: row.id,
    customerId: row.customer_id || '',
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
  return {
    customer_id: dbIdOrNull(row.customerId),
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
  let actionData = {}
  try {
    actionData = row.tomorrow_action ? JSON.parse(row.tomorrow_action) : {}
  } catch {
    actionData = { tomorrowFocus: row.tomorrow_action || '' }
  }

  return {
    id: row.id,
    date: row.date,
    store: normalizeStoreName(row.store),
    goalCompleted: Number(row.invite_rate || 0) > 0,
    unfinishedReason: row.unfinished_reason,
    mainIssue: actionData.mainIssue || '',
    tomorrowFocus: actionData.tomorrowFocus || '',
    tomorrowInviteTarget: actionData.tomorrowInviteTarget || '',
    tomorrowKeyCustomers: actionData.tomorrowKeyCustomers || '',
    bossSupport: actionData.bossSupport || '',
    createdAt: row.created_at,
  }
}

export function toReview(row, profile) {
  return {
    date: row.date,
    store: normalizeStoreForWrite(row.store, profile?.store),
    invite_rate: row.goalCompleted ? 1 : 0,
    appointment_rate: 0,
    arrival_rate: 0,
    deal_rate: 0,
    deal_amount: 0,
    unfinished_reason: row.unfinishedReason || '',
    tomorrow_action: JSON.stringify({
      mainIssue: row.mainIssue || '',
      tomorrowFocus: row.tomorrowFocus || '',
      tomorrowInviteTarget: row.tomorrowInviteTarget || '',
      tomorrowKeyCustomers: row.tomorrowKeyCustomers || '',
      bossSupport: row.bossSupport || '',
    }),
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
  let config = {}
  let remarkText = row.remark || ''
  try {
    const parsed = row.remark ? JSON.parse(row.remark) : {}
    config = parsed && typeof parsed === 'object' ? parsed : {}
    remarkText = config.text || ''
  } catch {
    config = {}
  }
  return {
    id: row.id,
    projectName: row.project_name || row.name || row.projectName || '',
    category: row.category || row.project_category || 'other',
    defaultPrice: Number(row.default_price ?? row.price ?? row.defaultPrice ?? config.defaultPrice ?? 0),
    manualCommission: Number(row.fixed_manual_commission ?? row.fixed_handwork_fee ?? row.handwork_fee ?? row.manual_commission ?? row.manualCommission ?? config.manualCommission ?? 0),
    durationMinutes: row.duration_minutes ?? row.duration ?? row.project_duration ?? row.durationMinutes ?? '',
    unit: row.unit || '次',
    isCardConsumption: row.is_card_consumption ?? row.is_card_deduct ?? row.consume_card ?? config.isCardConsumption ?? false,
    isHighEnd: row.is_high_end ?? row.isHighEnd ?? config.isHighEnd ?? false,
    includeSaleCommission: row.include_sale_commission ?? row.allow_sales_commission ?? config.includeSaleCommission ?? true,
    includeManualCommission: row.include_manual_commission ?? row.allow_handwork_commission ?? config.includeManualCommission ?? true,
    defaultPerformanceType: row.default_performance_type || row.performance_type || config.defaultPerformanceType || '售前',
    isActive: (row.is_enabled ?? row.enabled ?? row.is_active) !== false,
    remark: remarkText,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function toProjectCommission(row) {
  const remarkConfig = {
    text: row.remark || '',
    defaultPrice: Number(row.defaultPrice || 0),
    isCardConsumption: Boolean(row.isCardConsumption),
    isHighEnd: Boolean(row.isHighEnd),
    includeSaleCommission: row.includeSaleCommission !== false,
    includeManualCommission: row.includeManualCommission !== false,
    defaultPerformanceType: row.defaultPerformanceType || '售前',
  }
  return {
    project_name: row.projectName || '',
    category: row.category || 'other',
    manual_commission: Number(row.manualCommission || 0),
    duration_minutes: row.durationMinutes === '' || row.durationMinutes == null ? null : Number(row.durationMinutes),
    unit: row.unit || '次',
    is_active: row.isActive !== false,
    remark: JSON.stringify(remarkConfig),
    updated_at: new Date().toISOString(),
  }
}

export function toProjectStandard(row) {
  return {
    project_name: row.projectName || '',
    category: row.category || 'other',
    default_price: Number(row.defaultPrice || 0),
    fixed_manual_commission: Number(row.manualCommission || 0),
    duration_minutes: row.durationMinutes === '' || row.durationMinutes == null ? null : Number(row.durationMinutes),
    unit: row.unit || '次',
    is_card_consumption: Boolean(row.isCardConsumption),
    is_high_end: Boolean(row.isHighEnd),
    include_sale_commission: row.includeSaleCommission !== false,
    include_manual_commission: row.includeManualCommission !== false,
    default_performance_type: row.defaultPerformanceType || '售前',
    is_enabled: row.isActive !== false,
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
    manualCommissionAmount: 0,
    remark: row.remark || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function fromCashierOrder(row) {
  const storeName = normalizeStoreName(row.store_name || row.store)
  const fallbackItem = {
    id: `legacy-${row.id}`,
    orderId: row.id,
    projectId: row.project_id,
    projectName: row.project_name || '',
    projectCategory: row.project_category || '',
    quantity: Number(row.quantity || 1),
    originalAmount: Number(row.original_amount || 0),
    discountAmount: Number(row.discount_amount || 0),
    actualAmount: Number(row.actual_amount || 0),
    consumeAmount: Number(row.consume_amount || 0),
    manualCommission: Number(row.manual_commission || 0),
    manualCommissionAmount: Number(row.manual_commission_amount || 0),
    durationMinutes: '',
  }
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
    orderItems: row.orderItems?.length ? row.orderItems : (row.project_name ? [fallbackItem] : []),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function toCashierOrder(row, profile) {
  const date = row.date || new Date().toISOString().slice(0, 10)
  const items = Array.isArray(row.orderItems) && row.orderItems.length ? row.orderItems : []
  const firstItem = items[0] || row
  const quantity = items.length ? items.reduce((sum, item) => sum + Number(item.quantity || 0), 0) : Number(row.quantity || 1)
  const originalAmount = items.length ? items.reduce((sum, item) => sum + Number(item.originalAmount || 0), 0) : Number(row.originalAmount || 0)
  const discountAmount = items.length ? items.reduce((sum, item) => sum + Number(item.discountAmount || 0), 0) : Number(row.discountAmount || 0)
  const actualAmount = items.length
    ? items.reduce((sum, item) => sum + Number(item.actualAmount || 0), 0)
    : row.actualAmount === '' || row.actualAmount == null
      ? Math.max(originalAmount - discountAmount, 0)
      : Number(row.actualAmount || 0)
  const consumeAmount = items.length ? items.reduce((sum, item) => sum + Number(item.consumeAmount || 0), 0) : Number(row.consumeAmount || 0)
  const manualCommissionAmount = items.length
    ? items.reduce((sum, item) => sum + Number(item.manualCommissionAmount ?? (Number(item.manualCommission || 0) * Number(item.quantity || 1))), 0)
    : Number(row.manualCommissionAmount || 0)
  return {
    order_no: row.orderNo || '',
    date,
    month: String(date).slice(0, 7),
    store_id: dbIdOrNull(row.storeId),
    store_name: normalizeStoreForWrite(row.storeName || row.store, profile?.store),
    customer_id: dbIdOrNull(row.customerId),
    customer_name: row.customerName || '',
    customer_phone: row.customerPhone || '',
    project_id: dbIdOrNull(firstItem.projectId),
    project_name: items.length > 1 ? items.map((item) => item.projectName).filter(Boolean).join(' + ') : firstItem.projectName || '',
    project_category: firstItem.projectCategory || '',
    quantity,
    original_amount: originalAmount,
    discount_amount: discountAmount,
    actual_amount: actualAmount,
    consume_amount: consumeAmount,
    payment_type: row.paymentType || 'cash',
    service_employee_id: dbIdOrNull(row.serviceEmployeeId),
    service_employee_name: row.serviceEmployeeName || '',
    sales_employee_id: dbIdOrNull(row.salesEmployeeId),
    sales_employee_name: row.salesEmployeeName || '',
    consultant_id: dbIdOrNull(row.consultantId),
    consultant_name: row.consultantName || '',
    manual_commission_amount: manualCommissionAmount,
    remark: row.remark || '',
    status: row.status || 'active',
    updated_at: new Date().toISOString(),
  }
}

export function fromCashierOrderItem(row) {
  return {
    id: row.id,
    orderId: row.order_id,
    projectId: row.project_id,
    projectName: row.project_name || '',
    projectCategory: row.project_category || '',
    quantity: Number(row.quantity || 1),
    originalAmount: Number(row.original_amount || 0),
    discountAmount: Number(row.discount_amount || 0),
    actualAmount: Number(row.actual_amount || 0),
    consumeAmount: Number(row.consume_amount || 0),
    manualCommission: Number(row.manual_commission || 0),
    manualCommissionAmount: Number(row.manual_commission_amount || 0),
    durationMinutes: row.duration_minutes ?? '',
  }
}

export function toCashierOrderItem(item, orderId) {
  const quantity = Number(item.quantity || 1)
  const manualCommission = Number(item.manualCommission || 0)
  return {
    order_id: orderId,
    project_id: dbIdOrNull(item.projectId),
    project_name: item.projectName || '',
    project_category: item.projectCategory || '',
    quantity,
    original_amount: Number(item.originalAmount || 0),
    discount_amount: Number(item.discountAmount || 0),
    actual_amount: Number(item.actualAmount || 0),
    consume_amount: Number(item.consumeAmount || 0),
    manual_commission: manualCommission,
    manual_commission_amount: Number(item.manualCommissionAmount ?? manualCommission * quantity),
    duration_minutes: item.durationMinutes === '' || item.durationMinutes == null ? null : Number(item.durationMinutes),
  }
}

export function cashierOrderToPerformanceRecord(order) {
  const manualCommissionAmount = Array.isArray(order.orderItems) && order.orderItems.length
    ? order.orderItems.reduce((sum, item) => sum + Number(item.manualCommissionAmount || 0), 0)
    : Number(order.manualCommissionAmount || 0)
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
    manualCommissionAmount,
    remark: order.remark || '',
    status: order.status || 'active',
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  }
}
