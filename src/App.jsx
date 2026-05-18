import { useEffect, useMemo, useRef, useState } from 'react'
import {
  followMethods,
  issueOptions,
  levelOptions,
  makeCustomerStatus,
  stores as defaultStores,
} from './data/seedData'
import { canManage, useCloudData } from './hooks/useCloudData'
import { normalizeStoreName, validStoreNames } from './lib/mappers'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import { ageFromBirthday, daysSince, normalizeDateInput, percent, todayString } from './utils/date'
import { money } from './utils/format'

const navItems = [
  ['dashboard', '今日看板'],
  ['activation', '未到店激活'],
  ['customers', '顾客档案'],
  ['followups', '跟进记录'],
  ['reviews', '每日复盘'],
  ['employees', '员工管理'],
  ['performanceReports', '员工业绩日报'],
  ['performanceMonthly', '员工业绩月报'],
  ['storeTargets', '门店目标'],
]

function isBossRole(role) {
  const value = String(role || '').trim().toLowerCase()
  return value === 'boss'
}

function isBeauticianRole(role) {
  const value = String(role || '').trim().toLowerCase()
  return value === 'beautician'
}

function roleLabel(role) {
  const labels = {
    boss: '老板',
    manager: '店长',
    beautician: '美容师',
  }
  return labels[role] || role || ''
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

const activationStatusOptions = ['未跟进', '已联系', '已预约', '已到店', '无意向']
const commissionRates = {
  serviceSales: 0.1,
  consumeSales: 0.05,
  cashSales: 0.08,
  upsellAmount: 0.1,
}

function normalizeActivationStatus(value) {
  const status = String(value || '').trim()
  if (status === '未联系') return '未跟进'
  if (status === '已微信' || status === '已电话') return '已联系'
  if (status === '暂不考虑' || status === '无效客户') return '无意向'
  return activationStatusOptions.includes(status) ? status : '未跟进'
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
  lastFollowResult: '未跟进',
  nextFollowTime: '',
  followStatus: '未跟进',
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

const emptyReview = {
  date: todayString(),
  store: defaultStores[0],
  targetInvites: 20,
  wechatCount: 0,
  phoneCount: 0,
  appointments: 0,
  visits: 0,
  deals: 0,
  revenue: 0,
  reason: '',
  staffIssue: '',
  rejectReason: '',
  tomorrowAction: '',
  summary: '',
}

const emptyEmployee = {
  name: '',
  phone: '',
  store: defaultStores[0],
  role: 'beautician',
  today_followups: 0,
  today_appointments: 0,
  today_arrivals: 0,
  today_deals: 0,
  today_sales: 0,
  note: '',
}

const emptyPerformanceReport = {
  date: todayString(),
  store: defaultStores[0],
  employee: '',
  arrivals: 0,
  serviceSales: 0,
  consumeSales: 0,
  cashSales: 0,
  newCustomers: 0,
  repeatCustomers: 0,
  upsellAmount: 0,
}

function App() {
  const [session, setSession] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [active, setActive] = useState('dashboard')
  const cloud = useCloudData(session)

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

  const pageProps = {
    customers: active === 'customers' ? cloud.customers : enrichedCustomers,
    employees: cloud.employees,
    followups: cloud.followups,
    reviews: cloud.reviews,
    performanceReports: cloud.performanceReports,
    storeTargets: cloud.storeTargets,
    profile: cloud.profile,
    role: cloud.role,
    stores: validStoreNames,
    customerError: cloud.customerError,
    followupError: cloud.followupError,
    employeeError: cloud.employeeError,
    dailyReviewError: cloud.dailyReviewError,
    performanceReportError: cloud.performanceReportError,
    storeTargetError: cloud.storeTargetError,
    saveCustomer: cloud.saveCustomer,
    importCustomers: cloud.importCustomers,
    deleteCustomer: cloud.deleteCustomer,
    updateCustomerStatus: cloud.updateCustomerStatus,
    saveFollowup: cloud.saveFollowup,
    deleteFollowup: cloud.deleteFollowup,
    saveReview: cloud.saveReview,
    deleteReview: cloud.deleteReview,
    savePerformanceReport: cloud.savePerformanceReport,
    deletePerformanceReport: cloud.deletePerformanceReport,
    saveStoreTarget: cloud.saveStoreTarget,
    saveEmployee: cloud.saveEmployee,
    deleteEmployee: cloud.deleteEmployee,
    setActive,
  }
  const currentRole = cloud.profile?.role || cloud.role
  const isBossAccount = isBossRole(currentRole)
  const headerStore = isBossAccount ? '全部门店' : normalizeStoreName(cloud.profile?.store) || validStoreNames[0]

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
          {navItems.map(([key, label]) => (
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
          云端自动保存 · 当前角色：{roleLabel(cloud.role)}
        </div>
      </aside>

      <main className="ml-[236px] flex-1 px-5 py-5 xl:px-8">
        <header className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#641631]">雅美靓颜门店管理系统</h1>
            <p className="mt-1 text-sm text-[#9a6078]">先看今日重点，再处理顾客跟进</p>
          </div>
          <div className="rounded-full border border-pink-100 bg-white px-5 py-2 text-sm font-semibold text-[#c2185b] shadow-sm">
            {headerStore} · 今日 {todayString()}
            <button onClick={() => supabase.auth.signOut()} className="ml-4 text-[#8a4964] hover:text-[#c2185b]">退出</button>
          </div>
        </header>

        {cloud.error && (
          <div className="mb-5 rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm leading-6 text-red-700">
            云端部分数据读取失败：{cloud.error}
            <button onClick={cloud.refresh} className="ml-3 font-bold text-[#c2185b]">重新读取</button>
          </div>
        )}

        {active === 'dashboard' && <Dashboard {...pageProps} />}
        {active === 'customers' && <CustomersModule {...pageProps} />}
        {active === 'activation' && <ActivationModule {...pageProps} />}
        {active === 'followups' && <FollowupsModule {...pageProps} />}
        {active === 'reviews' && <ReviewsModule {...pageProps} />}
        {active === 'employees' && <EmployeesModule {...pageProps} />}
        {active === 'performanceReports' && <PerformanceReportsModule {...pageProps} />}
        {active === 'performanceMonthly' && <PerformanceMonthlyModule {...pageProps} />}
        {active === 'storeTargets' && <StoreTargetsModule {...pageProps} />}
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

function Dashboard({ customers, employees, followups, reviews, stores, role, profile, setActive }) {
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
  const customerInScope = (customer) => {
    const customerStore = normalizeStoreName(customer.store)
    if (isBoss) return !filterByDashboardStore || customerStore === dashboardStoreName
    if (isBeautician) return !profile?.name || customer.owner === profile.name
    return customerStore === profileStore
  }
  const viewCustomers = customers.filter(customerInScope)
  const thirtyNotVisited = viewCustomers.filter((item) => visitDays(item.lastVisit) !== null && visitDays(item.lastVisit) >= 30).length
  const sixtyNotVisited = viewCustomers.filter((item) => visitDays(item.lastVisit) !== null && visitDays(item.lastVisit) >= 60).length
  const ninetyHighRisk = viewCustomers.filter((item) => visitDays(item.lastVisit) !== null && visitDays(item.lastVisit) >= 90).length
  const employeeStore = (employee) => normalizeStoreName(employee.store)
  const employeeInScope = (employee) => {
    const store = employeeStore(employee)
    if (!store) return false
    if (isBoss) return !filterByDashboardStore || store === dashboardStoreName
    if (isBeautician) return employee.name === profile?.name
    return store === profileStore
  }
  const viewEmployees = employees.filter(employeeInScope)
  const todayFollowupTotal = viewEmployees.reduce((sum, item) => sum + Number(item.today_followups || 0), 0)
  const todayAppointments = viewEmployees.reduce((sum, item) => sum + Number(item.today_appointments || 0), 0)
  const todayVisits = viewEmployees.reduce((sum, item) => sum + Number(item.today_arrivals || 0), 0)
  const revenueStores = filterByDashboardStore ? [dashboardStoreName].filter(Boolean) : storeOptions
  const revenueEmployees = viewEmployees
  const storeRevenue = revenueStores.map((store) => {
    const storeEmployees = revenueEmployees
      .filter((item) => employeeStore(item) === store)
    // 今日数据来自 employee_daily_stats，员工列表已在读取时按当天合并。
    const employeeAmount = storeEmployees.reduce((sum, item) => sum + Number(item.today_sales || 0), 0)
    return {
      store,
      employees: storeEmployees,
      revenue: employeeAmount,
    }
  })
  const maxRevenue = Math.max(...storeRevenue.map((item) => item.revenue), 1)
  const dashboardRevenue = storeRevenue.reduce((sum, item) => sum + item.revenue, 0)
  const staffRank = viewEmployees
    .filter((item) => item.role === 'beautician')
    .map((item) => ({
      id: item.id,
      name: item.name || '未填写',
      store: employeeStore(item),
      todayFollowups: Number(item.today_followups || 0),
      todayAppointments: Number(item.today_appointments || 0),
      followupRevenue: Number(item.today_sales || 0),
    }))
    .sort((a, b) => b.todayFollowups - a.todayFollowups)
    .slice(0, 5)
  const todoCustomers = viewCustomers
    .filter((item) => (visitDays(item.lastVisit) !== null && visitDays(item.lastVisit) >= 90) || item.nextFollowTime === today || item.followStatus === '未联系')
    .sort((a, b) => (visitDays(b.lastVisit) || 0) - (visitDays(a.lastVisit) || 0))
    .slice(0, 6)

  const cards = [
    ['今日跟进', todayFollowupTotal, '条', '今日员工跟进合计'],
    ['90天高风险', ninetyHighRisk, '人', '优先由店长盯'],
    ['今日到店', todayVisits, '人', '员工今日到店合计'],
    ['今日成交', money(dashboardRevenue), '', '员工今日业绩合计'],
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
      <section className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {cards.map(([label, value, unit, hint]) => (
          <div key={label} className={`rounded-lg border bg-white p-5 shadow-sm ${label.includes('90天') ? 'border-red-200 ring-2 ring-red-100' : 'border-pink-100'}`}>
            <div className="text-sm font-semibold text-[#9b6078]">{label}</div>
            <div className={`mt-3 text-4xl font-bold ${label.includes('90天') ? 'text-red-600' : 'text-[#bd1657]'}`}>
              {value}
              <span className="ml-1 text-base font-semibold text-[#b9859a]">{unit}</span>
            </div>
            <div className="mt-2 text-xs text-[#a36a81]">{hint}</div>
          </div>
        ))}
      </section>

      <section className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {[
          ['30天未到店', thirtyNotVisited],
          ['60天未到店', sixtyNotVisited],
          ['今日已邀约', todayAppointments],
          ['老客回店率', percent(todayVisits, thirtyNotVisited)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border border-pink-100 bg-white px-5 py-4 shadow-sm">
            <div className="text-sm text-[#9b6078]">{label}</div>
            <div className="mt-2 text-2xl font-bold text-[#641631]">{value}</div>
          </div>
        ))}
      </section>

      <section className="grid grid-cols-1 gap-5 xl:grid-cols-[1.1fr_1fr]">
        <Panel
          title="今日先处理"
          subtitle="按风险从高到低排序，店长早上打开就能看到"
          action={<PrimaryButton onClick={() => setActive('activation')}>去激活顾客</PrimaryButton>}
        >
          <div className="grid gap-3">
            {todoCustomers.map((item) => (
              <div key={item.id} className={`flex items-center justify-between rounded-lg border p-4 ${item.notVisitedDays >= 90 ? 'border-red-200 bg-red-50' : 'border-pink-100 bg-pink-50'}`}>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold text-[#5f263c]">{item.name}</span>
                    <LevelBadge level={item.level} />
                    <RiskBadge days={visitDays(item.lastVisit) || item.notVisitedDays || 0} />
                  </div>
                  <div className="mt-2 text-sm text-[#83536a]">{item.store} · {item.owner}</div>
                </div>
                <div className="text-right text-sm text-[#83536a]">
                  <div>状态：{item.followStatus || '未联系'}</div>
                  <div>下次：{item.nextFollowTime || '未定'}</div>
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="美容师复盘">
          <div className="space-y-3">
            {staffRank.map((item, index) => (
              <div key={item.id} className="flex items-center justify-between rounded-lg bg-pink-50 px-4 py-4">
                <div className="flex items-center gap-3">
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-white text-sm font-bold text-[#c2185b]">{index + 1}</span>
                  <div>
                    <div className="font-semibold text-[#5f263c]">{item.name}</div>
                    <div className="text-xs text-[#a36a81]">{item.store}</div>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3 text-center text-sm">
                  <div><b className="block text-[#bd1657]">{item.todayFollowups}</b>跟进</div>
                  <div><b className="block text-[#bd1657]">{item.todayAppointments}</b>预约</div>
                  <div><b className="block text-[#bd1657]">{money(item.followupRevenue)}</b>成交</div>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </section>

      <section className="grid grid-cols-1 gap-5 xl:grid-cols-[1.2fr_1fr]">
        <Panel title="4家门店业绩对比">
          <div className="space-y-5">
            {storeRevenue.map((item) => (
              <div key={item.store}>
                <div className="mb-2 flex justify-between text-sm">
                  <span className="font-semibold text-[#643044]">{item.store}</span>
                  <span className="font-bold text-[#bd1657]">{money(item.revenue)}</span>
                </div>
                <div className="mb-2 text-xs font-bold text-[#643044]">总业绩：{money(item.revenue)}</div>
                <div className="h-3 rounded-full bg-pink-50">
                  <div className="h-3 rounded-full bg-[#c2185b]" style={{ width: `${(item.revenue / maxRevenue) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="今日操作入口">
          <div className="grid grid-cols-2 gap-3">
            <QuickButton onClick={() => setActive('activation')}>处理未到店顾客</QuickButton>
            <QuickButton onClick={() => setActive('followups')}>登记跟进结果</QuickButton>
            <QuickButton onClick={() => setActive('reviews')}>填写每日复盘</QuickButton>
            <QuickButton onClick={() => setActive('customers')}>查找顾客档案</QuickButton>
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

function ActivationModule({ customers, employees, stores, profile, role, updateCustomerStatus }) {
  const [drafts, setDrafts] = useState({})
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
    return status === '未跟进' || !nextFollowTime || nextFollowTime === today
  }).length

  const getDraft = (customer) => ({
    followStatus: normalizeActivationStatus(customer.followStatus || customer.lastFollowResult),
    nextFollowTime: customer.nextFollowTime || '',
    followNote: customer.followNote || '',
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
                      <div className="mt-2 rounded-md bg-white/80 px-3 py-2 text-sm text-[#674158]">上次结果：{normalizeActivationStatus(item.lastFollowResult || item.followStatus)}</div>
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

                  <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-[190px_1fr_auto_auto] md:items-start">
                    <label>
                      <span className="mb-2 block text-sm font-semibold text-[#79445b]">下次跟进日期</span>
                      <Input type="date" value={draft.nextFollowTime} onChange={(value) => updateDraft(item.id, { nextFollowTime: value })} />
                    </label>
                    <label>
                      <span className="mb-2 block text-sm font-semibold text-[#79445b]">跟进内容备注</span>
                      <Textarea value={draft.followNote} onChange={(value) => updateDraft(item.id, { followNote: value })} />
                    </label>
                    <div className="pt-7">
                      <PrimaryButton onClick={() => saveActivation(item)}>保存跟进</PrimaryButton>
                    </div>
                    <div className="pt-7">
                      <SecondaryButton onClick={() => completeTodayTask(item)}>{completed ? '已完成' : '今日已完成'}</SecondaryButton>
                    </div>
                  </div>
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
    .filter((item) => item.role === 'beautician')
    .map((employee) => {
      const records = followups.filter((item) => item.owner === employee.name)
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

function ReviewsModule({ reviews, stores, role, profile, dailyReviewError, saveReview, deleteReview }) {
  const canChooseStore = isBossRole(role)
  const canEditReviews = isBossRole(role) || String(role || '').trim() === 'manager'
  const fixedStore = canChooseStore ? '' : normalizeStoreName(profile?.store) || stores[0] || defaultStores[0]
  const [editing, setEditing] = useState(null)
  const [toast, setToast] = useState('')
  const [error, setError] = useState('')

  const save = async (data) => {
    const numeric = ['inviteRate', 'appointmentRate', 'arrivalRate', 'dealRate', 'dealAmount']
    const payload = { ...data, store: canChooseStore ? data.store : fixedStore }
    numeric.forEach((key) => { payload[key] = Number(payload[key] || 0) })
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
    <Panel title="每日复盘" subtitle="只看完成率、转化率和明日动作" action={canEditReviews ? <PrimaryButton onClick={() => setEditing({ date: todayString(), store: fixedStore || stores[0] || '', inviteRate: 0, appointmentRate: 0, arrivalRate: 0, dealRate: 0, dealAmount: 0, unfinishedReason: '', tomorrowAction: '' })}>新增复盘</PrimaryButton> : null}>
      {toast && <Toast>{toast}</Toast>}
      {(error || dailyReviewError) && <ErrorNotice>{error || dailyReviewError}</ErrorNotice>}
      <Table>
        <thead>
          <tr>
            {['日期', '门店', '邀约完成率', '预约转化率', '到店转化率', '成交转化率', '成交金额', '未完成原因', '明日动作', '操作'].map((head) => <Th key={head}>{head}</Th>)}
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
              <Td><MetricPill>{item.inviteRate ?? item.invite_rate ?? 0}%</MetricPill></Td>
              <Td><MetricPill>{item.appointmentRate ?? item.appointment_rate ?? 0}%</MetricPill></Td>
              <Td><MetricPill>{item.arrivalRate ?? item.arrival_rate ?? 0}%</MetricPill></Td>
              <Td><MetricPill>{item.dealRate ?? item.deal_rate ?? 0}%</MetricPill></Td>
              <Td>{money(item.dealAmount ?? item.deal_amount)}</Td>
              <Td className="max-w-60">{item.unfinishedReason ?? item.unfinished_reason}</Td>
              <Td className="max-w-60">{item.tomorrowAction ?? item.tomorrow_action}</Td>
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
    <Panel title="员工管理" subtitle="员工基础资料长期保存，今日数据按日期保存" action={canEditEmployees ? <PrimaryButton onClick={() => setEditing({ ...emptyEmployee, store: fixedStore || stores[0] || defaultStores[0] })}>新增员工</PrimaryButton> : null}>
      {toast && <Toast>{toast}</Toast>}
      {(error || employeeError) && <ErrorNotice>{error || employeeError}</ErrorNotice>}
      <Table>
        <thead>
          <tr>
            {['员工姓名', '手机号', '所属门店', '角色', '今日跟进数', '今日预约数', '今日到店数', '今日成交数', '今日销售额', '备注', '操作'].map((head) => <Th key={head}>{head}</Th>)}
          </tr>
        </thead>
        <tbody>
          {employees.length === 0 && (
            <tr className="border-t border-pink-50">
              <Td colSpan={11}>
                <div className="rounded-lg bg-pink-50 px-4 py-6 text-center text-[#8a4964]">暂无员工数据</div>
              </Td>
            </tr>
          )}
          {employees.map((item) => (
            <tr key={item.id} className="border-t border-pink-50">
              <Td><div className="font-semibold text-[#5f263c]">{item.name}</div></Td>
              <Td>{item.phone}</Td>
              <Td>{item.store}</Td>
              <Td>{roleLabel(item.role)}</Td>
              <Td>{item.today_followups || 0}</Td>
              <Td>{item.today_appointments || 0}</Td>
              <Td>{item.today_arrivals || 0}</Td>
              <Td>{item.today_deals || 0}</Td>
              <Td>{money(item.today_sales || 0)}</Td>
              <Td>{item.note || ''}</Td>
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

function PerformanceReportsModule({ performanceReports, employees, stores, role, profile, performanceReportError, savePerformanceReport, deletePerformanceReport }) {
  const canChooseStore = isBossRole(role)
  const isBeautician = isBeauticianRole(role)
  const canEditReports = isBossRole(role) || String(role || '').trim() === 'manager' || isBeautician
  const fixedStore = canChooseStore ? '' : normalizeStoreName(profile?.store) || stores[0] || defaultStores[0]
  const [editing, setEditing] = useState(null)
  const [toast, setToast] = useState('')
  const [error, setError] = useState('')
  const [filters, setFilters] = useState({
    date: todayString(),
    store: canChooseStore ? '全部门店' : fixedStore,
    employee: isBeautician ? profile?.name || '' : '全部员工',
  })

  const storeOptions = canChooseStore ? ['全部门店', ...validStoreNames] : [fixedStore]
  const scopedEmployees = employees.filter((item) => (filters.store === '全部门店' || normalizeStoreName(item.store) === filters.store) && (!isBeautician || item.name === profile?.name))
  const employeeOptions = isBeautician ? [profile?.name || ''] : ['全部员工', ...unique(scopedEmployees.map((item) => item.name).filter(Boolean))]
  const filteredReports = performanceReports.filter((item) => {
    const dateMatch = !filters.date || item.date === filters.date
    const storeMatch = filters.store === '全部门店' || normalizeStoreName(item.store) === filters.store
    const employeeMatch = filters.employee === '全部员工' || item.employee === filters.employee
    return dateMatch && storeMatch && employeeMatch
  })
  const todayReports = performanceReports.filter((item) => item.date === todayString() && (filters.store === '全部门店' || normalizeStoreName(item.store) === filters.store) && (!isBeautician || item.employee === profile?.name))
  const totalSales = todayReports.reduce((sum, item) => sum + Number(item.totalSales || 0), 0)
  const totalArrivals = todayReports.reduce((sum, item) => sum + Number(item.arrivals || 0), 0)
  const totalNewCustomers = todayReports.reduce((sum, item) => sum + Number(item.newCustomers || 0), 0)
  const averageOrder = totalArrivals > 0 ? totalSales / totalArrivals : 0
  const employeeRank = filteredReports
    .map((item) => ({ ...item }))
    .sort((a, b) => Number(b.totalSales || 0) - Number(a.totalSales || 0))
  const todayEmployeeRank = todayReports
    .map((item) => ({ name: item.employee, store: item.store, totalSales: item.totalSales, arrivals: item.arrivals }))
    .sort((a, b) => Number(b.totalSales || 0) - Number(a.totalSales || 0))
  const storeRank = validStoreNames
    .map((store) => {
      const list = todayReports.filter((item) => normalizeStoreName(item.store) === store)
      return {
        store,
        totalSales: list.reduce((sum, item) => sum + Number(item.totalSales || 0), 0),
        arrivals: list.reduce((sum, item) => sum + Number(item.arrivals || 0), 0),
      }
    })
    .filter((item) => canChooseStore || item.store === fixedStore)
    .sort((a, b) => Number(b.totalSales || 0) - Number(a.totalSales || 0))

  const showToast = (message) => {
    setToast(message)
    window.setTimeout(() => setToast(''), 2200)
  }

  const save = async (data) => {
    setError('')
    try {
      const payload = {
        ...data,
        store: canChooseStore ? data.store : fixedStore,
        employee: isBeautician ? profile?.name || '' : data.employee,
      }
      await savePerformanceReport(payload)
      setEditing(null)
      showToast('保存成功')
    } catch (saveError) {
      setError(saveError.message || '保存失败')
    }
  }

  const remove = async (item) => {
    if (!window.confirm('确认删除这条员工业绩日报吗？')) return
    setError('')
    try {
      await deletePerformanceReport(item.id)
      showToast('删除成功')
    } catch (deleteError) {
      setError(deleteError.message || '删除失败')
    }
  }

  const openCreate = () => {
    setEditing({
      ...emptyPerformanceReport,
      store: fixedStore || stores[0] || defaultStores[0],
      employee: isBeautician ? profile?.name || '' : '',
    })
  }

  return (
    <div className="space-y-5">
      <Panel title="员工业绩日报" subtitle="记录每天员工到店、手工、消耗、现金和升单数据" action={canEditReports ? <PrimaryButton onClick={openCreate}>新增日报</PrimaryButton> : null}>
        {toast && <Toast>{toast}</Toast>}
        {(error || performanceReportError) && <ErrorNotice>{error || performanceReportError}</ErrorNotice>}
        <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-4">
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
        </div>
        <div className="mb-4 grid grid-cols-1 gap-3 rounded-lg bg-white p-4 ring-1 ring-pink-100 md:grid-cols-3">
          <Field label="日期筛选"><Input type="date" value={filters.date} onChange={(value) => setFilters({ ...filters, date: value })} /></Field>
          <Field label="门店筛选"><Select value={filters.store} onChange={(value) => setFilters({ ...filters, store: value, employee: isBeautician ? profile?.name || '' : '全部员工' })} options={storeOptions} disabled={!canChooseStore} /></Field>
          <Field label="员工筛选"><Select value={filters.employee} onChange={(value) => setFilters({ ...filters, employee: value })} options={employeeOptions} disabled={isBeautician} /></Field>
        </div>
        <Table>
          <thead>
            <tr>
              {['排名', '日期', '门店', '员工', '到店人数', '手工业绩', '消耗业绩', '现金业绩', '新客人数', '老客复购', '升单金额', '总业绩', '客单价', '操作'].map((head) => <Th key={head}>{head}</Th>)}
            </tr>
          </thead>
          <tbody>
            {employeeRank.length === 0 && (
              <tr className="border-t border-pink-50">
                <Td colSpan={14}><div className="rounded-lg bg-pink-50 px-4 py-6 text-center text-[#8a4964]">暂无员工业绩日报</div></Td>
              </tr>
            )}
            {employeeRank.map((item, index) => (
              <tr key={item.id} className="border-t border-pink-50">
                <Td><Badge tone={index === 0 ? 'danger' : 'pink'}>第{index + 1}名</Badge></Td>
                <Td>{item.date}</Td>
                <Td>{item.store}</Td>
                <Td><div className="font-semibold text-[#5f263c]">{item.employee}</div></Td>
                <Td>{item.arrivals}</Td>
                <Td>{money(item.serviceSales)}</Td>
                <Td>{money(item.consumeSales)}</Td>
                <Td>{money(item.cashSales)}</Td>
                <Td>{item.newCustomers}</Td>
                <Td>{item.repeatCustomers}</Td>
                <Td>{money(item.upsellAmount)}</Td>
                <Td><b className="text-[#bd1657]">{money(item.totalSales)}</b></Td>
                <Td>{money(item.unitPrice)}</Td>
                <Td>
                  {canEditReports ? (
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
      </Panel>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Panel title="今日员工业绩排行" subtitle="按今日总业绩从高到低">
          <RankList rows={todayEmployeeRank.map((item) => ({ name: `${item.name} · ${item.store}`, value: money(item.totalSales), amount: Number(item.totalSales || 0), sub: `${item.arrivals}人到店` }))} />
        </Panel>
        <Panel title="今日门店排行" subtitle="按今日总业绩从高到低">
          <RankList rows={storeRank.map((item) => ({ name: item.store, value: money(item.totalSales), amount: Number(item.totalSales || 0), sub: `${item.arrivals}人到店` }))} />
        </Panel>
      </div>

      {editing && (
        <PerformanceReportDrawer
          data={editing}
          employees={employees}
          stores={stores}
          profile={profile}
          lockedStore={!canChooseStore}
          lockedStoreValue={fixedStore}
          lockedEmployee={isBeautician}
          onClose={() => setEditing(null)}
          onSave={save}
        />
      )}
    </div>
  )
}

function PerformanceMonthlyModule({ performanceReports, employees, stores, role, profile, performanceReportError }) {
  const canChooseStore = isBossRole(role)
  const isBeautician = isBeauticianRole(role)
  const fixedStore = canChooseStore ? '' : normalizeStoreName(profile?.store) || stores[0] || defaultStores[0]
  const [filters, setFilters] = useState({
    month: todayString().slice(0, 7),
    store: canChooseStore ? '全部门店' : fixedStore,
    employee: isBeautician ? profile?.name || '' : '全部员工',
  })
  const storeOptions = canChooseStore ? ['全部门店', ...validStoreNames] : [fixedStore]
  const scopedEmployees = employees.filter((item) => (filters.store === '全部门店' || normalizeStoreName(item.store) === filters.store) && (!isBeautician || item.name === profile?.name))
  const employeeOptions = isBeautician ? [profile?.name || ''] : ['全部员工', ...unique(scopedEmployees.map((item) => item.name).filter(Boolean))]
  const monthlySource = performanceReports.filter((item) => {
    const monthMatch = !filters.month || String(item.date || '').startsWith(filters.month)
    const storeMatch = filters.store === '全部门店' || normalizeStoreName(item.store) === filters.store
    const employeeMatch = filters.employee === '全部员工' || item.employee === filters.employee
    return monthMatch && storeMatch && employeeMatch
  })
  const monthlyRows = Object.values(monthlySource.reduce((map, item) => {
    const key = `${normalizeStoreName(item.store)}__${item.employee}`
    if (!map[key]) {
      map[key] = {
        month: filters.month,
        store: normalizeStoreName(item.store),
        employee: item.employee,
        arrivals: 0,
        serviceSales: 0,
        consumeSales: 0,
        cashSales: 0,
        newCustomers: 0,
        repeatCustomers: 0,
        upsellAmount: 0,
        totalSales: 0,
      }
    }
    map[key].arrivals += Number(item.arrivals || 0)
    map[key].serviceSales += Number(item.serviceSales || 0)
    map[key].consumeSales += Number(item.consumeSales || 0)
    map[key].cashSales += Number(item.cashSales || 0)
    map[key].newCustomers += Number(item.newCustomers || 0)
    map[key].repeatCustomers += Number(item.repeatCustomers || 0)
    map[key].upsellAmount += Number(item.upsellAmount || 0)
    map[key].totalSales += Number(item.totalSales || 0)
    return map
  }, {})).map((item) => {
    const serviceCommission = item.serviceSales * commissionRates.serviceSales
    const consumeCommission = item.consumeSales * commissionRates.consumeSales
    const cashCommission = item.cashSales * commissionRates.cashSales
    const upsellCommission = item.upsellAmount * commissionRates.upsellAmount
    return {
      ...item,
      unitPrice: item.arrivals > 0 ? item.totalSales / item.arrivals : 0,
      serviceCommission,
      consumeCommission,
      cashCommission,
      upsellCommission,
      totalCommission: serviceCommission + consumeCommission + cashCommission + upsellCommission,
    }
  }).sort((a, b) => Number(b.totalSales || 0) - Number(a.totalSales || 0))
  const monthTotalSales = monthlyRows.reduce((sum, item) => sum + Number(item.totalSales || 0), 0)
  const monthArrivals = monthlyRows.reduce((sum, item) => sum + Number(item.arrivals || 0), 0)
  const monthNewCustomers = monthlyRows.reduce((sum, item) => sum + Number(item.newCustomers || 0), 0)
  const monthUpsellAmount = monthlyRows.reduce((sum, item) => sum + Number(item.upsellAmount || 0), 0)
  const monthUnitPrice = monthArrivals > 0 ? monthTotalSales / monthArrivals : 0
  const storeRank = validStoreNames
    .map((store) => {
      const list = monthlyRows.filter((item) => item.store === store)
      return {
        store,
        totalSales: list.reduce((sum, item) => sum + Number(item.totalSales || 0), 0),
        arrivals: list.reduce((sum, item) => sum + Number(item.arrivals || 0), 0),
      }
    })
    .filter((item) => canChooseStore || item.store === fixedStore)
    .sort((a, b) => Number(b.totalSales || 0) - Number(a.totalSales || 0))
  const newCustomerRank = monthlyRows.map((item) => ({ name: `${item.employee} · ${item.store}`, value: `${item.newCustomers}人`, amount: Number(item.newCustomers || 0), sub: money(item.totalSales) })).sort((a, b) => b.amount - a.amount)
  const upsellRank = monthlyRows.map((item) => ({ name: `${item.employee} · ${item.store}`, value: money(item.upsellAmount), amount: Number(item.upsellAmount || 0), sub: `${item.arrivals}人到店` })).sort((a, b) => b.amount - a.amount)
  const employeeRank = monthlyRows.map((item) => ({ name: `${item.employee} · ${item.store}`, value: money(item.totalSales), amount: Number(item.totalSales || 0), sub: `提成 ${money(item.totalCommission)}` }))

  return (
    <div className="space-y-5">
      <Panel title="员工业绩月报" subtitle="自动汇总员工业绩日报，并按默认规则计算提成">
        {performanceReportError && <ErrorNotice>{performanceReportError}</ErrorNotice>}
        <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-5">
          <div className="rounded-lg bg-[#c2185b] p-4 text-white shadow-md shadow-pink-100">
            <div className="text-sm text-pink-100">本月总业绩</div>
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
            <div className="text-sm text-[#9a6078]">本月客单价</div>
            <div className="mt-2 text-3xl font-black text-[#bd1657]">{money(monthUnitPrice)}</div>
          </div>
          <div className="rounded-lg border border-pink-100 bg-pink-50 p-4">
            <div className="text-sm text-[#9a6078]">本月升单金额</div>
            <div className="mt-2 text-3xl font-black text-orange-600">{money(monthUpsellAmount)}</div>
          </div>
        </div>
        <div className="mb-4 grid grid-cols-1 gap-3 rounded-lg bg-white p-4 ring-1 ring-pink-100 md:grid-cols-3">
          <Field label="月份筛选"><Input type="month" value={filters.month} onChange={(value) => setFilters({ ...filters, month: value })} /></Field>
          <Field label="门店筛选"><Select value={filters.store} onChange={(value) => setFilters({ ...filters, store: value, employee: isBeautician ? profile?.name || '' : '全部员工' })} options={storeOptions} disabled={!canChooseStore} /></Field>
          <Field label="员工筛选"><Select value={filters.employee} onChange={(value) => setFilters({ ...filters, employee: value })} options={employeeOptions} disabled={isBeautician} /></Field>
        </div>
        <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-4">
          <MetricPill>手工提成 10%</MetricPill>
          <MetricPill>消耗提成 5%</MetricPill>
          <MetricPill>现金提成 8%</MetricPill>
          <MetricPill>升单提成 10%</MetricPill>
        </div>
        <Table>
          <thead>
            <tr>
              {['排名', '月份', '门店', '员工', '到店人数', '总业绩', '手工业绩', '消耗业绩', '现金业绩', '升单金额', '客单价', '总提成'].map((head) => <Th key={head}>{head}</Th>)}
            </tr>
          </thead>
          <tbody>
            {monthlyRows.length === 0 && (
              <tr className="border-t border-pink-50">
                <Td colSpan={12}><div className="rounded-lg bg-pink-50 px-4 py-6 text-center text-[#8a4964]">暂无员工业绩月报</div></Td>
              </tr>
            )}
            {monthlyRows.map((item, index) => (
              <tr key={`${item.store}-${item.employee}`} className="border-t border-pink-50">
                <Td><Badge tone={index === 0 ? 'danger' : 'pink'}>第{index + 1}名</Badge></Td>
                <Td>{item.month}</Td>
                <Td>{item.store}</Td>
                <Td><div className="font-semibold text-[#5f263c]">{item.employee}</div></Td>
                <Td>{item.arrivals}</Td>
                <Td><b className="text-[#bd1657]">{money(item.totalSales)}</b></Td>
                <Td>{money(item.serviceSales)}</Td>
                <Td>{money(item.consumeSales)}</Td>
                <Td>{money(item.cashSales)}</Td>
                <Td>{money(item.upsellAmount)}</Td>
                <Td>{money(item.unitPrice)}</Td>
                <Td><b className="text-green-700">{money(item.totalCommission)}</b></Td>
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
        <Panel title="本月新客排行榜" subtitle="按本月新客人数从高到低">
          <RankList rows={newCustomerRank} />
        </Panel>
        <Panel title="本月升单排行榜" subtitle="按本月升单金额从高到低">
          <RankList rows={upsellRank} />
        </Panel>
      </div>
    </div>
  )
}

function StoreTargetsModule({ performanceReports, storeTargets, stores, role, profile, storeTargetError, saveStoreTarget }) {
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
  const monthReports = performanceReports.filter((item) => String(item.date || '').startsWith(activeMonth))
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
        {(error || storeTargetError) && <ErrorNotice>{error || storeTargetError}</ErrorNotice>}
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
        <Field label="邀约完成率"><Input type="number" value={form.inviteRate} onChange={(value) => setForm({ ...form, inviteRate: value })} /></Field>
        <Field label="预约转化率"><Input type="number" value={form.appointmentRate} onChange={(value) => setForm({ ...form, appointmentRate: value })} /></Field>
        <Field label="到店转化率"><Input type="number" value={form.arrivalRate} onChange={(value) => setForm({ ...form, arrivalRate: value })} /></Field>
        <Field label="成交转化率"><Input type="number" value={form.dealRate} onChange={(value) => setForm({ ...form, dealRate: value })} /></Field>
        <Field label="成交金额"><Input type="number" value={form.dealAmount} onChange={(value) => setForm({ ...form, dealAmount: value })} /></Field>
        <Field label="未完成原因" full><Textarea value={form.unfinishedReason} onChange={(value) => setForm({ ...form, unfinishedReason: value })} /></Field>
        <Field label="明日动作" full><Textarea value={form.tomorrowAction} onChange={(value) => setForm({ ...form, tomorrowAction: value })} /></Field>
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
        <Field label="角色"><Select value={form.role} onChange={(value) => setForm({ ...form, role: value })} options={[['manager', '店长'], ['beautician', '美容师']]} /></Field>
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

function PerformanceReportDrawer({ data, employees, stores, profile, lockedStore, lockedStoreValue, lockedEmployee, onClose, onSave }) {
  const fixedStore = lockedStore ? normalizeStoreName(lockedStoreValue) || data.store : data.store
  const fixedEmployee = lockedEmployee ? profile?.name || data.employee : data.employee
  const [form, setForm] = useState({ ...data, store: fixedStore, employee: fixedEmployee })
  const employeeOptions = unique(
    employees
      .filter((item) => !form.store || normalizeStoreName(item.store) === normalizeStoreName(form.store))
      .map((item) => item.name)
      .filter(Boolean),
  )

  return (
    <Drawer title={form.id ? '编辑员工业绩日报' : '新增员工业绩日报'} onClose={onClose} onSave={() => onSave(form)}>
      <FormGrid>
        <Field label="日期"><Input type="date" value={form.date} onChange={(value) => setForm({ ...form, date: value })} /></Field>
        <Field label="门店">
          {lockedStore ? (
            <LockedStoreDisplay value={fixedStore} />
          ) : (
            <Select value={form.store} onChange={(value) => setForm({ ...form, store: value, employee: '' })} options={stores} />
          )}
        </Field>
        <Field label="员工">
          {lockedEmployee ? (
            <LockedStoreDisplay value={fixedEmployee} />
          ) : (
            <Select value={form.employee} onChange={(value) => setForm({ ...form, employee: value })} options={['', ...employeeOptions]} />
          )}
        </Field>
        <Field label="到店人数"><Input type="number" value={form.arrivals} onChange={(value) => setForm({ ...form, arrivals: value })} /></Field>
        <Field label="手工业绩"><Input type="number" value={form.serviceSales} onChange={(value) => setForm({ ...form, serviceSales: value })} /></Field>
        <Field label="消耗业绩"><Input type="number" value={form.consumeSales} onChange={(value) => setForm({ ...form, consumeSales: value })} /></Field>
        <Field label="现金业绩"><Input type="number" value={form.cashSales} onChange={(value) => setForm({ ...form, cashSales: value })} /></Field>
        <Field label="新客人数"><Input type="number" value={form.newCustomers} onChange={(value) => setForm({ ...form, newCustomers: value })} /></Field>
        <Field label="老客复购人数"><Input type="number" value={form.repeatCustomers} onChange={(value) => setForm({ ...form, repeatCustomers: value })} /></Field>
        <Field label="升单金额"><Input type="number" value={form.upsellAmount} onChange={(value) => setForm({ ...form, upsellAmount: value })} /></Field>
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

function Drawer({ title, onClose, onSave, children, successMessage }) {
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
          <PrimaryButton onClick={handleSave}>{saving ? '保存中...' : '保存'}</PrimaryButton>
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
  return <input type={type} placeholder={placeholder} value={value ?? ''} onChange={(event) => onChange(event.target.value)} className="w-full rounded-lg border border-pink-100 bg-white px-5 py-4 text-base text-[#5f263c] outline-none focus:border-[#c2185b] focus:ring-2 focus:ring-pink-100" />
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

function PrimaryButton({ children, onClick }) {
  return <button onClick={onClick} className="rounded-lg bg-[#c2185b] px-5 py-3 font-semibold text-white shadow-md shadow-pink-200 transition hover:bg-[#a9134d]">{children}</button>
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
