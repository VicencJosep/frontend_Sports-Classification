import { createBrowserRouter } from 'react-router'

import { DashboardPage } from '@/pages/Dashboard/DashboardPage'
import { MatchPage } from '@/pages/Match/MatchPage'
import { MatchesPage } from '@/pages/Matches/MatchesPage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { RouteErrorPage } from '@/pages/RouteErrorPage'
import { SettingsPage } from '@/pages/Settings/SettingsPage'
import { UploadPage } from '@/pages/Upload/UploadPage'

import { AppShell } from './shell/AppShell'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    errorElement: <RouteErrorPage />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'matches', element: <MatchesPage /> },
      { path: 'matches/new', element: <UploadPage /> },
      { path: 'matches/:matchId', element: <MatchPage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])
