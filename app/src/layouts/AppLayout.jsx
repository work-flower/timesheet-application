import { useState, useEffect } from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import useAppNavigate from '../hooks/useAppNavigate.js';
import { newTraceId, getTraceId } from '../api/traceId.js';
import { settingsApi, clientsApi, usersApi, meApi } from '../api/index.js';
import { useEmbedded } from '../contexts/EmbeddedContext.jsx';
import { useCurrentUser } from '../contexts/CurrentUserContext.jsx';
import {
  makeStyles,
  tokens,
  Text,
  Button,
  Tooltip,
  Spinner,
  MessageBar,
  MessageBarBody,
  Dialog,
  DialogTrigger,
  DialogSurface,
  DialogTitle,
  DialogBody,
  DialogContent,
  DialogActions,
} from '@fluentui/react-components';
import {
  BoardRegular,
  PeopleRegular,
  FolderRegular,
  CalendarClockRegular,
  ReceiptRegular,
  MoneyRegular,
  DocumentBulletListRegular,
  DatabaseRegular,
  ArrowImportRegular,
  TableRegular,
  WalletRegular,
  ArrowSwapRegular,
  NavigationRegular,
  QuestionCircleRegular,
  ChevronDownRegular,
  ChevronRightRegular,
  DataBarVerticalRegular,
  CalculatorRegular,
  DocumentTextRegular,
  LinkMultipleRegular,
  NoteRegular,
  DeleteRegular,
  NotebookRegular,
  GlobeRegular,
  TicketHorizontalRegular,
  ClipboardTaskListLtrRegular,
  PersonSwapRegular,
} from '@fluentui/react-icons';

const SIDEBAR_WIDTH = '220px';
const SIDEBAR_COLLAPSED = '49px';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    overflow: 'hidden',
  },
  topBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: '48px',
    paddingLeft: '16px',
    paddingRight: '16px',
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
    flexShrink: 0,
  },
  topBarLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  topBarTitle: {
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase400,
    color: tokens.colorBrandForeground1,
  },
  body: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
  },
  sidebar: {
    backgroundColor: '#F5F5F5',
    borderRight: `1px solid ${tokens.colorNeutralStroke2}`,
    paddingTop: '8px',
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    transitionProperty: 'width',
    transitionDuration: '150ms',
    transitionTimingFunction: 'ease',
    overflowX: 'hidden',
  },
  navItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '10px 16px',
    textDecoration: 'none',
    color: tokens.colorNeutralForeground1,
    fontSize: tokens.fontSizeBase300,
    borderLeft: '3px solid transparent',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    '&:hover': {
      backgroundColor: tokens.colorNeutralBackground1Hover,
    },
  },
  navItemActive: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '10px 16px',
    textDecoration: 'none',
    color: tokens.colorBrandForeground1,
    fontSize: tokens.fontSizeBase300,
    borderLeft: `3px solid ${tokens.colorBrandForeground1}`,
    backgroundColor: tokens.colorNeutralBackground1,
    fontWeight: tokens.fontWeightSemibold,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    '&:hover': {
      backgroundColor: tokens.colorNeutralBackground1Hover,
    },
  },
  navParent: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '10px 16px',
    color: tokens.colorNeutralForeground1,
    fontSize: tokens.fontSizeBase300,
    borderLeft: '3px solid transparent',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    '&:hover': {
      backgroundColor: tokens.colorNeutralBackground1Hover,
    },
  },
  navParentActive: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '10px 16px',
    color: tokens.colorBrandForeground1,
    fontSize: tokens.fontSizeBase300,
    borderLeft: `3px solid ${tokens.colorBrandForeground1}`,
    fontWeight: tokens.fontWeightSemibold,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    '&:hover': {
      backgroundColor: tokens.colorNeutralBackground1Hover,
    },
  },
  navChild: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '7px 16px 7px 32px',
    textDecoration: 'none',
    color: tokens.colorNeutralForeground1,
    fontSize: tokens.fontSizeBase200,
    borderLeft: '3px solid transparent',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    '&:hover': {
      backgroundColor: tokens.colorNeutralBackground1Hover,
    },
  },
  navChildActive: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '7px 16px 7px 32px',
    textDecoration: 'none',
    color: tokens.colorBrandForeground1,
    fontSize: tokens.fontSizeBase200,
    borderLeft: `3px solid ${tokens.colorBrandForeground1}`,
    backgroundColor: tokens.colorNeutralBackground1,
    fontWeight: tokens.fontWeightSemibold,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    '&:hover': {
      backgroundColor: tokens.colorNeutralBackground1Hover,
    },
  },
  chevron: {
    marginLeft: 'auto',
    fontSize: '12px',
    display: 'flex',
    alignItems: 'center',
  },
  navIcon: {
    flexShrink: 0,
    fontSize: '20px',
    display: 'flex',
    alignItems: 'center',
  },
  navChildIcon: {
    flexShrink: 0,
    fontSize: '16px',
    display: 'flex',
    alignItems: 'center',
  },
  content: {
    flex: 1,
    minWidth: 0,
    overflow: 'auto',
    backgroundColor: tokens.colorNeutralBackground2,
  },
});

