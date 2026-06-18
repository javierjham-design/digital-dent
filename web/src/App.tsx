import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Landing } from '@/pages/Landing'
import { CampaignLanding } from '@/pages/CampaignLanding'
import { CAMPAIGNS } from '@/landings/registry'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        {/* Landing pages de campaña (clariva.cl/<slug>). Se agregan en registry.ts */}
        {CAMPAIGNS.map((c) => (
          <Route key={c.slug} path={`/${c.slug}`} element={<CampaignLanding campaign={c} />} />
        ))}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
