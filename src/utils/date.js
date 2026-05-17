export function daysSince(dateString) {
  if (!dateString) return 0
  const start = new Date(`${dateString}T00:00:00`)
  const now = new Date()
  const diff = now.setHours(0, 0, 0, 0) - start.getTime()
  return Math.max(0, Math.floor(diff / 86400000))
}

export function todayString() {
  const date = new Date()
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function percent(part, total) {
  if (!total) return '0%'
  return `${Math.round((Number(part || 0) / Number(total || 0)) * 100)}%`
}
