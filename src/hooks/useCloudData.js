import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  stores as fixedStores,
} from '../data/seedData'
import { cashierSeedProjects, defaultProjectCommissions } from '../data/salarySeedData'
import {
  fromCustomer,
  fromCashierOrder,
  fromCashierOrderItem,
  fromEmployee,
  fromFollowup,
  fromPerformanceReport,
  fromPerformanceRecord,
  fromProjectCommission,
  fromReview,
  fromStoreTarget,
  isDbId,
  normalizeStoreName,
  toEmployee,
  toCashierOrder,
  toCashierOrderItem,
  toFollowup,
  toProjectCommission,
  toProjectStandard,
  toReview,
  toStoreTarget,
} from '../lib/mappers'
import { todayString } from '../utils/date'

const roleRank = {
  beautician: 1,
  consultant: 1,
  technical_teacher: 1,
  manager: 2,
  director: 2,
  regional_manager: 2,
  boss: 3,
  admin: 3,
}
const validRoles = ['boss', 'manager', 'employee', 'beautician', 'consultant', 'director', 'regional_manager', 'technical_teacher', 'admin']

function isBossRole(role) {
  const value = String(role || '').trim().toLowerCase()
  return value === 'boss' || value === 'admin'
}

function isManagerRole(role) {
  const value = String(role || '').trim().toLowerCase()
  return value === 'manager'
}

function isBeauticianRole(role) {
  const value = String(role || '').trim().toLowerCase()
  return value === 'beautician' || value === 'employee' || value === 'consultant' || value === 'technical_teacher'
}

function isValidRole(role) {
  return validRoles.includes(String(role || '').trim().toLowerCase())
}

const customerRequiredFields = ['name', 'phone', 'birthday', 'store', 'owner', 'level', 'last_visit']
const profileSelectFields = 'id,user_id,name,role,store,created_at'
const customerSelectFields = 'id,name,phone,age,birthday,store_id,store,owner,level,last_visit,follow_status,last_follow_result,last_follow_time,next_follow_time,follow_note,today_task_completed_at,created_at'
const customerLegacySelectFields = 'id,name,phone,age,birthday,store,owner,level,last_visit,follow_status,last_follow_result,last_follow_time,next_follow_time,follow_note,today_task_completed_at,created_at'
const employeeSelectFields = 'id,name,phone,store_id,store,role,note,entry_date,is_active,created_at,updated_at'
const employeeLegacySelectFields = 'id,name,phone,store,role,note,entry_date,is_active,created_at,updated_at'
const employeeDailyStatSelectFields = 'id,date,employee_id,employee_name,phone,store,role,followups,appointments,arrivals,deals,sales,note,created_at,updated_at'
const performanceReportSelectFields = 'id,date,store,employee,arrivals,service_sales,consume_sales,cash_sales,new_customers,repeat_customers,upsell_amount,total_sales,unit_price,created_at,updated_at'
const performanceRecordSelectFields = 'id,date,month,store_id,store_name,customer_id,customer_name,project_id,project_name,project_category,amount,consume_amount,payment_type,service_employee_id,service_employee_name,sales_employee_id,sales_employee_name,consultant_id,consultant_name,quantity,remark,created_at,updated_at'
const cashierOrderSelectFields = 'id,order_no,date,month,store_id,store_name,customer_id,customer_name,customer_phone,project_id,project_name,project_category,quantity,original_amount,discount_amount,actual_amount,consume_amount,payment_type,service_employee_id,service_employee_name,sales_employee_id,sales_employee_name,consultant_id,consultant_name,remark,status,created_at,updated_at'
const cashierOrderLegacySelectFields = 'id,order_no,date,month,store_name,customer_id,customer_name,customer_phone,project_id,project_name,project_category,quantity,original_amount,discount_amount,actual_amount,consume_amount,payment_type,service_employee_id,service_employee_name,sales_employee_id,sales_employee_name,consultant_id,consultant_name,remark,status,created_at,updated_at'
const cashierOrderItemSelectFields = 'id,order_id,project_id,project_name,project_category,quantity,original_amount,discount_amount,actual_amount,consume_amount,manual_commission,manual_commission_amount,duration_minutes,created_at'
const projectCommissionSelectFields = 'id,project_name,category,manual_commission,duration_minutes,unit,is_active,remark,created_at,updated_at'
const storeTargetSelectFields = 'id,month,store,monthly_target,daily_target,current_sales,completion_rate,remaining_amount,created_at'
const followupSelectFields = 'id,customer_id,customer_name,customer_phone,owner,feedback,content,issue_type,has_appointment,appointment_time,has_deal,deal_amount,next_follow_time,created_at,method,store'
const reviewSelectFields = 'id,date,store,invite_rate,appointment_rate,arrival_rate,deal_rate,deal_amount,unfinished_reason,tomorrow_action,created_at'
const projectStandardSelectFields = '*'

function shouldFilterByStore(profileData) {
  if (!profileData) return false
  if (isBossRole(profileData.role)) return false
  return isManagerRole(profileData.role) || isBeauticianRole(profileData.role)
}

function normalizeStoreNames(names) {
  const clean = (names || [])
    .map((name) => String(name || '').trim())
    .filter((name) => fixedStores.includes(name))
  return [...new Set([...clean, ...fixedStores])]
}

function profileStore(profileData) {
  return normalizeStoreName(profileData?.store) || fixedStores[0]
}

function writeStoreForProfile(rowStore, profileData) {
  return isBossRole(profileData?.role)
    ? normalizeStoreName(rowStore) || fixedStores[0]
    : profileStore(profileData)
}

function mergeTodayStats(employees, stats) {
  const statsByEmployeeId = new Map((stats || []).map((item) => [String(item.employee_id), item]))
  return employees.map((employee) => {
    const stat = statsByEmployeeId.get(String(employee.id))
    return {
      ...employee,
      today_followups: Number(stat?.followups || 0),
      today_appointments: Number(stat?.appointments || 0),
      today_arrivals: Number(stat?.arrivals || 0),
      today_deals: Number(stat?.deals || 0),
      today_sales: Number(stat?.sales || 0),
      dailyStatId: stat?.id,
      dailyStatDate: stat?.date || todayString(),
    }
  })
}

