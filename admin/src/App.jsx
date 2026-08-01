import { FluentProvider } from '@fluentui/react-components';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { theme } from './theme.js';
import { UnsavedChangesProvider } from './contexts/UnsavedChangesContext.jsx';
import { EmbeddedProvider } from './contexts/EmbeddedContext.jsx';
import AdminLayout from './layouts/AdminLayout.jsx';
import ProfilePage from './pages/config/ProfilePage.jsx';
import InvoicingPage from './pages/config/InvoicingPage.jsx';
import AiConfigPage from './pages/system/AiConfigPage.jsx';
import McpAuthPage from './pages/system/McpAuthPage.jsx';
import CalendarSourcesPage from './pages/system/CalendarSourcesPage.jsx';
import TicketSourcesPage from './pages/system/TicketSourcesPage.jsx';
import NotebookGitPage from './pages/system/NotebookGitPage.jsx';
import AiProvidersPage from './pages/agents/AiProvidersPage.jsx';
import EvalSetPage from './pages/agents/EvalSetPage.jsx';
import RoutingPage from './pages/agents/RoutingPage.jsx';
import AgentCardsPage from './pages/agents/AgentCardsPage.jsx';
import AgentCardEditPage from './pages/agents/AgentCardEditPage.jsx';
import UsersPage from './pages/access/UsersPage.jsx';
import RolesPage from './pages/access/RolesPage.jsx';
import RoleEditPage from './pages/access/RoleEditPage.jsx';
import BackupPage from './pages/infra/BackupPage.jsx';
import LoggingPage from './pages/infra/LoggingPage.jsx';
import LogViewer from './pages/infra/LogViewer.jsx';

export default function App() {
  return (
    <FluentProvider theme={theme}>
      <BrowserRouter basename="/admin">
        <EmbeddedProvider>
        <UnsavedChangesProvider>
          <Routes>
            <Route element={<AdminLayout />}>
              <Route path="/" element={<Navigate to="/config/profile" replace />} />
              <Route path="/config/profile" element={<ProfilePage />} />
              <Route path="/config/invoicing" element={<InvoicingPage />} />
              <Route path="/system/ai" element={<AiConfigPage />} />
              <Route path="/system/mcp-auth" element={<McpAuthPage />} />
              <Route path="/system/calendars" element={<CalendarSourcesPage />} />
              <Route path="/system/ticket-sources" element={<TicketSourcesPage />} />
              <Route path="/system/notebook-git" element={<NotebookGitPage />} />
              <Route path="/agents/providers" element={<AiProvidersPage />} />
              <Route path="/agents/eval-set" element={<EvalSetPage />} />
              <Route path="/agents/routing" element={<RoutingPage />} />
              <Route path="/agents/cards" element={<AgentCardsPage />} />
              <Route path="/agents/cards/new" element={<AgentCardEditPage />} />
              <Route path="/agents/cards/:slug" element={<AgentCardEditPage />} />
              <Route path="/access/users" element={<UsersPage />} />
              <Route path="/access/roles" element={<RolesPage />} />
              <Route path="/access/roles/new" element={<RoleEditPage />} />
              <Route path="/access/roles/:id" element={<RoleEditPage />} />
              <Route path="/infra/backup" element={<BackupPage />} />
              <Route path="/infra/logging" element={<LoggingPage />} />

              <Route path="/reports/logs" element={<LogViewer />} />
            </Route>
          </Routes>
        </UnsavedChangesProvider>
        </EmbeddedProvider>
      </BrowserRouter>
    </FluentProvider>
  );
}
