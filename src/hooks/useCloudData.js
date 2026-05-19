import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  stores as fixedStores,
} from '../data/seedData'
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
  normalizeStoreName,
  toEmployee,
  toCashierOrder,
  toCashierOrderItem,
  toFollowup,
  toPerformanceReport,
  toProjectCommission,
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
const customerSelectFields = 'id,name,phone,age,birthday,store,owner,level,last_visit,follow_status,last_follow_result,last_follow_time,next_follow_time,follow_note,today_task_completed_at,created_at'
const employeeSelectFields = 'id,name,phone,store,role,note,entry_date,is_active,created_at,updated_at'
const employeeDailyStatSelectFields = 'id,date,employee_id,employee_name,phone,store,role,followups,appointments,arrivals,deals,sales,note,created_at,updated_at'
const performanceReportSelectFields = 'id,date,store,employee,arrivals,service_sales,consume_sales,cash_sales,new_customers,repeat_customers,upsell_amount,total_sales,unit_price,created_at,updated_at'
const performanceRecordSelectFields = 'id,date,month,store_id,store_name,customer_id,customer_name,project_id,project_name,project_category,amount,consume_amount,payment_type,service_employee_id,service_employee_name,sales_employee_id,sales_employee_name,consultant_id,consultant_name,quantity,remark,created_at,updated_at'
const cashierOrderSelectFields = 'id,order_no,date,month,store_id,store_name,customer_id,customer_name,customer_phone,project_id,project_name,project_category,quantity,original_amount,discount_amount,actual_amount,consume_amount,payment_type,service_employee_id,service_employee_name,sales_employee_id,sales_employee_name,consultant_id,consultant_name,remark,status,created_at,updated_at'
const cashierOrderItemSelectFields = 'id,order_id,project_id,project_name,project_category,quantity,original_amount,discount_amount,actual_amount,consume_amount,duration_minutes,created_at'
const projectCommissionSelectFields = 'id,project_name,category,duration_minutes,unit,is_active,remark,created_at,updated_at'
const storeTargetSelectFields = 'id,month,store,monthly_target,daily_target,current_sales,completion_rate,remaining_amount,created_at'
const followupSelectFields = 'id,customer_id,customer_name,customer_phone,owner,feedback,content,issue_type,has_appointment,appointment_time,has_deal,deal_amount,next_follow_time,created_at,method,store'
const reviewSelectFields = 'id,date,store,invite_rate,appointment_rate,arrival_rate,deal_rate,deal_amount,unfinished_reason,tomorrow_action,created_at'

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

  const loadCustomers = useCallback(async (profileData) => {
    if (!profileData || !supabase) return false
    setCustomerError('')

    try {
      let query = supabase
        .from('customers')
        .select(customerSelectFields)
        .order('name', { ascending: true })

      if (shouldFilterByStore(profileData)) query = query.eq('store', profileStore(profileData))
      if (isBeauticianRole(profileData.role) && profileData.name) query = query.eq('owner', profileData.name)

      const { data, error: customersError } = await query
      if (customersError) {
        const message = errorMessage(customersError)
        console.error('customers 查询失败:', customersError)
        setCustomerError(message)
        setError(message)
        setCustomers([])
        return false
      }

      setCustomers((data || []).map(fromCustomer))
      return true
    } catch (customersError) {
      const message = errorMessage(customersError)
      console.error('customers 查询异常:', customersError)
      setCustomerError(message)
      setError(message)
      setCustomers([])
      return false
    }
  }, [])

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

  const loadEmployees = useCallback(async (profileData) => {
    if (!supabase || !profileData) return false
    setEmployeeError('')

    try {
      let query = supabase
        .from('employees')
        .select(employeeSelectFields)

      if (!isBossRole(profileData.role)) query = query.eq('store', profileStore(profileData))
      if (isBeauticianRole(profileData.role) && profileData.name) query = query.eq('name', profileData.name)

      const { data, error: employeesError } = await query

      if (employeesError) {
        const message = errorMessage(employeesError)
        console.error('employees 查询失败:', employeesError)
        setEmployeeError(message)
        setError(message)
        setEmployees([])
        return false
      }

      const mappedEmployees = (data || []).map(fromEmployee)
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
        const message = errorMessage(statsError)
        console.error('employee_daily_stats 查询失败:', statsError)
        setEmployeeError(message)
        setError(message)
        setEmployees(mergeTodayStats(mappedEmployees, []))
        return false
      }

      setEmployees(mergeTodayStats(mappedEmployees, statsData || []))
      return true
    } catch (employeesError) {
      const message = errorMessage(employeesError)
      console.error('employees 查询异常:', employeesError)
      setEmployeeError(message)
      setError(message)
      setEmployees([])
      return false
    }
  }, [])

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

    try {
      let query = supabase
        .from('cashier_orders')
        .select(cashierOrderSelectFields)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })

      if (!isBossRole(profileData.role)) query = query.eq('store_name', profileStore(profileData))
      if (isBeauticianRole(profileData.role) && profileData.name) {
        query = query.or(`service_employee_name.eq.${profileData.name},sales_employee_name.eq.${profileData.name},consultant_name.eq.${profileData.name}`)
      }

      const { data, error: ordersError } = await query
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

      setProjectCommissions((data || []).map(fromProjectCommission))
      return true
    } catch (projectsError) {
      const message = errorMessage(projectsError)
      console.error('project_commission_settings 查询异常:', projectsError)
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

      setProfile(activeProfile)

      const [storesRes] = await Promise.all([
        supabase.from('stores').select('id,name').order('id', { ascending: true }),
      ])

      const errors = []
      if (storesRes.error) {
        console.error('stores 查询失败:', storesRes.error)
        errors.push(`stores：${errorMessage(storesRes.error)}`)
      }

      const namesFromDb = storesRes.error ? [] : (storesRes.data || []).map((store) => store.name)
      setStoreNames(normalizeStoreNames(namesFromDb))

      const [customersOk, followupsOk, employeesOk, dailyReviewsOk, performanceReportsOk, performanceRecordsOk, cashierOrdersOk, projectCommissionsOk, storeTargetsOk] = await Promise.all([
        loadCustomers(activeProfile),
        loadFollowups(activeProfile),
        loadEmployees(activeProfile),
        loadDailyReviews(activeProfile),
        loadPerformanceReports(activeProfile),
        loadPerformanceRecords(activeProfile),
        loadCashierOrders(activeProfile),
        loadProjectCommissions(),
        loadStoreTargets(activeProfile),
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
      store: storeName,
      owner: isBeauticianRole(profile?.role) ? profile.name : row.owner ?? '',
      level: row.level || '',
      last_visit: row.lastVisit || null,
    }
    const request = row.id
      ? supabase.from('customers').update(payload).eq('id', row.id).select(customerSelectFields).single()
      : supabase.from('customers').insert([payload]).select(customerSelectFields).single()
    const { data, error: saveError } = await request
    if (saveError) throw new Error(customerSchemaError(saveError))
    if ((payload.owner || '') !== (data?.owner || '')) {
      throw new Error(`顾客负责人保存失败：提交为「${payload.owner || '空'}」，云端返回为「${data?.owner || '空'}」。请检查 customers.owner 字段和 RLS。`)
    }
    if (data) {
      const mapped = fromCustomer(data)
      setCustomers((list) => (row.id ? list.map((item) => (item.id === row.id ? mapped : item)) : [mapped, ...list]))
    }
    await loadCustomers(profile)
  }

  const importCustomers = async (rows) => {
    const normalizedRows = (rows || []).map((row) => ({
      name: row.name || '',
      phone: String(row.phone || '').trim(),
      age: row.age === '' || row.age == null ? null : Number(row.age),
      birthday: row.birthday || null,
      store: writeStoreForProfile(row.store, profile),
      owner: isBeauticianRole(profile?.role) ? profile.name : row.owner ?? '',
      level: row.level || '',
      last_visit: row.lastVisit || null,
    }))
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
      const { error: updateError } = await supabase
        .from('customers')
        .update(payload)
        .eq('id', id)
      if (updateError) throw new Error(customerSchemaError(updateError))
    }

    if (insertRows.length > 0) {
      const { error: insertError } = await supabase
        .from('customers')
        .insert(insertRows)
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

  const savePerformanceReport = async (row) => {
    const payload = {
      ...toPerformanceReport(row, profile),
      store: writeStoreForProfile(row.store, profile),
      employee: isBeauticianRole(profile?.role) ? profile.name : row.employee,
    }
    const request = row.id
      ? supabase.from('employee_performance_reports').update(payload).eq('id', row.id).select(performanceReportSelectFields).single()
      : supabase.from('employee_performance_reports').insert(payload).select(performanceReportSelectFields).single()
    const { data, error: saveError } = await request
    if (saveError) throw new Error(errorMessage(saveError))
    if (data) {
      const mapped = fromPerformanceReport(data)
      setPerformanceReports((list) => (row.id ? list.map((item) => (item.id === row.id ? mapped : item)) : [mapped, ...list]))
    }
    await loadPerformanceReports(profile)
  }

  const deletePerformanceReport = async (id) => {
    const { error: deleteError } = await supabase.from('employee_performance_reports').delete().eq('id', id)
    if (deleteError) throw new Error(errorMessage(deleteError))
    await loadPerformanceReports(profile)
  }

  const saveCashierOrder = async (row) => {
    const payload = {
      ...toCashierOrder(row, profile),
      store_name: writeStoreForProfile(row.storeName || row.store, profile),
      status: row.status || 'active',
    }
    if (isBeauticianRole(profile?.role)) {
      payload.service_employee_name = profile.name
      payload.sales_employee_name = profile.name
    }
    const request = row.id
      ? supabase.from('cashier_orders').update(payload).eq('id', row.id).select(cashierOrderSelectFields).single()
      : supabase.from('cashier_orders').insert(payload).select(cashierOrderSelectFields).single()
    const { data, error: saveError } = await request
    if (saveError) throw new Error(errorMessage(saveError))
    const orderItems = Array.isArray(row.orderItems) && row.orderItems.length ? row.orderItems : []
    if (data?.id && orderItems.length > 0) {
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
    const payload = toProjectCommission(row)
    const request = row.id && !String(row.id).startsWith('preset-')
      ? supabase.from('project_commission_settings').update(payload).eq('id', row.id).select(projectCommissionSelectFields).single()
      : supabase.from('project_commission_settings').insert(payload).select(projectCommissionSelectFields).single()
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
      ...toEmployee(row, profile),
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
    savePerformanceReport,
    deletePerformanceReport,
    saveCashierOrder,
    voidCashierOrder,
    saveStoreTarget,
    saveProjectCommission,
    saveEmployee,
    deleteEmployee,
  }
}
