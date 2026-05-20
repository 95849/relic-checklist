import { useParams, Link } from 'react-router-dom'
import { TEXT } from '../config/text'

export default function Success() {
  const { role } = useParams()
  const isP1 = role === 'p1'

  return (
    <div className="flex items-center justify-center min-h-screen px-4">
      <div className="text-center">
        <div className="text-5xl mb-4">{isP1 ? '📋' : '✅'}</div>
        <h1 className="text-xl font-bold mb-2">{TEXT.successTitle}</h1>
        <p className="text-gray-600 mb-6">
          {isP1 ? TEXT.successMsg1 : TEXT.successMsg2}
        </p>
        <Link
          to="/"
          className="inline-block px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
        >
          {TEXT.backHome}
        </Link>
      </div>
    </div>
  )
}