const navItems = [
  {
    label: 'Dashboards',
    icon: <BoardRegular />,
    prefix: ['/', '/dashboards'],
    children: [
      { to: '/', label: 'Operations', icon: <BoardRegular />, exact: true },
      { to: '/dashboards/reconciliation', label: 'Reconciliation', icon: <ArrowSwapRegular /> },
      { to: '/dashboards/financial', label: 'Financial', icon: <DataBarVerticalRegular /> },
    ],
  },
  { to: '/daily-plans', label: 'Daily Plans', icon: <ClipboardTaskListLtrRegular /> },
  { to: '/clients', label: 'Clients', icon: <PeopleRegular /> },
  { to: '/projects', label: 'Projects', icon: <FolderRegular /> },
  { to: '/timesheets', label: 'Timesheets', icon: <CalendarClockRegular /> },
  { to: '/expenses', label: 'Expenses', icon: <ReceiptRegular /> },
  { to: '/invoices', label: 'Invoices', icon: <MoneyRegular /> },
  {
    label: 'Banking',
    icon: <WalletRegular />,
    prefix: ['/transactions', '/banking'],
    children: [
      { to: '/transactions', label: 'Transactions', icon: <ArrowSwapRegular /> },
      { to: '/banking/transaction-reconciliation', label: 'Reconciliation', icon: <LinkMultipleRegular /> },
    ],
  },
  {
    label: 'Data Management',
    icon: <DatabaseRegular />,
    prefix: ['/import-jobs', '/staged-transactions'],
    children: [
      { to: '/import-jobs', label: 'Import Transactions', icon: <ArrowImportRegular /> },
      { to: '/staged-transactions', label: 'Staged Transactions', icon: <TableRegular /> },
    ],
  },
  {
    label: 'Notebook',
    icon: <NotebookRegular />,
    prefix: '/notebooks',
    children: [
      { to: '/notebooks', label: 'All Notebooks', icon: <NoteRegular /> },
      { to: '/notebooks/bin', label: 'Recycle Bin', icon: <DeleteRegular /> },
    ],
  },
  {
    label: 'External',
    icon: <GlobeRegular />,
    prefix: '/tickets',
    children: [
      { to: '/tickets', label: 'Tickets', icon: <TicketHorizontalRegular /> },
    ],
  },
  {
    label: 'Reports',
    icon: <DocumentBulletListRegular />,
    prefix: '/reports',
    children: [
      { to: '/reports/timesheets', label: 'Timesheet', icon: <CalendarClockRegular /> },
      { to: '/reports/expenses', label: 'Expenses', icon: <ReceiptRegular /> },
      { to: '/reports/income-expense', label: 'Income & Expense', icon: <DocumentTextRegular /> },
      { to: '/reports/vat', label: 'VAT', icon: <CalculatorRegular /> },
    ],
  },
];

// Table each nav route needs read access to (multiuser authorisation).
// Unlisted routes (e.g. '/', '/help') are always visible; gating is cosmetic —
// the server pipeline enforces regardless.
const NAV_TABLES = {
  '/dashboards/reconciliation': 'transactions',
  '/dashboards/financial': 'invoices',
  '/daily-plans': 'dailyPlans',
  '/clients': 'clients',
  '/projects': 'projects',
  '/timesheets': 'timesheets',
  '/expenses': 'expenses',
  '/invoices': 'invoices',
  '/transactions': 'transactions',
  '/banking/transaction-reconciliation': 'transactions',
  '/import-jobs': 'importJobs',
  '/staged-transactions': 'stagedTransactions',
  '/notebooks': 'notebooks',
  '/notebooks/bin': 'notebooks',
  '/tickets': 'tickets',
  '/reports/timesheets': 'timesheets',
  '/reports/expenses': 'expenses',
  '/reports/income-expense': 'invoices',
  '/reports/vat': 'invoices',
};

