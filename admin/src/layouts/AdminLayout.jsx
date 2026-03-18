import { useState, useEffect } from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import useAppNavigate from '../hooks/useAppNavigate.js';
import { newTraceId, getTraceId } from '../api/traceId.js';
import { settingsApi, clientsApi } from '../api/index.js';
import { useEmbedded } from '../contexts/EmbeddedContext.jsx';
import {
  makeStyles,
  tokens,
  Text,
  Button,
  Tooltip,
} from '@fluentui/react-components';
import {
  PersonRegular,
  MoneyRegular,
  BrainCircuitRegular,
  KeyRegular,
  CalendarMonthRegular,
  CloudArrowUpRegular,
  DocumentBulletListRegular,
  TextBulletListSquareRegular,
  NavigationRegular,
  QuestionCircleRegular,
  ChevronDownRegular,
  ChevronRightRegular,
  SettingsRegular,
  ShieldKeyholeRegular,
  ServerRegular,
  DataBarVerticalRegular,
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
    label: 'Business Config',
    icon: <SettingsRegular />,
    prefix: '/config',
    children: [
      { to: '/config/profile', label: 'Profile', icon: <PersonRegular /> },
      { to: '/config/invoicing', label: 'Invoicing', icon: <MoneyRegular /> },
    ],
  },
  {
    label: 'System Config',
    icon: <ShieldKeyholeRegular />,
    prefix: '/system',
    children: [
      { to: '/system/ai', label: 'AI', icon: <BrainCircuitRegular /> },
      { to: '/system/mcp-auth', label: 'M2M API Auth', icon: <KeyRegular /> },
      { to: '/system/calendars', label: 'Calendars', icon: <CalendarMonthRegular /> },
    ],
  },
  {
    label: 'Infrastructure',
    icon: <ServerRegular />,
    prefix: '/infra',
    children: [
      { to: '/infra/backup', label: 'Backup', icon: <CloudArrowUpRegular /> },
      { to: '/infra/logging', label: 'Logging', icon: <DocumentBulletListRegular /> },
    ],
  },
  {
    label: 'Admin Reports',
    icon: <DataBarVerticalRegular />,
    prefix: '/reports',
    children: [
      { to: '/reports/logs', label: 'Application Logs', icon: <TextBulletListSquareRegular /> },
    ],
  },
];

export default function AdminLayout() {
  const styles = useStyles();
  const location = useLocation();
  const { navigate } = useAppNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [appTitle, setAppTitle] = useState('');

  const isEmbedded = useEmbedded();

  useEffect(() => {
    if (isEmbedded) return;
    settingsApi.get().then((data) => {
      if (data?.businessClientId) {
        return clientsApi.getById(data.businessClientId).then((client) => {
          setAppTitle(`Admin Console for ${client?.companyName || 'Timesheet Manager'}`);
        });
      }
      setAppTitle('Admin Console for Timesheet Manager');
    }).catch(() => setAppTitle('Admin Console for Timesheet Manager'));
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
    if (Array.isArray(prefix)) return prefix.some((p) => location.pathname.startsWith(p));
    return location.pathname.startsWith(prefix);
  };

  const [configExpanded, setConfigExpanded] = useState(
    () => isChildRouteActive('/config'),
  );
  const [systemExpanded, setSystemExpanded] = useState(
    () => isChildRouteActive('/system'),
  );
  const [infraExpanded, setInfraExpanded] = useState(
    () => isChildRouteActive('/infra'),
  );
  const [reportsExpanded, setReportsExpanded] = useState(
    () => isChildRouteActive('/reports'),
  );

  if (isEmbedded) return <Outlet />;

  const expandState = {
    'Business Config': [configExpanded, setConfigExpanded],
    'System Config': [systemExpanded, setSystemExpanded],
    'Infrastructure': [infraExpanded, setInfraExpanded],
    'Admin Reports': [reportsExpanded, setReportsExpanded],
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
          <Button
            appearance="subtle"
            icon={<QuestionCircleRegular />}
            as="a"
            href="/help"
            target="_blank"
          >
            Help
          </Button>
        </div>
      </div>
      <div className={styles.body}>
        <nav
          className={styles.sidebar}
          style={{ width: collapsed ? SIDEBAR_COLLAPSED : SIDEBAR_WIDTH }}
        >
          {navItems.map((item) =>
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
