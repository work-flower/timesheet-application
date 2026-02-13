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
  navIcon: {
    flexShrink: 0,
    fontSize: '20px',
    display: 'flex',
    alignItems: 'center',
  },
  content: {
    flex: 1,
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
  { to: '/reports', label: 'Reports', icon: <DocumentBulletListRegular /> },
];

export default function AppLayout() {
  const styles = useStyles();
  const location = useLocation();
  const { guardedNavigate } = useUnsavedChanges();
  const [collapsed, setCollapsed] = useState(false);

  function isActive(item) {
    if (item.exact) return location.pathname === item.to;
    return location.pathname.startsWith(item.to);
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
          {navItems.map((item) => {
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
          })}
        </nav>
        <main className={styles.content}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
