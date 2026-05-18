const toNumber = (value) => {
  const number = Number(value || 0)
  return Number.isFinite(number) ? number : 0
}

export const salaryRoleOptions = [
  ['beautician', '美容师'],
  ['manager', '店长'],
  ['consultant', '顾问'],
  ['director', '总监'],
  ['regional_manager', '区域经理'],
  ['technical_teacher', '技术老师'],
  ['admin', '管理员'],
]

export const defaultSalaryPlans = {
  beautician: {
    salaryPlanType: 'beautician_standard',
    baseSalary: 1700,
    socialSecurityAllowance: 800,
    fullAttendanceBonus: 100,
  },
  manager: {
    salaryPlanType: 'manager_standard',
    baseSalary: 2400,
    socialSecurityAllowance: 800,
    fullAttendanceBonus: 100,
  },
  consultant: {
    salaryPlanType: 'consultant_standard',
    baseSalary: 2100,
    socialSecurityAllowance: 800,
    fullAttendanceBonus: 100,
  },
  technical_teacher: {
    salaryPlanType: 'technical_standard',
    baseSalary: 2600,
    socialSecurityAllowance: 800,
    fullAttendanceBonus: 100,
  },
}

export function getSalaryPlanForRole(role, isTechnicalDepartment = false) {
  if (isTechnicalDepartment || role === 'technical_teacher') return defaultSalaryPlans.technical_teacher
  if (role === 'manager') return defaultSalaryPlans.manager
  if (role === 'consultant') return defaultSalaryPlans.consultant
  return defaultSalaryPlans.beautician
}

export function getBeauticianCommissionRate(amount) {
  const value = toNumber(amount)
  if (value >= 30000) return { rate: 0.1, label: '30000以上：10%' }
  if (value >= 25000) return { rate: 0.09, label: '25000-30000：9%' }
  if (value >= 18000) return { rate: 0.08, label: '18000-25000：8%' }
  if (value >= 12000) return { rate: 0.07, label: '12000-18000：7%' }
  if (value >= 8000) return { rate: 0.06, label: '8000-12000：6%' }
  if (value >= 5000) return { rate: 0.05, label: '5000-8000：5%' }
  return { rate: 0, label: '5000以下：0%' }
}

export function getManagerCommissionRate(amount) {
  const value = toNumber(amount)
  if (value >= 100000) return { rate: 0.08, label: '100000以上：8%' }
  if (value >= 80000) return { rate: 0.07, label: '80000-100000：7%' }
  if (value >= 50000) return { rate: 0.05, label: '50000-80000：5%' }
  if (value >= 30000) return { rate: 0.03, label: '30000-50000：3%' }
  return { rate: 0.01, label: '30000以下：1%' }
}

export function getConsultantCommissionRate(amount) {
  const value = toNumber(amount)
  if (value >= 100000) return { rate: 0.06, label: '100000以上：6%' }
  if (value >= 50000) return { rate: 0.04, label: '50000-100000：4%' }
  if (value >= 30000) return { rate: 0.02, label: '30000-50000：2%' }
  if (value >= 10000) return { rate: 0.01, label: '10000-30000：1%' }
  return { rate: 0, label: '10000以下：0%' }
}

export function calculateSenioritySalary(entryDate, targetMonth) {
  if (!entryDate || !targetMonth) return 0
  const entry = new Date(`${String(entryDate).slice(0, 10)}T00:00:00`)
  const target = new Date(`${targetMonth}-01T00:00:00`)
  if (Number.isNaN(entry.getTime()) || Number.isNaN(target.getTime()) || target < entry) return 0
  let years = target.getFullYear() - entry.getFullYear()
  if (target.getMonth() < entry.getMonth()) years -= 1
  return Math.min(Math.max(years, 0) * 50, 200)
}

export function calculateManualCommission(records) {
  return (Array.isArray(records) ? records : []).reduce((sum, record) => {
    return sum + toNumber(record.manualCommissionAmount ?? record.manual_commission_amount)
  }, 0)
}

export function calculateStorePerformance(records, storeName, month) {
  return (Array.isArray(records) ? records : [])
    .filter((record) => (!storeName || record.storeName === storeName || record.store === storeName) && (!month || String(record.month || record.date || '').startsWith(month)))
    .reduce((sum, record) => sum + toNumber(record.amount ?? record.totalSales ?? record.total_sales), 0)
}

