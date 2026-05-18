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

export function ageFromBirthday(dateString) {
  if (!dateString) return ''
  const birthday = new Date(`${dateString}T00:00:00`)
  if (Number.isNaN(birthday.getTime())) return ''
  const today = new Date()
  let age = today.getFullYear() - birthday.getFullYear()
  const monthDiff = today.getMonth() - birthday.getMonth()
  const beforeBirthday = monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthday.getDate())
  if (beforeBirthday) age -= 1
  return age >= 0 ? age : ''
}

export function normalizeDateInput(value) {
  if (!value) return ''
  const text = String(value).trim()
  if (!text) return ''
  const match = text.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/)
  if (!match) return text
  const [, year, month, day] = match
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
}
