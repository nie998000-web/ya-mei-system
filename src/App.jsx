import { Component, useEffect, useMemo, useRef, useState } from 'react'
import {
  followMethods,
  issueOptions,
  levelOptions,
  makeCustomerStatus,
  stores as defaultStores,
} from './data/seedData'
import { defaultProjectCommissions } from './data/salarySeedData'
import { menuLabels, menuPermissions, sensitiveRoutes } from './config/menuPermissions'
import { canManage, useCloudData } from './hooks/useCloudData'
import { cashierOrderToPerformanceRecord, isDbId, normalizeStoreName, validStoreNames } from './lib/mappers'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import { ageFromBirthday, daysSince, normalizeDateInput, percent, todayString } from './utils/date'
import { money } from './utils/format'
import {
  canViewMenu,
  currentUserFromProfile,
  filterRecordsByUserPermission,
  normalizeRole,
  storeNameFromId,
  stripSalaryFields,
  testUsers,
} from './utils/permission'

const navItems = Object.entries(menuLabels)
const routeToMenuKey = Object.entries(sensitiveRoutes).reduce((map, [path, key]) => ({ ...map, [path]: key }), { '/cashier': 'cashier' })
const devRoleSwitcherEnabled = import.meta.env.DEV
const devRoleStorageKey = 'yaMeiDevRole'
const legacyIdCacheKeys = ['selectedStore', 'dashboardSelectedStore', 'cashierCustomerId', 'cashierProjectId', 'cashierEmployeeId', 'cashierOrderId', 'customerId', 'projectId', 'employeeId', 'storeId']

function isBossRole(role) {
  const value = String(role || '').trim().toLowerCase()
  return value === 'boss' || value === 'admin'
}

function isBeauticianRole(role) {
  const value = String(role || '').trim().toLowerCase()
  return value === 'beautician' || value === 'employee' || value === 'consultant' || value === 'technical_teacher'
}

function roleLabel(role) {
  const labels = {
    boss: '老板',
    admin: '管理员',
    manager: '店长',
    employee: '普通员工',
    beautician: '美容师',
    consultant: '顾问',
    director: '总监',
    regional_manager: '区域经理',
    technical_teacher: '技术老师',
    reception: '前台',
    front_desk: '前台',
  }
  return labels[role] || role || ''
}

function normalizeStaffRole(role) {
  const value = String(role || '').trim().toLowerCase()
  const roleMap = {
    employee: 'beautician',
    美容师: 'beautician',
    店长: 'manager',
    顾问: 'consultant',
    技术人员: 'technical_teacher',
    技术老师: 'technical_teacher',
    总监: 'director',
    管理员: 'admin',
    区域经理: 'regional_manager',
    前台: 'front_desk',
  }
  return roleMap[role] || roleMap[String(role || '').trim()] || value
}

const FOLLOWUP_STAFF_ROLES = [
  'manager',
  'beautician',
  'consultant',
  'technical_teacher',
  'boss',
  'admin',
]

function employeeRoleOf(employee) {
  return normalizeStaffRole(employee?.role || employee?.staff_role || employee?.position || employee?.job_title)
}

function employeeStoreOf(employee) {
  return normalizeRecordStore(employee) || normalizeStoreName(employee?.store)
}

function followupOwnerOf(record) {
  return record?.owner || record?.followupBy || record?.followup_by || record?.createdBy || record?.created_by || record?.staffName || ''
}

function followupMethodOf(record) {
  return record?.followupMethod || record?.followup_method || record?.method || ''
}

function followupContentOf(record) {
  return record?.content || record?.note || record?.remark || record?.feedback || ''
}

function followupNextDateOf(record) {
  return record?.nextFollowTime || record?.next_follow_date || record?.nextFollowDate || ''
}

function staffOptionLabel(employee) {
  return `${employee.name || '未命名'}｜${roleLabel(employeeRoleOf(employee)) || employee.role || '未设置岗位'}｜${employeeStoreOf(employee) || employee.store || '未设置门店'}`
}

function normalizeRecordStore(record) {
  const rawStore = record?.store
    || record?.storeName
    || record?.store_name
    || record?.branch
    || record?.shopName
    || record?.shop_name

  const normalizedRawStore = normalizeStoreName(rawStore)
  if (normalizedRawStore) return normalizedRawStore

  const rawStoreId = record?.storeId || record?.store_id || record?.shop_id || record?.branch_id
  const legacyStoreMap = {
    1: '龙泉1店',
    2: '龙泉2店',
    3: '龙泉金龙店',
    4: '郫县1店',
  }
  return normalizeStoreName(storeNameFromId(rawStoreId) || legacyStoreMap[String(rawStoreId)] || rawStoreId)
}

const customerImportHeaders = {
  name: ['姓名', '顾客姓名', '客户姓名', 'name'],
  phone: ['手机号', '电话', '手机', 'phone'],
  store: ['门店', '所属门店', 'store'],
  owner: ['美容师', '负责美容师', '跟进人', 'owner'],
  level: ['等级', '顾客等级', '客户等级', 'level'],
  birthday: ['生日', '出生日期', 'birthday'],
  lastVisit: ['最后到店时间', '最后到店日期', '最近到店日期', 'last_visit', 'lastVisit'],
}

const activationStatusOptions = ['未联系', '已联系', '已预约', '已到店', '无意向']
const paymentOptions = [
  ['cash', '现金'],
  ['wechat', '微信'],
  ['alipay', '支付宝'],
  ['card', '会员卡'],
  ['package', '项目包/套盒'],
  ['other', '其他'],
]
const paymentLabels = Object.fromEntries(paymentOptions)
const staffRoleOptions = [
  ['beautician', '美容师'],
  ['manager', '店长'],
  ['consultant', '顾问'],
  ['director', '总监'],
  ['regional_manager', '区域经理'],
  ['technical_teacher', '技术老师'],
  ['front_desk', '前台'],
  ['admin', '管理员'],
]

const projectCategoryOptions = [
  ['face', '面部'],
  ['body', '身体'],
  ['high_end', '高端项目'],
  ['instrument', '仪器'],
  ['material', '耗材'],
  ['moxibustion', '艾灸'],
  ['private', '私密'],
  ['anti_aging', '抗衰'],
  ['other', '其他'],
]
const projectCategoryLabels = Object.fromEntries(projectCategoryOptions)
const performanceTypeOptions = ['售前', '售后', '嘉宾', '刷卡', '消耗', '体验卡', '赠送', '退款']

function generateOrderNo(date = todayString()) {
  const day = String(date || todayString()).replaceAll('-', '')
  const suffix = String(Date.now() % 10000).padStart(4, '0')
  return `YM${day}${suffix}`
}

function cashierOrderItems(order) {
  if (Array.isArray(order?.orderItems) && order.orderItems.length) return order.orderItems
  if (!order?.projectName) return []
  return [{
    id: `legacy-${order.id || order.orderNo || 'new'}`,
    projectId: order.projectId,
    projectName: order.projectName,
    projectCategory: order.projectCategory,
    quantity: Number(order.quantity || 1),
    originalAmount: Number(order.originalAmount || 0),
    discountAmount: Number(order.discountAmount || 0),
    actualAmount: Number(order.actualAmount || 0),
    consumeAmount: Number(order.consumeAmount || 0),
    manualCommission: Number(order.manualCommission || 0),
    manualCommissionAmount: Number(order.manualCommissionAmount || 0),
    durationMinutes: '',
  }]
}

function orderPerformanceType(order) {
  const direct = order?.performanceType || order?.performance_type
  if (direct) return direct
  const remark = String(order?.remark || '')
  const match = remark.match(/业绩类型[:：]([^｜\]\s]+)/)
  if (match) return match[1]
  if (order?.paymentType === 'card') return '刷卡'
  if (Number(order?.consumeAmount || 0) > 0 && Number(order?.actualAmount || 0) === 0) return '消耗'
  return '售前'
}

function remarkWithoutPerformanceType(remark) {
  return String(remark || '').replace(/^业绩类型[:：][^｜\]\s]+[｜\s]*/, '')
}

function remarkWithPerformanceType(type, remark) {
  const cleanRemark = remarkWithoutPerformanceType(remark)
  return `业绩类型：${type || '售前'}${cleanRemark ? `｜${cleanRemark}` : ''}`
}

function orderManualAmount(order) {
  return cashierOrderItems(order).reduce((sum, item) => sum + Number(item.manualCommissionAmount || 0), 0)
}

function normalizeActivationStatus(value) {
  const status = String(value || '').trim()
  if (status === '未跟进') return '未联系'
  if (status === '已微信' || status === '已电话') return '已联系'
  if (status === '暂不考虑' || status === '无效客户') return '无意向'
  return activationStatusOptions.includes(status) ? status : '未联系'
}

function activationPriority(customer) {
  const level = String(customer.level || '').trim()
  if (Number(customer.notVisitedDays || 0) >= 90 || level === 'A客/VIP' || level === 'A类顾客') return '高'
  if (Number(customer.notVisitedDays || 0) >= 60 || level === 'B客' || level === 'B类顾客') return '中'
  return '低'
}

