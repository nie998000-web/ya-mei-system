export function money(value) {
  return `¥${Number(value || 0).toLocaleString('zh-CN')}`
}

export function nextId(prefix) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`
}
