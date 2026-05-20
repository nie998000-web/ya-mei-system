import { validStoreNames } from '../lib/mappers'

export const projectCategoryOptions = [
  ['face', '面部'],
  ['body', '身体'],
  ['moxibustion', '艾灸'],
  ['high_end', '高端项目'],
  ['other', '其他'],
]

const defaultProjectPrices = {
  面部基础护理: 198,
  眼八宝: 98,
  面部香薰: 298,
  颈护: 128,
  肩颈调理: 298,
  胸部保养: 398,
  卵巢保养: 398,
  肾保: 398,
  肝胆排毒: 598,
  淋巴: 398,
  腿部保养: 398,
  臀疗: 498,
  头疗: 168,
  艾灸: 18,
  泥灸: 38,
  贝罗娜: 1280,
  中胚: 980,
  祛木: 680,
  私密SAP: 1280,
  苗药: 398,
  童颜抗衰仪: 980,
  魔术刀: 680,
  骨龄抗衰: 980,
  逆龄炮: 780,
}

export const defaultProjectCommissions = [
  { projectName: '面部基础护理', category: 'face', manualCommission: 3, durationMinutes: 60, unit: '次', isActive: true, remark: '' },
  { projectName: '眼八宝', category: 'face', manualCommission: 3, durationMinutes: 30, unit: '次', isActive: true, remark: '' },
  { projectName: '面部香薰', category: 'face', manualCommission: 5, durationMinutes: 60, unit: '次', isActive: true, remark: '' },
  { projectName: '颈护', category: 'body', manualCommission: 3, durationMinutes: 30, unit: '次', isActive: true, remark: '' },
  { projectName: '肩颈调理', category: 'body', manualCommission: 8, durationMinutes: 60, unit: '次', isActive: true, remark: '' },
  { projectName: '胸部保养', category: 'body', manualCommission: 8, durationMinutes: 45, unit: '次', isActive: true, remark: '' },
  { projectName: '卵巢保养', category: 'body', manualCommission: 8, durationMinutes: 45, unit: '次', isActive: true, remark: '' },
  { projectName: '肾保', category: 'body', manualCommission: 8, durationMinutes: 45, unit: '次', isActive: true, remark: '' },
  { projectName: '肝胆排毒', category: 'body', manualCommission: 15, durationMinutes: 90, unit: '次', isActive: true, remark: '' },
  { projectName: '淋巴', category: 'body', manualCommission: 8, durationMinutes: 45, unit: '次', isActive: true, remark: '' },
  { projectName: '腿部保养', category: 'body', manualCommission: 8, durationMinutes: 45, unit: '次', isActive: true, remark: '' },
  { projectName: '臀疗', category: 'body', manualCommission: 15, durationMinutes: 45, unit: '次', isActive: true, remark: '' },
  { projectName: '头疗', category: 'body', manualCommission: 3, durationMinutes: 45, unit: '次', isActive: true, remark: '' },
  { projectName: '艾灸', category: 'moxibustion', manualCommission: 0.5, durationMinutes: '', unit: '个', isActive: true, remark: '' },
  { projectName: '泥灸', category: 'moxibustion', manualCommission: 1, durationMinutes: '', unit: '张', isActive: true, remark: '' },
  { projectName: '贝罗娜', category: 'high_end', manualCommission: 15, durationMinutes: '', unit: '次', isActive: true, remark: '' },
  { projectName: '中胚', category: 'high_end', manualCommission: 15, durationMinutes: '', unit: '次', isActive: true, remark: '' },
  { projectName: '祛木', category: 'high_end', manualCommission: 15, durationMinutes: '', unit: '次', isActive: true, remark: '' },
  { projectName: '私密SAP', category: 'high_end', manualCommission: 20, durationMinutes: '', unit: '次', isActive: true, remark: '' },
  { projectName: '苗药', category: 'high_end', manualCommission: 8, durationMinutes: '', unit: '次', isActive: true, remark: '' },
  { projectName: '童颜抗衰仪', category: 'high_end', manualCommission: 15, durationMinutes: '', unit: '次', isActive: true, remark: '' },
  { projectName: '魔术刀', category: 'high_end', manualCommission: 15, durationMinutes: 40, unit: '次', isActive: true, remark: '局部15元' },
  { projectName: '骨龄抗衰', category: 'high_end', manualCommission: 20, durationMinutes: 40, unit: '次', isActive: true, remark: '' },
  { projectName: '逆龄炮', category: 'high_end', manualCommission: 15, durationMinutes: 30, unit: '次', isActive: true, remark: '' },
].map((item, index) => ({
  id: `preset-project-${index + 1}`,
  defaultPrice: defaultProjectPrices[item.projectName] || 298,
  isCardConsumption: item.category === 'moxibustion',
  isHighEnd: item.category === 'high_end',
  includeSaleCommission: true,
  includeManualCommission: true,
  defaultPerformanceType: item.category === 'moxibustion' ? '消耗' : '售前',
  ...item,
}))

