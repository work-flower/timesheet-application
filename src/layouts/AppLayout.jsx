import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { useUnsavedChanges } from '../contexts/UnsavedChangesContext.jsx';
import {
  makeStyles,
  tokens,
  Text,
  Button,
  Divider,
} from '@fluentui/react-components';
import {
  BoardRegular,
  PeopleRegular,
  FolderRegular,
  CalendarClockRegular,
  ReceiptRegular,
  DocumentBulletListRegular,
  SettingsRegular,
} from '@fluentui/react-icons';

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
    width: '220px',
    backgroundColor: '#F5F5F5',
    borderRight: `1px solid ${tokens.colorNeutralStroke2}`,
    paddingTop: '8px',
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
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
    '&:hover': {
      backgroundColor: tokens.colorNeutralBackground1Hover,
    },
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
  { to: '/reports', label: 'Reports', icon: <DocumentBulletListRegular /> },
];

export default function AppLayout() {
  const styles = useStyles();
  const location = useLocation();
  const { guardedNavigate } = useUnsavedChanges();

  function isActive(item) {
    if (item.exact) return location.pathname === item.to;
    return location.pathname.startsWith(item.to);
  }

  return (
    <div className={styles.root}>
      <div className={styles.topBar}>
        <Text className={styles.topBarTitle}>Timesheet Manager</Text>
        <Button appearance="subtle" icon={<SettingsRegular />} onClick={() => guardedNavigate('/settings')}>
          Settings
        </Button>
      </div>
      <div className={styles.body}>
        <nav className={styles.sidebar}>
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={isActive(item) ? styles.navItemActive : styles.navItem}
              onClick={(e) => { e.preventDefault(); guardedNavigate(item.to); }}
            >
              {item.icon}
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <main className={styles.content}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
