import { Navigate } from 'react-router-dom'

export function AuthGuard({ children }) {
  const token = localStorage.getItem('admin_token')
  if (!token) return <Navigate to="/login" replace />
  return children
}

export function isLoggedIn() {
  return !!localStorage.getItem('admin_token')
}

export function logout() {
  localStorage.removeItem('admin_token')
  localStorage.removeItem('admin_user')
  window.location.href = window.location.href.split('#')[0] + '#/login'
}
