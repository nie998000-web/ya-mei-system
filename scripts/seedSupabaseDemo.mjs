import { createClient } from '@supabase/supabase-js'
import {
  initialCustomers,
  initialEmployees,
  initialFollowups,
  initialReviews,
  stores,
} from '../src/data/seedData.js'
import {
  toCustomer,
  toEmployee,
  toFollowup,
  toReview,
} from '../src/lib/mappers.js'

const url = process.env.VITE_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !serviceKey) {
  console.error('请先设置 VITE_SUPABASE_URL 和 SUPABASE_SERVICE_ROLE_KEY 环境变量。')
  process.exit(1)
}

const supabase = createClient(url, serviceKey)
const profile = { store: stores[0] }

const run = async () => {
  await supabase.from('stores').upsert(stores.map((name) => ({ name })), { onConflict: 'name' })

  const employeeRows = initialEmployees.map((item) => toEmployee(item, profile))
  const { error: employeeError } = await supabase.from('staff').insert(employeeRows)
  if (employeeError) throw employeeError

  const customerRows = initialCustomers.map((item) => toCustomer(item, profile))
  const { data: insertedCustomers, error: customerError } = await supabase
    .from('customers')
    .insert(customerRows)
    .select('id,name,store')
  if (customerError) throw customerError

  const customerMap = new Map(insertedCustomers.map((item) => [item.name, item]))
  const followupRows = initialFollowups.map((item) => {
    const customer = customerMap.get(item.customerName)
    return toFollowup({ ...item, customerId: customer?.id, store: customer?.store || item.store }, profile)
  })
  const { error: followupError } = await supabase.from('followups').insert(followupRows)
  if (followupError) throw followupError

  const reviewRows = initialReviews.map((item) => toReview(item, profile))
  const { error: reviewError } = await supabase.from('daily_reviews').insert(reviewRows)
  if (reviewError) throw reviewError

  console.log(`演示数据导入完成：${customerRows.length} 位顾客，${employeeRows.length} 位员工。`)
}

run().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
