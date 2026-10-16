import { RouterProvider } from 'react-router'

import { ServicesProvider } from './providers/ServicesProvider'
import { SettingsProvider } from './providers/SettingsProvider'
import { router } from './router'

export function App() {
  return (
    <ServicesProvider>
      <SettingsProvider>
        <RouterProvider router={router} />
      </SettingsProvider>
    </ServicesProvider>
  )
}
