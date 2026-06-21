import { Navigate, Route, Routes } from 'react-router-dom'
import Home from './routes/Home'
import Meeting from './routes/Meeting'
import Live from './routes/Live'
import Settings from './routes/Settings'
import Onboarding from './routes/Onboarding'
import UpdateBanner from './components/UpdateBanner'

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/meeting/:id" element={<Meeting />} />
        <Route path="/live" element={<Live />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/onboarding" element={<Onboarding />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <UpdateBanner />
    </>
  )
}