const managerNames = ['刘店长', '王店长', '周店长', '何店长']
const beauticianNames = [
  ['林娜', '胡语', '张倩', '小王'],
  ['李继', '陈思思', '郑雅', '罗萍'],
  ['王红', '唐悦', '高雯', '蒋蓉'],
  ['黄云', '赵晴', '何倩', '杜丽'],
]

export const demoSalaryEmployees = validStoreNames.flatMap((store, storeIndex) => [
  {
    id: `demo-manager-${storeIndex + 1}`,
    name: managerNames[storeIndex],
    phone: `13900010${storeIndex + 1}00`,
    store,
    role: 'manager',
    baseSalary: 2400,
    socialSecurityAllowance: 800,
    fullAttendanceBonus: 100,
    senioritySalary: 100,
    entryDate: '2023-03-01',
    isActive: true,
    isTechnicalDepartment: false,
    salaryPlanType: 'manager_standard',
  },
  ...beauticianNames[storeIndex].map((name, index) => ({
    id: `demo-beautician-${storeIndex + 1}-${index + 1}`,
    name,
    phone: `1390002${storeIndex}${index}00`,
    store,
    role: 'beautician',
    baseSalary: 1700,
    socialSecurityAllowance: 800,
    fullAttendanceBonus: 100,
    senioritySalary: index > 1 ? 50 : 0,
    entryDate: index > 1 ? '2024-01-10' : '2025-08-01',
    isActive: true,
    isTechnicalDepartment: false,
    salaryPlanType: 'beautician_standard',
  })),
  {
    id: `demo-consultant-${storeIndex + 1}`,
    name: `${store.slice(0, 2)}顾问`,
    phone: `13900030${storeIndex + 1}00`,
    store,
    role: 'consultant',
    baseSalary: 2100,
    socialSecurityAllowance: 800,
    fullAttendanceBonus: 100,
    senioritySalary: 50,
    entryDate: '2024-05-01',
    isActive: true,
    isTechnicalDepartment: false,
    salaryPlanType: 'consultant_standard',
  },
])

const storeTargets = [92000, 65000, 88000, 76000]

export const demoPerformanceRecords = validStoreNames.flatMap((store, storeIndex) => {
  const staff = demoSalaryEmployees.filter((item) => item.store === store && item.role === 'beautician')
  const manager = demoSalaryEmployees.find((item) => item.store === store && item.role === 'manager')
  const consultant = demoSalaryEmployees.find((item) => item.store === store && item.role === 'consultant')
  return staff.flatMap((employee, employeeIndex) => {
    const amount = employeeIndex === 0 && storeIndex === 0 ? 32000 : Math.round((storeTargets[storeIndex] / 4) * (0.72 + employeeIndex * 0.12))
    const project = defaultProjectCommissions[(storeIndex * 4 + employeeIndex) % defaultProjectCommissions.length]
    const serviceAmount = Math.round(amount * 0.28)
    const cashAmount = Math.round(amount * 0.55)
    const consumeAmount = amount - serviceAmount - cashAmount
    return [
      {
        id: `demo-record-${storeIndex + 1}-${employeeIndex + 1}`,
        date: '2026-05-13',
        month: '2026-05',
        storeName: store,
        customerName: `测试顾客${storeIndex + 1}${employeeIndex + 1}`,
        projectName: project.projectName,
        projectCategory: project.category,
        amount,
        consumeAmount,
        paymentType: 'cash',
        serviceEmployeeName: employee.name,
        salesEmployeeName: employee.name,
        consultantName: consultant?.name || '',
        quantity: 2 + employeeIndex,
        manualCommissionAmount: Number(project.manualCommission || 0) * (2 + employeeIndex),
        arrivals: 3 + employeeIndex,
        newCustomers: employeeIndex % 2 === 0 ? 2 : 1,
        repeatCustomers: 2 + employeeIndex,
        serviceSales: serviceAmount,
        consumeSales: consumeAmount,
        cashSales: cashAmount,
        upsellAmount: employeeIndex === 0 ? 2600 : 900,
        role: employee.role,
        managerName: manager?.name || '',
      },
    ]
  })
})
