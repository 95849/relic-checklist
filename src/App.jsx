import { Routes, Route } from 'react-router-dom'
import Home from './pages/Home'
import AdminResult from './pages/AdminResult'
import Form from './pages/Form'
import Success from './pages/Success'

export default function App() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/admin/:projectId" element={<AdminResult />} />
        <Route path="/form/:role/:slug" element={<Form />} />
        <Route path="/form/:role/:slug/success" element={<Success />} />
      </Routes>
    </div>
  )
}
