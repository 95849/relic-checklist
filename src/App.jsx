import { Routes, Route } from 'react-router-dom'
import Home from './pages/Home'
import AdminResult from './pages/AdminResult'
import Form from './pages/Form'
import Success from './pages/Success'
import Login from './pages/Login'
import { AuthGuard } from './components/AuthGuard'

export default function App() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<AuthGuard><Home /></AuthGuard>} />
        <Route path="/admin/:projectId" element={<AuthGuard><AdminResult /></AuthGuard>} />
        <Route path="/form/:role/:slug" element={<Form />} />
        <Route path="/form/:role/:slug/success" element={<Success />} />
      </Routes>
    </div>
  )
}
