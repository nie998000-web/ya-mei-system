export const menuPermissions = {
  dashboard: ['admin', 'boss', 'manager'],
  cashier: ['admin', 'boss', 'manager'],
  customers: ['admin', 'boss', 'manager'],
  activation: ['admin', 'boss', 'manager'],
  performanceMonthly: ['admin', 'boss', 'manager'],
  handworkSettlement: ['admin', 'boss', 'manager'],
  projectCommissions: ['admin', 'boss', 'manager'],
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
  cashier: '今日收银台',
  customers: '顾客管理',
  activation: '未到店激活',
  performanceMonthly: '员工业绩月报',
  handworkSettlement: '手工费结算',
  projectCommissions: '项目标准库',
}