function splitCsvLine(line) {
  const cells = []
  let current = ''
  let quoted = false
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    const next = line[index + 1]
    if (char === '"' && quoted && next === '"') {
      current += '"'
      index += 1
    } else if (char === '"') {
      quoted = !quoted
    } else if (char === ',' && !quoted) {
      cells.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  cells.push(current.trim())
  return cells
}

function parseCustomerImportText(text) {
  const lines = String(text || '').split(/\r?\n/).filter((line) => line.trim())
  if (lines.length < 2) return []
  const delimiter = lines[0].includes('\t') ? '\t' : ','
  const parseLine = (line) => delimiter === '\t' ? line.split('\t').map((cell) => cell.trim()) : splitCsvLine(line)
  const headers = parseLine(lines[0])
  const findIndex = (names) => headers.findIndex((header) => names.includes(String(header || '').trim()))

  return lines.slice(1).map((line) => {
    const cells = parseLine(line)
    const valueOf = (field) => {
      const index = findIndex(customerImportHeaders[field])
      return index >= 0 ? String(cells[index] || '').trim() : ''
    }
    return {
      name: valueOf('name'),
      phone: valueOf('phone'),
      store: normalizeStoreName(valueOf('store')) || valueOf('store'),
      owner: valueOf('owner'),
      level: valueOf('level'),
      birthday: normalizeDateInput(valueOf('birthday')),
      lastVisit: normalizeDateInput(valueOf('lastVisit')),
    }
  }).filter((row) => row.name || row.phone)
}

const emptyCustomer = {
  name: '',
  phone: '',
  age: '',
  birthday: '',
  store: '龙泉1店',
  owner: '',
  level: 'B客',
  lastVisit: todayString(),
  lastFollowResult: '未联系',
  nextFollowTime: '',
  followStatus: '未联系',
  followNote: '',
  todayTaskCompletedAt: '',
}

const emptyFollowup = {
  customerId: '',
  customerName: '',
  customerPhone: '',
  store: defaultStores[0],
  method: '微信',
  owner: '',
  content: '',
  feedback: '',
  hasAppointment: false,
  appointmentTime: '',
  hasDeal: false,
  dealAmount: 0,
  nextFollowTime: '',
  issueType: '没时间',
}

const emptyCashierOrder = {
  orderNo: '',
  date: todayString(),
  storeName: defaultStores[0],
  customerId: '',
  customerName: '',
  customerPhone: '',
  projectId: '',
  projectName: '',
  projectCategory: '',
  quantity: 1,
  originalAmount: 0,
  discountAmount: 0,
  actualAmount: 0,
  consumeAmount: 0,
  paymentType: 'cash',
  serviceEmployeeId: '',
  serviceEmployeeName: '',
  salesEmployeeId: '',
  salesEmployeeName: '',
  consultantId: '',
  consultantName: '',
  orderItems: [],
  remark: '',
  status: 'active',
}

const emptyReview = {
  date: todayString(),
  store: defaultStores[0],
  goalCompleted: false,
  unfinishedReason: '',
  mainIssue: '',
  tomorrowFocus: '',
  tomorrowInviteTarget: '',
  tomorrowKeyCustomers: '',
  bossSupport: '',
}

const emptyEmployee = {
  name: '',
  phone: '',
  store: defaultStores[0],
  role: 'beautician',
  entryDate: '',
  isActive: true,
  today_followups: 0,
  today_appointments: 0,
  today_arrivals: 0,
  today_deals: 0,
  today_sales: 0,
  note: '',
}

class AppErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('系统运行时错误:', error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-[#fff4f8] p-8">
          <div className="mx-auto max-w-2xl rounded-xl border border-red-100 bg-white p-6 shadow-sm">
            <h1 className="text-xl font-bold text-[#641631]">系统加载失败，请刷新或联系管理员</h1>
            <p className="mt-3 rounded-lg bg-red-50 px-4 py-3 text-sm leading-6 text-red-700">{this.state.error?.message || String(this.state.error)}</p>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

function App() {
  return (
    <AppErrorBoundary>
      <AppContent />
    </AppErrorBoundary>
  )
}

function AppContent() {
  const [session, setSession] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [active, setActive] = useState(() => routeToMenuKey[window.location.pathname] || 'dashboard')
  const [devUsername, setDevUsername] = useState(() => localStorage.getItem(devRoleStorageKey) || 'admin')
  const cloud = useCloudData(session)

  useEffect(() => {
    const storageKeys = [
      ...legacyIdCacheKeys,
      ...Object.keys(localStorage).filter((key) => /cashier|customer|project|employee|store|order/i.test(key)),
      ...Object.keys(sessionStorage).filter((key) => /cashier|customer|project|employee|store|order/i.test(key)),
    ]
    unique(storageKeys).forEach((key) => {
      const value = localStorage.getItem(key) || sessionStorage.getItem(key)
      if (value && /^\d+$/.test(value)) {
        localStorage.removeItem(key)
        sessionStorage.removeItem(key)
      }
    })
  }, [])

  const enrichedCustomers = useMemo(
    () =>
      cloud.customers.map((customer) => {
        const notVisitedDays = daysSince(customer.lastVisit)
        return {
          ...customer,
          notVisitedDays,
          status: makeCustomerStatus(notVisitedDays),
        }
      }),
    [cloud.customers],
  )

  useEffect(() => {
    if (!supabase) {
      setAuthLoading(false)
      return
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setAuthLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setAuthLoading(false)
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  if (!isSupabaseConfigured) return <SetupMissing />
  if (authLoading) return <LoadingScreen text="正在检查登录状态..." />
  if (!session) return <LoginPage />
  if (cloud.loading) return <LoadingScreen text="正在读取云端门店数据..." />
  if (!cloud.profile) return <AccountBlocked message={cloud.error || '当前账号未配置权限。'} />

  const realUser = currentUserFromProfile(cloud.profile)
  const currentUser = devRoleSwitcherEnabled
    ? testUsers.find((item) => item.username === devUsername) || testUsers[0]
    : realUser
  const scopedCustomers = filterRecordsByUserPermission(cloud.customers, currentUser)
  const scopedEnrichedCustomers = filterRecordsByUserPermission(enrichedCustomers, currentUser)
  const scopedEmployees = filterRecordsByUserPermission(cloud.employees, currentUser).map((employee) => stripSalaryFields(employee, currentUser))
  const scopedFollowups = filterRecordsByUserPermission(cloud.followups, currentUser)
  const scopedPerformanceReports = filterRecordsByUserPermission(cloud.performanceReports, currentUser)
  const scopedCashierOrders = filterRecordsByUserPermission(cloud.cashierOrders, currentUser)
  const scopedStoreTargets = filterRecordsByUserPermission(cloud.storeTargets, currentUser)
  const visibleNavItems = navItems.filter(([key]) => canViewMenu(currentUser, key, menuPermissions))
  const activeAllowed = canViewMenu(currentUser, active, menuPermissions)
  const visibleActive = activeAllowed ? active : 'noPermission'

  const pageProps = {
    customers: active === 'customers' ? scopedCustomers : scopedEnrichedCustomers,
    employees: scopedEmployees,
    followups: scopedFollowups,
    reviews: filterRecordsByUserPermission(cloud.reviews, currentUser),
    performanceReports: scopedPerformanceReports,
    cashierOrders: scopedCashierOrders,
    projectCommissions: cloud.projectCommissions,
    storeTargets: scopedStoreTargets,
    profile: currentUser,
    currentUser,
    role: currentUser.role,
    stores: validStoreNames,
    storeRecords: cloud.storeRecords || [],
    customerError: cloud.customerError,
    followupError: cloud.followupError,
    employeeError: cloud.employeeError,
    dailyReviewError: cloud.dailyReviewError,
	    performanceReportError: cloud.performanceReportError,
    cashierOrderError: cloud.cashierOrderError,
	    projectCommissionError: cloud.projectCommissionError,
	    storeTargetError: cloud.storeTargetError,
    saveCustomer: cloud.saveCustomer,
    importCustomers: cloud.importCustomers,
    deleteCustomer: cloud.deleteCustomer,
    updateCustomerStatus: cloud.updateCustomerStatus,
    saveFollowup: cloud.saveFollowup,
    deleteFollowup: cloud.deleteFollowup,
    saveReview: cloud.saveReview,
    deleteReview: cloud.deleteReview,
    saveCashierOrder: cloud.saveCashierOrder,
    voidCashierOrder: cloud.voidCashierOrder,
	    saveStoreTarget: cloud.saveStoreTarget,
	    saveProjectCommission: cloud.saveProjectCommission,
	    saveEmployee: cloud.saveEmployee,
    deleteEmployee: cloud.deleteEmployee,
    setActive,
  }
  const currentRole = currentUser.role
  const isBossAccount = isBossRole(currentRole)
  const headerStore = isBossAccount ? '全部门店' : normalizeStoreName(currentUser.store || storeNameFromId(currentUser.storeId)) || validStoreNames[0]

  return (
    <div className="flex min-h-screen bg-[#fff4f8]">
      <aside className="fixed left-0 top-0 h-full w-[236px] border-r border-pink-100 bg-white/95 px-4 py-5 shadow-[12px_0_40px_rgba(191,24,92,0.06)]">
        <div className="mb-8 flex items-center gap-3">
          <div className="grid h-[52px] w-[52px] place-items-center rounded-full border border-pink-100 bg-white text-center text-sm font-bold leading-4 text-[#c2185b] shadow-sm">
            雅美<br />靓颜
          </div>
          <div>
            <div className="text-lg font-bold text-[#8d1744]">雅美靓颜</div>
            <div className="text-xs text-[#a66a82]">门店每日工作台</div>
          </div>
        </div>
        <nav className="space-y-2">
          {visibleNavItems.map(([key, label]) => (
            <button
              key={key}
              onClick={() => setActive(key)}
              className={`w-full rounded-lg px-4 py-4 text-left text-[15px] font-semibold transition ${
                active === key
                  ? 'bg-[#c2185b] text-white shadow-lg shadow-pink-200'
                  : 'text-[#7c445d] hover:bg-pink-50 hover:text-[#c2185b]'
              }`}
            >
              {label}
            </button>
          ))}
        </nav>
        <div className="absolute bottom-5 left-4 right-4 rounded-lg bg-pink-50 p-3 text-xs leading-6 text-[#8a4964]">
          云端自动保存 · 当前角色：{roleLabel(currentUser.role)}
        </div>
      </aside>

      <main className="ml-[236px] flex-1 px-5 py-5 xl:px-8">
        <header className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#641631]">雅美靓颜门店管理系统</h1>
            <p className="mt-1 text-sm text-[#9a6078]">先看今日重点，再处理顾客跟进</p>
          </div>
          <div className="flex items-center gap-3">
            {devRoleSwitcherEnabled && (
              <select
                value={devUsername}
                onChange={(event) => {
                  const nextUsername = event.target.value
                  localStorage.setItem(devRoleStorageKey, nextUsername)
                  setDevUsername(nextUsername)
                  setActive('dashboard')
                }}
                className="rounded-full border border-pink-100 bg-white px-4 py-2 text-sm font-semibold text-[#8a4964] shadow-sm"
              >
                {testUsers.map((user) => <option key={user.username} value={user.username}>当前角色：{user.label}</option>)}
              </select>
            )}
            <div className="rounded-full border border-pink-100 bg-white px-5 py-2 text-sm font-semibold text-[#c2185b] shadow-sm">
              {headerStore} · 今日 {todayString()}
              <button onClick={() => supabase.auth.signOut()} className="ml-4 text-[#8a4964] hover:text-[#c2185b]">退出</button>
            </div>
          </div>
        </header>

        {cloud.error && (
          <div className="mb-5 rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm leading-6 text-red-700">
            云端部分数据读取失败：{cloud.error}
            <button onClick={cloud.refresh} className="ml-3 font-bold text-[#c2185b]">重新读取</button>
          </div>
        )}

        {visibleActive === 'noPermission' && <NoPermission />}
        {visibleActive === 'dashboard' && <Dashboard {...pageProps} />}
        {visibleActive === 'customers' && <CustomersModule {...pageProps} />}
        {visibleActive === 'activation' && <ActivationModule {...pageProps} />}
        {visibleActive === 'cashier' && <CashierModule {...pageProps} />}
        {visibleActive === 'performanceMonthly' && <PerformanceMonthlyModule {...pageProps} />}
        {visibleActive === 'handworkSettlement' && <HandworkSettlementModule {...pageProps} />}
        {visibleActive === 'projectCommissions' && <ProjectStandardLibraryModule {...pageProps} />}
        {visibleActive === 'employees' && <EmployeesModule {...pageProps} />}
      </main>
    </div>
  )
}

function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  const login = async (event) => {
    event.preventDefault()
    setLoading(true)
    setMessage('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setMessage(error.message)
    setLoading(false)
  }

  return (
    <div className="grid min-h-screen place-items-center bg-[#fff4f8] px-6">
      <form onSubmit={login} className="w-full max-w-md rounded-lg border border-pink-100 bg-white p-8 shadow-xl shadow-pink-100">
        <div className="mb-6 flex items-center gap-3">
          <div className="grid h-[56px] w-[56px] place-items-center rounded-full border border-pink-100 bg-white text-center text-sm font-bold leading-4 text-[#c2185b] shadow-sm">
            雅美<br />靓颜
          </div>
          <div>
            <h1 className="text-2xl font-bold text-[#641631]">门店管理系统</h1>
            <p className="text-sm text-[#9a6078]">老板、店长、美容师账号登录</p>
          </div>
        </div>
        <div className="space-y-4">
          <Field label="账号邮箱">
            <Input value={email} onChange={setEmail} placeholder="请输入邮箱" />
          </Field>
          <Field label="登录密码">
            <Input type="password" value={password} onChange={setPassword} placeholder="请输入密码" />
          </Field>
          {message && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{message}</div>}
          <button disabled={loading} className="w-full rounded-lg bg-[#c2185b] px-5 py-3 font-semibold text-white shadow-md shadow-pink-200 transition hover:bg-[#a9134d] disabled:opacity-60">
            {loading ? '正在登录...' : '登录系统'}
          </button>
        </div>
      </form>
    </div>
  )
}

function SetupMissing() {
  return (
    <div className="grid min-h-screen place-items-center bg-[#fff4f8] px-6">
      <div className="max-w-xl rounded-lg border border-pink-100 bg-white p-8 text-[#674158] shadow-xl shadow-pink-100">
        <h1 className="text-2xl font-bold text-[#641631]">需要配置 Supabase</h1>
        <p className="mt-3 leading-7">请先在项目根目录创建 `.env.local`，填写 `VITE_SUPABASE_URL` 和 `VITE_SUPABASE_ANON_KEY`，然后重新启动项目。</p>
      </div>
    </div>
  )
}

function AccountBlocked({ message }) {
  return (
    <div className="grid min-h-screen place-items-center bg-[#fff4f8] px-6">
      <div className="max-w-xl rounded-lg border border-red-100 bg-white p-8 text-[#674158] shadow-xl shadow-pink-100">
        <h1 className="text-2xl font-bold text-red-700">账号暂不能进入系统</h1>
        <p className="mt-3 leading-7">{message}</p>
        <p className="mt-2 text-sm leading-6 text-[#9a6078]">请确认 Supabase profiles 表已为当前登录用户配置 `user_id`、`role`、`store` 和 `name`。</p>
        <button onClick={() => supabase.auth.signOut()} className="mt-5 rounded-lg bg-[#c2185b] px-5 py-3 font-semibold text-white shadow-md shadow-pink-200 transition hover:bg-[#a9134d]">
          退出登录
        </button>
      </div>
    </div>
  )
}

function LoadingScreen({ text }) {
  return <div className="grid min-h-screen place-items-center bg-[#fff4f8] text-lg font-bold text-[#c2185b]">{text}</div>
}

function NoPermission() {
  return (
    <Panel title="暂无权限">
      <div className="rounded-lg border border-pink-100 bg-pink-50 px-6 py-10 text-center text-[#8a4964]">
        暂无权限查看该页面，请联系管理员。
      </div>
    </Panel>
  )
}

function ErrorScreen({ message, onRetry }) {
  return (
    <div className="grid min-h-screen place-items-center bg-[#fff4f8] px-6">
      <div className="max-w-xl rounded-lg border border-red-100 bg-white p-8 shadow-xl">
        <h1 className="text-xl font-bold text-red-700">云端数据读取失败</h1>
        <p className="mt-3 text-[#674158]">{message}</p>
        <button onClick={onRetry} className="mt-5 rounded-lg bg-[#c2185b] px-5 py-3 font-semibold text-white">重新读取</button>
      </div>
    </div>
  )
}

function Dashboard({ customers, employees, followups, cashierOrders, stores, role, profile, setActive }) {
  const allStoreLabel = '全部门店'
  const [selectedStore, setSelectedStore] = useState(allStoreLabel)
  const normalizedRole = String(role || '').trim()
  const isBoss = isBossRole(normalizedRole)
  const isBeautician = isBeauticianRole(normalizedRole)
  const canChooseStore = isBoss
  const profileStore = normalizeStoreName(profile?.store) || defaultStores[0]
  const today = todayString()
  const storeOptions = validStoreNames
  const dashboardStore = isBoss ? selectedStore : profileStore
  const dashboardStoreName = normalizeStoreName(dashboardStore)
  const filterByDashboardStore = !isBoss || selectedStore !== allStoreLabel
  useEffect(() => {
    if (!isBoss) return
    localStorage.removeItem('selectedStore')
    localStorage.removeItem('dashboardSelectedStore')
    setSelectedStore(allStoreLabel)
  }, [isBoss])
  const visitDays = (value) => (value ? daysSince(value) : null)
  const safeCustomers = Array.isArray(customers) ? customers : []
  const safeEmployees = Array.isArray(employees) ? employees : []
  const safeFollowups = Array.isArray(followups) ? followups : []
  const safeOrders = Array.isArray(cashierOrders) ? cashierOrders : []
  const customerInScope = (customer) => {
    const customerStore = normalizeStoreName(customer.store)
    if (isBoss) return !filterByDashboardStore || customerStore === dashboardStoreName
    if (isBeautician) return !profile?.name || customer.owner === profile.name
    return customerStore === profileStore
  }
  const viewCustomers = safeCustomers.filter(customerInScope)
  const customerById = new Map(viewCustomers.map((item) => [String(item.id), item]))
  const employeeStore = (employee) => employeeStoreOf(employee)
  const employeeInScope = (employee) => {
    const store = employeeStore(employee)
    if (!store) return false
    if (isBoss) return !filterByDashboardStore || store === dashboardStoreName
    if (isBeautician) return employee.name === profile?.name
    return store === profileStore
  }
  const viewEmployees = safeEmployees.filter(employeeInScope)
  const orderStore = (order) => normalizeStoreName(order.storeName || order.store)
  const orderBelongsToUser = (order) => {
    if (!isBeautician) return true
    const name = profile?.name || ''
    return order.serviceEmployeeName === name || order.salesEmployeeName === name || order.consultantName === name
  }
  const orderInScope = (order) => {
    if (order.status === 'voided') return false
    const store = orderStore(order)
    if (!orderBelongsToUser(order)) return false
    if (isBoss) return !filterByDashboardStore || store === dashboardStoreName
    return store === profileStore
  }
  const todayOrders = safeOrders.filter((order) => orderInScope(order) && formatDateOnly(order.date) === today)
  const customerKeyOfOrder = (order) => String(order.customerId || order.customerPhone || order.customerName || order.id)
  const todayCustomerKeys = unique(todayOrders.map(customerKeyOfOrder))
  const todayRevenue = todayOrders.reduce((sum, order) => sum + Number(order.actualAmount || 0), 0)
  const todayArrivals = todayCustomerKeys.length
  const todayNewCustomers = unique(todayOrders
    .filter((order) => customerById.get(String(order.customerId))?.isNewCustomer)
    .map(customerKeyOfOrder)).length
  const followupInScope = (item) => {
    const store = normalizeStoreName(item.store)
    if (isBoss) return !filterByDashboardStore || store === dashboardStoreName
    if (isBeautician) return item.owner === profile?.name
    return store === profileStore
  }
  const todayFollowups = safeFollowups.filter((item) => followupInScope(item) && formatDateOnly(item.createdAt) === today)
  const todayAppointments = todayFollowups.filter((item) => item.hasAppointment).length
  const todayReturnRate = percent(todayArrivals, todayAppointments)
  const todayUnitPrice = todayArrivals > 0 ? todayRevenue / todayArrivals : 0
  const storeRanking = storeOptions
    .filter((store) => !filterByDashboardStore || store === dashboardStoreName)
    .map((store) => {
      const storeOrders = safeOrders.filter((order) => order.status !== 'voided' && formatDateOnly(order.date) === today && orderStore(order) === store)
      const storeFollowups = safeFollowups.filter((item) => formatDateOnly(item.createdAt) === today && normalizeStoreName(item.store) === store)
      const arrivals = unique(storeOrders.map(customerKeyOfOrder)).length
      const appointments = storeFollowups.filter((item) => item.hasAppointment).length
      return {
        store,
        revenue: storeOrders.reduce((sum, order) => sum + Number(order.actualAmount || 0), 0),
        arrivals,
        returnRate: percent(arrivals, appointments),
      }
    })
    .sort((a, b) => b.revenue - a.revenue)
  const lowRevenueStores = storeRanking.filter((item) => item.revenue < 1000).length
  const dueCustomers = viewCustomers.filter((item) => item.nextFollowTime === today || normalizeActivationStatus(item.followStatus || item.lastFollowResult) === '未联系')
  const unfinishedAppointmentCount = safeFollowups.filter((item) => {
    if (!followupInScope(item)) return false
    const appointmentDate = formatDateOnly(item.appointmentTime || item.nextFollowTime || item.createdAt)
    return item.hasAppointment && appointmentDate === today && !item.hasDeal
  }).length
  const vipNoVisit = viewCustomers.filter((item) => {
    const level = String(item.level || '').trim()
    const followDays = item.lastFollowTime ? daysSince(item.lastFollowTime) : 999
    return (level === 'A客/VIP' || level === 'A类顾客') && followDays >= 30
  }).length
  const overSixtyNotVisited = viewCustomers.filter((item) => visitDays(item.lastVisit) !== null && visitDays(item.lastVisit) >= 60)
  const repeatedNoAppointment = viewCustomers.filter((customer) => {
    const records = safeFollowups.filter((item) => String(item.customerId) === String(customer.id) || item.customerPhone === customer.phone)
    return records.length >= 3 && records.every((item) => !item.hasAppointment)
  })
  const silentHighValueCustomers = viewCustomers.filter((customer) => {
    const customerOrders = safeOrders.filter((order) => order.status !== 'voided' && String(order.customerId) === String(customer.id))
    const amount = customerOrders.reduce((sum, order) => sum + Number(order.actualAmount || 0), 0)
    const followDays = customer.lastFollowTime ? daysSince(customer.lastFollowTime) : 999
    return amount >= 10000 && followDays >= 30
  })
  const profileEmployee = !isBoss && profile?.name
    ? { id: `profile-${profile.name}`, name: profile.name, role: profile.role, store: profileStore }
    : null
  const followupStaff = [...viewEmployees, profileEmployee]
    .filter(Boolean)
    .filter((item, index, list) => list.findIndex((other) => `${other.name}-${employeeStore(other)}` === `${item.name}-${employeeStore(item)}`) === index)
    .filter((item) => FOLLOWUP_STAFF_ROLES.includes(employeeRoleOf(item)))
  const staffRank = followupStaff
    .map((item) => ({
      id: item.id,
      name: item.name || '未填写',
      store: employeeStore(item),
      role: employeeRoleOf(item),
      todayDue: dueCustomers.filter((customer) => customer.owner === item.name).length,
      todayFollowups: todayFollowups.filter((record) => followupOwnerOf(record) === item.name).length,
      todayAppointments: todayFollowups.filter((record) => followupOwnerOf(record) === item.name && record.hasAppointment).length,
      todayArrivals: todayOrders.filter((order) => order.serviceEmployeeName === item.name || order.salesEmployeeName === item.name || order.consultantName === item.name).length,
      followupRevenue: todayOrders
        .filter((order) => order.salesEmployeeName === item.name || order.serviceEmployeeName === item.name)
        .reduce((sum, order) => sum + Number(order.actualAmount || 0), 0),
    }))
    .map((item) => ({
      ...item,
      todayUnfinished: Math.max(Number(item.todayDue || 0) - Number(item.todayFollowups || 0), 0),
      completionRate: item.todayDue > 0 ? Math.min(Math.round((Number(item.todayFollowups || 0) / item.todayDue) * 100), 100) : 0,
      status: item.todayDue === 0 ? '今日无任务' : item.todayFollowups >= item.todayDue ? '已完成' : '需跟进',
    }))
    .sort((a, b) => b.todayUnfinished - a.todayUnfinished || b.todayFollowups - a.todayFollowups || b.followupRevenue - a.followupRevenue)
  const todoCustomers = viewCustomers
    .filter((item) => (visitDays(item.lastVisit) !== null && visitDays(item.lastVisit) >= 90) || item.nextFollowTime === today || normalizeActivationStatus(item.followStatus || item.lastFollowResult) === '未联系')
    .sort((a, b) => (visitDays(b.lastVisit) || 0) - (visitDays(a.lastVisit) || 0))
    .slice(0, 6)

  if (isBeautician) {
    const myFollowups = (followups || []).filter((item) => item.owner === profile?.name || item.employee === profile?.name)
    const myAppointments = myFollowups.filter((item) => item.hasAppointment).length
    const myDone = viewEmployees.reduce((sum, item) => sum + Number(item.today_followups || 0), 0)
    return (
      <div className="space-y-6">
        <section className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          {[
            ['我的今日预约', myAppointments, '人'],
            ['我的待跟进顾客', todoCustomers.length, '人'],
            ['我的服务记录', myFollowups.length, '条'],
            ['我的任务完成', myDone, '条'],
          ].map(([label, value, unit]) => (
            <div key={label} className="rounded-lg border border-pink-100 bg-white p-5 shadow-sm">
              <div className="text-sm font-semibold text-[#9b6078]">{label}</div>
              <div className="mt-3 text-4xl font-bold text-[#bd1657]">{value}<span className="ml-1 text-base font-semibold text-[#b9859a]">{unit}</span></div>
            </div>
          ))}
        </section>
        <Panel title="我的今日任务" subtitle="只显示分配给自己的顾客和跟进事项">
          <div className="grid gap-3">
            {todoCustomers.length === 0 && <div className="rounded-lg bg-pink-50 px-4 py-6 text-center text-[#8a4964]">暂无待处理顾客</div>}
            {todoCustomers.map((item) => (
              <div key={item.id} className="flex items-center justify-between rounded-lg border border-pink-100 bg-pink-50 p-4">
                <div>
                  <div className="font-bold text-[#5f263c]">{item.name}</div>
                  <div className="mt-1 text-sm text-[#83536a]">{item.phone} · {item.level || '未分级'}</div>
                </div>
                <div className="text-right text-sm text-[#83536a]">
                  <div>{item.notVisitedDays || 0}天未到店</div>
                  <div>{item.nextFollowTime || '未设置下次跟进'}</div>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    )
  }

  const cards = [
    ['今日总业绩', money(todayRevenue), '', '来自开单收银'],
    ['今日到店人数', todayArrivals, '人', '按开单顾客去重'],
    ['今日新客人数', todayNewCustomers, '人', '来自顾客新客标记'],
    ['今日预约人数', todayAppointments, '人', '来自今日跟进'],
    ['今日回店率', todayReturnRate, '', '到店 / 预约'],
    ['今日客单价', money(todayUnitPrice), '', '业绩 / 到店人数'],
  ]

  return (
    <div className="space-y-6">
      {canChooseStore && (
        <Panel title="门店筛选" subtitle="老板可查看全部门店，也可以单独查看某一家门店">
          <QuickFilters
            value={selectedStore}
            options={[allStoreLabel, ...storeOptions]}
            onChange={setSelectedStore}
          />
        </Panel>
      )}
      <section className="grid grid-cols-2 gap-4 xl:grid-cols-6">
        {cards.map(([label, value, unit, hint]) => (
          <div key={label} className="rounded-lg border border-pink-100 bg-white p-5 shadow-sm">
            <div className="text-sm font-semibold text-[#9b6078]">{label}</div>
            <div className="mt-3 text-3xl font-bold text-[#bd1657]">
              {value}
              <span className="ml-1 text-base font-semibold text-[#b9859a]">{unit}</span>
            </div>
            <div className="mt-2 text-xs text-[#a36a81]">{hint}</div>
          </div>
        ))}
      </section>

      <section className="grid grid-cols-1 gap-5 xl:grid-cols-[1.1fr_1fr]">
        <Panel
          title="今日必须处理"
          subtitle="店长早上先盯这四件事"
          action={<PrimaryButton onClick={() => setActive('activation')}>去激活顾客</PrimaryButton>}
        >
          <div className="grid grid-cols-2 gap-3">
            <MetricBox label="今日待跟进顾客" value={`${dueCustomers.length} 人`} />
            <MetricBox label="今日未完成预约" value={`${unfinishedAppointmentCount} 人`} />
            <MetricBox label="今日未回访A客" value={`${vipNoVisit} 人`} />
            <MetricBox label="今日低业绩门店" value={`${lowRevenueStores} 家`} />
          </div>
        </Panel>

        <Panel title="高风险客户提醒" subtitle="只提醒要处理的风险，不做重复录入">
          <div className="grid gap-3">
            {[
              ['超过60天未到店顾客', overSixtyNotVisited.length, 'danger'],
              ['A客/VIP超过30天未联系顾客', vipNoVisit, 'warning'],
              ['连续多次跟进未预约顾客', repeatedNoAppointment.length, 'pink'],
              ['高消费但近期沉默顾客', silentHighValueCustomers.length, 'light'],
            ].map(([label, value, tone]) => (
              <div key={label} className="flex items-center justify-between rounded-lg bg-pink-50 px-4 py-3">
                <span className="font-semibold text-[#6b344a]">{label}</span>
                <Badge tone={tone}>{value} 人</Badge>
              </div>
            ))}
          </div>
        </Panel>
      </section>

      <section className="grid grid-cols-1 gap-5 xl:grid-cols-[1.1fr_1fr]">
        <Panel title="今日门店排行榜" subtitle="按今日开单业绩从高到低排序">
          <div className="space-y-3">
            {storeRanking.map((item, index) => (
              <div key={item.store} className="grid grid-cols-[44px_1fr_auto_auto_auto] items-center gap-3 rounded-lg border border-pink-100 bg-white px-4 py-4">
                <span className="grid h-8 w-8 place-items-center rounded-full bg-pink-50 text-sm font-bold text-[#c2185b]">{index + 1}</span>
                <div className="font-bold text-[#5f263c]">{item.store}</div>
                <div className="text-right text-sm text-[#7b4f64]"><b className="block text-[#bd1657]">{money(item.revenue)}</b>今日业绩</div>
                <div className="text-right text-sm text-[#7b4f64]"><b className="block text-[#bd1657]">{item.arrivals}</b>到店</div>
                <div className="text-right text-sm text-[#7b4f64]"><b className="block text-[#bd1657]">{item.returnRate}</b>回店率</div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="员工跟进提醒" subtitle="店长、美容师、顾问都纳入跟进执行提醒">
          <div className="space-y-3">
            {staffRank.map((item, index) => (
              <div key={item.id} className="rounded-lg bg-pink-50 px-4 py-4">
                <div className="flex items-center gap-3">
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-white text-sm font-bold text-[#c2185b]">{index + 1}</span>
                  <div>
                    <div className="font-semibold text-[#5f263c]">{item.name}</div>
                    <div className="text-xs text-[#a36a81]">{roleLabel(item.role)} · {item.store || '未设置门店'}</div>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-4 gap-2 text-center text-sm xl:grid-cols-8">
                  <div><b className="block text-[#bd1657]">{item.todayDue}</b>应跟进</div>
                  <div><b className="block text-[#bd1657]">{item.todayFollowups}</b>已跟进</div>
                  <div><b className="block text-orange-600">{item.todayUnfinished}</b>未跟进</div>
                  <div><b className="block text-green-600">{item.todayAppointments}</b>预约</div>
                  <div><b className="block text-[#5f263c]">{item.todayArrivals}</b>到店</div>
                  <div><b className="block text-[#bd1657]">{item.completionRate}%</b>完成率</div>
                  <div className="xl:col-span-2"><Badge tone={item.status === '需跟进' ? 'warning' : item.status === '已完成' ? 'success' : 'light'}>{item.status}</Badge></div>
                </div>
              </div>
            ))}
            {staffRank.length === 0 && <div className="rounded-lg bg-pink-50 px-4 py-6 text-center text-[#8a4964]">暂无员工跟进数据</div>}
          </div>
        </Panel>
      </section>
    </div>
  )
}

function CustomersModule({ customers, stores, profile, role, customerError, saveCustomer, importCustomers: importCustomerRows, deleteCustomer }) {
  const canChooseStore = isBossRole(role)
  const canEditCustomers = isBossRole(role) || String(role || '').trim() === 'manager'
  const fixedStore = canChooseStore ? '' : normalizeStoreName(profile?.store) || stores[0] || defaultStores[0]
  const defaultCustomerFilters = () => ({
    status: '全部顾客',
    store: canChooseStore ? '全部门店' : fixedStore,
    level: '全部等级',
    search: '',
  })
  const [editing, setEditing] = useState(null)
  const [toast, setToast] = useState('')
  const [error, setError] = useState('')
  const [filters, setFilters] = useState(defaultCustomerFilters)
  const importInputRef = useRef(null)

  const rows = customers || []
  const currentMonth = new Date().getMonth() + 1
  const birthdayCustomers = rows
    .filter((item) => {
      if (!item.birthday) return false
      const [, month] = String(item.birthday).split('-').map(Number)
      return month === currentMonth
    })
    .sort((a, b) => String(a.birthday || '').slice(5).localeCompare(String(b.birthday || '').slice(5)))
  const storeOptions = canChooseStore ? ['全部门店', ...validStoreNames] : [fixedStore]
  const isAll = (value, allLabels = []) => value === undefined || value === null || value === '' || value === 'all' || allLabels.includes(value)
  const filteredRows = rows.filter((item) => {
    const statusFilter = filters.status
    const storeFilter = filters.store
    const levelFilter = filters.level
    const search = String(filters.search || '').trim()
    const storeMatch = isAll(storeFilter, ['全部门店']) || normalizeStoreName(item.store) === storeFilter
    const levelMatch = isAll(levelFilter, ['全部等级']) || String(item.level || '').trim() === levelFilter
    const days = daysSince(item.lastVisit)
    const currentStatus = item.followStatus || item.lastFollowResult || ''
    const statusMatch =
      isAll(statusFilter, ['全部顾客']) ||
      (statusFilter === '30天未到店' && days >= 30) ||
      (statusFilter === '60天未到店' && days >= 60) ||
      (statusFilter === '90天未到店' && days >= 90) ||
      (statusFilter === 'A客/VIP' && item.level === 'A客/VIP') ||
      (statusFilter === 'B客' && item.level === 'B客') ||
      (statusFilter === '高风险顾客' && days >= 90) ||
      (statusFilter === '已预约' && currentStatus === '已预约') ||
      (statusFilter === '已到店' && currentStatus === '已到店') ||
      (statusFilter === '无效客户' && currentStatus === '无效客户')
    const searchMatch =
      !search ||
      String(item.name || '').includes(search) ||
      String(item.phone || '').includes(search) ||
      String(item.owner || '').includes(search)
    return statusMatch && levelMatch && storeMatch && searchMatch
  })

  const showToast = (message) => {
    setToast(message)
    window.setTimeout(() => setToast(''), 2200)
  }

  const handleSaveCustomer = async (data) => {
    setError('')
    const payload = {
      ...data,
      store: canChooseStore ? data.store : fixedStore,
      owner: isBeauticianRole(role) ? profile?.name || '' : data.owner,
    }
    await saveCustomer(payload)
    setFilters(defaultCustomerFilters())
    showToast('保存成功')
    setEditing(null)
  }

  const importCustomers = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    setError('')
    try {
      if (/\.xlsx$/i.test(file.name)) {
        throw new Error('当前版本请先在 Excel 中另存为 CSV 格式后导入。')
      }
      const text = await file.text()
      const importedRows = parseCustomerImportText(text)
      if (importedRows.length === 0) throw new Error('没有识别到可导入的顾客数据，请检查表头。')
      const result = await importCustomerRows(importedRows.map((row) => ({
        ...row,
        store: canChooseStore ? row.store : fixedStore,
        owner: isBeauticianRole(role) ? profile?.name || '' : row.owner,
      })))
      setFilters(defaultCustomerFilters())
      showToast(`导入完成：新增 ${result.created} 位，更新 ${result.updated} 位，跳过 ${result.skipped} 位`)
    } catch (importError) {
      setError(importError.message || '导入失败')
    } finally {
      event.target.value = ''
    }
  }

  const remove = async (item) => {
    if (!window.confirm(`确认删除顾客「${item.name || item.phone || item.id}」吗？`)) return
    setError('')
    try {
      await deleteCustomer(item.id)
      showToast('删除成功')
    } catch (deleteError) {
      setError(deleteError.message || '删除失败')
    }
  }

  return (
    <Panel
      title="顾客档案"
      subtitle="默认只显示店员最常用信息，更多内容点编辑查看"
      action={canEditCustomers ? (
        <div className="flex gap-2">
          <input ref={importInputRef} type="file" accept=".csv,.txt,.xls" onChange={importCustomers} className="hidden" />
          <SecondaryButton onClick={() => importInputRef.current?.click()}>批量导入</SecondaryButton>
          <PrimaryButton onClick={() => {
            setFilters(defaultCustomerFilters())
            setEditing({ name: '', phone: '', age: '', birthday: '', store: fixedStore || validStoreNames[0], owner: profile?.role === 'beautician' ? profile.name : '', level: '', lastVisit: '' })
          }}>新增顾客</PrimaryButton>
        </div>
      ) : null}
    >
      {toast && <Toast>{toast}</Toast>}
      {(error || customerError) && <ErrorNotice>{error || customerError}</ErrorNotice>}
      <div className="mb-4 rounded-lg border border-pink-100 bg-pink-50/80 p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <div className="font-bold text-[#641631]">本月生日顾客</div>
            <div className="mt-1 text-sm text-[#9a6078]">本月共 {birthdayCustomers.length} 位顾客生日</div>
          </div>
        </div>
        {birthdayCustomers.length === 0 ? (
          <div className="text-sm text-[#8a4964]">暂无本月生日顾客</div>
        ) : (
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
            {birthdayCustomers.slice(0, 8).map((item) => (
              <div key={item.id} className="rounded-lg bg-white px-3 py-3 text-sm text-[#674158]">
                <div className="font-bold text-[#5f263c]">{item.name}</div>
                <div className="mt-1">{item.birthday} · {ageFromBirthday(item.birthday)}岁</div>
              </div>
            ))}
          </div>
        )}
      </div>
      <FilterBar>
        <Select
          value={filters.status}
          onChange={(value) => setFilters({ ...filters, status: value })}
          options={['全部顾客', '30天未到店', '60天未到店', '90天未到店', 'A客/VIP', 'B客', '高风险顾客', '已预约', '已到店', '无效客户']}
        />
        <Select
          value={filters.level}
          onChange={(value) => setFilters({ ...filters, level: value })}
          options={['全部等级', 'A客/VIP', 'B客', 'C客', '普通']}
        />
        <Select
          value={filters.store}
          onChange={(value) => setFilters({ ...filters, store: value })}
          options={storeOptions}
          disabled={!canChooseStore}
        />
        <Input
          value={filters.search}
          onChange={(value) => setFilters({ ...filters, search: value })}
          placeholder="搜索姓名/手机号/美容师"
        />
      </FilterBar>
      <Table>
        <thead>
          <tr>
            {['顾客姓名', '手机号', '生日', '年龄', '负责门店', '美容师', '等级', '最后到店日期', '操作'].map((head) => (
              <Th key={head}>{head}</Th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filteredRows.length === 0 && (
            <tr className="border-t border-pink-50">
              <Td colSpan={9}>
                <div className="rounded-lg bg-pink-50 px-4 py-6 text-center text-[#8a4964]">暂无顾客数据</div>
              </Td>
            </tr>
          )}
          {filteredRows.length > 0 &&
            filteredRows.map((item) => (
              <tr key={item.id} className="border-t border-pink-50">
                <Td>
                  <div className="font-semibold text-[#5f263c]">{item.name}</div>
                </Td>
                <Td>{item.phone}</Td>
                <Td>{item.birthday || ''}</Td>
                <Td>{ageFromBirthday(item.birthday)}</Td>
                <Td>{item.store || ''}</Td>
                <Td>{item.owner || ''}</Td>
                <Td>{item.level || ''}</Td>
                <Td>{item.lastVisit || ''}</Td>
                <Td>
                  {canEditCustomers ? (
                    <>
                      <ActionButton onClick={() => setEditing(item)}>编辑</ActionButton>
                      <ActionButton tone="danger" onClick={() => remove(item)}>删除</ActionButton>
                    </>
                  ) : ''}
                </Td>
              </tr>
            ))}
        </tbody>
      </Table>

      {editing && (
        <CustomerDrawer
          data={editing}
          stores={stores}
          storeRecords={storeRecords || []}
          profile={profile}
          lockedStore={!canChooseStore}
          lockedStoreValue={fixedStore}
          lockedOwner={profile?.role === 'beautician'}
          onClose={() => setEditing(null)}
          onSave={handleSaveCustomer}
        />
      )}
    </Panel>
  )
}

function ActivationModule({ customers, employees, followups, stores, profile, role, updateCustomerStatus, saveFollowup }) {
  const [drafts, setDrafts] = useState({})
  const [historyOpen, setHistoryOpen] = useState({})
  const [editingFollowupId, setEditingFollowupId] = useState(null)
  const [toast, setToast] = useState('')
  const [error, setError] = useState('')
  const canChooseStore = isBossRole(role)
  const fixedStore = canChooseStore ? '' : normalizeStoreName(profile?.store) || stores[0] || defaultStores[0]
  const [filters, setFilters] = useState({
    store: canChooseStore ? '全部门店' : fixedStore,
    owner: '全部美容师',
    level: '全部等级',
  })

  const activationCustomers = customers.filter((item) => Number(item.notVisitedDays || 0) >= 30)
  const storeOptions = canChooseStore ? ['全部门店', ...validStoreNames] : [fixedStore]
  const storeFilteredCustomers = activationCustomers.filter((item) => filters.store === '全部门店' || normalizeStoreName(item.store) === filters.store)
  const ownerOptions = ['全部美容师', ...unique(storeFilteredCustomers.map((item) => item.owner).filter(Boolean))]
  const levelFilterOptions = ['全部等级', ...levelOptions]
  const safeFollowups = Array.isArray(followups) ? followups : []
  const customerFollowups = (customer) => safeFollowups
    .filter((item) => String(item.customerId) === String(customer.id) || (customer.phone && item.customerPhone === customer.phone))
    .sort((a, b) => {
      const byTime = new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
      if (byTime) return byTime
      const aId = Number(a.id)
      const bId = Number(b.id)
      if (Number.isFinite(aId) && Number.isFinite(bId)) return bId - aId
      return String(b.id || '').localeCompare(String(a.id || ''))
    })
  const latestFollowupOf = (customer) => customerFollowups(customer)[0] || null
  const statusFromFollowup = (item) => normalizeActivationStatus(item?.status || item?.followStatus || item?.issueType || item?.feedback || '')
  const filteredCustomers = storeFilteredCustomers.filter((item) => {
    const ownerMatch = filters.owner === '全部美容师' || item.owner === filters.owner
    const levelMatch = filters.level === '全部等级' || item.level === filters.level
    return ownerMatch && levelMatch
  })
  const today = todayString()
  const statusOf = (item) => normalizeActivationStatus((drafts[item.id] || {}).followStatus || item.followStatus || item.lastFollowResult)
  const isCompletedToday = (item) => formatDateOnly((drafts[item.id] || {}).todayTaskCompletedAt || item.todayTaskCompletedAt) === today
  const isTodayTaskBase = (item) => item.notVisitedDays > 30 && item.nextFollowTime === today
  const isTodayTask = (item) => isTodayTaskBase(item) && statusOf(item) !== '已到店'
  const todayTaskBase = filteredCustomers.filter(isTodayTaskBase)
  const todayTasks = todayTaskBase.filter(isTodayTask)
  const todayDueCount = todayTasks.length
  const completedCount = todayTasks.filter(isCompletedToday).length
  const unfinishedCount = Math.max(todayDueCount - completedCount, 0)
  const todayAppointmentCount = todayTasks.filter((item) => statusOf(item) === '已预约').length
  const todayReturnRate = todayTaskBase.length > 0 ? Math.round((todayTaskBase.filter((item) => statusOf(item) === '已到店').length / todayTaskBase.length) * 100) : 0
  const contactedCount = filteredCustomers.filter((item) => statusOf(item) === '已联系').length
  const appointmentCount = filteredCustomers.filter((item) => statusOf(item) === '已预约').length
  const arrivedCount = filteredCustomers.filter((item) => statusOf(item) === '已到店').length
  const leaderboard = unique([...employees.map((item) => item.name), ...filteredCustomers.map((item) => item.owner)].filter(Boolean))
    .map((owner) => {
      const ownedTasks = todayTasks.filter((item) => item.owner === owner)
      const ownedCustomers = filteredCustomers.filter((item) => item.owner === owner)
      return {
        owner,
        followups: ownedTasks.filter(isCompletedToday).length,
        appointments: ownedTasks.filter((item) => statusOf(item) === '已预约').length,
        arrivals: ownedCustomers.filter((item) => isTodayTaskBase(item) && statusOf(item) === '已到店').length,
      }
    })
    .filter((item) => item.followups || item.appointments || item.arrivals || filteredCustomers.some((customer) => customer.owner === item.owner))
    .sort((a, b) => b.followups - a.followups || b.appointments - a.appointments || b.arrivals - a.arrivals)
  const todayDueFallbackCount = filteredCustomers.filter((item) => {
    const draft = drafts[item.id] || {}
    const status = statusOf(item)
    const nextFollowTime = draft.nextFollowTime ?? item.nextFollowTime
    return status === '未联系' || !nextFollowTime || nextFollowTime === today
  }).length

  const getDraft = (customer) => ({
    followStatus: normalizeActivationStatus(customer.followStatus || customer.lastFollowResult),
    nextFollowTime: customer.nextFollowTime || '',
    followNote: customer.followNote || '',
    method: '电话',
    followupBy: customer.owner || profile?.name || '',
    todayTaskCompletedAt: customer.todayTaskCompletedAt || '',
    ...(drafts[customer.id] || {}),
  })

  const updateDraft = (id, patch) => {
    setDrafts((current) => ({ ...current, [id]: { ...(current[id] || {}), ...patch } }))
  }

  const saveActivation = async (customer, patch = {}) => {
    setError('')
    const nextDraft = { ...getDraft(customer), ...patch }
    updateDraft(customer.id, nextDraft)
    try {
      await updateCustomerStatus(customer.id, nextDraft)
      setToast('已更新')
      window.setTimeout(() => setToast(''), 1800)
    } catch (updateError) {
      setError(updateError.message || '更新失败')
    }
  }

  const completeTodayTask = (customer) => {
    saveActivation(customer, { todayTaskCompletedAt: new Date().toISOString() })
  }

  const startEditingFollowup = (customer, followup) => {
    if (!followup) return
    updateDraft(customer.id, {
      followStatus: statusFromFollowup(followup),
      method: followupMethodOf(followup) || '电话',
      followNote: followupContentOf(followup),
      nextFollowTime: followupNextDateOf(followup),
      followupBy: followupOwnerOf(followup) || customer.owner || profile?.name || '',
    })
    setEditingFollowupId(followup.id)
    setToast('已进入编辑状态')
    window.setTimeout(() => setToast(''), 1600)
  }

  const saveActivationFollowup = async (customer, latest = null) => {
    setError('')
    const draft = getDraft(customer)
    try {
      await saveFollowup({
        id: latest?.id,
        customerId: customer.id,
        customerName: customer.name,
        customerPhone: customer.phone,
        store: customer.store,
        owner: draft.followupBy || customer.owner || profile?.name || '',
        method: draft.method || '电话',
        content: draft.followNote || '',
        feedback: draft.followStatus,
        issueType: draft.followStatus,
        hasAppointment: draft.followStatus === '已预约',
        appointmentTime: draft.followStatus === '已预约' ? draft.nextFollowTime || '' : '',
        hasDeal: draft.followStatus === '已到店',
        dealAmount: 0,
        nextFollowTime: draft.nextFollowTime,
      })
      await updateCustomerStatus(customer.id, draft)
      setEditingFollowupId(null)
      setToast(latest ? '跟进已更新' : '跟进已新增')
      window.setTimeout(() => setToast(''), 1800)
    } catch (followupError) {
      setError(followupError.message || '保存跟进失败')
    }
  }

  const groups = [
    ['今日必须跟进', '系统按规则自动生成，建议当天处理完', todayTasks],
    ['高风险客户池', '90天以上或高价值顾客，建议店长重点盯', filteredCustomers.filter((item) => !isTodayTask(item) && activationPriority(item) === '高')],
    ['30天以上客户池', '已超过30天未到店但未排入今日任务', filteredCustomers.filter((item) => !isTodayTask(item) && activationPriority(item) !== '高')],
  ]

  return (
    <div className="space-y-5">
      {toast && <Toast>{toast}</Toast>}
      {error && <ErrorNotice>{error}</ErrorNotice>}
      <Panel title="30天未到店自动激活系统" subtitle="自动筛选最后到店日期超过30天的顾客，集中安排联系、预约和回店跟进">
        <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-5">
          <div className="rounded-lg bg-[#c2185b] p-4 text-white shadow-md shadow-pink-100">
            <div className="text-sm text-pink-100">今日必须联系</div>
            <div className="mt-2 text-3xl font-black">{todayDueCount}</div>
          </div>
          <div className="rounded-lg border border-pink-100 bg-pink-50 p-4">
            <div className="text-sm text-[#9a6078]">今日已完成</div>
            <div className="mt-2 text-3xl font-black text-[#5f263c]">{completedCount}</div>
          </div>
          <div className="rounded-lg border border-pink-100 bg-pink-50 p-4">
            <div className="text-sm text-[#9a6078]">今日未完成</div>
            <div className="mt-2 text-3xl font-black text-orange-600">{unfinishedCount}</div>
          </div>
          <div className="rounded-lg border border-pink-100 bg-pink-50 p-4">
            <div className="text-sm text-[#9a6078]">今日预约人数</div>
            <div className="mt-2 text-3xl font-black text-green-600">{todayAppointmentCount}</div>
          </div>
          <div className="rounded-lg border border-pink-100 bg-pink-50 p-4">
            <div className="text-sm text-[#9a6078]">今日回店率</div>
            <div className="mt-2 text-3xl font-black text-[#bd1657]">{todayReturnRate}%</div>
          </div>
        </div>
        <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
          <MetricPill>激活客户池：{filteredCustomers.length} 位</MetricPill>
          <MetricPill>已联系：{contactedCount} 位 · 已预约：{appointmentCount} 位</MetricPill>
          <MetricPill>已到店：{arrivedCount} 位 · 待安排：{todayDueFallbackCount} 位</MetricPill>
        </div>
        <div className="grid grid-cols-1 gap-3 rounded-lg bg-white p-4 ring-1 ring-pink-100 md:grid-cols-3">
          <Field label="门店筛选">
            <Select value={filters.store} onChange={(value) => setFilters({ ...filters, store: value, owner: '全部美容师' })} options={storeOptions} disabled={!canChooseStore} />
          </Field>
          <Field label="美容师筛选">
            <Select value={filters.owner} onChange={(value) => setFilters({ ...filters, owner: value })} options={ownerOptions} />
          </Field>
          <Field label="等级筛选">
            <Select value={filters.level} onChange={(value) => setFilters({ ...filters, level: value })} options={levelFilterOptions} />
          </Field>
        </div>
      </Panel>
      <Panel title="员工今日作战排行榜" subtitle="按今日任务完成、预约、到店情况复盘美容师执行">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          {leaderboard.map((item, index) => (
            <div key={item.owner} className="rounded-lg border border-pink-100 bg-white p-4">
              <div className="flex items-center justify-between">
                <div className="font-bold text-[#5f263c]">{index + 1}. {item.owner}</div>
                <Badge tone={index === 0 ? 'danger' : 'pink'}>{item.followups} 跟进</Badge>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center text-sm text-[#7b4f64]">
                <div><b className="block text-xl text-[#bd1657]">{item.followups}</b>跟进</div>
                <div><b className="block text-xl text-green-600">{item.appointments}</b>预约</div>
                <div><b className="block text-xl text-[#5f263c]">{item.arrivals}</b>到店</div>
              </div>
            </div>
          ))}
          {leaderboard.length === 0 && <div className="text-sm text-[#9a6078]">暂无今日作战数据</div>}
        </div>
      </Panel>
      {groups.map(([title, hint, list]) => (
        <Panel key={title} title={`${title}未到店`} subtitle={`${hint} · ${list.length} 位顾客`}>
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            {list.map((item) => {
              const draft = getDraft(item)
              const priority = activationPriority(item)
              const completed = isCompletedToday(item)
              const latestFollowup = latestFollowupOf(item)
              const history = customerFollowups(item)
              return (
                <div key={item.id} className={`rounded-lg border p-4 ${item.notVisitedDays >= 90 ? 'border-red-200 bg-red-50 ring-1 ring-red-100' : 'border-pink-100 bg-white'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-lg font-bold text-[#5f263c]">{item.name}</span>
                        <LevelBadge level={item.level} />
                        <RiskBadge days={item.notVisitedDays} />
                        <Badge tone={priority === '高' ? 'danger' : priority === '中' ? 'warning' : 'light'}>{priority}优先级</Badge>
                        {completed && <Badge tone="success">今日已完成</Badge>}
                      </div>
                      <div className="mt-2 text-sm text-[#7b4f64]">电话：{item.phone || ''}</div>
                      <div className="mt-1 text-sm text-[#7b4f64]">门店：{item.store || ''} · 美容师：{item.owner || ''}</div>
                      <div className="mt-1 text-sm text-[#7b4f64]">最后到店日期：{item.lastVisit || '未记录'} · 已 {item.notVisitedDays} 天未到店</div>
                      <div className="mt-3 rounded-lg bg-white/80 px-3 py-3 text-sm text-[#674158]">
                        <div className="mb-2 font-bold text-[#5f263c]">最近一次跟进</div>
                        {latestFollowup ? (
                          <div className="grid gap-1 md:grid-cols-2">
                            <span>时间：{formatDateTime(latestFollowup.createdAt) || '未记录'}</span>
                            <span>跟进人：{followupOwnerOf(latestFollowup) || '-'}</span>
                            <span>方式：{followupMethodOf(latestFollowup) || '-'}</span>
                            <span>状态：{statusFromFollowup(latestFollowup)}</span>
                            <span className="md:col-span-2">备注：{followupContentOf(latestFollowup) || '-'}</span>
                            <span className="md:col-span-2">下次跟进日期：{followupNextDateOf(latestFollowup) || '未定'}</span>
                          </div>
                        ) : (
                          <div>暂无历史跟进，请先新增跟进。</div>
                        )}
                      </div>
                    </div>
                    <div className="text-right text-sm text-[#8a5268]">
                      <div>下次跟进</div>
                      <b className="text-[#bd1657]">{draft.nextFollowTime || '未定'}</b>
                      {completed && <div className="mt-1 text-xs text-green-700">{formatDateTime(draft.todayTaskCompletedAt || item.todayTaskCompletedAt)}</div>}
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {activationStatusOptions.map((option) => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => saveActivation(item, { followStatus: option })}
                        className={`rounded-full px-3 py-2 text-sm font-semibold transition ${
                          draft.followStatus === option
                            ? 'bg-[#c2185b] text-white shadow-sm'
                            : 'bg-white text-[#8a4964] ring-1 ring-pink-100 hover:bg-pink-50'
                        }`}
                      >
                        {option}
                      </button>
                    ))}
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-[150px_160px_190px_1fr] md:items-start">
                    <label>
                      <span className="mb-2 block text-sm font-semibold text-[#79445b]">跟进方式</span>
                      <Select value={draft.method} onChange={(value) => updateDraft(item.id, { method: value })} options={followMethods} />
                    </label>
                    <label>
                      <span className="mb-2 block text-sm font-semibold text-[#79445b]">跟进人</span>
                      <Input value={draft.followupBy} onChange={(value) => updateDraft(item.id, { followupBy: value })} />
                    </label>
                    <label>
                      <span className="mb-2 block text-sm font-semibold text-[#79445b]">下次跟进日期</span>
                      <Input type="date" value={draft.nextFollowTime} onChange={(value) => updateDraft(item.id, { nextFollowTime: value })} />
                    </label>
                    <label>
                      <span className="mb-2 block text-sm font-semibold text-[#79445b]">跟进内容备注</span>
                      <Textarea value={draft.followNote} onChange={(value) => updateDraft(item.id, { followNote: value })} />
                    </label>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <PrimaryButton onClick={() => saveActivationFollowup(item)}>新增跟进</PrimaryButton>
                    {latestFollowup ? (
                      editingFollowupId === latestFollowup.id
                        ? <PrimaryButton onClick={() => saveActivationFollowup(item, latestFollowup)}>保存编辑</PrimaryButton>
                        : <SecondaryButton onClick={() => startEditingFollowup(item, latestFollowup)}>编辑最近跟进</SecondaryButton>
                    ) : (
                      <button disabled className="cursor-not-allowed rounded-lg border border-pink-100 bg-pink-50 px-5 py-3 font-semibold text-[#b9859a]">暂无跟进可编辑</button>
                    )}
                    <SecondaryButton onClick={() => saveActivation(item)}>只保存状态</SecondaryButton>
                    <SecondaryButton onClick={() => completeTodayTask(item)}>{completed ? '已完成' : '今日已完成'}</SecondaryButton>
                    <SecondaryButton onClick={() => setHistoryOpen((current) => ({ ...current, [item.id]: !current[item.id] }))}>
                      {historyOpen[item.id] ? '收起历史跟进' : `查看历史跟进（${history.length}）`}
                    </SecondaryButton>
                  </div>
                  {historyOpen[item.id] && (
                    <div className="mt-4 space-y-2 rounded-lg bg-pink-50 p-3">
                      {history.length === 0 && <div className="text-sm text-[#8a4964]">暂无历史跟进</div>}
                      {history.map((record) => (
                        <div key={record.id} className="rounded-lg bg-white px-3 py-3 text-sm text-[#674158] ring-1 ring-pink-100">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge tone={statusFromFollowup(record) === '已预约' ? 'success' : statusFromFollowup(record) === '无意向' ? 'light' : 'pink'}>{statusFromFollowup(record)}</Badge>
                            <span>{formatDateTime(record.createdAt) || '未记录时间'}</span>
                            <span>{followupOwnerOf(record) || '-'}</span>
                            <span>{followupMethodOf(record) || '-'}</span>
                          </div>
                          <div className="mt-2">备注：{followupContentOf(record) || '-'}</div>
                          <div className="mt-1">下次跟进：{followupNextDateOf(record) || '未定'}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </Panel>
      ))}
    </div>
  )
}

function FollowupsModule({ followups, customers, employees, stores, profile, role, followupError, saveFollowup, deleteFollowup }) {
  const canChooseStore = isBossRole(role)
  const isBeautician = isBeauticianRole(role)
  const fixedStore = canChooseStore ? '' : normalizeStoreName(profile?.store) || stores[0] || defaultStores[0]
  const [editing, setEditing] = useState(null)
  const [viewing, setViewing] = useState(null)
  const [toast, setToast] = useState('')
  const [error, setError] = useState('')
  const [filters, setFilters] = useState({ store: canChooseStore ? '全部' : fixedStore, owner: isBeautician ? profile?.name || '' : '全部', issueType: '全部', date: '' })
  const staffSummary = employees
    .filter((item) => FOLLOWUP_STAFF_ROLES.includes(employeeRoleOf(item)))
    .map((employee) => {
      const records = followups.filter((item) => followupOwnerOf(item) === employee.name)
      return {
        ...employee,
        records: records.length,
        appointments: records.filter((item) => item.hasAppointment).length,
        deals: records.filter((item) => item.hasDeal).length,
      }
    })
    .sort((a, b) => b.records - a.records)
  const owners = unique([...employees.map((item) => item.name), ...followups.map((item) => item.owner)].filter(Boolean))
  const filteredFollowups = followups.filter((item) => {
    const storeMatch = filters.store === '全部' || normalizeStoreName(item.store) === filters.store
    const ownerMatch = filters.owner === '全部' || item.owner === filters.owner
    const issueMatch = filters.issueType === '全部' || item.issueType === filters.issueType
    const dateMatch = !filters.date || formatDateOnly(item.createdAt) === filters.date
    return storeMatch && ownerMatch && issueMatch && dateMatch
  })

  const phoneOf = (followup) => {
    if (followup.customerPhone) return followup.customerPhone
    const customer = customers.find((item) => String(item.id) === String(followup.customerId) || item.name === followup.customerName)
    return customer?.phone || ''
  }

  const save = async (data) => {
    const customer = customers.find((item) => String(item.id) === String(data.customerId))
    const forcedStore = canChooseStore
      ? normalizeStoreName(customer?.store) || normalizeStoreName(data.store) || validStoreNames[0]
      : fixedStore
    const payload = {
      id: data.id,
      customerId: customer?.id ?? data.customerId,
      customerName: customer?.name || data.customerName,
      customerPhone: customer?.phone || data.customerPhone,
      store: forcedStore,
      owner: isBeautician ? profile?.name || '' : data.owner,
      method: data.method,
      content: data.content,
      feedback: data.feedback,
      issueType: data.issueType,
      hasAppointment: data.hasAppointment,
      appointmentTime: data.appointmentTime,
      hasDeal: data.hasDeal,
      dealAmount: Number(data.dealAmount || 0),
      nextFollowTime: data.nextFollowTime,
    }
    await saveFollowup(payload)
    setToast('保存成功')
    setEditing(null)
    window.setTimeout(() => setToast(''), 2200)
  }

  const remove = async (item) => {
    if (!window.confirm(`确认删除「${item.customerName || item.id}」的跟进记录吗？`)) return
    setError('')
    try {
      await deleteFollowup(item.id)
      setToast('删除成功')
      window.setTimeout(() => setToast(''), 2200)
    } catch (deleteError) {
      setError(deleteError.message || '删除失败')
    }
  }

  return (
    <Panel
      title="跟进记录"
      subtitle="店员只需要登记结果，店长看预约和成交"
      action={<PrimaryButton onClick={() => setEditing({ ...emptyFollowup, store: fixedStore || normalizeStoreName(profile?.store) || validStoreNames[0], owner: profile?.role === 'beautician' ? profile.name : '' })}>新增跟进</PrimaryButton>}
    >
      {toast && <Toast>{toast}</Toast>}
      {(error || followupError) && <ErrorNotice>{error || followupError}</ErrorNotice>}
      <FilterBar>
        <Select value={filters.store} onChange={(value) => setFilters({ ...filters, store: value })} options={canChooseStore ? ['全部', ...stores] : [fixedStore]} disabled={!canChooseStore} />
        <Select value={filters.owner} onChange={(value) => setFilters({ ...filters, owner: value })} options={isBeautician ? [profile?.name || ''] : ['全部', ...owners]} disabled={isBeautician} />
        <Select value={filters.issueType} onChange={(value) => setFilters({ ...filters, issueType: value })} options={['全部', ...issueOptions]} />
        <Input type="date" value={filters.date} onChange={(value) => setFilters({ ...filters, date: value })} />
      </FilterBar>
      <div className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
        {staffSummary.slice(0, 4).map((item) => (
          <div key={item.id} className="rounded-lg bg-pink-50 p-4">
            <div className="font-bold text-[#5f263c]">{item.name}</div>
            <div className="mt-2 grid grid-cols-3 gap-2 text-center text-sm text-[#7b4f64]">
              <div><b className="block text-xl text-[#bd1657]">{item.records}</b>跟进</div>
              <div><b className="block text-xl text-[#bd1657]">{item.appointments}</b>预约</div>
              <div><b className="block text-xl text-[#bd1657]">{item.deals}</b>成交</div>
            </div>
          </div>
        ))}
      </div>
      <Table>
        <thead>
          <tr>
            {['顾客姓名', '手机号', '跟进人', '沟通内容', '顾客反馈', '问题分类', '是否预约', '是否成交', '成交金额', '下次跟进时间', '创建时间', '操作'].map((head) => <Th key={head}>{head}</Th>)}
          </tr>
        </thead>
        <tbody>
          {filteredFollowups.length === 0 && (
            <tr className="border-t border-pink-50">
              <Td colSpan={12}>
                <div className="rounded-lg bg-pink-50 px-4 py-6 text-center text-[#8a4964]">暂无跟进记录</div>
              </Td>
            </tr>
          )}
          {filteredFollowups.map((item) => (
            <tr key={item.id} className="border-t border-pink-50">
              <Td><div className="font-semibold text-[#5f263c]">{item.customerName}</div></Td>
              <Td>{phoneOf(item)}</Td>
              <Td>{item.owner}</Td>
              <Td className="max-w-64">{item.content}</Td>
              <Td className="max-w-64">{item.feedback}</Td>
              <Td>{item.issueType}</Td>
              <Td><StatusPill tone={item.hasAppointment ? 'green' : 'gray'}>{item.hasAppointment ? '已预约' : '未预约'}</StatusPill></Td>
              <Td><StatusPill tone={item.hasDeal ? 'red' : 'light'}>{item.hasDeal ? '已成交' : '未成交'}</StatusPill></Td>
              <Td>{money(item.dealAmount)}</Td>
              <Td>{item.nextFollowTime || '-'}</Td>
              <Td>{formatDateTime(item.createdAt)}</Td>
              <Td>
                <ActionButton onClick={() => setEditing(item)}>编辑</ActionButton>
                <ActionButton onClick={() => setViewing(item)}>查看详情</ActionButton>
                {canManage(role, 'review') && <ActionButton tone="danger" onClick={() => remove(item)}>删除</ActionButton>}
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
      {editing && <FollowupDrawer data={editing} customers={customers} employees={employees} stores={stores} profile={profile} lockedStore={!canChooseStore} lockedStoreValue={fixedStore} onClose={() => setEditing(null)} onSave={save} />}
      {viewing && <FollowupDetail followup={viewing} phone={phoneOf(viewing)} onClose={() => setViewing(null)} />}
    </Panel>
  )
}

function CashierModule({ cashierOrders, customers, employees, projectCommissions, stores, storeRecords, profile, role, cashierOrderError, saveCashierOrder, voidCashierOrder, setActive }) {
  const isBoss = isBossRole(role)
  const isStaff = isBeauticianRole(role)
  const canChooseStore = isBoss
  const fixedStore = canChooseStore ? '' : normalizeStoreName(profile?.store) || stores[0] || defaultStores[0]
  const [filters, setFilters] = useState({
    month: todayString().slice(0, 7),
    date: '',
    store: canChooseStore ? '全部门店' : fixedStore,
    customer: '',
    project: '',
    serviceEmployee: isStaff ? profile?.name || '' : '',
    salesEmployee: '',
    paymentType: '全部方式',
  })
  const [editing, setEditing] = useState(null)
  const [detail, setDetail] = useState(null)
  const [toast, setToast] = useState('')
  const [error, setError] = useState('')
  const standardProjects = Array.isArray(projectCommissions) ? projectCommissions : []
  const activeProjectOptions = standardProjects.filter((item) => item.isActive !== false && isDbId(item.id))
  const activeEmployeeOptions = (Array.isArray(employees) ? employees : []).filter((item) => item.isActive !== false && isDbId(item.id))
  const activeOrders = (Array.isArray(cashierOrders) ? cashierOrders : []).filter((item) => item.status !== 'voided')
  const visibleOrders = activeOrders.filter((item) => {
    const storeMatch = filters.store === '全部门店' || normalizeStoreName(item.storeName || item.store) === filters.store
    const monthMatch = !filters.month || String(item.month || item.date || '').startsWith(filters.month)
    const dateMatch = !filters.date || item.date === filters.date
    const customerMatch = !filters.customer || String(item.customerName || '').includes(filters.customer)
    const projectNames = cashierOrderItems(item).map((orderItem) => orderItem.projectName).join(' ')
    const projectMatch = !filters.project || String(item.projectName || projectNames || '').includes(filters.project) || projectNames.includes(filters.project)
    const serviceMatch = !filters.serviceEmployee || item.serviceEmployeeName === filters.serviceEmployee
    const salesMatch = !filters.salesEmployee || item.salesEmployeeName === filters.salesEmployee
    const paymentMatch = filters.paymentType === '全部方式' || item.paymentType === filters.paymentType
    return storeMatch && monthMatch && dateMatch && customerMatch && projectMatch && serviceMatch && salesMatch && paymentMatch
  })
  const today = todayString()
  const todayOrders = visibleOrders.filter((item) => item.date === today)
  const monthOrders = visibleOrders.filter((item) => String(item.month || item.date || '').startsWith(filters.month))
  const todayByType = performanceTypeOptions.reduce((map, type) => ({ ...map, [type]: 0 }), {})
  todayOrders.forEach((order) => {
    const type = orderPerformanceType(order)
    const sign = type === '退款' ? -1 : 1
    todayByType[type] = Number(todayByType[type] || 0) + sign * Number(order.actualAmount || 0)
  })
  const todayManualAmount = todayOrders.reduce((sum, item) => sum + orderManualAmount(item), 0)
  const showToast = (message) => {
    setToast(message)
    window.setTimeout(() => setToast(''), 2200)
  }
  const openCreate = () => {
    setEditing({
      ...emptyCashierOrder,
      orderNo: generateOrderNo(todayString()),
      date: todayString(),
      storeName: fixedStore || stores[0] || defaultStores[0],
      storeId: (storeRecords || []).find((store) => normalizeStoreName(store.name) === normalizeStoreName(fixedStore || stores[0] || defaultStores[0]))?.id || '',
      serviceEmployeeName: isStaff ? profile?.name || '' : '',
      salesEmployeeName: isStaff ? profile?.name || '' : '',
    })
  }
  const save = async (row) => {
    setError('')
    try {
      await saveCashierOrder(row)
      setEditing(null)
      showToast('开单成功')
    } catch (saveError) {
      setError(saveError.message || '保存失败')
    }
  }
  const voidOrder = async (order) => {
    if (!window.confirm('确定作废该订单吗？作废后不再进入经营统计。')) return
    setError('')
    try {
      await voidCashierOrder(order.id)
      showToast('订单已作废')
    } catch (voidError) {
      setError(voidError.message || '作废失败')
    }
  }

  if (isStaff) {
    return (
      <Panel title="我的服务记录" subtitle="仅显示本人相关开单，不展示全店收银金额">
        {(error || cashierOrderError) && <ErrorNotice>{error || cashierOrderError}</ErrorNotice>}
        <Table>
          <thead>
            <tr>
              {['订单编号', '日期', '门店', '顾客', '项目', '数量', '操作老师', '开单人', '状态'].map((head) => <Th key={head}>{head}</Th>)}
            </tr>
          </thead>
          <tbody>
            {visibleOrders.length === 0 && (
              <tr className="border-t border-pink-50">
                <Td colSpan={9}><div className="rounded-lg bg-pink-50 px-4 py-6 text-center text-[#8a4964]">暂无我的服务记录</div></Td>
              </tr>
            )}
            {visibleOrders.map((item) => (
              <tr key={item.id} className="border-t border-pink-50">
                <Td>{item.orderNo}</Td>
                <Td>{item.date}</Td>
                <Td>{item.storeName}</Td>
                <Td>{item.customerName}</Td>
                <Td>{cashierOrderItems(item).map((orderItem) => orderItem.projectName).filter(Boolean).join(' + ') || item.projectName}</Td>
                <Td>{cashierOrderItems(item).reduce((sum, orderItem) => sum + Number(orderItem.quantity || 0), 0) || item.quantity}</Td>
                <Td>{item.serviceEmployeeName}</Td>
                <Td>{item.salesEmployeeName}</Td>
                <Td><Badge tone={item.status === 'voided' ? 'warning' : 'success'}>{item.status === 'voided' ? '已作废' : '正常'}</Badge></Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Panel>
    )
  }

  return (
    <div className="space-y-5">
      <Panel title="今日收银台" subtitle="一次开单自动生成顾客、员工、门店和月度经营数据" action={<PrimaryButton onClick={openCreate}>新增开单</PrimaryButton>}>
        {toast && <Toast>{toast}</Toast>}
        {(error || cashierOrderError) && <ErrorNotice>{error || cashierOrderError}</ErrorNotice>}
        {todayOrders.length === 0 && (
          <EmptyActionCard title="今日暂无订单" description="请先新增开单，今日实收、消耗、刷卡和订单数会自动从开单记录汇总。" actionLabel="新增开单" onAction={openCreate} />
        )}
        {customers.length === 0 && <EmptyActionCard title="暂无顾客数据" description="当前账号可见范围内还没有顾客。请先到顾客管理新增顾客，再回到收银台开单。" actionLabel="前往顾客管理" onAction={() => setActive('customers')} />}
        {activeProjectOptions.length === 0 && <EmptyActionCard title="暂无可用项目" description="开单只能选择已启用的项目。请先到项目标准库新增或启用项目。" actionLabel="前往项目标准库" onAction={() => setActive('projectCommissions')} />}
        {activeEmployeeOptions.length === 0 && <EmptyActionCard title="暂无可用员工" description="操作老师和开单人来自员工管理。请先添加店长、顾问、美容师或前台。" actionLabel="前往员工管理" onAction={() => setActive('employees')} />}
        <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-4 xl:grid-cols-8">
          <MetricBox label="今日实收" value={money(todayOrders.reduce((sum, item) => sum + Number(item.actualAmount || 0), 0))} />
          <MetricBox label="今日消耗" value={money(todayOrders.reduce((sum, item) => sum + Number(item.consumeAmount || 0), 0))} />
          <MetricBox label="今日刷卡" value={money(todayByType['刷卡'])} />
          <MetricBox label="今日售前" value={money(todayByType['售前'])} />
          <MetricBox label="今日售后" value={money(todayByType['售后'])} />
          <MetricBox label="今日嘉宾" value={money(todayByType['嘉宾'])} />
          <MetricBox label="今日订单数" value={todayOrders.length} />
          <MetricBox label="今日手工费" value={money(todayManualAmount)} />
        </div>
        <div className="mb-4 grid grid-cols-1 gap-3 rounded-lg bg-white p-4 ring-1 ring-pink-100 md:grid-cols-4">
          <Field label="月份"><Input type="month" value={filters.month} onChange={(value) => setFilters({ ...filters, month: value })} /></Field>
          <Field label="日期"><Input type="date" value={filters.date} onChange={(value) => setFilters({ ...filters, date: value })} /></Field>
          <Field label="门店"><Select value={filters.store} onChange={(value) => setFilters({ ...filters, store: value })} options={canChooseStore ? ['全部门店', ...validStoreNames] : [fixedStore]} disabled={!canChooseStore} /></Field>
          <Field label="顾客姓名"><Input value={filters.customer} onChange={(value) => setFilters({ ...filters, customer: value })} /></Field>
          <Field label="项目"><Input value={filters.project} onChange={(value) => setFilters({ ...filters, project: value })} /></Field>
          <Field label="操作老师"><Select value={filters.serviceEmployee} onChange={(value) => setFilters({ ...filters, serviceEmployee: value })} options={['', ...unique(employees.map((item) => item.name).filter(Boolean))]} /></Field>
          <Field label="开单人"><Select value={filters.salesEmployee} onChange={(value) => setFilters({ ...filters, salesEmployee: value })} options={['', ...unique(employees.map((item) => item.name).filter(Boolean))]} /></Field>
          <Field label="收款方式"><Select value={filters.paymentType} onChange={(value) => setFilters({ ...filters, paymentType: value })} options={['全部方式', ...paymentOptions]} /></Field>
        </div>
        <Table>
          <thead>
            <tr>
              {['订单编号', '日期', '门店', '顾客', '项目', '数量', '实收金额', '消耗金额', '业绩类型', '操作老师', '开单人', '手工费', '操作'].map((head) => <Th key={head}>{head}</Th>)}
            </tr>
          </thead>
          <tbody>
            {visibleOrders.length === 0 && (
              <tr className="border-t border-pink-50">
                <Td colSpan={13}><div className="rounded-lg bg-pink-50 px-4 py-6 text-center text-[#8a4964]">暂无开单记录</div></Td>
              </tr>
            )}
            {visibleOrders.map((item) => (
              <tr key={item.id} className="border-t border-pink-50">
                <Td>{item.orderNo}</Td>
                <Td>{item.date}</Td>
                <Td>{item.storeName}</Td>
                <Td>{item.customerName}</Td>
                <Td>{cashierOrderItems(item).map((orderItem) => orderItem.projectName).filter(Boolean).join(' + ') || item.projectName}</Td>
                <Td>{cashierOrderItems(item).reduce((sum, orderItem) => sum + Number(orderItem.quantity || 0), 0) || item.quantity}</Td>
                <Td><b className="text-[#bd1657]">{money(item.actualAmount)}</b></Td>
                <Td>{money(item.consumeAmount)}</Td>
                <Td>{orderPerformanceType(item)}</Td>
                <Td>{item.serviceEmployeeName}</Td>
                <Td>{item.salesEmployeeName}</Td>
                <Td>{money(orderManualAmount(item))}</Td>
                <Td>
                  <ActionButton onClick={() => setDetail(item)}>查看详情</ActionButton>
                  <ActionButton onClick={() => setEditing(item)}>编辑</ActionButton>
                  <ActionButton tone="danger" onClick={() => voidOrder(item)}>作废</ActionButton>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Panel>
      {editing && (
        <CashierDrawer
          data={editing}
          customers={customers}
          employees={activeEmployeeOptions}
          projects={activeProjectOptions}
          stores={stores}
          storeRecords={storeRecords || []}
          profile={profile}
          lockedStore={!canChooseStore}
          lockedStoreValue={fixedStore}
          onClose={() => setEditing(null)}
          onSave={save}
        />
      )}
      {detail && <CashierDetail order={detail} onClose={() => setDetail(null)} />}
    </div>
  )
}

function ReviewsModule({ reviews, stores, role, profile, dailyReviewError, saveReview, deleteReview }) {
  const canChooseStore = isBossRole(role)
  const canEditReviews = isBossRole(role) || String(role || '').trim() === 'manager'
  const fixedStore = canChooseStore ? '' : normalizeStoreName(profile?.store) || stores[0] || defaultStores[0]
  const [editing, setEditing] = useState(null)
  const [toast, setToast] = useState('')
  const [error, setError] = useState('')

  const save = async (data) => {
    const payload = { ...data, store: canChooseStore ? data.store : fixedStore }
    await saveReview(payload)
    setToast('保存成功')
    setEditing(null)
    window.setTimeout(() => setToast(''), 2200)
  }

  const remove = async (id) => {
    if (!window.confirm('确认删除这条复盘记录吗？')) return
    setError('')
    try {
      await deleteReview(id)
      setToast('删除成功')
      window.setTimeout(() => setToast(''), 2200)
    } catch (deleteError) {
      setError(deleteError.message || '删除失败')
    }
  }

  return (
    <Panel title="每日复盘" subtitle="日报负责数据，复盘负责管理动作" action={canEditReviews ? <PrimaryButton onClick={() => setEditing({ ...emptyReview, date: todayString(), store: fixedStore || stores[0] || '' })}>新增复盘</PrimaryButton> : null}>
      {toast && <Toast>{toast}</Toast>}
      {(error || dailyReviewError) && <ErrorNotice>{error || dailyReviewError}</ErrorNotice>}
      <Table>
        <thead>
          <tr>
            {['日期', '门店', '目标完成', '未完成原因', '今日主要问题', '明日重点工作', '明日邀约目标', '明日重点顾客', '老板支持事项', '操作'].map((head) => <Th key={head}>{head}</Th>)}
          </tr>
        </thead>
        <tbody>
          {reviews.length === 0 && (
            <tr className="border-t border-pink-50">
              <Td colSpan={10}>
                <div className="rounded-lg bg-pink-50 px-4 py-6 text-center text-[#8a4964]">暂无复盘数据</div>
              </Td>
            </tr>
          )}
          {reviews.map((item) => (
            <tr key={item.id} className="border-t border-pink-50">
              <Td>{item.date}</Td>
              <Td>{item.store || '未设置门店'}</Td>
              <Td><Badge tone={item.goalCompleted ? 'success' : 'warning'}>{item.goalCompleted ? '已完成' : '未完成'}</Badge></Td>
              <Td className="max-w-60">{item.unfinishedReason}</Td>
              <Td className="max-w-60">{item.mainIssue}</Td>
              <Td className="max-w-60">{item.tomorrowFocus}</Td>
              <Td>{item.tomorrowInviteTarget || 0}人</Td>
              <Td className="max-w-60">{item.tomorrowKeyCustomers}</Td>
              <Td className="max-w-60">{item.bossSupport}</Td>
              <Td>
                {canEditReviews ? (
                  <>
                    <ActionButton onClick={() => setEditing(item)}>编辑</ActionButton>
                    <ActionButton tone="danger" onClick={() => remove(item.id)}>删除</ActionButton>
                  </>
                ) : ''}
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
      {editing && <ReviewDrawer data={editing} stores={stores} lockedStore={!canChooseStore} lockedStoreValue={fixedStore} onClose={() => setEditing(null)} onSave={save} />}
    </Panel>
  )
}

function EmployeesModule({ employees, stores, role, profile, employeeError, saveEmployee, deleteEmployee }) {
  const canChooseStore = isBossRole(role)
  const canEditEmployees = isBossRole(role) || String(role || '').trim() === 'manager'
  const fixedStore = canChooseStore ? '' : normalizeStoreName(profile?.store) || stores[0] || defaultStores[0]
  const [editing, setEditing] = useState(null)
  const [toast, setToast] = useState('')
  const [error, setError] = useState('')
  const [filters, setFilters] = useState({
    store: canChooseStore ? '全部门店' : fixedStore,
    role: '全部岗位',
  })
  const filteredEmployees = employees.filter((item) => {
    const storeMatch = filters.store === '全部门店' || normalizeStoreName(item.store) === filters.store
    const roleMatch = filters.role === '全部岗位' || item.role === filters.role
    return storeMatch && roleMatch
  })

  const showToast = (message) => {
    setToast(message)
    window.setTimeout(() => setToast(''), 2200)
  }

  const save = async (data) => {
    setError('')
    try {
      await saveEmployee({ ...data, store: canChooseStore ? data.store : fixedStore })
      setEditing(null)
      showToast('保存成功')
    } catch (saveError) {
      setError(saveError.message || '保存失败')
    }
  }

  const remove = async (item) => {
    if (!window.confirm('确定删除该员工吗？')) return
    setError('')
    try {
      await deleteEmployee(item.id)
      showToast('删除成功')
    } catch (deleteError) {
      setError(deleteError.message || '删除失败')
    }
  }

  return (
    <Panel title="员工管理" subtitle="维护员工基础资料和今日经营数据" action={canEditEmployees ? <PrimaryButton onClick={() => setEditing({ ...emptyEmployee, store: fixedStore || stores[0] || defaultStores[0] })}>新增员工</PrimaryButton> : null}>
      {toast && <Toast>{toast}</Toast>}
      {(error || employeeError) && <ErrorNotice>{error || employeeError}</ErrorNotice>}
      <div className="mb-4 grid grid-cols-1 gap-3 rounded-lg bg-white p-4 ring-1 ring-pink-100 md:grid-cols-2">
        <Field label="按门店筛选"><Select value={filters.store} onChange={(value) => setFilters({ ...filters, store: value })} options={canChooseStore ? ['全部门店', ...validStoreNames] : [fixedStore]} disabled={!canChooseStore} /></Field>
        <Field label="按岗位筛选"><Select value={filters.role} onChange={(value) => setFilters({ ...filters, role: value })} options={['全部岗位', ...staffRoleOptions]} /></Field>
      </div>
      <Table>
        <thead>
          <tr>
            {['员工姓名', '手机号', '所属门店', '岗位', '在职', '今日跟进', '今日预约', '今日到店', '今日成交', '今日业绩', '操作'].map((head) => <Th key={head}>{head}</Th>)}
          </tr>
        </thead>
        <tbody>
          {filteredEmployees.length === 0 && (
            <tr className="border-t border-pink-50">
              <Td colSpan={11}>
                <div className="rounded-lg bg-pink-50 px-4 py-6 text-center text-[#8a4964]">暂无员工数据</div>
              </Td>
            </tr>
          )}
          {filteredEmployees.map((item) => (
            <tr key={item.id} className="border-t border-pink-50">
              <Td><div className="font-semibold text-[#5f263c]">{item.name}</div></Td>
              <Td>{item.phone}</Td>
              <Td>{item.store}</Td>
              <Td>{roleLabel(item.role)}</Td>
              <Td><Badge tone={item.isActive ? 'success' : 'warning'}>{item.isActive ? '在职' : '停用'}</Badge></Td>
              <Td>{item.today_followups || 0}</Td>
              <Td>{item.today_appointments || 0}</Td>
              <Td>{item.today_arrivals || 0}</Td>
              <Td>{item.today_deals || 0}</Td>
              <Td>{money(item.today_sales || 0)}</Td>
              <Td>
                {canEditEmployees ? (
                  <>
                    <ActionButton onClick={() => setEditing(item)}>编辑</ActionButton>
                    <ActionButton tone="danger" onClick={() => remove(item)}>删除</ActionButton>
                  </>
                ) : ''}
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
      {editing && <EmployeeDrawer data={editing} stores={stores} lockedStore={!canChooseStore} lockedStoreValue={fixedStore} onClose={() => setEditing(null)} onSave={save} />}
    </Panel>
  )
}

function PerformanceReportsModule({ cashierOrders, customers, stores, role, profile, cashierOrderError }) {
  const canChooseStore = isBossRole(role)
  const isBeautician = isBeauticianRole(role)
  const fixedStore = canChooseStore ? '' : normalizeStoreName(profile?.store) || stores[0] || defaultStores[0]
  const [filters, setFilters] = useState({
    store: canChooseStore ? '全部门店' : fixedStore,
    employee: isBeautician ? profile?.name || '' : '全部员工',
  })

  const storeOptions = canChooseStore ? ['全部门店', ...validStoreNames] : [fixedStore]
  const today = todayString()
  const customerMap = new Map((Array.isArray(customers) ? customers : []).map((customer) => [String(customer.id), customer]))
  const todayOrders = (Array.isArray(cashierOrders) ? cashierOrders : []).filter((order) => {
    const store = normalizeStoreName(order.storeName || order.store)
    const employee = order.salesEmployeeName || order.serviceEmployeeName || ''
    const storeMatch = filters.store === '全部门店' || store === filters.store
    const employeeMatch = filters.employee === '全部员工' || employee === filters.employee
    return order.status !== 'voided' && order.date === today && storeMatch && employeeMatch
  })
  const employeeOptions = isBeautician
    ? [profile?.name || '']
    : ['全部员工', ...unique(todayOrders.map((order) => order.salesEmployeeName || order.serviceEmployeeName).filter(Boolean))]
  const customerKeyOf = (order) => String(order.customerId || order.customerPhone || order.customerName || order.id)
  const arrivedCustomerKeys = new Set(todayOrders.map(customerKeyOf).filter(Boolean))
  const totalSales = todayOrders.reduce((sum, order) => sum + Number(order.actualAmount || 0), 0)
  const totalArrivals = arrivedCustomerKeys.size
  const newCustomerKeys = new Set(todayOrders
    .filter((order) => {
      const customer = customerMap.get(String(order.customerId))
      return Boolean(customer?.isNewCustomer || customer?.is_new_customer)
    })
    .map(customerKeyOf)
    .filter(Boolean))
  const totalNewCustomers = newCustomerKeys.size
  const averageOrder = totalArrivals > 0 ? totalSales / totalArrivals : 0
  const todayUpsellAmount = todayOrders.reduce((sum, order) => sum + Number(order.upsellAmount || 0), 0)
  const employeeRank = Object.values(todayOrders.reduce((map, order) => {
    const name = order.salesEmployeeName || order.serviceEmployeeName || '未设置员工'
    const key = `${normalizeStoreName(order.storeName || order.store)}-${name}`
    map[key] = map[key] || {
      employee: name,
      store: normalizeStoreName(order.storeName || order.store),
      totalSales: 0,
      consumeSales: 0,
      cashSales: 0,
      customerKeys: new Set(),
      orders: 0,
    }
    map[key].totalSales += Number(order.actualAmount || 0)
    map[key].consumeSales += Number(order.consumeAmount || 0)
    if (!['card', 'package'].includes(order.paymentType)) map[key].cashSales += Number(order.actualAmount || 0)
    map[key].customerKeys.add(customerKeyOf(order))
    map[key].orders += 1
    return map
  }, {})).map((item) => ({
    ...item,
    arrivals: item.customerKeys.size,
    unitPrice: item.customerKeys.size > 0 ? item.totalSales / item.customerKeys.size : 0,
  }))
    .sort((a, b) => Number(b.totalSales || 0) - Number(a.totalSales || 0))
  const storeRank = validStoreNames
    .map((store) => {
      const list = todayOrders.filter((order) => normalizeStoreName(order.storeName || order.store) === store)
      const storeCustomerKeys = new Set(list.map(customerKeyOf).filter(Boolean))
      return {
        store,
        totalSales: list.reduce((sum, order) => sum + Number(order.actualAmount || 0), 0),
        arrivals: storeCustomerKeys.size,
        orders: list.length,
      }
    })
    .filter((item) => canChooseStore || item.store === fixedStore)
    .sort((a, b) => Number(b.totalSales || 0) - Number(a.totalSales || 0))

  return (
    <div className="space-y-5">
      <Panel title="员工业绩日报" subtitle="自动读取今日开单收银数据，不再人工录入">
        {cashierOrderError && <ErrorNotice>{cashierOrderError}</ErrorNotice>}
        <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-5">
          <div className="rounded-lg bg-[#c2185b] p-4 text-white shadow-md shadow-pink-100">
            <div className="text-sm text-pink-100">今日总业绩</div>
            <div className="mt-2 text-3xl font-black">{money(totalSales)}</div>
          </div>
          <div className="rounded-lg border border-pink-100 bg-pink-50 p-4">
            <div className="text-sm text-[#9a6078]">今日到店人数</div>
            <div className="mt-2 text-3xl font-black text-[#5f263c]">{totalArrivals}</div>
          </div>
          <div className="rounded-lg border border-pink-100 bg-pink-50 p-4">
            <div className="text-sm text-[#9a6078]">今日新客人数</div>
            <div className="mt-2 text-3xl font-black text-green-600">{totalNewCustomers}</div>
          </div>
          <div className="rounded-lg border border-pink-100 bg-pink-50 p-4">
            <div className="text-sm text-[#9a6078]">今日客单价</div>
            <div className="mt-2 text-3xl font-black text-[#bd1657]">{money(averageOrder)}</div>
          </div>
          <div className="rounded-lg border border-pink-100 bg-pink-50 p-4">
            <div className="text-sm text-[#9a6078]">今日升单金额</div>
            <div className="mt-2 text-3xl font-black text-orange-600">{money(todayUpsellAmount)}</div>
          </div>
        </div>
        <div className="mb-4 grid grid-cols-1 gap-3 rounded-lg bg-white p-4 ring-1 ring-pink-100 md:grid-cols-2">
          <Field label="门店筛选"><Select value={filters.store} onChange={(value) => setFilters({ ...filters, store: value, employee: isBeautician ? profile?.name || '' : '全部员工' })} options={storeOptions} disabled={!canChooseStore} /></Field>
          <Field label="员工筛选"><Select value={filters.employee} onChange={(value) => setFilters({ ...filters, employee: value })} options={employeeOptions} disabled={isBeautician} /></Field>
        </div>
        <Table>
          <thead>
            <tr>
              {['排名', '门店', '员工', '到店人数', '订单数', '消耗金额', '现金金额', '总业绩', '客单价'].map((head) => <Th key={head}>{head}</Th>)}
            </tr>
          </thead>
          <tbody>
            {employeeRank.length === 0 && (
              <tr className="border-t border-pink-50">
                <Td colSpan={9}><div className="rounded-lg bg-pink-50 px-4 py-6 text-center text-[#8a4964]">今日暂无开单数据</div></Td>
              </tr>
            )}
            {employeeRank.map((item, index) => (
              <tr key={`${item.store}-${item.employee}`} className="border-t border-pink-50">
                <Td><Badge tone={index === 0 ? 'danger' : 'pink'}>第{index + 1}名</Badge></Td>
                <Td>{item.store}</Td>
                <Td><div className="font-semibold text-[#5f263c]">{item.employee}</div></Td>
                <Td>{item.arrivals}</Td>
                <Td>{item.orders}</Td>
                <Td>{money(item.consumeSales)}</Td>
                <Td>{money(item.cashSales)}</Td>
                <Td><b className="text-[#bd1657]">{money(item.totalSales)}</b></Td>
                <Td>{money(item.unitPrice)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Panel>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Panel title="今日员工业绩排行" subtitle="按今日总业绩从高到低">
          <RankList rows={employeeRank.map((item) => ({ name: `${item.employee} · ${item.store}`, value: money(item.totalSales), amount: Number(item.totalSales || 0), sub: `${item.arrivals}人到店 · ${item.orders}单` }))} />
        </Panel>
        <Panel title="今日门店排行" subtitle="按今日总业绩从高到低">
          <RankList rows={storeRank.map((item) => ({ name: item.store, value: money(item.totalSales), amount: Number(item.totalSales || 0), sub: `${item.arrivals}人到店` }))} />
        </Panel>
      </div>
    </div>
  )
}

function salaryEmployeeSource(employees) {
  return Array.isArray(employees) ? employees : []
}

function salaryRecordSource(performanceRecords, performanceReports, cashierOrders = []) {
  const activeCashierOrders = (Array.isArray(cashierOrders) ? cashierOrders : [])
    .filter((order) => order.status !== 'voided')
    .map(cashierOrderToPerformanceRecord)
  return activeCashierOrders
}

function buildMonthlySalaryRows({ employees, records, month, store, employee, role }) {
  const scopedEmployees = (Array.isArray(employees) ? employees : []).filter((item) => {
    const storeMatch = store === '全部门店' || normalizeStoreName(item.store) === store
    const employeeMatch = employee === '全部员工' || item.name === employee
    const roleMatch = role === '全部岗位' || item.role === role
    return storeMatch && employeeMatch && roleMatch && item.isActive !== false
  })

  return scopedEmployees.map((item) => {
    const employeeRecords = (Array.isArray(records) ? records : []).filter((record) => {
      const recordMonth = String(record.month || record.date || '').slice(0, 7)
      const salesName = record.salesEmployeeName || record.employee
      const serviceName = record.serviceEmployeeName || record.employee
      return recordMonth === month && (salesName === item.name || serviceName === item.name)
    })
    const personalPerformanceAmount = employeeRecords
      .filter((record) => (record.salesEmployeeName || record.employee) === item.name)
      .reduce((sum, record) => sum + Number(record.amount ?? record.totalSales ?? 0), 0)
    const storePerformanceAmount = (Array.isArray(records) ? records : [])
      .filter((record) => String(record.month || record.date || '').slice(0, 7) === month && normalizeStoreName(record.storeName || record.store) === normalizeStoreName(item.store))
      .reduce((sum, record) => sum + Number(record.amount ?? record.totalSales ?? 0), 0)
    return {
      employeeId: item.id,
      employeeName: item.name,
      storeName: normalizeStoreName(item.store),
      role: item.role,
      month,
      personalPerformanceAmount,
      storePerformanceAmount,
      arrivals: employeeRecords.reduce((sum, record) => sum + Number(record.arrivals || 0), 0),
      newCustomers: employeeRecords.reduce((sum, record) => sum + Number(record.newCustomers || 0), 0),
      consumeAmount: employeeRecords.reduce((sum, record) => sum + Number(record.consumeAmount ?? record.consumeSales ?? 0), 0),
      serviceSales: employeeRecords.reduce((sum, record) => sum + Number(record.serviceSales || 0), 0),
      cashSales: employeeRecords.reduce((sum, record) => sum + Number(record.cashSales || 0), 0),
      upsellAmount: employeeRecords.reduce((sum, record) => sum + Number(record.upsellAmount || 0), 0),
      recordCount: employeeRecords.length,
      records: employeeRecords,
    }
  }).sort((a, b) => Number(b.personalPerformanceAmount || 0) - Number(a.personalPerformanceAmount || 0))
}

function PerformanceMonthlyModule({ performanceReports, performanceRecords, cashierOrders, employees, stores, role, profile, performanceReportError, performanceRecordError, cashierOrderError, setActive }) {
  const canChooseStore = isBossRole(role)
  const isBeautician = isBeauticianRole(role)
  const fixedStore = canChooseStore ? '' : normalizeStoreName(profile?.store) || stores[0] || defaultStores[0]
  const [filters, setFilters] = useState({
    month: todayString().slice(0, 7),
    store: canChooseStore ? '全部门店' : fixedStore,
    employee: isBeautician ? profile?.name || '' : '全部员工',
    role: '全部岗位',
  })
  const storeOptions = canChooseStore ? ['全部门店', ...validStoreNames] : [fixedStore]
  const sourceEmployees = salaryEmployeeSource(employees)
  const sourceRecords = salaryRecordSource(performanceRecords, performanceReports, cashierOrders)
  const scopedEmployees = sourceEmployees.filter((item) => (filters.store === '全部门店' || normalizeStoreName(item.store) === filters.store) && (!isBeautician || item.name === profile?.name))
  const employeeOptions = isBeautician ? [profile?.name || ''] : ['全部员工', ...unique(scopedEmployees.map((item) => item.name).filter(Boolean))]
  const monthlyRows = buildMonthlySalaryRows({ employees: sourceEmployees, records: sourceRecords, month: filters.month, store: filters.store, employee: filters.employee, role: filters.role })
  const monthTotalSales = monthlyRows.reduce((sum, item) => sum + Number(item.personalPerformanceAmount || 0), 0)
  const monthArrivals = monthlyRows.reduce((sum, item) => sum + Number(item.arrivals || 0), 0)
  const monthNewCustomers = monthlyRows.reduce((sum, item) => sum + Number(item.newCustomers || 0), 0)
  const monthConsumeAmount = monthlyRows.reduce((sum, item) => sum + Number(item.consumeAmount || 0), 0)
  const monthCashAmount = monthlyRows.reduce((sum, item) => sum + Number(item.cashSales || 0), 0)
  const monthUpsellAmount = monthlyRows.reduce((sum, item) => sum + Number(item.upsellAmount || 0), 0)
  const monthUnitPrice = monthArrivals > 0 ? monthTotalSales / monthArrivals : 0
  const storeRank = validStoreNames
    .map((store) => {
      const list = monthlyRows.filter((item) => item.storeName === store)
      return {
        store,
        totalSales: list.reduce((sum, item) => sum + Number(item.personalPerformanceAmount || 0), 0),
        arrivals: list.reduce((sum, item) => sum + Number(item.arrivals || 0), 0),
      }
    })
    .filter((item) => canChooseStore || item.store === fixedStore)
    .sort((a, b) => Number(b.totalSales || 0) - Number(a.totalSales || 0))
  const roleRows = Object.values(monthlyRows.reduce((map, item) => {
    const key = roleLabel(item.role)
    map[key] = map[key] || { name: key, total: 0, count: 0 }
    map[key].total += Number(item.personalPerformanceAmount || 0)
    map[key].count += 1
    return map
  }, {}))
  const employeeRank = monthlyRows.map((item) => ({ name: `${item.employeeName} · ${item.storeName}`, value: money(item.personalPerformanceAmount), amount: Number(item.personalPerformanceAmount || 0), sub: `${item.arrivals}人到店` }))

  return (
    <div className="space-y-5">
      <Panel title="员工业绩月报" subtitle="按月份汇总员工业绩、到店、消耗、现金和升单">
        {(performanceReportError || performanceRecordError || cashierOrderError) && <ErrorNotice>{performanceReportError || performanceRecordError || cashierOrderError}</ErrorNotice>}
        <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-6">
          <div className="rounded-lg bg-[#c2185b] p-4 text-white shadow-md shadow-pink-100">
            <div className="text-sm text-pink-100">本月门店总业绩</div>
            <div className="mt-2 text-3xl font-black">{money(monthTotalSales)}</div>
          </div>
          <div className="rounded-lg border border-pink-100 bg-pink-50 p-4">
            <div className="text-sm text-[#9a6078]">本月到店人数</div>
            <div className="mt-2 text-3xl font-black text-[#5f263c]">{monthArrivals}</div>
          </div>
          <div className="rounded-lg border border-pink-100 bg-pink-50 p-4">
            <div className="text-sm text-[#9a6078]">本月新客人数</div>
            <div className="mt-2 text-3xl font-black text-green-600">{monthNewCustomers}</div>
          </div>
          <div className="rounded-lg border border-pink-100 bg-pink-50 p-4">
            <div className="text-sm text-[#9a6078]">本月消耗金额</div>
            <div className="mt-2 text-3xl font-black text-[#bd1657]">{money(monthConsumeAmount)}</div>
          </div>
          <div className="rounded-lg border border-pink-100 bg-pink-50 p-4">
            <div className="text-sm text-[#9a6078]">本月现金金额</div>
            <div className="mt-2 text-3xl font-black text-orange-600">{money(monthCashAmount)}</div>
          </div>
          <div className="rounded-lg border border-pink-100 bg-pink-50 p-4">
            <div className="text-sm text-[#9a6078]">本月升单金额</div>
            <div className="mt-2 text-3xl font-black text-green-700">{money(monthUpsellAmount)}</div>
          </div>
        </div>
        <div className="mb-4 grid grid-cols-1 gap-3 rounded-lg bg-white p-4 ring-1 ring-pink-100 md:grid-cols-4">
          <Field label="月份筛选"><Input type="month" value={filters.month} onChange={(value) => setFilters({ ...filters, month: value })} /></Field>
          <Field label="门店筛选"><Select value={filters.store} onChange={(value) => setFilters({ ...filters, store: value, employee: isBeautician ? profile?.name || '' : '全部员工' })} options={storeOptions} disabled={!canChooseStore} /></Field>
          <Field label="员工筛选"><Select value={filters.employee} onChange={(value) => setFilters({ ...filters, employee: value })} options={employeeOptions} disabled={isBeautician} /></Field>
          <Field label="岗位筛选"><Select value={filters.role} onChange={(value) => setFilters({ ...filters, role: value })} options={['全部岗位', ...staffRoleOptions]} /></Field>
        </div>
        <Table>
          <thead>
            <tr>
              {['排名', '月份', '门店', '员工', '岗位', '到店人数', '总业绩', '消耗金额', '现金金额', '升单金额', '客单价', '操作'].map((head) => <Th key={head}>{head}</Th>)}
            </tr>
          </thead>
          <tbody>
            {monthlyRows.length === 0 && (
              <tr className="border-t border-pink-50">
                <Td colSpan={12}><div className="rounded-lg bg-pink-50 px-4 py-6 text-center text-[#8a4964]">暂无员工业绩数据，请先录入业绩记录或检查筛选条件。</div></Td>
              </tr>
            )}
            {monthlyRows.map((item, index) => (
              <tr key={`${item.storeName}-${item.employeeName}`} className="border-t border-pink-50">
                <Td><Badge tone={index === 0 ? 'danger' : 'pink'}>第{index + 1}名</Badge></Td>
                <Td>{item.month}</Td>
                <Td>{item.storeName}</Td>
                <Td><div className="font-semibold text-[#5f263c]">{item.employeeName}</div></Td>
                <Td>{roleLabel(item.role)}</Td>
                <Td>{item.arrivals}</Td>
                <Td><b className="text-[#bd1657]">{money(item.personalPerformanceAmount)}</b></Td>
                <Td>{money(item.consumeAmount)}</Td>
                <Td>{money(item.cashSales)}</Td>
                <Td>{money(item.upsellAmount)}</Td>
                <Td>{money(item.arrivals > 0 ? item.personalPerformanceAmount / item.arrivals : 0)}</Td>
                <Td><Badge tone={item.recordCount > 0 ? 'success' : 'light'}>{item.recordCount > 0 ? '有记录' : '暂无'}</Badge></Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Panel>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Panel title="本月员工业绩排行榜" subtitle="按本月总业绩从高到低">
          <RankList rows={employeeRank} />
        </Panel>
        <Panel title="本月门店业绩排行榜" subtitle="按本月总业绩从高到低">
          <RankList rows={storeRank.map((item) => ({ name: item.store, value: money(item.totalSales), amount: Number(item.totalSales || 0), sub: `${item.arrivals}人到店` }))} />
        </Panel>
        <Panel title="各岗位业绩简表" subtitle={`本月客单价 ${money(monthUnitPrice)}`}>
          <RankList rows={roleRows.map((item) => ({ name: item.name, value: money(item.total), amount: item.total, sub: `${item.count}人` }))} />
        </Panel>
      </div>
    </div>
  )
}

function HandworkSettlementModule({ cashierOrders, stores, role, profile, cashierOrderError }) {
  const canChooseStore = isBossRole(role)
  const fixedStore = canChooseStore ? '' : normalizeStoreName(profile?.store) || stores[0] || defaultStores[0]
  const [filters, setFilters] = useState({
    month: todayString().slice(0, 7),
    store: canChooseStore ? '全部门店' : fixedStore,
  })
  const activeOrders = (Array.isArray(cashierOrders) ? cashierOrders : []).filter((order) => {
    const store = normalizeStoreName(order.storeName || order.store)
    const month = String(order.month || order.date || '').slice(0, 7)
    const storeMatch = filters.store === '全部门店' || store === filters.store
    return order.status !== 'voided' && month === filters.month && storeMatch
  })
  const rows = Object.values(activeOrders.reduce((map, order) => {
    const name = order.serviceEmployeeName || '未设置操作老师'
    const store = normalizeStoreName(order.storeName || order.store)
    const key = `${store}-${name}`
    map[key] = map[key] || { name, store, orders: 0, manualAmount: 0, consumeAmount: 0, salesAmount: 0 }
    map[key].orders += 1
    map[key].manualAmount += orderManualAmount(order)
    map[key].consumeAmount += Number(order.consumeAmount || 0)
    map[key].salesAmount += Number(order.actualAmount || 0)
    return map
  }, {})).sort((a, b) => b.manualAmount - a.manualAmount)
  const totalManual = rows.reduce((sum, item) => sum + Number(item.manualAmount || 0), 0)

  return (
    <Panel title="手工费结算" subtitle="自动按开单项目固定手工费汇总，不再手工手算">
      {cashierOrderError && <ErrorNotice>{cashierOrderError}</ErrorNotice>}
      <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
        <MetricBox label="本月手工费" value={money(totalManual)} />
        <MetricBox label="开单数" value={activeOrders.length} />
        <MetricBox label="结算人数" value={rows.length} />
      </div>
      <div className="mb-4 grid grid-cols-1 gap-3 rounded-lg bg-white p-4 ring-1 ring-pink-100 md:grid-cols-2">
        <Field label="月份"><Input type="month" value={filters.month} onChange={(value) => setFilters({ ...filters, month: value })} /></Field>
        <Field label="门店"><Select value={filters.store} onChange={(value) => setFilters({ ...filters, store: value })} options={canChooseStore ? ['全部门店', ...validStoreNames] : [fixedStore]} disabled={!canChooseStore} /></Field>
      </div>
      <Table>
        <thead>
          <tr>{['员工', '门店', '服务单数', '手工费', '消耗金额', '关联实收'].map((head) => <Th key={head}>{head}</Th>)}</tr>
        </thead>
        <tbody>
          {rows.length === 0 && <tr className="border-t border-pink-50"><Td colSpan={6}><div className="rounded-lg bg-pink-50 px-4 py-6 text-center text-[#8a4964]">暂无手工费数据</div></Td></tr>}
          {rows.map((item) => (
            <tr key={`${item.store}-${item.name}`} className="border-t border-pink-50">
              <Td><b className="text-[#5f263c]">{item.name}</b></Td>
              <Td>{item.store}</Td>
              <Td>{item.orders}</Td>
              <Td><b className="text-[#bd1657]">{money(item.manualAmount)}</b></Td>
              <Td>{money(item.consumeAmount)}</Td>
              <Td>{money(item.salesAmount)}</Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </Panel>
  )
}

function ProjectStandardLibraryModule({ projectCommissions, projectCommissionError, saveProjectCommission }) {
  const projects = Array.isArray(projectCommissions) && projectCommissions.length ? projectCommissions : defaultProjectCommissions
  const [editing, setEditing] = useState(null)
  const [filters, setFilters] = useState({ category: '全部分类', search: '' })
  const [toast, setToast] = useState('')
  const [error, setError] = useState('')
  const rows = projects.filter((item) => {
    const categoryMatch = filters.category === '全部分类' || item.category === filters.category
    const searchMatch = !filters.search || String(item.projectName || '').includes(filters.search)
    return categoryMatch && searchMatch
  })
  const save = async (row) => {
    setError('')
    try {
      await saveProjectCommission(row)
      setEditing(null)
      setToast('保存成功')
      window.setTimeout(() => setToast(''), 1800)
    } catch (saveError) {
      setError(saveError.message || '保存失败')
    }
  }

  return (
    <Panel title="项目标准库" subtitle="开单只能选择已启用项目，默认售价、固定手工费和统计规则都从这里带出" action={<PrimaryButton onClick={() => setEditing({ projectName: '', category: 'face', defaultPrice: 0, manualCommission: 0, durationMinutes: '', unit: '次', isCardConsumption: false, isHighEnd: false, includeSaleCommission: true, includeManualCommission: true, isActive: true, defaultPerformanceType: '售前', remark: '' })}>新增项目</PrimaryButton>}>
      {toast && <Toast>{toast}</Toast>}
      {(error || projectCommissionError) && <ErrorNotice>{error || projectCommissionError}</ErrorNotice>}
      <div className="mb-4 grid grid-cols-1 gap-3 rounded-lg bg-white p-4 ring-1 ring-pink-100 md:grid-cols-2">
        <Field label="分类筛选"><Select value={filters.category} onChange={(value) => setFilters({ ...filters, category: value })} options={['全部分类', ...projectCategoryOptions]} /></Field>
        <Field label="搜索项目"><Input value={filters.search} onChange={(value) => setFilters({ ...filters, search: value })} placeholder="输入项目名称" /></Field>
      </div>
      <Table>
        <thead>
          <tr>{['项目名称', '分类', '默认售价', '固定手工费', '时长', '耗卡', '高端', '销售提成', '手工提成', '状态', '操作'].map((head) => <Th key={head}>{head}</Th>)}</tr>
        </thead>
        <tbody>
          {rows.map((item) => (
            <tr key={item.id || item.projectName} className="border-t border-pink-50">
              <Td><b className="text-[#5f263c]">{item.projectName}</b></Td>
              <Td>{projectCategoryLabels[item.category] || item.category}</Td>
              <Td>{money(item.defaultPrice || 0)}</Td>
              <Td>{money(item.manualCommission || 0)}</Td>
              <Td>{item.durationMinutes || '-'}{item.durationMinutes ? '分钟' : ''}</Td>
              <Td><Badge tone={item.isCardConsumption ? 'warning' : 'light'}>{item.isCardConsumption ? '是' : '否'}</Badge></Td>
              <Td><Badge tone={item.isHighEnd ? 'danger' : 'light'}>{item.isHighEnd ? '是' : '否'}</Badge></Td>
              <Td><Badge tone={item.includeSaleCommission === false ? 'light' : 'success'}>{item.includeSaleCommission === false ? '否' : '是'}</Badge></Td>
              <Td><Badge tone={item.includeManualCommission === false ? 'light' : 'success'}>{item.includeManualCommission === false ? '否' : '是'}</Badge></Td>
              <Td><Badge tone={item.isActive === false ? 'warning' : 'success'}>{item.isActive === false ? '停用' : '启用'}</Badge></Td>
              <Td><ActionButton onClick={() => setEditing(item)}>编辑</ActionButton></Td>
            </tr>
          ))}
        </tbody>
      </Table>
      {editing && <ProjectStandardDrawer data={editing} onClose={() => setEditing(null)} onSave={save} />}
    </Panel>
  )
}

function StoreTargetsModule({ performanceReports, cashierOrders, storeTargets, stores, role, profile, storeTargetError, cashierOrderError, saveStoreTarget }) {
  const canChooseStore = isBossRole(role)
  const fixedStore = canChooseStore ? '' : normalizeStoreName(profile?.store) || stores[0] || defaultStores[0]
  const [filters, setFilters] = useState({
    month: todayString().slice(0, 7),
    store: canChooseStore ? '全部门店' : fixedStore,
  })
  const [draftTargets, setDraftTargets] = useState({})
  const [toast, setToast] = useState('')
  const [error, setError] = useState('')
  const today = todayString()
  const activeMonth = filters.month || today.slice(0, 7)
  const currentDate = new Date(`${activeMonth}-01T00:00:00`)
  const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate()
  const isCurrentMonth = today.startsWith(activeMonth)
  const elapsedDays = isCurrentMonth ? Math.min(Number(today.slice(8, 10)), daysInMonth) : daysInMonth
  const remainingDays = Math.max(daysInMonth - elapsedDays + 1, 1)
  const visibleStores = (filters.store === '全部门店' ? validStoreNames : [filters.store]).filter((store) => canChooseStore || store === fixedStore)
  const cashierReports = (Array.isArray(cashierOrders) ? cashierOrders : [])
    .filter((item) => item.status !== 'voided')
    .map((item) => ({
      date: item.date,
      store: item.storeName,
      totalSales: Number(item.actualAmount || 0),
    }))
  const monthReports = cashierReports.filter((item) => String(item.date || '').startsWith(activeMonth))
  const targetOf = (store) => storeTargets.find((item) => item.month === activeMonth && normalizeStoreName(item.store) === store)
  const salesOf = (store, matcher) => monthReports
    .filter((item) => normalizeStoreName(item.store) === store && (!matcher || matcher(item)))
    .reduce((sum, item) => sum + Number(item.totalSales || 0), 0)
  const storesData = visibleStores.map((store) => {
    const target = targetOf(store)
    const monthlyTarget = Number(draftTargets[store] ?? target?.monthlyTarget ?? 0)
    const currentSales = salesOf(store)
    const todaySales = salesOf(store, (item) => item.date === today)
    const dailyTarget = monthlyTarget > 0 ? monthlyTarget / daysInMonth : 0
    const completionRate = monthlyTarget > 0 ? (currentSales / monthlyTarget) * 100 : 0
    const remainingAmount = Math.max(monthlyTarget - currentSales, 0)
    const projectedSales = elapsedDays > 0 ? (currentSales / elapsedDays) * daysInMonth : 0
    const expectedProgress = monthlyTarget > 0 ? (elapsedDays / daysInMonth) * 100 : 0
    const start = new Date(`${activeMonth}-01T00:00:00`)
    const dates = Array.from({ length: Math.min(3, elapsedDays) }, (_, index) => {
      const date = new Date(start)
      date.setDate(elapsedDays - index)
      return date.toISOString().slice(0, 10)
    })
    const lowThreeDays = dates.length === 3 && dates.every((date) => salesOf(store, (item) => item.date === date) < dailyTarget)
    const last7 = monthReports.filter((item) => normalizeStoreName(item.store) === store && Number(String(item.date || '').slice(8, 10)) > elapsedDays - 7)
      .reduce((sum, item) => sum + Number(item.totalSales || 0), 0)
    const prev7 = monthReports.filter((item) => {
      const day = Number(String(item.date || '').slice(8, 10))
      return normalizeStoreName(item.store) === store && day <= elapsedDays - 7 && day > elapsedDays - 14
    }).reduce((sum, item) => sum + Number(item.totalSales || 0), 0)
    return {
      store,
      monthlyTarget,
      currentSales,
      todaySales,
      dailyTarget,
      todayRequired: Math.max(remainingAmount / remainingDays, dailyTarget),
      completionRate,
      remainingAmount,
      projectedSales,
      expectedProgress,
      lowThreeDays,
      growthAmount: last7 - prev7,
    }
  })
  const totalTarget = storesData.reduce((sum, item) => sum + item.monthlyTarget, 0)
  const totalSales = storesData.reduce((sum, item) => sum + item.currentSales, 0)
  const totalCompletionRate = totalTarget > 0 ? (totalSales / totalTarget) * 100 : 0
  const todayRequired = storesData.reduce((sum, item) => sum + item.todayRequired, 0)
  const todayActual = storesData.reduce((sum, item) => sum + item.todaySales, 0)
  const completionRank = [...storesData].sort((a, b) => b.completionRate - a.completionRate)
  const salesRank = [...storesData].sort((a, b) => b.currentSales - a.currentSales)
  const growthRank = [...storesData].sort((a, b) => b.growthAmount - a.growthAmount)
  const warnings = storesData.flatMap((item) => {
    const list = []
    if (item.monthlyTarget > 0 && item.completionRate + 0.1 < item.expectedProgress) list.push(`${item.store} 低于本月进度`)
    if (item.lowThreeDays) list.push(`${item.store} 连续3天未达标`)
    if (item.completionRate >= 90 && item.completionRate < 100) list.push(`${item.store} 接近目标`)
    return list
  })
  const colorOf = (rate) => rate < 60 ? 'text-red-600 bg-red-50 border-red-100' : rate < 80 ? 'text-orange-600 bg-orange-50 border-orange-100' : 'text-green-700 bg-green-50 border-green-100'

  const showToast = (message) => {
    setToast(message)
    window.setTimeout(() => setToast(''), 2200)
  }

  const saveTarget = async (item) => {
    setError('')
    try {
      await saveStoreTarget({
        month: activeMonth,
        store: item.store,
        monthlyTarget: item.monthlyTarget,
        dailyTarget: item.dailyTarget,
        currentSales: item.currentSales,
        completionRate: item.completionRate,
        remainingAmount: item.remainingAmount,
      })
      showToast('保存成功')
    } catch (saveError) {
      setError(saveError.message || '保存失败')
    }
  }

  return (
    <div className="space-y-5">
      <Panel title="门店目标管理" subtitle="按月目标追踪门店完成率、日目标、预估月底业绩和经营预警">
        {toast && <Toast>{toast}</Toast>}
        {(error || storeTargetError || cashierOrderError) && <ErrorNotice>{error || storeTargetError || cashierOrderError}</ErrorNotice>}
        <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-5">
          <div className="rounded-lg bg-[#c2185b] p-4 text-white shadow-md shadow-pink-100">
            <div className="text-sm text-pink-100">全部门店总目标</div>
            <div className="mt-2 text-3xl font-black">{money(totalTarget)}</div>
          </div>
          <div className="rounded-lg border border-pink-100 bg-pink-50 p-4">
            <div className="text-sm text-[#9a6078]">全部已完成业绩</div>
            <div className="mt-2 text-3xl font-black text-[#5f263c]">{money(totalSales)}</div>
          </div>
          <div className={`rounded-lg border p-4 ${colorOf(totalCompletionRate)}`}>
            <div className="text-sm">总完成率</div>
            <div className="mt-2 text-3xl font-black">{totalCompletionRate.toFixed(1)}%</div>
          </div>
          <div className="rounded-lg border border-pink-100 bg-pink-50 p-4">
            <div className="text-sm text-[#9a6078]">今日应完成金额</div>
            <div className="mt-2 text-3xl font-black text-orange-600">{money(todayRequired)}</div>
          </div>
          <div className="rounded-lg border border-pink-100 bg-pink-50 p-4">
            <div className="text-sm text-[#9a6078]">今日实际完成金额</div>
            <div className="mt-2 text-3xl font-black text-green-700">{money(todayActual)}</div>
          </div>
        </div>
        <div className="mb-4 grid grid-cols-1 gap-3 rounded-lg bg-white p-4 ring-1 ring-pink-100 md:grid-cols-2">
          <Field label="月份切换"><Input type="month" value={filters.month} onChange={(value) => setFilters({ ...filters, month: value })} /></Field>
          <Field label="门店筛选"><Select value={filters.store} onChange={(value) => setFilters({ ...filters, store: value })} options={canChooseStore ? ['全部门店', ...validStoreNames] : [fixedStore]} disabled={!canChooseStore} /></Field>
        </div>
        {warnings.length > 0 && (
          <div className="mb-4 rounded-lg border border-orange-100 bg-orange-50 px-4 py-3 text-sm leading-6 text-orange-700">
            {warnings.map((item) => <div key={item}>{item}</div>)}
          </div>
        )}
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {storesData.map((item) => (
            <div key={item.store} className="rounded-lg border border-pink-100 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-lg font-bold text-[#5f263c]">{item.store}</div>
                  <div className="mt-2 text-sm text-[#9a6078]">当前进度：{item.completionRate.toFixed(1)}% / 时间进度：{item.expectedProgress.toFixed(1)}%</div>
                </div>
                <Badge tone={item.completionRate < 60 ? 'danger' : item.completionRate < 80 ? 'warning' : 'success'}>{item.completionRate.toFixed(1)}%</Badge>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
                <MetricBox label="当前完成" value={money(item.currentSales)} />
                <MetricBox label="剩余金额" value={money(item.remainingAmount)} />
                <MetricBox label="今日目标" value={money(item.todayRequired)} />
                <MetricBox label="今日完成" value={money(item.todaySales)} />
                <MetricBox label="日均目标" value={money(item.dailyTarget)} />
                <MetricBox label="预计月底业绩" value={money(item.projectedSales)} />
              </div>
              <div className="mt-4 h-3 overflow-hidden rounded-full bg-pink-50">
                <div className={`h-full rounded-full ${item.completionRate < 60 ? 'bg-red-500' : item.completionRate < 80 ? 'bg-orange-400' : 'bg-green-500'}`} style={{ width: `${Math.min(item.completionRate, 100)}%` }} />
              </div>
              <div className="mt-4 flex flex-col gap-3 md:flex-row">
                <Input type="number" value={item.monthlyTarget} onChange={(value) => setDraftTargets({ ...draftTargets, [item.store]: value })} placeholder="月目标" />
                <PrimaryButton onClick={() => saveTarget(item)}>保存目标</PrimaryButton>
              </div>
            </div>
          ))}
        </div>
      </Panel>
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <Panel title="门店完成率排行榜" subtitle="按目标完成率排序">
          <RankList rows={completionRank.map((item) => ({ name: item.store, value: `${item.completionRate.toFixed(1)}%`, amount: item.completionRate, sub: money(item.currentSales) }))} />
        </Panel>
        <Panel title="门店业绩排行榜" subtitle="按本月累计业绩排序">
          <RankList rows={salesRank.map((item) => ({ name: item.store, value: money(item.currentSales), amount: item.currentSales, sub: `目标 ${money(item.monthlyTarget)}` }))} />
        </Panel>
        <Panel title="门店增长排行榜" subtitle="近7天较前7天增长">
          <RankList rows={growthRank.map((item) => ({ name: item.store, value: money(item.growthAmount), amount: Math.max(item.growthAmount, 0), sub: `预计 ${money(item.projectedSales)}` }))} />
        </Panel>
      </div>
    </div>
  )
}

function LockedStoreDisplay({ value }) {
  return (
    <div className="w-full rounded-lg border border-pink-100 bg-pink-50 px-5 py-4 text-base font-semibold text-[#8a4964]">
      {value || '未设置门店'}
    </div>
  )
}

function CustomerDrawer({ data, stores, profile, lockedStore, lockedStoreValue, lockedOwner, onClose, onSave }) {
  const fixedStore = lockedStore ? normalizeStoreName(lockedStoreValue) || normalizeStoreName(profile?.store) || data.store : data.store
  const [customerForm, setCustomerForm] = useState({
    ...data,
    store: fixedStore,
    owner: lockedOwner ? profile?.name || '' : data.owner ?? '',
  })

  return (
    <Drawer title="新增顾客" onClose={onClose} onSave={() => onSave(customerForm)} successMessage="顾客档案创建成功">
      <FormGrid>
        <Field label="顾客姓名"><Input value={customerForm.name} onChange={(value) => setCustomerForm({ ...customerForm, name: value })} /></Field>
        <Field label="手机号"><Input value={customerForm.phone} onChange={(value) => setCustomerForm({ ...customerForm, phone: value })} /></Field>
        <Field label="生日"><Input type="date" value={customerForm.birthday} onChange={(value) => setCustomerForm({ ...customerForm, birthday: value })} /></Field>
        <Field label="所属门店">
          {lockedStore ? (
            <LockedStoreDisplay value={fixedStore} />
          ) : (
            <Select value={customerForm.store} onChange={(value) => setCustomerForm({ ...customerForm, store: value, owner: '' })} options={stores} />
          )}
        </Field>
        <Field label="负责美容师">
          <input
            type="text"
            value={customerForm.owner ?? ''}
            onChange={(event) => setCustomerForm({ ...customerForm, owner: event.target.value })}
            placeholder="请输入负责美容师姓名"
            disabled={lockedOwner}
            className="w-full rounded-lg border border-pink-100 bg-white px-5 py-4 text-base text-[#5f263c] outline-none focus:border-[#c2185b] focus:ring-2 focus:ring-pink-100"
          />
        </Field>
        <Field label="顾客等级"><Select value={customerForm.level} onChange={(value) => setCustomerForm({ ...customerForm, level: value })} options={['', ...levelOptions]} /></Field>
        <Field label="最后到店日期"><Input type="date" value={customerForm.lastVisit} onChange={(value) => setCustomerForm({ ...customerForm, lastVisit: value })} /></Field>
      </FormGrid>
    </Drawer>
  )
}

function FollowupDrawer({ data, customers, employees, stores, profile, lockedStore, lockedStoreValue, onClose, onSave }) {
  const fixedStore = lockedStore ? normalizeStoreName(lockedStoreValue) || normalizeStoreName(profile?.store) || data.store : data.store
  const [form, setForm] = useState({ ...data, store: fixedStore, owner: profile?.role === 'beautician' ? profile.name : data.owner })
  const staff = profile?.role === 'beautician' ? [profile.name] : employees.map((item) => item.name)
  return (
    <Drawer title={form.id ? '编辑跟进记录' : '新增跟进记录'} onClose={onClose} onSave={() => onSave(form)}>
      <FormGrid>
        <Field label={<RequiredLabel>顾客姓名</RequiredLabel>}><Select value={form.customerId} onChange={(value) => {
          const customer = customers.find((item) => String(item.id) === String(value))
          setForm({ ...form, customerId: value, customerName: customer?.name || '', customerPhone: customer?.phone || '', store: customer?.store || form.store })
        }} options={customers.map((item) => [item.id, item.name])} /></Field>
        <Field label={<RequiredLabel>所属门店</RequiredLabel>}>
          {lockedStore ? (
            <LockedStoreDisplay value={fixedStore} />
          ) : (
            <Select value={form.store} onChange={(value) => setForm({ ...form, store: value })} options={stores} />
          )}
        </Field>
        <Field label={<RequiredLabel>跟进方式</RequiredLabel>}><Select value={form.method} onChange={(value) => setForm({ ...form, method: value })} options={followMethods} /></Field>
        <Field label={<RequiredLabel>跟进人</RequiredLabel>}><Select value={form.owner} onChange={(value) => setForm({ ...form, owner: value })} options={staff} /></Field>
        <Field label="是否预约"><Select value={String(form.hasAppointment)} onChange={(value) => setForm({ ...form, hasAppointment: value === 'true' })} options={[['false', '否'], ['true', '是']]} /></Field>
        <Field label="预约到店时间"><Input type="date" value={form.appointmentTime} onChange={(value) => setForm({ ...form, appointmentTime: value })} /></Field>
        <Field label="是否成交"><Select value={String(form.hasDeal)} onChange={(value) => setForm({ ...form, hasDeal: value === 'true' })} options={[['false', '否'], ['true', '是']]} /></Field>
        <Field label="成交金额"><Input type="number" value={form.dealAmount} onChange={(value) => setForm({ ...form, dealAmount: value })} /></Field>
        <Field label="下次跟进时间"><Input type="date" value={form.nextFollowTime} onChange={(value) => setForm({ ...form, nextFollowTime: value })} /></Field>
        <Field label="问题分类"><Select value={form.issueType} onChange={(value) => setForm({ ...form, issueType: value })} options={issueOptions} /></Field>
        <Field label="沟通内容" full><Textarea value={form.content} onChange={(value) => setForm({ ...form, content: value })} /></Field>
        <Field label="顾客反馈" full><Textarea value={form.feedback} onChange={(value) => setForm({ ...form, feedback: value })} /></Field>
      </FormGrid>
    </Drawer>
  )
}

function ProjectStandardDrawer({ data, onClose, onSave }) {
  const [form, setForm] = useState({
    ...data,
    category: data.category || 'face',
    defaultPrice: data.defaultPrice || 0,
    manualCommission: data.manualCommission || 0,
    unit: data.unit || '次',
    defaultPerformanceType: data.defaultPerformanceType || '售前',
    includeSaleCommission: data.includeSaleCommission !== false,
    includeManualCommission: data.includeManualCommission !== false,
    isActive: data.isActive !== false,
  })
  const boolOptions = [['true', '是'], ['false', '否']]
  const updateBool = (key, value) => setForm({ ...form, [key]: value === 'true' })

  return (
    <Drawer title={form.id ? '编辑项目标准' : '新增项目标准'} onClose={onClose} onSave={() => onSave(form)}>
      <FormGrid>
        <Field label="项目名称"><Input value={form.projectName} onChange={(value) => setForm({ ...form, projectName: value })} /></Field>
        <Field label="项目分类"><Select value={form.category} onChange={(value) => setForm({ ...form, category: value })} options={projectCategoryOptions} /></Field>
        <Field label="默认售价"><Input type="number" value={form.defaultPrice} onChange={(value) => setForm({ ...form, defaultPrice: value })} /></Field>
        <Field label="固定手工费"><Input type="number" value={form.manualCommission} onChange={(value) => setForm({ ...form, manualCommission: value })} /></Field>
        <Field label="项目时长"><Input type="number" value={form.durationMinutes} onChange={(value) => setForm({ ...form, durationMinutes: value })} /></Field>
        <Field label="计费单位"><Input value={form.unit} onChange={(value) => setForm({ ...form, unit: value })} /></Field>
        <Field label="是否耗卡"><Select value={String(Boolean(form.isCardConsumption))} onChange={(value) => updateBool('isCardConsumption', value)} options={boolOptions} /></Field>
        <Field label="是否高端项目"><Select value={String(Boolean(form.isHighEnd))} onChange={(value) => updateBool('isHighEnd', value)} options={boolOptions} /></Field>
        <Field label="参与销售提成"><Select value={String(form.includeSaleCommission !== false)} onChange={(value) => updateBool('includeSaleCommission', value)} options={boolOptions} /></Field>
        <Field label="参与手工提成"><Select value={String(form.includeManualCommission !== false)} onChange={(value) => updateBool('includeManualCommission', value)} options={boolOptions} /></Field>
        <Field label="默认业绩类型"><Select value={form.defaultPerformanceType} onChange={(value) => setForm({ ...form, defaultPerformanceType: value })} options={performanceTypeOptions} /></Field>
        <Field label="是否启用"><Select value={String(form.isActive !== false)} onChange={(value) => updateBool('isActive', value)} options={boolOptions} /></Field>
        <Field label="备注" full><Textarea value={form.remark} onChange={(value) => setForm({ ...form, remark: value })} /></Field>
      </FormGrid>
    </Drawer>
  )
}

function CashierDrawer({ data, customers, employees, projects, stores, storeRecords = [], profile, lockedStore, lockedStoreValue, onClose, onSave }) {
  const fixedStore = lockedStore ? normalizeStoreName(lockedStoreValue) || normalizeStoreName(profile?.store) || data.storeName : data.storeName
  const storeIdByName = (name) => (storeRecords || []).find((store) => normalizeStoreName(store.name) === normalizeStoreName(name))?.id || ''
  const initialItems = cashierOrderItems(data)
  const [form, setForm] = useState({
    ...data,
    orderNo: data.orderNo || generateOrderNo(data.date || todayString()),
    storeName: fixedStore,
    storeId: data.storeId || storeIdByName(fixedStore),
    performanceType: orderPerformanceType(data),
    remark: remarkWithoutPerformanceType(data.remark),
    orderItems: initialItems.length ? initialItems : [{
      id: `new-${Date.now()}`,
      projectId: '',
      projectName: '',
      projectCategory: '',
      quantity: 1,
      originalAmount: 0,
      discountAmount: 0,
      actualAmount: 0,
      consumeAmount: 0,
      manualCommission: 0,
      manualCommissionAmount: 0,
      durationMinutes: '',
    }],
  })
  const [customerSearch, setCustomerSearch] = useState(data.customerName || data.customerPhone || '')
  const [showCustomerResults, setShowCustomerResults] = useState(false)
  const [validationError, setValidationError] = useState('')
  const selectedStoreName = normalizeStoreName(form.storeName)
  const currentStoreId = form.storeId || storeIdByName(selectedStoreName)
  const recordBelongsToCurrentStore = (record) => {
    const recordStoreId = record.storeId || record.store_id || ''
    if (isDbId(currentStoreId) && isDbId(recordStoreId)) return String(recordStoreId) === String(currentStoreId)
    return normalizeRecordStore(record) === selectedStoreName
  }
  const staffInStore = employees
    .filter((item) => recordBelongsToCurrentStore(item))
  const staffOptionsByRoles = (roles) => staffInStore
    .filter((item) => isDbId(item.id))
    .filter((item) => roles.includes(normalizeStaffRole(item.role)))
    .map((item) => [item.id, staffOptionLabel(item)])
  const serviceEmployeeOptions = staffOptionsByRoles(['beautician', 'manager', 'consultant', 'technical_teacher'])
  const salesEmployeeOptions = staffOptionsByRoles(['manager', 'consultant', 'front_desk'])
  const consultantOptions = staffOptionsByRoles(['consultant', 'manager'])
  const normalizedCustomerSearch = String(customerSearch || '').trim().toLowerCase()
  const storeCustomers = customers
    .filter((customer) => isDbId(customer.id) && recordBelongsToCurrentStore(customer))
    .sort((a, b) => String(b.lastVisit || b.createdAt || '').localeCompare(String(a.lastVisit || a.createdAt || '')))
  const customerResults = storeCustomers
    .filter((item) => {
      if (!normalizedCustomerSearch) return true
      return String(item.name || '').toLowerCase().includes(normalizedCustomerSearch)
        || String(item.phone || '').includes(normalizedCustomerSearch)
    })
    .slice(0, 20)
  const totals = form.orderItems.reduce((sum, item) => ({
    originalAmount: sum.originalAmount + Number(item.originalAmount || 0),
    discountAmount: sum.discountAmount + Number(item.discountAmount || 0),
    actualAmount: sum.actualAmount + Number(item.actualAmount || 0),
    consumeAmount: sum.consumeAmount + Number(item.consumeAmount || 0),
    manualCommissionAmount: sum.manualCommissionAmount + Number(item.manualCommissionAmount || 0),
  }), { originalAmount: 0, discountAmount: 0, actualAmount: 0, consumeAmount: 0, manualCommissionAmount: 0 })
  const projectById = new Map(projects.map((project) => [String(project.id), project]))
  const selectedOrderItems = form.orderItems.filter((item) => item.projectId || item.projectName)
  const hasValidItems = selectedOrderItems.length > 0 && selectedOrderItems.every((item) => (
    isDbId(item.projectId)
    && projectById.get(String(item.projectId))?.isActive !== false
    && Number(item.quantity || 0) > 0
    && Number(item.originalAmount || 0) >= 0
    && Number(item.discountAmount || 0) >= 0
    && Number(item.actualAmount || 0) >= 0
    && Number(item.consumeAmount || 0) >= 0
  ))
  const selectedCustomer = storeCustomers.find((customer) => String(customer.id) === String(form.customerId))
  const canSubmitCashierOrder = Boolean(
    isDbId(form.customerId)
    && selectedCustomer
    && hasValidItems
    && isDbId(form.serviceEmployeeId)
    && isDbId(form.salesEmployeeId)
    && (!form.consultantId || isDbId(form.consultantId)),
  )
  useEffect(() => {
    console.log('currentStoreId', currentStoreId)
    console.log('stores', storeRecords)
    console.log('projects', projects)
    console.log('employees', employees)
    console.log('customers', customers)
  }, [currentStoreId, storeRecords, projects, employees, customers])
  const chooseCustomer = (customer) => {
    setForm({
      ...form,
      customerId: customer?.id || '',
      customerName: customer?.name || '',
      customerPhone: customer?.phone || '',
      storeName: form.storeName,
      storeId: currentStoreId,
    })
    setCustomerSearch(customer ? `${customer.name} ${customer.phone || ''}` : '')
    setShowCustomerResults(false)
  }
  const chooseCustomerById = (value) => {
    const customer = storeCustomers.find((item) => String(item.id) === String(value))
    chooseCustomer(customer || null)
  }
  const changeStore = (value) => {
    setForm({ ...form, storeName: value, storeId: storeIdByName(value), customerId: '', customerName: '', customerPhone: '' })
    setCustomerSearch('')
    setShowCustomerResults(false)
  }
  const updateItem = (index, patch) => {
    const orderItems = form.orderItems.map((item, itemIndex) => {
      if (itemIndex !== index) return item
      const next = { ...item, ...patch }
      const original = Number(next.originalAmount || 0)
      const discount = Number(next.discountAmount || 0)
      if (patch.originalAmount !== undefined || patch.discountAmount !== undefined) next.actualAmount = Math.max(original - discount, 0)
      const quantity = Number(next.quantity || 0)
      next.manualCommissionAmount = next.includeManualCommission === false ? 0 : Number(next.manualCommission || 0) * quantity
      return next
    })
    setForm({ ...form, orderItems })
  }
  const chooseProject = (index, value) => {
    const selected = projects.find((item) => String(item.id) === String(value))
    const orderItems = form.orderItems.map((item, itemIndex) => {
      if (itemIndex !== index) return item
      const quantity = Number(item.quantity || 1)
      const manualCommission = Number(selected?.manualCommission || 0)
      const includeManualCommission = selected?.includeManualCommission !== false
      return {
        ...item,
        projectId: isDbId(value) ? value : '',
        projectName: selected?.projectName || '',
        projectCategory: selected?.category || '',
        originalAmount: selected?.defaultPrice || 0,
        actualAmount: selected?.defaultPrice || 0,
        manualCommission,
        manualCommissionAmount: includeManualCommission ? manualCommission * quantity : 0,
        includeManualCommission,
        includeSaleCommission: selected?.includeSaleCommission !== false,
        isCardConsumption: Boolean(selected?.isCardConsumption),
        isHighEnd: Boolean(selected?.isHighEnd),
        durationMinutes: selected?.durationMinutes ?? '',
      }
    })
    setForm({ ...form, orderItems, performanceType: selected?.defaultPerformanceType || form.performanceType || '售前' })
  }
  const addItem = () => {
    setForm({
      ...form,
      orderItems: [...form.orderItems, {
        id: `new-${Date.now()}`,
        projectId: '',
        projectName: '',
        projectCategory: '',
        quantity: 1,
        originalAmount: 0,
        discountAmount: 0,
        actualAmount: 0,
        consumeAmount: 0,
        manualCommission: 0,
        manualCommissionAmount: 0,
        durationMinutes: '',
      }],
    })
  }
  const removeItem = (index) => {
    setForm({ ...form, orderItems: form.orderItems.filter((_, itemIndex) => itemIndex !== index) })
  }
  const chooseEmployee = (fieldId, fieldName, value) => {
    const employee = employees.find((item) => String(item.id) === String(value))
    setForm({ ...form, [fieldId]: isDbId(value) ? value : '', [fieldName]: employee?.name || '' })
  }
  const validateAndSave = () => {
    setValidationError('')
    const orderItems = form.orderItems.filter((item) => item.projectId || item.projectName)
    if (!form.customerId) {
      setValidationError('请先选择顾客')
      throw new Error('请先选择顾客')
    }
    if (!selectedCustomer || !recordBelongsToCurrentStore(selectedCustomer)) {
      setValidationError('顾客不属于当前门店，请重新选择顾客')
      throw new Error('顾客不属于当前门店，请重新选择顾客')
    }
    if (!isDbId(form.customerId) || !isDbId(currentStoreId)) {
      setValidationError('请选择正确的顾客、门店、项目、操作老师和开单人')
      throw new Error('请选择正确的顾客、门店、项目、操作老师和开单人')
    }
    if (orderItems.length === 0) {
      setValidationError('请至少添加 1 个项目。')
      throw new Error('请至少添加 1 个项目。')
    }
    const invalidIndex = orderItems.findIndex((item) => !item.projectId || !item.projectName || Number(item.quantity || 0) <= 0)
    if (invalidIndex >= 0) {
      setValidationError(`第 ${invalidIndex + 1} 个项目未选择项目名称，或数量不是大于 0 的数字。`)
      throw new Error(`第 ${invalidIndex + 1} 个项目未选择项目名称，或数量不是大于 0 的数字。`)
    }
    if (orderItems.some((item) => !isDbId(item.projectId))) {
      setValidationError('请选择正确的顾客、门店、项目、操作老师和开单人')
      throw new Error('请选择正确的顾客、门店、项目、操作老师和开单人')
    }
    const inactiveIndex = orderItems.findIndex((item) => projectById.get(String(item.projectId))?.isActive === false || !projectById.has(String(item.projectId)))
    if (inactiveIndex >= 0) {
      setValidationError(`第 ${inactiveIndex + 1} 个项目已停用或不存在，不能开单。`)
      throw new Error(`第 ${inactiveIndex + 1} 个项目已停用或不存在，不能开单。`)
    }
    const invalidAmountIndex = orderItems.findIndex((item) => (
      Number(item.originalAmount || 0) < 0
      || Number(item.discountAmount || 0) < 0
      || Number(item.actualAmount || 0) < 0
      || Number(item.consumeAmount || 0) < 0
    ))
    if (invalidAmountIndex >= 0) {
      setValidationError(`第 ${invalidAmountIndex + 1} 个项目金额不能为负数。`)
      throw new Error(`第 ${invalidAmountIndex + 1} 个项目金额不能为负数。`)
    }
    if (!form.serviceEmployeeName) {
      setValidationError('请选择操作老师。')
      throw new Error('请选择操作老师。')
    }
    if (!form.salesEmployeeName) {
      setValidationError('请选择开单人。')
      throw new Error('请选择开单人。')
    }
    if (!isDbId(form.serviceEmployeeId) || !isDbId(form.salesEmployeeId) || (form.consultantId && !isDbId(form.consultantId))) {
      setValidationError('请选择正确的顾客、门店、项目、操作老师和开单人')
      throw new Error('请选择正确的顾客、门店、项目、操作老师和开单人')
    }
    return onSave({ ...form, storeId: currentStoreId, orderItems, ...totals, remark: remarkWithPerformanceType(form.performanceType, form.remark) })
  }

  return (
    <Drawer title={form.id ? '编辑开单' : '新增开单'} onClose={onClose} onSave={validateAndSave} saveLabel="保存开单" saveDisabled={!canSubmitCashierOrder}>
      {validationError && <div className="mb-4 rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{validationError}</div>}
      <div className="mb-4 rounded-lg bg-pink-50/70 p-4">
        <div className="mb-3 font-bold text-[#641631]">基础信息</div>
        <FormGrid>
        <Field label="订单编号"><Input value={form.orderNo} onChange={(value) => setForm({ ...form, orderNo: value })} /></Field>
        <Field label="开单日期"><Input type="date" value={form.date} onChange={(value) => setForm({ ...form, date: value, orderNo: form.orderNo || generateOrderNo(value) })} /></Field>
        <Field label="门店">
          {lockedStore ? (
            <LockedStoreDisplay value={fixedStore} />
          ) : (
            <Select value={form.storeName} onChange={changeStore} options={stores} />
          )}
        </Field>
        <Field label="顾客搜索" full>
          <Input value={customerSearch} onChange={(value) => {
            setCustomerSearch(value)
            setShowCustomerResults(true)
            if (!value) chooseCustomer(null)
          }} placeholder="输入顾客姓名或手机号搜索" />
          {showCustomerResults && <div className="mt-2 max-h-52 overflow-y-auto rounded-lg border border-pink-100 bg-white shadow-sm">
            {customerResults.length === 0 && <div className="px-4 py-3 text-sm text-[#8a4964]">未找到顾客，请先到顾客管理新增</div>}
            {customerResults.map((customer) => (
              <button key={customer.id} type="button" onClick={() => chooseCustomer(customer)} className="block w-full cursor-pointer border-b border-pink-50 px-4 py-3 text-left text-sm text-[#5f263c] transition hover:bg-[#ffe4ef] hover:text-[#bd1657]">
                {customer.name}｜{customer.phone || '无手机号'}｜{normalizeRecordStore(customer) || '未设置门店'}
              </button>
            ))}
          </div>}
          <div className="mt-3">
            <Select
              value={form.customerId || ''}
              onChange={chooseCustomerById}
              options={storeCustomers.length ? [['', '请选择顾客（默认显示最近到店前20位）'], ...storeCustomers.slice(0, 20).map((customer) => [customer.id, `${customer.name}｜${customer.phone || '无手机号'}｜${normalizeRecordStore(customer) || '未设置门店'}`])] : [['', '暂无该门店顾客，请先到顾客管理添加']]}
            />
          </div>
          {(form.customerName || form.customerPhone) && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-pink-100 bg-white px-4 py-3 text-sm text-[#5f263c]">
              <span>已选择：{form.customerName || '-'}｜{form.customerPhone || '-'}｜{form.storeName || '-'}</span>
              <button type="button" onClick={() => chooseCustomer(null)} className="rounded-md bg-pink-50 px-3 py-2 font-semibold text-[#c2185b] hover:bg-pink-100">清空顾客</button>
            </div>
          )}
        </Field>
        <Field label="顾客电话"><Input value={form.customerPhone} onChange={(value) => setForm({ ...form, customerPhone: value })} /></Field>
        </FormGrid>
      </div>
      <div className="mb-4 rounded-lg bg-white p-4 ring-1 ring-pink-100">
        <div className="mb-3 flex items-center justify-between">
          <div className="font-bold text-[#641631]">项目明细</div>
          <PrimaryButton onClick={addItem}>添加项目</PrimaryButton>
        </div>
        <div className="space-y-3">
          {form.orderItems.map((item, index) => (
            <div key={item.id || index} className="rounded-lg border border-pink-100 bg-pink-50/70 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="font-bold text-[#641631]">项目 {index + 1}</div>
                <ActionButton tone="danger" onClick={() => removeItem(index)}>删除项目</ActionButton>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                <div className="md:col-span-2 xl:col-span-2">
                  <Field label="项目选择"><Select value={item.projectId} onChange={(value) => chooseProject(index, value)} options={projects.length ? [['', '请选择项目'], ...projects.map((project) => [project.id, `${project.projectName}${project.durationMinutes ? ` · ${project.durationMinutes}分钟` : ''}`])] : [['', '暂无项目，请先到项目标准库添加']]} /></Field>
                </div>
                <div className="min-w-[120px]"><Field label="数量"><Input type="number" value={item.quantity} onChange={(value) => updateItem(index, { quantity: value })} /></Field></div>
                <div className="min-w-[120px]"><Field label="项目时长"><Input value={item.durationMinutes || ''} onChange={() => {}} /></Field></div>
                <div className="min-w-[120px]"><Field label="默认售价"><Input type="number" value={item.originalAmount} onChange={(value) => updateItem(index, { originalAmount: value })} /></Field></div>
                <div className="min-w-[120px]"><Field label="实收金额"><Input type="number" value={item.actualAmount} onChange={(value) => updateItem(index, { actualAmount: value })} /></Field></div>
                <div className="min-w-[120px]"><Field label="消耗金额"><Input type="number" value={item.consumeAmount} onChange={(value) => updateItem(index, { consumeAmount: value })} /></Field></div>
                <div className="min-w-[120px]"><Field label="固定手工费"><Input value={money(item.manualCommissionAmount || 0)} onChange={() => {}} /></Field></div>
                <div className="min-w-[120px]"><Field label="项目分类"><Input value={projectCategoryLabels[item.projectCategory] || item.projectCategory || ''} onChange={() => {}} /></Field></div>
                <div className="md:col-span-2 xl:col-span-4">
                  <div className="flex flex-wrap gap-2 text-xs font-bold text-[#8a4964]">
                    <Badge tone={item.isCardConsumption ? 'warning' : 'light'}>{item.isCardConsumption ? '耗卡项目' : '不耗卡'}</Badge>
                    <Badge tone={item.isHighEnd ? 'danger' : 'light'}>{item.isHighEnd ? '高端项目' : '普通项目'}</Badge>
                    <Badge tone={item.includeSaleCommission === false ? 'light' : 'success'}>{item.includeSaleCommission === false ? '不计销售业绩' : '计销售业绩'}</Badge>
                    <Badge tone={item.includeManualCommission === false ? 'light' : 'success'}>{item.includeManualCommission === false ? '不计手工费' : '计手工费'}</Badge>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="mb-4 rounded-lg bg-pink-50/70 p-4">
        <div className="mb-3 font-bold text-[#641631]">人员与收款</div>
        <FormGrid>
          <Field label="操作老师"><Select value={form.serviceEmployeeId} onChange={(value) => chooseEmployee('serviceEmployeeId', 'serviceEmployeeName', value)} options={serviceEmployeeOptions.length ? [['', '请选择操作老师'], ...serviceEmployeeOptions] : [['', '暂无可选操作人员，请先到员工管理添加美容师/店长/顾问/技术人员']]} /></Field>
          <Field label="开单人"><Select value={form.salesEmployeeId} onChange={(value) => chooseEmployee('salesEmployeeId', 'salesEmployeeName', value)} options={salesEmployeeOptions.length ? [['', '请选择开单人'], ...salesEmployeeOptions] : [['', '暂无可选开单人员，请先到员工管理添加店长/顾问/总监/管理员/区域经理']]} /></Field>
          <Field label="顾问"><Select value={form.consultantId} onChange={(value) => chooseEmployee('consultantId', 'consultantName', value)} options={[['', '无顾问'], ...consultantOptions]} /></Field>
          <Field label="收款方式"><Select value={form.paymentType} onChange={(value) => setForm({ ...form, paymentType: value })} options={paymentOptions} /></Field>
          <Field label="业绩类型"><Select value={form.performanceType} onChange={(value) => setForm({ ...form, performanceType: value })} options={performanceTypeOptions} /></Field>
          <Field label="备注" full><Textarea value={form.remark} onChange={(value) => setForm({ ...form, remark: value })} /></Field>
        </FormGrid>
      </div>
      <div className="rounded-lg border border-pink-100 bg-white p-4">
        <div className="mb-3 font-bold text-[#641631]">订单汇总</div>
        <FormGrid>
        <Field label="订单总实收"><Input value={money(totals.actualAmount)} onChange={() => {}} /></Field>
        <Field label="订单总消耗"><Input value={money(totals.consumeAmount)} onChange={() => {}} /></Field>
        <Field label="订单总手工费"><Input value={money(totals.manualCommissionAmount)} onChange={() => {}} /></Field>
        </FormGrid>
      </div>
    </Drawer>
  )
}

function CashierDetail({ order, onClose }) {
  const items = cashierOrderItems(order)
  const rows = [
    ['订单编号', order.orderNo],
    ['日期', order.date],
    ['门店', order.storeName],
    ['顾客', `${order.customerName || ''} ${order.customerPhone || ''}`],
    ['项目', items.map((item) => item.projectName).join(' + ') || order.projectName],
    ['数量', items.reduce((sum, item) => sum + Number(item.quantity || 0), 0) || order.quantity],
    ['原价', money(order.originalAmount)],
    ['优惠金额', money(order.discountAmount)],
    ['实收金额', money(order.actualAmount)],
    ['消耗金额', money(order.consumeAmount)],
    ['收款方式', paymentLabels[order.paymentType] || order.paymentType],
    ['操作老师', order.serviceEmployeeName],
    ['开单人', order.salesEmployeeName],
    ['顾问', order.consultantName],
    ['备注', order.remark],
  ]
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-[#32111f]/30">
      <div className="h-full w-full max-w-[620px] overflow-y-auto bg-white p-6 shadow-2xl scrollbar-soft">
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-xl font-bold text-[#641631]">开单详情</h3>
          <button onClick={onClose} className="rounded-md px-4 py-2 text-sm font-semibold text-[#8b4d66] hover:bg-pink-50">关闭</button>
        </div>
        <div className="rounded-lg bg-pink-50/70 p-5">
          {rows.map(([label, value]) => (
            <div key={label} className="grid grid-cols-[130px_1fr] border-b border-pink-100 py-3 last:border-b-0">
              <div className="font-semibold text-[#79445b]">{label}</div>
              <div className="text-[#5f263c]">{value || '-'}</div>
            </div>
          ))}
        </div>
        <div className="mt-4 rounded-lg border border-pink-100 bg-white p-4">
          <div className="mb-3 font-bold text-[#641631]">项目明细</div>
          {items.length === 0 && <div className="text-sm text-[#8a4964]">暂无项目明细</div>}
          {items.map((item, index) => (
            <div key={item.id || index} className="grid grid-cols-2 gap-2 border-b border-pink-50 py-3 text-sm last:border-b-0 md:grid-cols-5">
              <div className="font-semibold text-[#5f263c]">{item.projectName || '-'}</div>
              <div>数量：{item.quantity}</div>
              <div>实收：{money(item.actualAmount)}</div>
              <div>消耗：{money(item.consumeAmount)}</div>
              <div>时长：{item.durationMinutes || '-'}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function FollowupDetail({ followup, phone, onClose }) {
  const rows = [
    ['顾客姓名', followup.customerName],
    ['手机号', phone],
    ['跟进人', followup.owner],
    ['跟进日期', followup.date],
    ['沟通内容', followup.content],
    ['顾客反馈', followup.feedback],
    ['问题分类', followup.issueType],
    ['是否预约', followup.hasAppointment ? '已预约' : '未预约'],
    ['是否成交', followup.hasDeal ? '已成交' : '未成交'],
    ['成交金额', money(followup.dealAmount)],
    ['下次跟进时间', followup.nextFollowTime],
    ['创建时间', formatDateTime(followup.createdAt)],
  ]

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-[#32111f]/30">
      <div className="h-full w-full max-w-[620px] overflow-y-auto bg-white p-6 shadow-2xl scrollbar-soft">
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-xl font-bold text-[#641631]">跟进详情</h3>
          <button onClick={onClose} className="rounded-md px-4 py-2 text-sm font-semibold text-[#8b4d66] hover:bg-pink-50">关闭</button>
        </div>
        <div className="rounded-lg bg-pink-50/70 p-5">
          {rows.map(([label, value]) => (
            <div key={label} className="grid grid-cols-[130px_1fr] border-b border-pink-100 py-3 last:border-b-0">
              <div className="font-semibold text-[#79445b]">{label}</div>
              <div className="text-[#5f263c]">{value || '-'}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function ReviewDrawer({ data, stores, lockedStore, lockedStoreValue, onClose, onSave }) {
  const fixedStore = lockedStore ? normalizeStoreName(lockedStoreValue) || data.store : data.store
  const [form, setForm] = useState({ ...data, store: fixedStore })
  return (
    <Drawer title={form.id ? '编辑每日复盘' : '新增每日复盘'} onClose={onClose} onSave={() => onSave(form)}>
      <FormGrid>
        <Field label="日期"><Input type="date" value={form.date} onChange={(value) => setForm({ ...form, date: value })} /></Field>
        <Field label="门店">
          {lockedStore ? (
            <LockedStoreDisplay value={fixedStore} />
          ) : (
            <Select value={form.store} onChange={(value) => setForm({ ...form, store: value })} options={stores} />
          )}
        </Field>
        <Field label="今日目标是否完成"><Select value={form.goalCompleted ? 'true' : 'false'} onChange={(value) => setForm({ ...form, goalCompleted: value === 'true' })} options={[['false', '未完成'], ['true', '已完成']]} /></Field>
        <Field label="明日邀约目标人数"><Input type="number" value={form.tomorrowInviteTarget} onChange={(value) => setForm({ ...form, tomorrowInviteTarget: value })} /></Field>
        <Field label="未完成原因" full><Textarea value={form.unfinishedReason} onChange={(value) => setForm({ ...form, unfinishedReason: value })} /></Field>
        <Field label="今日主要问题" full><Textarea value={form.mainIssue} onChange={(value) => setForm({ ...form, mainIssue: value })} /></Field>
        <Field label="明日重点工作" full><Textarea value={form.tomorrowFocus} onChange={(value) => setForm({ ...form, tomorrowFocus: value })} /></Field>
        <Field label="明日重点跟进顾客" full><Textarea value={form.tomorrowKeyCustomers} onChange={(value) => setForm({ ...form, tomorrowKeyCustomers: value })} /></Field>
        <Field label="需要老板支持事项" full><Textarea value={form.bossSupport} onChange={(value) => setForm({ ...form, bossSupport: value })} /></Field>
      </FormGrid>
    </Drawer>
  )
}

function EmployeeDrawer({ data, stores, lockedStore, lockedStoreValue, onClose, onSave }) {
  const fixedStore = lockedStore ? normalizeStoreName(lockedStoreValue) || data.store : data.store
  const [form, setForm] = useState({ ...data, store: fixedStore })
  return (
    <Drawer title={form.id ? '编辑员工' : '新增员工'} onClose={onClose} onSave={() => onSave(form)}>
      <FormGrid>
        <Field label="员工姓名"><Input value={form.name} onChange={(value) => setForm({ ...form, name: value })} /></Field>
        <Field label="手机号"><Input value={form.phone} onChange={(value) => setForm({ ...form, phone: value })} /></Field>
        <Field label="所属门店">
          {lockedStore ? (
            <LockedStoreDisplay value={fixedStore} />
          ) : (
            <Select value={form.store} onChange={(value) => setForm({ ...form, store: value })} options={stores} />
          )}
        </Field>
        <Field label="岗位"><Select value={form.role} onChange={(value) => setForm({ ...form, role: value })} options={staffRoleOptions} /></Field>
        <Field label="入职时间"><Input type="date" value={form.entryDate} onChange={(value) => setForm({ ...form, entryDate: value })} /></Field>
        <Field label="是否在职"><Select value={String(form.isActive !== false)} onChange={(value) => setForm({ ...form, isActive: value === 'true' })} options={[['true', '在职'], ['false', '停用']]} /></Field>
        <Field label="今日跟进数"><Input type="number" value={form.today_followups ?? 0} onChange={(value) => setForm({ ...form, today_followups: value })} /></Field>
        <Field label="今日预约数"><Input type="number" value={form.today_appointments ?? 0} onChange={(value) => setForm({ ...form, today_appointments: value })} /></Field>
        <Field label="今日到店数"><Input type="number" value={form.today_arrivals ?? 0} onChange={(value) => setForm({ ...form, today_arrivals: value })} /></Field>
        <Field label="今日成交数"><Input type="number" value={form.today_deals ?? 0} onChange={(value) => setForm({ ...form, today_deals: value })} /></Field>
        <Field label="今日销售额"><Input type="number" value={form.today_sales ?? 0} onChange={(value) => setForm({ ...form, today_sales: value })} /></Field>
        <Field label="备注" full><Textarea value={form.note} onChange={(value) => setForm({ ...form, note: value })} /></Field>
      </FormGrid>
    </Drawer>
  )
}

function Panel({ title, subtitle, action, children }) {
  return (
    <section className="rounded-lg border border-pink-100 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-[#641631]">{title}</h2>
          {subtitle && <p className="mt-1 text-sm text-[#a36a81]">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

function RankList({ rows }) {
  if (!rows.length) return <div className="rounded-lg bg-pink-50 px-4 py-6 text-center text-[#8a4964]">暂无排行数据</div>
  const max = Math.max(...rows.map((item) => item.amount || 0), 1)
  return (
    <div className="space-y-3">
      {rows.map((item, index) => (
        <div key={`${item.name}-${index}`} className="rounded-lg border border-pink-100 bg-white p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="font-bold text-[#5f263c]">{index + 1}. {item.name}</div>
              {item.sub && <div className="mt-1 text-xs text-[#9a6078]">{item.sub}</div>}
            </div>
            <div className="font-black text-[#bd1657]">{item.value}</div>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-pink-50">
            <div className="h-full rounded-full bg-[#c2185b]" style={{ width: `${Math.max(((item.amount || 0) / max) * 100, 4)}%` }} />
          </div>
        </div>
      ))}
    </div>
  )
}

function Drawer({ title, onClose, onSave, children, successMessage, saveLabel = '保存', saveDisabled = false }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const handleSave = async () => {
    setSaving(true)
    setError('')
    setSuccess('')
    try {
      await onSave()
      if (successMessage) setSuccess(successMessage)
    } catch (saveError) {
      setError(saveError.message || '保存失败，请检查表字段和网络连接。')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-[#32111f]/30">
      <div className="h-full w-full max-w-[680px] overflow-y-auto bg-white p-6 shadow-2xl scrollbar-soft">
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-xl font-bold text-[#641631]">{title}</h3>
          <button onClick={onClose} className="rounded-md px-4 py-2 text-sm font-semibold text-[#8b4d66] hover:bg-pink-50">关闭</button>
        </div>
        {children}
        {success && <div className="mt-5 rounded-lg bg-pink-50 px-4 py-3 text-sm font-semibold leading-6 text-[#c2185b]">{success}</div>}
        {error && <div className="mt-5 rounded-lg bg-red-50 px-4 py-3 text-sm leading-6 text-red-700">{error}</div>}
        <div className="mt-6 flex justify-end gap-3">
          <button onClick={onClose} className="rounded-lg border border-pink-100 px-6 py-3 font-semibold text-[#8b4d66] hover:bg-pink-50">取消</button>
          <PrimaryButton onClick={handleSave} disabled={saving || saveDisabled}>{saving ? '保存中...' : saveLabel}</PrimaryButton>
        </div>
      </div>
    </div>
  )
}

function Toast({ children }) {
  return (
    <div className="fixed right-8 top-6 z-[60] rounded-lg bg-[#c2185b] px-5 py-3 font-semibold text-white shadow-xl shadow-pink-200">
      {children}
    </div>
  )
}

function ErrorNotice({ children }) {
  return (
    <div className="mb-4 rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm leading-6 text-red-700">
      {children}
    </div>
  )
}

function EmptyActionCard({ title, description, actionLabel, onAction }) {
  return (
    <div className="mb-4 rounded-lg border border-pink-100 bg-white px-5 py-5 shadow-sm">
      <div className="text-base font-bold text-[#641631]">{title}</div>
      <div className="mt-2 text-sm leading-6 text-[#8a4964]">{description}</div>
      {actionLabel && onAction && (
        <div className="mt-4">
          <SecondaryButton onClick={onAction}>{actionLabel}</SecondaryButton>
        </div>
      )}
    </div>
  )
}

function Table({ children }) {
  return <div className="overflow-x-auto scrollbar-soft"><table className="w-full min-w-[860px] border-collapse text-left text-sm">{children}</table></div>
}

function Th({ children }) {
  return <th className="whitespace-nowrap bg-pink-50 px-4 py-3 font-bold text-[#7a3450]">{children}</th>
}

function Td({ children, className = '', ...props }) {
  return <td {...props} className={`align-top px-4 py-3 text-[#674158] ${className}`}>{children}</td>
}

function FilterBar({ children }) {
  return <div className="mb-3 grid grid-cols-2 gap-3 xl:grid-cols-4">{children}</div>
}

function Field({ label, full, children }) {
  return <label className={full ? 'md:col-span-2' : ''}><span className="mb-2 block text-[15px] font-semibold text-[#79445b]">{label}</span>{children}</label>
}

function FormGrid({ children }) {
  return <div className="grid grid-cols-1 gap-5 rounded-lg bg-pink-50/70 p-5 md:grid-cols-2">{children}</div>
}

function Input({ value, onChange, type = 'text', placeholder = '' }) {
  return <input type={type} inputMode={type === 'number' ? 'decimal' : undefined} placeholder={placeholder} value={value ?? ''} onChange={(event) => onChange(event.target.value)} className="min-w-[120px] w-full rounded-lg border border-pink-100 bg-white px-5 py-4 text-base text-[#5f263c] outline-none focus:border-[#c2185b] focus:ring-2 focus:ring-pink-100" />
}

function Textarea({ value, onChange }) {
  return <textarea rows={3} value={value ?? ''} onChange={(event) => onChange(event.target.value)} className="w-full resize-none rounded-lg border border-pink-100 bg-white px-5 py-4 text-base text-[#5f263c] outline-none focus:border-[#c2185b] focus:ring-2 focus:ring-pink-100" />
}

function Select({ value, onChange, options, disabled = false }) {
  return (
    <select disabled={disabled} value={value ?? ''} onChange={(event) => onChange(event.target.value)} className="w-full rounded-lg border border-pink-100 bg-white px-5 py-4 text-base text-[#5f263c] outline-none focus:border-[#c2185b] focus:ring-2 focus:ring-pink-100 disabled:bg-pink-50 disabled:text-[#9a6078]">
      {options.map((option) => Array.isArray(option) ? <option key={option[0]} value={option[0]}>{option[1]}</option> : <option key={option}>{option}</option>)}
    </select>
  )
}

function PrimaryButton({ children, onClick, disabled = false }) {
  return <button disabled={disabled} onClick={onClick} className="rounded-lg bg-[#c2185b] px-5 py-3 font-semibold text-white shadow-md shadow-pink-200 transition hover:bg-[#a9134d] disabled:cursor-not-allowed disabled:bg-pink-200 disabled:text-white/80 disabled:shadow-none">{children}</button>
}

function SecondaryButton({ children, onClick }) {
  return <button onClick={onClick} className="rounded-lg border border-pink-100 bg-white px-5 py-3 font-semibold text-[#c2185b] shadow-sm transition hover:bg-pink-50">{children}</button>
}

function ActionButton({ children, onClick, tone = 'normal' }) {
  return <button onClick={onClick} className={`mr-2 rounded-md px-3 py-2 text-sm font-semibold ${tone === 'danger' ? 'text-[#c03955] hover:bg-red-50' : 'text-[#c2185b] hover:bg-pink-50'}`}>{children}</button>
}

function LevelBadge({ level }) {
  const vip = level === 'A客/VIP'
  return <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${vip ? 'bg-[#c2185b] text-white' : 'bg-pink-50 text-[#9a3f63]'}`}>{level}</span>
}

function RequiredLabel({ children }) {
  return <>{children}<span className="ml-1 text-red-500">*</span></>
}

function StatusPill({ children, tone }) {
  const styles = {
    green: 'bg-green-50 text-green-700 ring-green-100',
    gray: 'bg-gray-100 text-gray-600 ring-gray-200',
    red: 'bg-red-50 text-red-700 ring-red-100',
    light: 'bg-slate-50 text-slate-500 ring-slate-100',
  }
  return <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ring-1 ${styles[tone] || styles.light}`}>{children}</span>
}

function Badge({ children, tone = 'light' }) {
  const styles = {
    danger: 'bg-red-50 text-red-700 ring-red-100',
    warning: 'bg-orange-50 text-orange-700 ring-orange-100',
    success: 'bg-green-50 text-green-700 ring-green-100',
    pink: 'bg-pink-50 text-[#bd1657] ring-pink-100',
    light: 'bg-slate-50 text-slate-600 ring-slate-100',
  }
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${styles[tone] || styles.light}`}>{children}</span>
}

function formatDateTime(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function formatDateOnly(value) {
  if (!value) return ''
  return String(value).slice(0, 10)
}

function RiskBadge({ days }) {
  const high = days >= 90
  return <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${high ? 'bg-red-100 text-red-700 ring-1 ring-red-200' : days >= 60 ? 'bg-orange-100 text-orange-700' : days >= 30 ? 'bg-pink-100 text-[#bd1657]' : 'bg-green-50 text-green-700'}`}>{days}天{high ? ' 高风险' : ''}</span>
}

function MetricPill({ children }) {
  return <span className="inline-block rounded-full bg-white px-3 py-1 font-bold text-[#c2185b] ring-1 ring-pink-100">{children}</span>
}

function MetricBox({ label, value }) {
  return (
    <div className="rounded-lg bg-pink-50 px-3 py-3">
      <div className="text-xs text-[#9a6078]">{label}</div>
      <div className="mt-1 font-black text-[#5f263c]">{value}</div>
    </div>
  )
}

function QuickButton({ children, onClick }) {
  return (
    <button
      onClick={onClick}
      className="min-h-20 rounded-lg border border-pink-100 bg-pink-50 px-4 py-4 text-left text-base font-bold text-[#7a3450] transition hover:border-[#c2185b] hover:bg-white hover:text-[#c2185b]"
    >
      {children}
    </button>
  )
}

function QuickFilters({ value, options, onChange }) {
  return (
    <div className="mb-4 flex flex-wrap gap-2">
      {options.map((option) => (
        <button
          key={option}
          onClick={() => onChange(option)}
          className={`rounded-full px-4 py-2 text-sm font-semibold ${
            value === option ? 'bg-[#c2185b] text-white' : 'bg-pink-50 text-[#8a4964] hover:bg-pink-100'
          }`}
        >
          {option}
        </button>
      ))}
    </div>
  )
}

function unique(list) {
  return [...new Set(list)].filter(Boolean)
}

export default App
