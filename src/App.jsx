import { FluentProvider } from '@fluentui/react-components';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { theme } from './theme.js';
import { UnsavedChangesProvider } from './contexts/UnsavedChangesContext.jsx';
import AppLayout from './layouts/AppLayout.jsx';
import Dashboard from './pages/Dashboard.jsx';
import ClientList from './pages/clients/ClientList.jsx';
import ClientForm from './pages/clients/ClientForm.jsx';
import ProjectList from './pages/projects/ProjectList.jsx';
import ProjectForm from './pages/projects/ProjectForm.jsx';
import TimesheetList from './pages/timesheets/TimesheetList.jsx';
import TimesheetForm from './pages/timesheets/TimesheetForm.jsx';
import ExpenseList from './pages/expenses/ExpenseList.jsx';
import ExpenseForm from './pages/expenses/ExpenseForm.jsx';
import InvoiceList from './pages/invoices/InvoiceList.jsx';
import InvoiceForm from './pages/invoices/InvoiceForm.jsx';
import Settings from './pages/settings/Settings.jsx';
import ReportForm from './pages/reports/ReportForm.jsx';

export default function App() {
  return (
    <FluentProvider theme={theme}>
      <BrowserRouter>
        <UnsavedChangesProvider>
          <Routes>
            <Route element={<AppLayout />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/clients" element={<ClientList />} />
              <Route path="/clients/new" element={<ClientForm />} />
              <Route path="/clients/:id" element={<ClientForm />} />
              <Route path="/projects" element={<ProjectList />} />
              <Route path="/projects/new" element={<ProjectForm />} />
              <Route path="/projects/:id" element={<ProjectForm />} />
              <Route path="/timesheets" element={<TimesheetList />} />
              <Route path="/timesheets/new" element={<TimesheetForm />} />
              <Route path="/timesheets/:id" element={<TimesheetForm />} />
              <Route path="/expenses" element={<ExpenseList />} />
              <Route path="/expenses/new" element={<ExpenseForm />} />
              <Route path="/expenses/:id" element={<ExpenseForm />} />
              <Route path="/invoices" element={<InvoiceList />} />
              <Route path="/invoices/new" element={<InvoiceForm />} />
              <Route path="/invoices/:id" element={<InvoiceForm />} />
              <Route path="/reports" element={<ReportForm />} />
              <Route path="/settings" element={<Settings />} />
            </Route>
          </Routes>
        </UnsavedChangesProvider>
      </BrowserRouter>
    </FluentProvider>
  );
}