export function calculateEmployeePerformance(records, employeeName, month) {
  return (Array.isArray(records) ? records : [])
    .filter((record) => {
      const name = record.salesEmployeeName || record.sales_employee_name || record.employee
      return (!employeeName || name === employeeName) && (!month || String(record.month || record.date || '').startsWith(month))
    })
    .reduce((sum, record) => sum + toNumber(record.amount ?? record.totalSales ?? record.total_sales), 0)
}

export function calculateEmployeeSalary(employee, performanceRecords, options = {}) {
  const role = employee?.role || 'beautician'
  const month = options.month || ''
  const storeName = employee?.storeName || employee?.store || ''
  const employeeName = employee?.name || employee?.employeeName || ''
  const employeeRecords = (Array.isArray(performanceRecords) ? performanceRecords : []).filter((record) => {
    const recordMonth = String(record.month || record.date || '').slice(0, 7)
    const salesName = record.salesEmployeeName || record.sales_employee_name || record.employee
    const serviceName = record.serviceEmployeeName || record.service_employee_name || record.employee
    return (!month || recordMonth === month) && (salesName === employeeName || serviceName === employeeName)
  })
  const storeRecords = (Array.isArray(performanceRecords) ? performanceRecords : []).filter((record) => {
    const recordMonth = String(record.month || record.date || '').slice(0, 7)
    const recordStore = record.storeName || record.store
    return (!month || recordMonth === month) && recordStore === storeName
  })
  const plan = getSalaryPlanForRole(role, employee?.isTechnicalDepartment)
  const baseSalary = toNumber(employee?.baseSalary ?? employee?.base_salary ?? plan.baseSalary)
  const socialSecurityAllowance = toNumber(employee?.socialSecurityAllowance ?? employee?.social_security_allowance ?? plan.socialSecurityAllowance)
  const fullAttendanceBonus = toNumber(employee?.fullAttendanceBonus ?? employee?.full_attendance_bonus ?? plan.fullAttendanceBonus)
  const senioritySalary = toNumber(employee?.senioritySalary ?? employee?.seniority_salary ?? calculateSenioritySalary(employee?.entryDate ?? employee?.entry_date, month))
  const personalPerformanceAmount = calculateEmployeePerformance(employeeRecords, employeeName, month)
  const storePerformanceAmount = calculateStorePerformance(storeRecords, storeName, month)
  const manualCommissionAmount = calculateManualCommission(employeeRecords)
  const commissionRule = role === 'manager'
    ? getManagerCommissionRate(storePerformanceAmount)
    : role === 'consultant'
      ? getConsultantCommissionRate(personalPerformanceAmount)
      : employee?.isTechnicalDepartment || role === 'technical_teacher'
        ? { rate: 0.08, label: '技术老师：8%' }
        : getBeauticianCommissionRate(personalPerformanceAmount)
  const commissionBase = role === 'manager' ? storePerformanceAmount : personalPerformanceAmount
  const performanceCommissionAmount = commissionBase * commissionRule.rate
  const otherBonus = toNumber(options.otherBonus)
  const absenceDeduction = toNumber(options.absenceDeduction)
  const socialSecurityDeduction = toNumber(options.socialSecurityDeduction)
  const otherDeduction = toNumber(options.otherDeduction)
  const totalSalary = baseSalary
    + socialSecurityAllowance
    + fullAttendanceBonus
    + senioritySalary
    + performanceCommissionAmount
    + manualCommissionAmount
    + otherBonus
    - absenceDeduction
    - socialSecurityDeduction
    - otherDeduction

  return {
    employeeId: employee?.id,
    employeeName,
    storeName,
    role,
    month,
    baseSalary,
    socialSecurityAllowance,
    fullAttendanceBonus,
    senioritySalary,
    personalPerformanceAmount,
    storePerformanceAmount,
    performanceCommissionRate: commissionRule.rate,
    performanceCommissionLabel: commissionRule.label,
    performanceCommissionAmount,
    manualCommissionAmount,
    otherBonus,
    absenceDeduction,
    socialSecurityDeduction,
    otherDeduction,
    totalSalary,
    status: options.status || '未结算',
    remark: options.remark || '',
  }
}
