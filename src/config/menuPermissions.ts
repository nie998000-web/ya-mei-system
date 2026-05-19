export const menuPermissions = {
  dashboard: ['admin', 'boss', 'manager'],
  customers: ['admin', 'boss', 'manager'],
  activation: ['admin', 'boss', 'manager'],
  cashier: ['admin', 'boss', 'manager'],
  reviews: ['admin', 'boss', 'manager'],
  storeTargets: ['admin', 'boss', 'manager'],
  performanceReports: ['admin', 'boss', 'manager'],
  performanceMonthly: ['admin', 'boss', 'manager'],
  employees: ['admin', 'boss', 'manager'],
}

export const sensitiveRoutes = {
  '/salary': 'salarySettlement',
  '/salary-settlement': 'salarySettlement',
  '/employee-performance-monthly': 'performanceMonthly',
  '/commission-settings': 'projectCommissions',
  '/project-commission-settings': 'projectCommissions',
  '/employee-management': 'employees',
  '/system-settings': 'settings',
}

export const menuLabels = {
  dashboard: '首页看板',
  customers: '顾客管理',
  activation: '未到店激活',
  cashier: '开单收银',
  reviews: '每日复盘',
  storeTargets: '门店目标',
  performanceReports: '员工业绩日报',
  performanceMonthly: '员工业绩月报',
  employees: '员工管理',
}
