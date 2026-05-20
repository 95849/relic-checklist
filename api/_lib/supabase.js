import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

let _client = null

export function getSupabase() {
  if (!_client) {
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('Supabase 环境变量未配置')
    }
    _client = createClient(supabaseUrl, serviceRoleKey)
  }
  return _client
}