function defaultEmployeesForStore(store, storeId) {
  return [
    {
      name: `${store}店长`,
      phone: '',
      store_id: storeId,
      store,
      role: 'manager',
      note: '系统初始化默认店长，可在员工管理中修改',
      entry_date: null,
      is_active: true,
      updated_at: new Date().toISOString(),
    },
    {
      name: `${store}顾问`,
      phone: '',
      store_id: storeId,
      store,
      role: 'consultant',
      note: '系统初始化默认顾问，可在员工管理中修改',
      entry_date: null,
      is_active: true,
      updated_at: new Date().toISOString(),
    },
    {
      name: `${store}美容师`,
      phone: '',
      store_id: storeId,
      store,
      role: 'beautician',
      note: '系统初始化默认美容师，可在员工管理中修改',
      entry_date: null,
      is_active: true,
      updated_at: new Date().toISOString(),
    },
  ]
}

function storeByIdFromRows(rows) {
  return new Map((rows || []).filter((store) => store?.id).map((store) => [String(store.id), store.name]))
}

function storeIdByNameFromRows(rows, name) {
  const normalizedName = normalizeStoreName(name)
  return (rows || []).find((store) => normalizeStoreName(store.name) === normalizedName)?.id || ''
}

async function ensureFixedStores() {
  const { data, error } = await supabase.from('stores').select('id,name').order('name', { ascending: true })
  if (error) return { data: [], error }

  let rows = data || []
  const names = new Set(rows.map((store) => normalizeStoreName(store.name)).filter(Boolean))
  const missingStores = fixedStores.filter((name) => !names.has(name))
  if (missingStores.length > 0) {
    const { error: insertError } = await supabase
      .from('stores')
      .insert(missingStores.map((name) => ({ name })))
    if (insertError) return { data: rows, error: insertError }

    const refreshed = await supabase.from('stores').select('id,name').order('name', { ascending: true })
    if (refreshed.error) return { data: rows, error: refreshed.error }
    rows = refreshed.data || []
  }

  return { data: rows, error: null }
}

async function ensureStoreBoundMasterData(rows) {
  const validRows = (rows || []).filter((store) => isDbId(store.id) && fixedStores.includes(normalizeStoreName(store.name)))
  await Promise.all(validRows.flatMap((store) => [
    supabase.from('customers').update({ store_id: store.id, store: normalizeStoreName(store.name) }).eq('store', normalizeStoreName(store.name)).is('store_id', null),
    supabase.from('employees').update({ store_id: store.id, store: normalizeStoreName(store.name) }).eq('store', normalizeStoreName(store.name)).is('store_id', null),
  ])).catch((bindingError) => {
    console.warn('主数据 store_id 绑定补齐失败:', bindingError)
  })
}


function errorMessage(error, fallback = '云端数据操作失败') {
  return error?.message || error?.details || error?.hint || fallback
}

function customerSchemaError(error) {
  const message = error?.message || ''
  const missing = customerRequiredFields.filter((field) => message.includes(`'${field}'`) || message.includes(`"${field}"`) || message.includes(` ${field} `))
  if (missing.length === 0 && /column|schema cache|Could not find/i.test(message)) {
    return `customers 表字段不完整。请确认已添加这些字段：${customerRequiredFields.join('、')}。原始错误：${message}`
  }
  if (missing.length > 0) {
    return `customers 表缺少字段：${missing.join('、')}。请在 Supabase customers 表添加后再保存。`
  }
  return message
}

function isMissingColumnError(error, columnName) {
  const message = String(error?.message || error?.details || '').toLowerCase()
  return message.includes(columnName.toLowerCase()) && /does not exist|schema cache|could not find|column/.test(message)
}

function isStoreIdCompatibilityError(error) {
  const message = String(error?.message || error?.details || error?.hint || '').toLowerCase()
  return message.includes('store_id') && /(uuid|bigint|operator does not exist|invalid input syntax|cannot cast|foreign key|constraint)/.test(message)
}

function withoutStoreId(payload) {
  const { store_id, ...rest } = payload
  return rest
}

export function canManage(role, area) {
  if (isBossRole(role)) return true
  if (isManagerRole(role)) return area !== 'system'
  return area === 'followup' || area === 'customerStatus'
}

