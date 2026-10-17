import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, RequireRole } from './auth'
import AuditLog from './pages/AuditLog'
import Dashboard from './pages/Dashboard'
import Decision from './pages/Decision'
import Record from './pages/Record'
import Review from './pages/Review'
import Rules from './pages/Rules'
import SignIn from './pages/SignIn'
import Upload from './pages/Upload'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/signin" element={<SignIn />} />
          <Route path="/" element={<RequireRole role="analyst"><Dashboard /></RequireRole>} />
          <Route path="/households/:id" element={<RequireRole role="analyst"><Review /></RequireRole>} />
          <Route path="/households/:id/decision" element={<RequireRole role="analyst"><Decision /></RequireRole>} />
          <Route path="/households/:id/record" element={<RequireRole role="analyst"><Record /></RequireRole>} />
          <Route path="/audit" element={<RequireRole role="analyst"><AuditLog /></RequireRole>} />
          <Route path="/rules" element={<RequireRole role="analyst"><Rules /></RequireRole>} />
          <Route path="/upload" element={<RequireRole role="property_manager"><Upload /></RequireRole>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
