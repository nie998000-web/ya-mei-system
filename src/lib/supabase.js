import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

function isValidHttpUrl(value) {
  try {
    const url = new URL(String(value || '').trim())
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function isRealEnvValue(value) {
  const text = String(value || '').trim()
  return Boolean(text) && !text.includes('这里粘贴') && !text.includes('your-') && !text.includes('YOUR_')
}

export const isSupabaseConfigured = isValidHttpUrl(supabaseUrl) && isRealEnvValue(supabaseAnonKey)

if (supabaseUrl && !isValidHttpUrl(supabaseUrl)) {
  console.warn('Supabase URL 无效，已切换到本地兜底模式。')
}

export const supabase = isSupabaseConfigured
  ? createClient(String(supabaseUrl).trim(), String(supabaseAnonKey).trim(), {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null
