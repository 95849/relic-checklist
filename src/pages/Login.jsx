import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  async function handleLogin(e) {
    e.preventDefault()
    setError('')
    if (!username.trim() || !password.trim()) {
      setError('请输入用户名和密码')
      return
    }

    setLoading(true)
    try {
      // SHA-256 哈希密码
      const msgBuffer = new TextEncoder().encode(password)
      const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer)
      const hashArray = Array.from(new Uint8Array(hashBuffer))
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')

      // 查询 Supabase 验证
      const { data, error: dbErr } = await supabase
        .from('admin_users')
        .select('*')
        .eq('username', username.trim())
        .eq('password_hash', hashHex)
        .single()

      if (dbErr || !data) {
        setError('用户名或密码错误')
        setLoading(false)
        return
      }

      // 存储登录状态
      const token = btoa(`${username}:${Date.now()}`)
      localStorage.setItem('admin_token', token)
      localStorage.setItem('admin_user', username)
      navigate('/')
    } catch (e) {
      setError('登录失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center justify-center min-h-screen px-4 bg-gray-50">
      <div className="w-full max-w-sm">
        <h1 className="text-xl font-bold text-center mb-6">管理员登录</h1>
        <form onSubmit={handleLogin} className="bg-white border rounded-lg p-6 shadow-sm space-y-4">
          {error && <div className="p-2 bg-red-50 border border-red-200 text-red-600 text-sm rounded">{error}</div>}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">用户名</label>
            <input
              type="text" value={username} onChange={e => setUsername(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-blue-400"
              placeholder="请输入用户名" autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">密码</label>
            <input
              type="password" value={password} onChange={e => setPassword(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-blue-400"
              placeholder="请输入密码"
            />
          </div>
          <button
            type="submit" disabled={loading}
            className="w-full py-2.5 bg-blue-500 text-white text-base font-medium rounded-lg hover:bg-blue-600 disabled:opacity-50"
          >
            {loading ? '登录中...' : '登录'}
          </button>
        </form>
      </div>
    </div>
  )
}