// Impersonation picker — lists users; the server enforces the guard rails
// (self, impersonation-capable targets), so their 4xx messages surface here.
function ImpersonateDialog({ open, onClose, selfEmail }) {
  const [users, setUsers] = useState(null);
  const [error, setError] = useState(null);
  const [starting, setStarting] = useState(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setUsers(null);
    usersApi.getAll()
      .then((data) => setUsers(data.filter((u) => u.email !== selfEmail)))
      .catch((err) => setError(err.message));
  }, [open, selfEmail]);

  const start = (email) => {
    setStarting(email);
    setError(null);
    meApi.impersonate(email)
      .then(() => window.location.reload())
      .catch((err) => {
        setError(err.message);
        setStarting(null);
      });
  };

  return (
    <Dialog open={open} onOpenChange={(e, data) => { if (!data.open) onClose(); }}>
      <DialogSurface>
        <DialogBody>
          <DialogTitle>Impersonate a user</DialogTitle>
          <DialogContent>
            <Text size={200} style={{ display: 'block', marginBottom: 12, color: tokens.colorNeutralForeground2 }}>
              You will see and act in the app exactly as the selected user. Writes are
              recorded against them with you as the impersonator.
            </Text>
            {error && (
              <MessageBar intent="error" style={{ marginBottom: 8 }}>
                <MessageBarBody>{error}</MessageBarBody>
              </MessageBar>
            )}
            {users === null && !error && <Spinner size="tiny" label="Loading users..." />}
            {users?.length === 0 && <Text size={200}>No other users found.</Text>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {users?.map((user) => (
                <Button
                  key={user._id}
                  appearance="subtle"
                  icon={<PersonSwapRegular />}
                  disabled={!!starting}
                  onClick={() => start(user.email)}
                  style={{ justifyContent: 'flex-start' }}
                >
                  {starting === user.email ? 'Starting...' : `${user.email} — ${user.status}${user.roleNames?.length ? ` (${user.roleNames.join(', ')})` : ''}`}
                </Button>
              ))}
            </div>
          </DialogContent>
          <DialogActions>
            <DialogTrigger disableButtonEnhancement>
              <Button appearance="secondary">Cancel</Button>
            </DialogTrigger>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}

export default function AppLayout() {
  const styles = useStyles();
  const location = useLocation();
  const { navigate } = useAppNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [appTitle, setAppTitle] = useState('');
  const [impersonateOpen, setImpersonateOpen] = useState(false);

  const isEmbedded = useEmbedded();
  const { canRead, canAction, enabled, me } = useCurrentUser();
  // `enabled &&` matters: canAction returns true when authorisation is off,
  // but the endpoints are inert then — hide the button in legacy mode
  const canImpersonate = enabled && canAction('users', 'impersonate');

  const navVisible = (item) => !NAV_TABLES[item.to] || canRead(NAV_TABLES[item.to]);
  const visibleNavItems = navItems
    .map((item) =>
      item.children
        ? { ...item, children: item.children.filter(navVisible) }
        : item
    )
    .filter((item) => (item.children ? item.children.length > 0 : navVisible(item)));

  useEffect(() => {
    if (isEmbedded) return;
    settingsApi.get().then((data) => {
      if (data?.businessClientId) {
        return clientsApi.getById(data.businessClientId).then((client) => {
          setAppTitle(client?.companyName || 'Timesheet Manager');
        });
      }
      setAppTitle('Timesheet Manager');
    }).catch(() => setAppTitle('Timesheet Manager'));
  }, [isEmbedded]);

  // Generate a new traceId on every navigation and log it as a pageview
  useEffect(() => {
    if (isEmbedded) return;
    newTraceId();
    fetch('/api/logs/pageview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Trace-Id': getTraceId() },
      body: JSON.stringify({ path: location.pathname, method: 'GET', traceId: getTraceId() }),
    }).catch(() => {});
  }, [location.pathname, isEmbedded]);

  const isChildRouteActive = (prefix) => {
    if (Array.isArray(prefix)) return prefix.some((p) => {
      if (p === '/') return location.pathname === '/';
      return location.pathname.startsWith(p);
    });
    if (prefix === '/') return location.pathname === '/';
    return location.pathname.startsWith(prefix);
  };

  const [dashboardsExpanded, setDashboardsExpanded] = useState(
    () => isChildRouteActive(['/', '/dashboards']),
  );
  const [reportsExpanded, setReportsExpanded] = useState(
    () => isChildRouteActive('/reports'),
  );
  const [bankingExpanded, setBankingExpanded] = useState(
    () => isChildRouteActive(['/transactions', '/banking']),
  );
  const [dataExpanded, setDataExpanded] = useState(
    () => isChildRouteActive(['/import-jobs', '/staged-transactions']),
  );
  const [notebookExpanded, setNotebookExpanded] = useState(
    () => isChildRouteActive('/notebooks'),
  );
  const [externalExpanded, setExternalExpanded] = useState(
    () => isChildRouteActive('/tickets'),
  );

  if (isEmbedded) return <Outlet />;

  const expandState = {
    Dashboards: [dashboardsExpanded, setDashboardsExpanded],
    Reports: [reportsExpanded, setReportsExpanded],
    Banking: [bankingExpanded, setBankingExpanded],
    'Data Management': [dataExpanded, setDataExpanded],
    Notebook: [notebookExpanded, setNotebookExpanded],
    External: [externalExpanded, setExternalExpanded],
  };

  function isActive(item) {
    if (item.exact) return location.pathname === item.to;
    return location.pathname.startsWith(item.to);
  }

  function renderNavLink(item) {
    const link = (
      <NavLink
        key={item.to}
        to={item.to}
        className={isActive(item) ? styles.navItemActive : styles.navItem}
        onClick={(e) => { e.preventDefault(); navigate(item.to); }}
      >
        <span className={styles.navIcon}>{item.icon}</span>
        {!collapsed && <span>{item.label}</span>}
      </NavLink>
    );

    return collapsed ? (
      <Tooltip key={item.to} content={item.label} relationship="label" positioning="after">
        {link}
      </Tooltip>
    ) : link;
  }

  function renderParentItem(item) {
    const parentActive = isChildRouteActive(item.prefix);

    if (collapsed) {
      // When collapsed, render children as separate tooltip items
      return item.children.map((child) => {
        const childActive = isActive(child);
        const link = (
          <NavLink
            key={child.to}
            to={child.to}
            className={childActive ? styles.navItemActive : styles.navItem}
            onClick={(e) => { e.preventDefault(); navigate(child.to); }}
          >
            <span className={styles.navIcon}>{child.icon}</span>
          </NavLink>
        );
        return (
          <Tooltip key={child.to} content={`${item.label}: ${child.label}`} relationship="label" positioning="after">
            {link}
          </Tooltip>
        );
      });
    }

    const [isExpanded, setIsExpanded] = expandState[item.label] || [false, () => {}];
    const expanded = isExpanded || parentActive;

    return (
      <div key={item.label}>
        <div
          className={parentActive ? styles.navParentActive : styles.navParent}
          onClick={() => setIsExpanded((v) => !v)}
        >
          <span className={styles.navIcon}>{item.icon}</span>
          <span>{item.label}</span>
          <span className={styles.chevron}>
            {expanded ? <ChevronDownRegular /> : <ChevronRightRegular />}
          </span>
        </div>
        {expanded && item.children.map((child) => {
          const childActive = isActive(child);
          return (
            <NavLink
              key={child.to}
              to={child.to}
              className={childActive ? styles.navChildActive : styles.navChild}
              onClick={(e) => { e.preventDefault(); navigate(child.to); }}
            >
              <span className={styles.navChildIcon}>{child.icon}</span>
              <span>{child.label}</span>
            </NavLink>
          );
        })}
      </div>
    );
  }

  return (
    <div className={styles.root}>
      <div className={styles.topBar}>
        <div className={styles.topBarLeft}>
          <Button
            appearance="subtle"
            icon={<NavigationRegular />}
            onClick={() => setCollapsed((c) => !c)}
            size="small"
          />
          <Text className={styles.topBarTitle}>{appTitle}</Text>
        </div>
        <div style={{ display: 'flex', gap: '4px' }}>
          {canImpersonate && (
            <Tooltip content="View the app as another user" relationship="description">
              <Button
                appearance="subtle"
                icon={<PersonSwapRegular />}
                onClick={() => setImpersonateOpen(true)}
              >
                Impersonate
              </Button>
            </Tooltip>
          )}
          <Button appearance="subtle" icon={<QuestionCircleRegular />} onClick={() => navigate('/help')}>
            Help
          </Button>
        </div>
      </div>
      {canImpersonate && (
        <ImpersonateDialog
          open={impersonateOpen}
          onClose={() => setImpersonateOpen(false)}
          selfEmail={me?.email}
        />
      )}
      <div className={styles.body}>
        <nav
          className={styles.sidebar}
          style={{ width: collapsed ? SIDEBAR_COLLAPSED : SIDEBAR_WIDTH }}
        >
          {visibleNavItems.map((item) =>
            item.children ? renderParentItem(item) : renderNavLink(item)
          )}
        </nav>
        <main className={styles.content}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
