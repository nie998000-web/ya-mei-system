const storeIdToName = {
  all: '全部门店',
  longquan_1: '龙泉1店',
  longquan_2: '龙泉2店',
  longquan_jinlong: '龙泉金龙店',
  pixian_1: '郫县1店',
}

const storeNameToId = {
  龙泉1店: 'longquan_1',
  龙泉2店: 'longquan_2',
  龙泉金龙店: 'longquan_jinlong',
  郫县1店: 'pixian_1',
}

const salarySensitiveFields = [
  'baseSalary',
  'socialSecurityAllowance',
  'fullAttendanceBonus',
  'senioritySalary',
  'performanceCommissionRate',
  'performanceCommissionAmount',
  'manualCommissionAmount',
  'otherBonus',
  'otherDeduction',
  'totalSalary',
  'salaryStatus',
  'salaryRemark',
]

export const testUsers = [
  { username: 'admin', name: '老板', role: 'admin', storeId: 'all', store: '全部门店', employeeId: 'all', label: '老板' },
  { username: 'manager_lq1', name: '龙泉1店店长', role: 'manager', storeId: 'longquan_1', store: '龙泉1店', label: '龙泉1店店长' },
  { username: 'employee_lq1', name: '胡语', role: 'employee', storeId: 'longquan_1', store: '龙泉1店', employeeId: 'demo-beautician-1-2', label: '龙泉1店员工' },
  { username: 'manager_px1', name: '郫县1店店长', role: 'manager', storeId: 'pixian_1', store: '郫县1店', label: '郫县1店店长' },
  { username: 'regional', name: '区域经理', role: 'regional_manager', storeId: 'all', store: '全部门店', regionStoreIds: ['longquan_1', 'longquan_2', 'longquan_jinlong', 'pixian_1'], label: '区域经理' },
]

export function normalizeRole(role) {
  const value = String(role || '').trim().toLowerCase()
  if (value === 'boss') return 'admin'
  if (value === 'beautician' || value === 'technical_teacher') return 'employee'
  return value || 'admin'
}

export function storeNameFromId(storeId) {
  return storeIdToName[storeId] || ''
}

export function storeIdFromName(storeName) {
  return storeNameToId[storeName] || storeName || ''
}

export function currentUserFromProfile(profile) {
  const role = normalizeRole(profile?.role)
  const store = profile?.store || (role === 'admin' ? '全部门店' : '')
  return {
    username: profile?.user_id || 'current',
    name: profile?.name || (role === 'admin' ? '老板' : ''),
    role,
    store,
    storeId: role === 'admin' ? 'all' : storeIdFromName(store),
    employeeId: profile?.employee_id || profile?.id || '',
    regionStoreIds: role === 'regional_manager' ? ['longquan_1', 'longquan_2', 'longquan_jinlong', 'pixian_1'] : [],
  }
}

export function hasPermission(user, permissionKey) {
  const role = normalizeRole(user?.role)
  const rules = {
    viewSalary: ['admin'],
    viewProjectCommissions: ['admin'],
    viewSystemSettings: ['admin'],
    viewEmployeeManagement: ['admin'],
    viewAllStores: ['admin'],
    viewStoreTargets: ['admin', 'manager', 'regional_manager'],
    viewPerformanceReports: ['admin', 'manager'],
    viewPerformanceMonthly: ['admin', 'manager'],
  }
  return (rules[permissionKey] || []).includes(role)
}

export function canViewMenu(user, menuKey, menuPermissions) {
  const role = normalizeRole(user?.role)
  return (menuPermissions[menuKey] || []).includes(role)
}

export function canViewSalary(user) {
  return normalizeRole(user?.role) === 'admin'
}

export function canViewAllStores(user) {
  return normalizeRole(user?.role) === 'admin'
}

function recordStoreId(record) {
  return record?.storeId || record?.store_id || storeIdFromName(record?.store || record?.storeName || record?.store_name)
}

function isOwnRecord(record, user) {
  const employeeId = String(user?.employeeId || '')
  const userName = String(user?.name || '')
  return (
    (employeeId && [
      record?.employeeId,
      record?.employee_id,
      record?.serviceEmployeeId,
      record?.service_employee_id,
      record?.salesEmployeeId,
      record?.sales_employee_id,
      record?.ownerEmployeeId,
      record?.owner_employee_id,
      record?.id,
    ].map((value) => String(value || '')).includes(employeeId)) ||
    (userName && [record?.employee, record?.name, record?.owner, record?.serviceEmployeeName, record?.salesEmployeeName, record?.employeeName].includes(userName))
  )
}

export function filterRecordsByUserPermission(records, user) {
  const list = Array.isArray(records) ? records : []
  const role = normalizeRole(user?.role)
  if (role === 'admin') return list
  if (role === 'manager') return list.filter((record) => recordStoreId(record) === user?.storeId)
  if (role === 'regional_manager') return list.filter((record) => (user?.regionStoreIds || []).includes(recordStoreId(record)))
  if (role === 'consultant') {
    return list.filter((record) => {
      const employeeId = String(user?.employeeId || '')
      return isOwnRecord(record, user) || String(record?.consultantId || record?.consultant_id || '') === employeeId
    })
  }
  return list.filter((record) => isOwnRecord(record, user))
}

export function stripSalaryFields(record, user) {
  if (canViewSalary(user)) return record
  const clean = { ...(record || {}) }
  salarySensitiveFields.forEach((field) => {
    if (field in clean) delete clean[field]
  })
  return clean
}