export function useCloudData(session) {
  const [profile, setProfile] = useState(null)
  const [customers, setCustomers] = useState([])
  const [employees, setEmployees] = useState([])
  const [followups, setFollowups] = useState([])
  const [reviews, setReviews] = useState([])
  const [performanceReports, setPerformanceReports] = useState([])
  const [performanceRecords, setPerformanceRecords] = useState([])
  const [cashierOrders, setCashierOrders] = useState([])
  const [projectCommissions, setProjectCommissions] = useState([])
  const [storeTargets, setStoreTargets] = useState([])
  const [storeNames, setStoreNames] = useState(fixedStores)
  const [storeRecords, setStoreRecords] = useState([])
  const [projectSource, setProjectSource] = useState('project_commission_settings')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [customerError, setCustomerError] = useState('')
  const [followupError, setFollowupError] = useState('')
  const [employeeError, setEmployeeError] = useState('')
  const [dailyReviewError, setDailyReviewError] = useState('')
  const [performanceReportError, setPerformanceReportError] = useState('')
  const [performanceRecordError, setPerformanceRecordError] = useState('')
  const [cashierOrderError, setCashierOrderError] = useState('')
  const [projectCommissionError, setProjectCommissionError] = useState('')
  const [storeTargetError, setStoreTargetError] = useState('')

  const role = profile?.role || ''

  const applyStoreScope = (query, profileData) => (isBossRole(profileData.role) ? query : query.eq('store', profileStore(profileData)))
  const applyCustomerOwnerScope = (query, profileData) => {
    if (isBossRole(profileData.role)) return query
    const scoped = query.eq('store', profileStore(profileData))
    return isBeauticianRole(profileData.role) && profileData.name ? scoped.eq('owner', profileData.name) : scoped
  }
  const applyFollowupOwnerScope = (query, profileData) => {
    if (isBossRole(profileData.role)) return query
    const scoped = shouldFilterByStore(profileData) ? query.eq('store', profileStore(profileData)) : query
    return isBeauticianRole(profileData.role) && profileData.name ? scoped.eq('owner', profileData.name) : scoped
  }
  const applyEmployeeScope = (query, profileData) => {
    const scoped = applyStoreScope(query, profileData)
    return isBeauticianRole(profileData.role) ? scoped.eq('name', profileData.name) : scoped
  }

  const loadCustomers = useCallback(async (profileData, activeStoreRows = storeRecords) => {
    if (!profileData || !supabase) return false
    setCustomerError('')

    const runCustomerQuery = async ({ useStoreId }) => {
      let query = supabase
        .from('customers')
        .select(useStoreId ? customerSelectFields : customerLegacySelectFields)
        .order('name', { ascending: true })

      if (shouldFilterByStore(profileData)) {
        query = useStoreId && isDbId(profileData.storeId)
          ? query.eq('store_id', profileData.storeId)
          : query.eq('store', profileStore(profileData))
      }
      if (isBeauticianRole(profileData.role) && profileData.name) query = query.eq('owner', profileData.name)
      return query
    }

    try {
      let { data, error: customersError } = await runCustomerQuery({ useStoreId: true })

      if (customersError && (isMissingColumnError(customersError, 'store_id') || isStoreIdCompatibilityError(customersError))) {
        console.warn('customers.store_id 不可用，临时按 customers.store 读取。请执行 supabase/store_id_bigint_compat.sql 完成字段统一。', customersError)
        const fallback = await runCustomerQuery({ useStoreId: false })
        data = fallback.data
        customersError = fallback.error
      }

      if (customersError) {
        const message = errorMessage(customersError)
        console.error('customers 查询失败:', customersError)
        setCustomerError(message)
        setError(message)
        setCustomers([])
        return false
      }

      const storeById = storeByIdFromRows(activeStoreRows)
      setCustomers((data || []).map((row) => fromCustomer(row, storeById)))
      return true
    } catch (customersError) {
      const message = errorMessage(customersError)
      console.error('customers 查询异常:', customersError)
      setCustomerError(message)
      setError(message)
      setCustomers([])
      return false
    }
  }, [storeRecords])

  const loadFollowups = useCallback(async (profileData) => {
    if (!profileData || !supabase) return false
    setFollowupError('')

    try {
      let query = supabase
        .from('followups')
        .select(followupSelectFields)
        .order('created_at', { ascending: false })

      if (shouldFilterByStore(profileData)) query = query.eq('store', profileStore(profileData))
      if (isBeauticianRole(profileData.role) && profileData.name) query = query.eq('owner', profileData.name)

      const { data, error: followupsError } = await query
      if (followupsError) {
        const message = errorMessage(followupsError)
        console.error('followups 查询失败:', followupsError)
        setFollowupError(message)
        setError(message)
        setFollowups([])
        return false
      }

      setFollowups((data || []).map(fromFollowup))
      return true
    } catch (followupsError) {
      const message = errorMessage(followupsError)
      console.error('followups 查询异常:', followupsError)
      setFollowupError(message)
      setError(message)
      setFollowups([])
      return false
    }
  }, [])

  const loadEmployees = useCallback(async (profileData, activeStoreRows = storeRecords) => {
    if (!supabase || !profileData) return false
    setEmployeeError('')

    const runEmployeeQuery = async ({ useStoreId }) => {
      let query = supabase
        .from('employees')
        .select(useStoreId ? employeeSelectFields : employeeLegacySelectFields)

      if (!isBossRole(profileData.role)) {
        query = useStoreId && isDbId(profileData.storeId) ? query.eq('store_id', profileData.storeId) : query.eq('store', profileStore(profileData))
      }
      if (isBeauticianRole(profileData.role) && profileData.name) query = query.eq('name', profileData.name)
      return query
    }

    try {
      let { data, error: employeesError } = await runEmployeeQuery({ useStoreId: true })

      if (employeesError && (isMissingColumnError(employeesError, 'store_id') || isStoreIdCompatibilityError(employeesError))) {
        console.warn('employees.store_id 不可用，临时按 employees.store 读取。', employeesError)
        const fallback = await runEmployeeQuery({ useStoreId: false })
        data = fallback.data
        employeesError = fallback.error
      }

      if (employeesError) {
        const message = errorMessage(employeesError)
        console.error('employees 查询失败:', employeesError)
        setEmployeeError(message)
        setEmployees([])
        return false
      }

      const storeById = storeByIdFromRows(activeStoreRows)
      let mappedEmployees = (data || []).map((row) => fromEmployee(row, storeById))
      const seedStores = (isBossRole(profileData.role) ? activeStoreRows : activeStoreRows.filter((store) => String(store.id) === String(profileData.storeId) || normalizeStoreName(store.name) === profileStore(profileData)))
        .filter((store) => fixedStores.includes(normalizeStoreName(store.name)))
      const seedPayloads = seedStores.flatMap((storeRow) => {
        const store = normalizeStoreName(storeRow.name)
        const storeEmployees = mappedEmployees.filter((item) => String(item.storeId) === String(storeRow.id) || normalizeStoreName(item.store) === store)
        const hasManager = storeEmployees.some((item) => String(item.role || '').toLowerCase() === 'manager')
        const hasConsultant = storeEmployees.some((item) => String(item.role || '').toLowerCase() === 'consultant')
        const hasBeautician = storeEmployees.some((item) => String(item.role || '').toLowerCase() === 'beautician')
        return defaultEmployeesForStore(store, isDbId(storeRow.id) ? storeRow.id : null).filter((item) => (
          (item.role === 'manager' && !hasManager) || (item.role === 'consultant' && !hasConsultant) || (item.role === 'beautician' && !hasBeautician)
        ))
      })

      if (seedPayloads.length > 0) {
        let { data: seededEmployees, error: seedError } = await supabase
          .from('employees')
          .insert(seedPayloads)
          .select(employeeSelectFields)
        if (seedError && (isMissingColumnError(seedError, 'store_id') || isStoreIdCompatibilityError(seedError))) {
          ;({ data: seededEmployees, error: seedError } = await supabase
            .from('employees')
            .insert(seedPayloads.map(withoutStoreId))
            .select(employeeLegacySelectFields))
        }
        if (seedError) {
          console.error('employees 初始化默认员工失败:', seedError)
          setEmployeeError(errorMessage(seedError))
        } else {
          mappedEmployees = [...mappedEmployees, ...(seededEmployees || []).map((row) => fromEmployee(row, storeById))]
        }
      }

      const employeeIds = mappedEmployees.map((item) => item.id).filter(Boolean)
      let statsQuery = supabase
        .from('employee_daily_stats')
        .select(employeeDailyStatSelectFields)
        .eq('date', todayString())

      if (!isBossRole(profileData.role)) statsQuery = statsQuery.eq('store', profileStore(profileData))
      if (isBeauticianRole(profileData.role) && profileData.name) statsQuery = statsQuery.eq('employee_name', profileData.name)
      if (employeeIds.length > 0) statsQuery = statsQuery.in('employee_id', employeeIds)

      const { data: statsData, error: statsError } = await statsQuery
      if (statsError) {
        console.error('employee_daily_stats 查询失败:', statsError)
        setEmployeeError(errorMessage(statsError))
        setEmployees(mergeTodayStats(mappedEmployees, []))
        return true
      }

      setEmployees(mergeTodayStats(mappedEmployees, statsData || []))
      return true
    } catch (employeesError) {
      const message = errorMessage(employeesError)
      console.error('employees 查询异常:', employeesError)
      setEmployeeError(message)
      setEmployees([])
      return false
    }
  }, [storeRecords])

  const loadDailyReviews = useCallback(async (profileData) => {
    if (!supabase || !profileData) return false
    setDailyReviewError('')

    try {
      if (isBeauticianRole(profileData.role)) {
        setReviews([])
        return true
      }

      let query = supabase
        .from('daily_reviews')
        .select(reviewSelectFields)
        .order('created_at', { ascending: false })

      if (!isBossRole(profileData.role)) query = query.eq('store', profileStore(profileData))

      const { data, error: dailyReviewsError } = await query

      if (dailyReviewsError) {
        const message = errorMessage(dailyReviewsError)
        console.error('daily_reviews 查询失败:', dailyReviewsError)
        setDailyReviewError(message)
        setError(message)
        setReviews([])
        return false
      }

      setReviews((data || []).map(fromReview))
      return true
    } catch (dailyReviewsError) {
      const message = errorMessage(dailyReviewsError)
      console.error('daily_reviews 查询异常:', dailyReviewsError)
      setDailyReviewError(message)
      setError(message)
      setReviews([])
      return false
    }
  }, [])

  const loadPerformanceReports = useCallback(async (profileData) => {
    if (!supabase || !profileData) return false
    setPerformanceReportError('')

    try {
      let query = supabase
        .from('employee_performance_reports')
        .select(performanceReportSelectFields)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })

      if (!isBossRole(profileData.role)) query = query.eq('store', profileStore(profileData))
      if (isBeauticianRole(profileData.role) && profileData.name) query = query.eq('employee', profileData.name)

      const { data, error: reportsError } = await query
      if (reportsError) {
        const message = errorMessage(reportsError)
        console.error('employee_performance_reports 查询失败:', reportsError)
        setPerformanceReportError(message)
        setError(message)
        setPerformanceReports([])
        return false
      }

      setPerformanceReports((data || []).map(fromPerformanceReport))
      return true
    } catch (reportsError) {
      const message = errorMessage(reportsError)
      console.error('employee_performance_reports 查询异常:', reportsError)
      setPerformanceReportError(message)
      setError(message)
      setPerformanceReports([])
      return false
    }
  }, [])

  const loadPerformanceRecords = useCallback(async (profileData) => {
    if (!supabase || !profileData) return false
    setPerformanceRecordError('')

    try {
      let query = supabase
        .from('performance_records')
        .select(performanceRecordSelectFields)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })

      if (!isBossRole(profileData.role)) query = query.eq('store_name', profileStore(profileData))
      if (isBeauticianRole(profileData.role) && profileData.name) {
        query = query.or(`service_employee_name.eq.${profileData.name},sales_employee_name.eq.${profileData.name}`)
      }

      const { data, error: recordsError } = await query
      if (recordsError) {
        const message = errorMessage(recordsError)
        console.error('performance_records 查询失败:', recordsError)
        setPerformanceRecordError(message)
        setPerformanceRecords([])
        return false
      }

      setPerformanceRecords((data || []).map(fromPerformanceRecord))
      return true
    } catch (recordsError) {
      const message = errorMessage(recordsError)
      console.error('performance_records 查询异常:', recordsError)
      setPerformanceRecordError(message)
      setPerformanceRecords([])
      return false
    }
  }, [])

  const loadCashierOrders = useCallback(async (profileData) => {
    if (!supabase || !profileData) return false
    setCashierOrderError('')

    const runCashierQuery = async ({ useStoreId }) => {
      let query = supabase
        .from('cashier_orders')
        .select(useStoreId ? cashierOrderSelectFields : cashierOrderLegacySelectFields)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })

      if (!isBossRole(profileData.role)) {
        query = useStoreId && isDbId(profileData.storeId) ? query.eq('store_id', profileData.storeId) : query.eq('store_name', profileStore(profileData))
      }
      if (isBeauticianRole(profileData.role) && profileData.name) {
        query = query.or(`service_employee_name.eq.${profileData.name},sales_employee_name.eq.${profileData.name},consultant_name.eq.${profileData.name}`)
      }
      return query
    }

    try {
      let { data, error: ordersError } = await runCashierQuery({ useStoreId: true })

      if (ordersError && (isMissingColumnError(ordersError, 'store_id') || isStoreIdCompatibilityError(ordersError))) {
        console.warn('cashier_orders.store_id 不可用，临时按 cashier_orders.store_name 读取。', ordersError)
        const fallback = await runCashierQuery({ useStoreId: false })
        data = fallback.data
        ordersError = fallback.error
      }

      if (ordersError) {
        const message = errorMessage(ordersError)
        console.error('cashier_orders 查询失败:', ordersError)
        setCashierOrderError(message)
        setCashierOrders([])
        return false
      }

      const mappedOrders = (data || []).map(fromCashierOrder)
      const orderIds = mappedOrders.map((item) => item.id).filter(Boolean)
      let itemsByOrderId = new Map()
      if (orderIds.length > 0) {
        const { data: itemRows, error: itemsError } = await supabase
          .from('cashier_order_items')
          .select(cashierOrderItemSelectFields)
          .in('order_id', orderIds)
        if (itemsError) {
          console.error('cashier_order_items 查询失败:', itemsError)
        } else {
          itemsByOrderId = (itemRows || []).map(fromCashierOrderItem).reduce((map, item) => {
            const key = String(item.orderId)
            map.set(key, [...(map.get(key) || []), item])
            return map
          }, new Map())
        }
      }
      setCashierOrders(mappedOrders.map((order) => {
        const orderItems = itemsByOrderId.get(String(order.id)) || order.orderItems || []
        return {
          ...order,
          orderItems,
          projectName: orderItems.length > 1 ? orderItems.map((item) => item.projectName).filter(Boolean).join(' + ') : order.projectName,
          actualAmount: orderItems.length ? orderItems.reduce((sum, item) => sum + Number(item.actualAmount || 0), 0) : order.actualAmount,
          consumeAmount: orderItems.length ? orderItems.reduce((sum, item) => sum + Number(item.consumeAmount || 0), 0) : order.consumeAmount,
          manualCommissionAmount: 0,
        }
      }))
      return true
    } catch (ordersError) {
      const message = errorMessage(ordersError)
      console.error('cashier_orders 查询异常:', ordersError)
      setCashierOrderError(message)
      setCashierOrders([])
      return false
    }
  }, [])

  const loadProjectCommissions = useCallback(async () => {
    if (!supabase) return false
    setProjectCommissionError('')

    try {
      const { data: standardRows, error: standardError } = await supabase
        .from('projects')
        .select(projectStandardSelectFields)
        .order('project_name', { ascending: true })

      if (!standardError) {
        setProjectSource('projects')
        let projectRows = standardRows || []
        if (projectRows.length === 0) {
          const { data: seededProjects, error: seedError } = await supabase
            .from('projects')
            .insert(cashierSeedProjects.map((item) => toProjectStandard(item)))
            .select(projectStandardSelectFields)
          if (seedError) {
            console.error('projects 初始化默认项目失败:', seedError)
            setProjectCommissionError(errorMessage(seedError))
          } else {
            projectRows = seededProjects || []
          }
        }
        setProjectCommissions(projectRows.map(fromProjectCommission))
        return true
      }

      console.warn('projects 查询失败，尝试旧项目表 project_commission_settings:', standardError)
      setProjectSource('project_commission_settings')
      const { data, error: projectsError } = await supabase
        .from('project_commission_settings')
        .select(projectCommissionSelectFields)
        .order('project_name', { ascending: true })

      if (projectsError) {
        const message = errorMessage(projectsError)
        console.error('project_commission_settings 查询失败:', projectsError)
        setProjectCommissionError(message)
        setProjectCommissions([])
        return false
      }

      let projectRows = data || []
      if (projectRows.length === 0) {
        const seedPayloads = cashierSeedProjects.map((item) => toProjectCommission(item))
        const { data: seededProjects, error: seedError } = await supabase
          .from('project_commission_settings')
          .insert(seedPayloads)
          .select(projectCommissionSelectFields)
        if (seedError) {
          console.error('project_commission_settings 初始化默认项目失败:', seedError)
          setProjectCommissionError(errorMessage(seedError))
        } else {
          projectRows = seededProjects || []
        }
      }

      setProjectCommissions(projectRows.map(fromProjectCommission))
      return true
    } catch (projectsError) {
      const message = errorMessage(projectsError)
      console.error('项目标准库查询异常:', projectsError)
      setProjectCommissionError(message)
      setProjectCommissions([])
      return false
    }
  }, [])

  const loadStoreTargets = useCallback(async (profileData) => {
    if (!supabase || !profileData) return false
    setStoreTargetError('')

    try {
      let query = supabase
        .from('store_targets')
        .select(storeTargetSelectFields)
        .order('month', { ascending: false })
        .order('store', { ascending: true })

      if (!isBossRole(profileData.role)) query = query.eq('store', profileStore(profileData))

      const { data, error: targetsError } = await query
      if (targetsError) {
        const message = errorMessage(targetsError)
        console.error('store_targets 查询失败:', targetsError)
        setStoreTargetError(message)
        setError(message)
        setStoreTargets([])
        return false
      }

      setStoreTargets((data || []).map(fromStoreTarget))
      return true
    } catch (targetsError) {
      const message = errorMessage(targetsError)
      console.error('store_targets 查询异常:', targetsError)
      setStoreTargetError(message)
      setError(message)
      setStoreTargets([])
      return false
    }
  }, [])

  const loadAll = useCallback(async () => {
    if (!session?.user || !supabase) return
    setLoading(true)
    setError('')
    setCustomerError('')
    setFollowupError('')
    setEmployeeError('')
    setDailyReviewError('')
    setPerformanceReportError('')
    setPerformanceRecordError('')
    setCashierOrderError('')
    setProjectCommissionError('')
    setStoreTargetError('')

    try {
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select(profileSelectFields)
        .eq('user_id', session.user.id)
        .maybeSingle()

      if (profileError) {
        const message = `profiles 查询失败：${errorMessage(profileError)}`
        console.error('profiles 查询失败:', profileError)
        setError(message)
        setProfile(null)
        return
      }

      if (!profileData) {
        setError('当前登录账号没有 profiles 资料，请先为该账号配置角色和门店。')
        setProfile(null)
        return
      }

      const activeProfile = {
        ...profileData,
        role: String(profileData.role || '').trim().toLowerCase(),
        store: normalizeStoreName(profileData.store),
      }

      if (!isValidRole(activeProfile.role)) {
        setError('当前账号角色无效，只允许 boss、admin、manager、employee、beautician、consultant、director、regional_manager、technical_teacher。')
        setProfile(null)
        return
      }

      if (!isBossRole(activeProfile.role) && !activeProfile.store) {
        setError('当前账号未配置有效门店，请在 profiles.store 中填写固定门店。')
        setProfile(null)
        return
      }

      if (isBeauticianRole(activeProfile.role) && !String(activeProfile.name || '').trim()) {
        setError('美容师账号未配置姓名，无法匹配自己的顾客和跟进记录。')
        setProfile(null)
        return
      }

      const storesRes = await ensureFixedStores()

      const errors = []
      if (storesRes.error) {
        console.error('stores 查询/初始化失败:', storesRes.error)
        errors.push(`stores：${errorMessage(storesRes.error)}`)
      }

      const activeStoreRows = storesRes.error ? [] : (storesRes.data || [])
      const activeProfileWithStore = {
        ...activeProfile,
        storeId: storeIdByNameFromRows(activeStoreRows, activeProfile.store),
      }
      setProfile(activeProfileWithStore)
      setStoreRecords(activeStoreRows)
      const namesFromDb = activeStoreRows.map((store) => store.name)
      setStoreNames(normalizeStoreNames(namesFromDb))
      await ensureStoreBoundMasterData(activeStoreRows)

      const [customersOk, followupsOk, employeesOk, dailyReviewsOk, performanceReportsOk, performanceRecordsOk, cashierOrdersOk, projectCommissionsOk, storeTargetsOk] = await Promise.all([
        loadCustomers(activeProfileWithStore, activeStoreRows),
        loadFollowups(activeProfileWithStore),
        loadEmployees(activeProfileWithStore, activeStoreRows),
        loadDailyReviews(activeProfileWithStore),
        loadPerformanceReports(activeProfileWithStore),
        loadPerformanceRecords(activeProfileWithStore),
        loadCashierOrders(activeProfileWithStore),
        loadProjectCommissions(),
        loadStoreTargets(activeProfileWithStore),
      ])
      if (errors.length || !customersOk || !followupsOk || !employeesOk || !dailyReviewsOk || !performanceReportsOk || !performanceRecordsOk || !cashierOrdersOk || !projectCommissionsOk || !storeTargetsOk) {
        setError((current) => [current, ...errors].filter(Boolean).join('；'))
      }
    } catch (loadError) {
      const message = errorMessage(loadError)
      console.error('loadAll 执行异常:', loadError)
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [session, loadCustomers, loadFollowups, loadEmployees, loadDailyReviews, loadPerformanceReports, loadPerformanceRecords, loadCashierOrders, loadProjectCommissions, loadStoreTargets])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  const saveCustomer = async (row) => {
    const storeName = writeStoreForProfile(row.store, profile)
    const payload = {
      name: row.name || '',
      phone: row.phone || '',
      age: row.age === '' || row.age == null ? null : Number(row.age),
      birthday: row.birthday || null,
      store_id: storeIdByNameFromRows(storeRecords, storeName) || profile?.storeId || null,
      store: storeName,
      owner: isBeauticianRole(profile?.role) ? profile.name : row.owner ?? '',
      level: row.level || '',
      last_visit: row.lastVisit || null,
    }
    const saveRequest = (nextPayload, selectFields) => row.id
      ? supabase.from('customers').update(nextPayload).eq('id', row.id).select(selectFields).single()
      : supabase.from('customers').insert([nextPayload]).select(selectFields).single()
    let { data, error: saveError } = await saveRequest(payload, customerSelectFields)
    if (saveError && (isMissingColumnError(saveError, 'store_id') || isStoreIdCompatibilityError(saveError))) {
      console.warn('customers.store_id 不可用，顾客保存临时不写 store_id。请执行 supabase/store_id_bigint_compat.sql。', saveError)
      ;({ data, error: saveError } = await saveRequest(withoutStoreId(payload), customerLegacySelectFields))
    }
    if (saveError) throw new Error(customerSchemaError(saveError))
    if ((payload.owner || '') !== (data?.owner || '')) {
      throw new Error(`顾客负责人保存失败：提交为「${payload.owner || '空'}」，云端返回为「${data?.owner || '空'}」。请检查 customers.owner 字段和 RLS。`)
    }
    if (data) {
      const mapped = fromCustomer(data, storeByIdFromRows(storeRecords))
      setCustomers((list) => (row.id ? list.map((item) => (item.id === row.id ? mapped : item)) : [mapped, ...list]))
    }
    await loadCustomers(profile)
  }

  const importCustomers = async (rows) => {
    const normalizedRows = (rows || []).map((row) => {
      const storeName = writeStoreForProfile(row.store, profile)
      return {
      name: row.name || '',
      phone: String(row.phone || '').trim(),
      age: row.age === '' || row.age == null ? null : Number(row.age),
      birthday: row.birthday || null,
      store_id: storeIdByNameFromRows(storeRecords, storeName) || profile?.storeId || null,
      store: storeName,
      owner: isBeauticianRole(profile?.role) ? profile.name : row.owner ?? '',
      level: row.level || '',
      last_visit: row.lastVisit || null,
    }
    })
    const skippedBlankPhone = normalizedRows.filter((row) => !row.phone).length
    const rowsWithPhone = normalizedRows.filter((row) => row.phone)

    if (rowsWithPhone.length === 0) throw new Error('导入数据必须包含手机号。')

    const dedupedByPhone = [...new Map(rowsWithPhone.map((row) => [row.phone, row])).values()]
    const skippedDuplicateInFile = rowsWithPhone.length - dedupedByPhone.length
    const phones = dedupedByPhone.map((row) => row.phone)
    const { data: existingRows, error: existingError } = await supabase
      .from('customers')
      .select('id,phone')
      .in('phone', phones)

    if (existingError) throw new Error(errorMessage(existingError))

    const existingByPhone = new Map((existingRows || []).map((row) => [row.phone, row.id]))
    const updateRows = dedupedByPhone
      .filter((row) => existingByPhone.has(row.phone))
      .map((row) => ({ id: existingByPhone.get(row.phone), ...row }))
    const insertRows = dedupedByPhone.filter((row) => !existingByPhone.has(row.phone))

    for (const row of updateRows) {
      const { id, ...payload } = row
      let { error: updateError } = await supabase
        .from('customers')
        .update(payload)
        .eq('id', id)
      if (updateError && (isMissingColumnError(updateError, 'store_id') || isStoreIdCompatibilityError(updateError))) {
        ;({ error: updateError } = await supabase
          .from('customers')
          .update(withoutStoreId(payload))
          .eq('id', id))
      }
      if (updateError) throw new Error(customerSchemaError(updateError))
    }

    if (insertRows.length > 0) {
      let { error: insertError } = await supabase
        .from('customers')
        .insert(insertRows)
      if (insertError && (isMissingColumnError(insertError, 'store_id') || isStoreIdCompatibilityError(insertError))) {
        ;({ error: insertError } = await supabase
          .from('customers')
          .insert(insertRows.map(withoutStoreId)))
      }
      if (insertError) throw new Error(customerSchemaError(insertError))
    }

    await loadCustomers(profile)
    return {
      total: rows.length,
      created: insertRows.length,
      updated: updateRows.length,
      skipped: skippedBlankPhone + skippedDuplicateInFile,
    }
  }

  const deleteCustomer = async (id) => {
    const { error: deleteError } = await supabase.from('customers').delete().eq('id', id)
    if (deleteError) throw new Error(errorMessage(deleteError))
    await loadAll()
  }

  const updateCustomerStatus = async (id, changes) => {
    const today = new Date().toISOString().slice(0, 10)
    const followStatus = typeof changes === 'string' ? changes : changes?.followStatus
    const nextFollowTime = typeof changes === 'string' ? undefined : changes?.nextFollowTime
    const followNote = typeof changes === 'string' ? undefined : changes?.followNote
    const todayTaskCompletedAt = typeof changes === 'string' ? undefined : changes?.todayTaskCompletedAt
    const payload = {
      follow_status: followStatus,
      last_follow_result: followStatus,
      last_follow_time: today,
    }
    if (nextFollowTime !== undefined) payload.next_follow_time = nextFollowTime || null
    if (followNote !== undefined) payload.follow_note = followNote || ''
    if (todayTaskCompletedAt !== undefined) payload.today_task_completed_at = todayTaskCompletedAt || null
    if (followStatus === '已到店') payload.last_visit = today

    const { error: updateError } = await supabase
      .from('customers')
      .update(payload)
      .eq('id', id)
    if (updateError) throw new Error(errorMessage(updateError))
    setCustomers((list) =>
      list.map((item) =>
        item.id === id
          ? {
              ...item,
              followStatus,
              lastFollowResult: followStatus,
              lastFollowTime: today,
              nextFollowTime: nextFollowTime !== undefined ? nextFollowTime : item.nextFollowTime,
              followNote: followNote !== undefined ? followNote : item.followNote,
              todayTaskCompletedAt: todayTaskCompletedAt !== undefined ? todayTaskCompletedAt : item.todayTaskCompletedAt,
              lastVisit: followStatus === '已到店' ? today : item.lastVisit,
            }
          : item,
      ),
    )
    await loadAll()
  }

  const saveFollowup = async (row) => {
    const payload = {
      ...toFollowup(row, profile),
      store: writeStoreForProfile(row.store, profile),
      owner: isBeauticianRole(profile?.role) ? profile.name : row.owner,
    }
    const request = row.id
      ? supabase.from('followups').update(payload).eq('id', row.id).select(followupSelectFields).single()
      : supabase.from('followups').insert(payload).select(followupSelectFields).single()
    const { data, error: saveError } = await request
    if (saveError) throw new Error(errorMessage(saveError))
    if (data) {
      const mapped = fromFollowup(data)
      setFollowups((list) => (row.id ? list.map((item) => (item.id === row.id ? mapped : item)) : [mapped, ...list]))
    }
    await loadAll()
  }

  const deleteFollowup = async (id) => {
    const { error: deleteError } = await supabase.from('followups').delete().eq('id', id)
    if (deleteError) throw new Error(errorMessage(deleteError))
    await loadAll()
  }

  const saveReview = async (row) => {
    const payload = {
      ...toReview(row, profile),
      store: writeStoreForProfile(row.store, profile),
    }
    const request = row.id
      ? supabase.from('daily_reviews').update(payload).eq('id', row.id).select(reviewSelectFields).single()
      : supabase.from('daily_reviews').insert(payload).select(reviewSelectFields).single()
    const { data, error: saveError } = await request
    if (saveError) throw new Error(errorMessage(saveError))
    if (data) {
      const mapped = fromReview(data)
      setReviews((list) => (row.id ? list.map((item) => (item.id === row.id ? mapped : item)) : [mapped, ...list]))
    }
    await loadAll()
  }

  const deleteReview = async (id) => {
    const { error: deleteError } = await supabase.from('daily_reviews').delete().eq('id', id)
    if (deleteError) throw new Error(errorMessage(deleteError))
    await loadAll()
  }

  const saveCashierOrder = async (row) => {
    const storeName = writeStoreForProfile(row.storeName || row.store, profile)
    const invalidUuidPayload = [
      row.customerId,
      ...(Array.isArray(row.orderItems) ? row.orderItems.map((item) => item.projectId) : [row.projectId]),
      row.serviceEmployeeId,
      row.salesEmployeeId,
      row.consultantId || null,
    ].filter((value) => value && !isDbId(value))
    if (invalidUuidPayload.length > 0) {
      throw new Error('请选择正确的顾客、门店、项目、操作老师和开单人')
    }
    const payload = {
      ...toCashierOrder(row, profile),
      store_name: storeName,
      status: row.status || 'active',
    }
    if (!payload.store_id && storeName) {
      const { data: storeRow, error: storeError } = await supabase
        .from('stores')
        .select('id')
        .eq('name', storeName)
        .maybeSingle()
      if (!storeError && isDbId(storeRow?.id)) payload.store_id = storeRow.id
    }
    if (!payload.store_id) {
      throw new Error('请选择正确的顾客、门店、项目、操作老师和开单人')
    }
    if (isBeauticianRole(profile?.role)) {
      payload.service_employee_name = profile.name
      payload.sales_employee_name = profile.name
    }
    console.log('cashier submit payload', payload)
    const request = row.id && isDbId(row.id)
      ? supabase.from('cashier_orders').update(payload).eq('id', row.id).select(cashierOrderSelectFields).single()
      : supabase.from('cashier_orders').insert(payload).select(cashierOrderSelectFields).single()
    const { data, error: saveError } = await request
    if (saveError) throw new Error(errorMessage(saveError))
    const orderItems = Array.isArray(row.orderItems) && row.orderItems.length ? row.orderItems : []
    if (data?.id && isDbId(data.id) && orderItems.length > 0) {
      const invalidItemIds = orderItems.map((item) => item.projectId).filter((value) => value && !isDbId(value))
      if (invalidItemIds.length > 0) throw new Error('请选择正确的顾客、门店、项目、操作老师和开单人')
      const { error: deleteItemsError } = await supabase
        .from('cashier_order_items')
        .delete()
        .eq('order_id', data.id)
      if (deleteItemsError) throw new Error(errorMessage(deleteItemsError))
      const { error: insertItemsError } = await supabase
        .from('cashier_order_items')
        .insert(orderItems.map((item) => toCashierOrderItem(item, data.id)))
      if (insertItemsError) throw new Error(errorMessage(insertItemsError))
    }
    if (data) {
      const mapped = fromCashierOrder(data)
      setCashierOrders((list) => (row.id ? list.map((item) => (item.id === row.id ? mapped : item)) : [mapped, ...list]))
    }
    await Promise.all([
      loadCashierOrders(profile),
      loadPerformanceReports(profile),
      loadPerformanceRecords(profile),
      loadStoreTargets(profile),
    ])
  }

  const voidCashierOrder = async (id) => {
    const { error: voidError } = await supabase
      .from('cashier_orders')
      .update({ status: 'voided', updated_at: new Date().toISOString() })
      .eq('id', id)
    if (voidError) throw new Error(errorMessage(voidError))
    await loadCashierOrders(profile)
  }

  const saveStoreTarget = async (row) => {
    const payload = {
      ...toStoreTarget(row, profile),
      store: writeStoreForProfile(row.store, profile),
    }
    const { data: existing, error: existingError } = await supabase
      .from('store_targets')
      .select('id')
      .eq('month', payload.month)
      .eq('store', payload.store)
      .maybeSingle()
    if (existingError) throw new Error(errorMessage(existingError))

    const request = existing?.id
      ? supabase.from('store_targets').update(payload).eq('id', existing.id).select(storeTargetSelectFields).single()
      : supabase.from('store_targets').insert(payload).select(storeTargetSelectFields).single()
    const { data, error: saveError } = await request
    if (saveError) throw new Error(errorMessage(saveError))
    if (data) {
      const mapped = fromStoreTarget(data)
      setStoreTargets((list) => {
        const exists = list.some((item) => item.id === mapped.id)
        return exists ? list.map((item) => (item.id === mapped.id ? mapped : item)) : [mapped, ...list]
      })
    }
    await loadStoreTargets(profile)
  }

  const saveProjectCommission = async (row) => {
    const isStandardProject = projectSource === 'projects'
    const payload = isStandardProject ? toProjectStandard(row) : toProjectCommission(row)
    const tableName = isStandardProject ? 'projects' : 'project_commission_settings'
    const selectFields = isStandardProject ? projectStandardSelectFields : projectCommissionSelectFields
    const canUpdate = row.id && !String(row.id).startsWith('preset-') && !String(row.id).startsWith('seed-')
    const request = canUpdate
      ? supabase.from(tableName).update(payload).eq('id', row.id).select(selectFields).single()
      : supabase.from(tableName).insert(payload).select(selectFields).single()
    const { data, error: saveError } = await request
    if (saveError) throw new Error(errorMessage(saveError))
    if (data) {
      const mapped = fromProjectCommission(data)
      setProjectCommissions((list) => {
        const exists = list.some((item) => item.id === mapped.id)
        return exists ? list.map((item) => (item.id === mapped.id ? mapped : item)) : [mapped, ...list]
      })
    }
    await loadProjectCommissions()
  }

  const saveEmployee = async (row) => {
    const storeName = writeStoreForProfile(row.store, profile)
    const employeePayload = {
      ...toEmployee({ ...row, storeId: storeIdByNameFromRows(storeRecords, storeName) || row.storeId }, profile),
      store_id: storeIdByNameFromRows(storeRecords, storeName) || row.storeId || profile?.storeId || null,
      store: storeName,
    }
    const { data, error: saveError } = row.id
      ? await supabase.from('employees').update(employeePayload).eq('id', row.id).select(employeeSelectFields).single()
      : await supabase.from('employees').insert(employeePayload).select(employeeSelectFields).single()
    if (saveError) throw new Error(errorMessage(saveError))
    const statPayload = {
      date: todayString(),
      employee_id: data.id,
      employee_name: data.name || '',
      phone: data.phone || '',
      store: storeName,
      role: data.role || 'beautician',
      followups: Number(row.today_followups || 0),
      appointments: Number(row.today_appointments || 0),
      arrivals: Number(row.today_arrivals || 0),
      deals: Number(row.today_deals || 0),
      sales: Number(row.today_sales || 0),
      note: row.note || '',
      updated_at: new Date().toISOString(),
    }
    const { error: statsSaveError } = await supabase
      .from('employee_daily_stats')
      .upsert(statPayload, { onConflict: 'date,employee_id' })
    if (statsSaveError) throw new Error(errorMessage(statsSaveError))
    await loadEmployees(profile)
  }

  const deleteEmployee = async (id) => {
    const { error: deleteError } = await supabase.from('employees').delete().eq('id', id)
    if (deleteError) throw new Error(errorMessage(deleteError))
    await loadEmployees(profile)
  }

  const stores = useMemo(() => {
    const cleanStore = normalizeStoreName(profile?.store)
    const availableStores = normalizeStoreNames(storeNames)
    if (!profile) return availableStores
    if (!isBossRole(profile.role)) return [cleanStore || fixedStores[0]]
    return availableStores
  }, [profile, storeNames])

  return {
    profile,
    role,
    roleLevel: roleRank[role] || 1,
    stores,
    storeRecords,
    customers,
    employees,
    followups,
    reviews,
    performanceReports,
    performanceRecords,
    cashierOrders,
    projectCommissions,
    storeTargets,
    loading,
    error,
    customerError,
    followupError,
    employeeError,
    dailyReviewError,
    performanceReportError,
    performanceRecordError,
    cashierOrderError,
    projectCommissionError,
    storeTargetError,
    refresh: loadAll,
    loadCustomers,
    loadFollowups,
    loadEmployees,
    loadDailyReviews,
    loadPerformanceReports,
    loadPerformanceRecords,
    loadCashierOrders,
    loadProjectCommissions,
    loadStoreTargets,
    saveCustomer,
    importCustomers,
    deleteCustomer,
    updateCustomerStatus,
    saveFollowup,
    deleteFollowup,
    saveReview,
    deleteReview,
    saveCashierOrder,
    voidCashierOrder,
    saveStoreTarget,
    saveProjectCommission,
    saveEmployee,
    deleteEmployee,
  }
}
