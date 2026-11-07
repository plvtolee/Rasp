import { Navigate, Route, Routes } from 'react-router-dom'
import NavRail from './components/NavRail'
import Dashboard from './pages/Dashboard'
import NewProject from './pages/NewProject'
import ExportsPage from './pages/ExportsPage'
import SettingsPage from './pages/SettingsPage'
import EditorPage from './editor/EditorPage'

export default function App() {
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <NavRail />
      <div className="min-w-0 flex-1">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/new" element={<NewProject />} />
          <Route path="/editor/:id" element={<EditorPage />} />
          <Route path="/exports" element={<ExportsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </div>
  )
}