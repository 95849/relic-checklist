import { useParams } from 'react-router-dom'
import { TEXT } from '../config/text'

export default function Success() {
  const { role } = useParams()
  const isP1 = role === 'p1'

  return (
    <div className="flex items-center justify-center min-h-screen px-4">
      <div className="text-center">
        <div className="text-5xl mb-4">{isP1 ? '📋' : '✅'}</div>
        <h1 className="text-xl font-bold mb-2">{TEXT.successTitle}</h1>
        <p className="text-gray-600">
          {isP1 ? TEXT.successMsg1 : TEXT.successMsg2}
        </p>
      </div>
    </div>
  )
}
