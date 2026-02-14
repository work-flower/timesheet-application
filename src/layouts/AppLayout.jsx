import { useState } from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { useUnsavedChanges } from '../contexts/UnsavedChangesContext.jsx';
import {
  makeStyles,
  tokens,
  Text,
  Button,
  Tooltip,
} from '@fluentui/react-components';
import {
  BoardRegular,
  PeopleRegular,
  FolderRegular,
  CalendarClockRegular,
  ReceiptRegular,
  MoneyRegular,
  DocumentBulletListRegular,
  SettingsRegular,
  NavigationRegular,
  ChevronDownRegular,
  ChevronRightRegular,
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
  { to: '/', label: 'Dashboard', icon: <BoardRegular />, exact: true },
  { to: '/clients', label: 'Clients', icon: <PeopleRegular /> },
  { to: '/projects', label: 'Projects', icon: <FolderRegular /> },
  { to: '/timesheets', label: 'Timesheets', icon: <CalendarClockRegular /> },
  { to: '/expenses', label: 'Expenses', icon: <ReceiptRegular /> },
  { to: '/invoices', label: 'Invoices', icon: <MoneyRegular /> },
  {
    label: 'Reports',
    icon: <DocumentBulletListRegular />,
    prefix: '/reports',
    children: [
      { to: '/reports/timesheets', label: 'Timesheet', icon: <CalendarClockRegular /> },
      { to: '/reports/expenses', label: 'Expenses', icon: <ReceiptRegular /> },
    ],
  },
];

export default function AppLayout() {
  const styles = useStyles();
  const location = useLocation();
  const { guardedNavigate } = useUnsavedChanges();
  const [collapsed, setCollapsed] = useState(false);

  const isChildRouteActive = (prefix) => location.pathname.startsWith(prefix);

  const [reportsExpanded, setReportsExpanded] = useState(
    () => isChildRouteActive('/reports'),
  );

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
        onClick={(e) => { e.preventDefault(); guardedNavigate(item.to); }}
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
        const childActive = location.pathname.startsWith(child.to);
        const link = (
          <NavLink
            key={child.to}
            to={child.to}
            className={childActive ? styles.navItemActive : styles.navItem}
            onClick={(e) => { e.preventDefault(); guardedNavigate(child.to); }}
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

    const expanded = reportsExpanded || parentActive;

    return (
      <div key={item.prefix}>
        <div
          className={parentActive ? styles.navParentActive : styles.navParent}
          onClick={() => setReportsExpanded((v) => !v)}
        >
          <span className={styles.navIcon}>{item.icon}</span>
          <span>{item.label}</span>
          <span className={styles.chevron}>
            {expanded ? <ChevronDownRegular /> : <ChevronRightRegular />}
          </span>
        </div>
        {expanded && item.children.map((child) => {
          const childActive = location.pathname.startsWith(child.to);
          return (
            <NavLink
              key={child.to}
              to={child.to}
              className={childActive ? styles.navChildActive : styles.navChild}
              onClick={(e) => { e.preventDefault(); guardedNavigate(child.to); }}
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
          <Text className={styles.topBarTitle}>Timesheet Manager</Text>
        </div>
        <Button appearance="subtle" icon={<SettingsRegular />} onClick={() => guardedNavigate('/settings')}>
          Settings
        </Button>
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
