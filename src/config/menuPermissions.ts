export const menuPermissions = {
  dashboard: ['admin', 'boss', 'manager', 'regional_manager', 'employee', 'beautician', 'consultant', 'technical_teacher'],
  customers: ['admin', 'boss', 'manager', 'regional_manager', 'employee', 'beautician', 'consultant', 'technical_teacher'],
  activation: ['admin', 'boss', 'manager', 'regional_manager', 'employee', 'beautician', 'consultant', 'technical_teacher'],
  cashier: ['admin', 'boss', 'manager', 'employee', 'beautician', 'consultant', 'technical_teacher'],
  storeTargets: ['admin', 'boss', 'manager', 'regional_manager'],
  performanceReports: ['admin', 'boss', 'manager'],
  performanceMonthly: ['admin', 'boss', 'manager'],
  salarySettlement: ['admin', 'boss'],
  projectCommissions: ['admin', 'boss'],
  employees: ['admin', 'boss'],
  settings: ['admin', 'boss'],
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
  storeTargets: '门店目标',
  performanceReports: '员工业绩日报',
  performanceMonthly: '员工业绩月报',
  salarySettlement: '工资结算',
  projectCommissions: '项目提成设置',
  employees: '员工管理',
  settings: '系统设置',
}
