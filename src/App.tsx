import '@/lib/sentry';
import { lazy, Suspense } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { ActionsProvider } from '@/context/ActionsContext';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ErrorBusProvider } from '@/components/ErrorBus';
import { Layout } from '@/components/Layout';
import DashboardOverview from '@/pages/DashboardOverview';
import AdminPage from '@/pages/AdminPage';
import TerminverwaltungPage from '@/pages/TerminverwaltungPage';
import TerminverwaltungDetailPage from '@/pages/TerminverwaltungDetailPage';
import KundenverwaltungPage from '@/pages/KundenverwaltungPage';
import KundenverwaltungDetailPage from '@/pages/KundenverwaltungDetailPage';
import MonteurdatenPage from '@/pages/MonteurdatenPage';
import MonteurdatenDetailPage from '@/pages/MonteurdatenDetailPage';
import PublicFormTerminverwaltung from '@/pages/public/PublicForm_Terminverwaltung';
import PublicFormKundenverwaltung from '@/pages/public/PublicForm_Kundenverwaltung';
import PublicFormMonteurdaten from '@/pages/public/PublicForm_Monteurdaten';
// <public:imports>
// </public:imports>
// <custom:imports>
// </custom:imports>

export default function App() {
  return (
    <ErrorBoundary>
      <ErrorBusProvider>
        <HashRouter>
          <ActionsProvider>
            <Routes>
              <Route path="public/6a438b105067be8e61ede88a" element={<PublicFormTerminverwaltung />} />
              <Route path="public/6a438b0adf0702ab92fe4ca1" element={<PublicFormKundenverwaltung />} />
              <Route path="public/6a438b0f0996cd2d134c788a" element={<PublicFormMonteurdaten />} />
              {/* <public:routes> */}
              {/* </public:routes> */}
              <Route element={<Layout />}>
                <Route index element={<DashboardOverview />} />
                <Route path="terminverwaltung" element={<TerminverwaltungPage />} />
                <Route path="terminverwaltung/:id" element={<TerminverwaltungDetailPage />} />
                <Route path="kundenverwaltung" element={<KundenverwaltungPage />} />
                <Route path="kundenverwaltung/:id" element={<KundenverwaltungDetailPage />} />
                <Route path="monteurdaten" element={<MonteurdatenPage />} />
                <Route path="monteurdaten/:id" element={<MonteurdatenDetailPage />} />
                <Route path="admin" element={<AdminPage />} />
                {/* <custom:routes> */}
                {/* </custom:routes> */}
              </Route>
            </Routes>
          </ActionsProvider>
        </HashRouter>
      </ErrorBusProvider>
    </ErrorBoundary>
  );
}
