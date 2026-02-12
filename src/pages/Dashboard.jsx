import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  makeStyles,
  tokens,
  Text,
  Card,
  CardHeader,
  Spinner,
} from '@fluentui/react-components';
import {
  ClockRegular,
  CalendarMonthRegular,
  FolderRegular,
  MoneyRegular,
  ReceiptRegular,
} from '@fluentui/react-icons';
import { timesheetsApi, projectsApi, expensesApi } from '../api/index.js';
import EntityGrid from '../components/EntityGrid.jsx';

const useStyles = makeStyles({
  page: {
    padding: '24px',
  },
  title: {
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase600,
    display: 'block',
    marginBottom: '24px',
  },
  cards: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '16px',
    marginBottom: '32px',
  },
  card: {
    padding: '20px',
  },
  cardIcon: {
    fontSize: '24px',
    color: tokens.colorBrandForeground1,
    marginBottom: '8px',
  },
  cardValue: {
    fontWeight: tokens.fontWeightBold,
    fontSize: tokens.fontSizeBase600,
    display: 'block',
  },
  cardLabel: {
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
  },
  sectionTitle: {
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase400,
    display: 'block',
    marginBottom: '12px',
  },
});

function getWeekRange() {
  const now = new Date();
  const day = now.getDay() || 7;
  const mon = new Date(now);
  mon.setDate(now.getDate() - day + 1);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  return {
    startDate: mon.toISOString().split('T')[0],
    endDate: sun.toISOString().split('T')[0],
  };
}

function getMonthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return {
    startDate: start.toISOString().split('T')[0],
    endDate: end.toISOString().split('T')[0],
  };
}

const recentColumns = [
  { key: 'date', label: 'Date' },
  { key: 'clientName', label: 'Client' },
  { key: 'projectName', label: 'Project' },
  { key: 'hours', label: 'Hours' },
  {
    key: 'amount',
    label: 'Amount',
    render: (item) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(item.amount || 0),
  },
];

export default function Dashboard() {
  const styles = useStyles();
  const navigate = useNavigate();
  const [weekEntries, setWeekEntries] = useState([]);
  const [monthEntries, setMonthEntries] = useState([]);
  const [activeProjects, setActiveProjects] = useState(0);
  const [recentEntries, setRecentEntries] = useState([]);
  const [monthExpenses, setMonthExpenses] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      try {
        const [week, month, projects, recent, monthExp] = await Promise.all([
          timesheetsApi.getAll(getWeekRange()),
          timesheetsApi.getAll(getMonthRange()),
          projectsApi.getAll(),
          timesheetsApi.getAll({}),
          expensesApi.getAll(getMonthRange()),
        ]);
        setWeekEntries(week);
        setMonthEntries(month);
        setActiveProjects(projects.filter((p) => p.status === 'active').length);
        setRecentEntries(recent.slice(0, 10));
        setMonthExpenses(monthExp);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  const weekHours = weekEntries.reduce((s, e) => s + (e.hours || 0), 0);
  const monthHours = monthEntries.reduce((s, e) => s + (e.hours || 0), 0);
  const monthEarnings = monthEntries.reduce((s, e) => s + (e.amount || 0), 0);
  const billableExpenses = monthExpenses.filter((e) => e.billable).reduce((s, e) => s + (e.amount || 0), 0);
  const totalExpenses = monthExpenses.reduce((s, e) => s + (e.amount || 0), 0);
  const fmt = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });

  if (loading) return <div style={{ padding: 48, textAlign: 'center' }}><Spinner label="Loading dashboard..." /></div>;

  return (
    <div className={styles.page}>
      <Text className={styles.title}>Dashboard</Text>

      <div className={styles.cards}>
        <Card className={styles.card}>
          <div className={styles.cardIcon}><ClockRegular /></div>
          <Text className={styles.cardValue}>{weekHours}</Text>
          <Text className={styles.cardLabel}>Hours This Week</Text>
        </Card>
        <Card className={styles.card}>
          <div className={styles.cardIcon}><CalendarMonthRegular /></div>
          <Text className={styles.cardValue}>{monthHours}</Text>
          <Text className={styles.cardLabel}>Hours This Month</Text>
        </Card>
        <Card className={styles.card}>
          <div className={styles.cardIcon}><FolderRegular /></div>
          <Text className={styles.cardValue}>{activeProjects}</Text>
          <Text className={styles.cardLabel}>Active Projects</Text>
        </Card>
        <Card className={styles.card}>
          <div className={styles.cardIcon}><MoneyRegular /></div>
          <Text className={styles.cardValue}>{fmt.format(monthEarnings)}</Text>
          <Text className={styles.cardLabel}>Earnings This Month</Text>
        </Card>
        <Card className={styles.card}>
          <div className={styles.cardIcon}><ReceiptRegular /></div>
          <Text className={styles.cardValue}>{fmt.format(billableExpenses)}</Text>
          <Text className={styles.cardLabel}>Expenses This Month</Text>
          {totalExpenses > 0 && (
            <Text style={{ fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 }}>
              Total: {fmt.format(totalExpenses)}
            </Text>
          )}
        </Card>
      </div>

      <Text className={styles.sectionTitle}>Recent Timesheet Entries</Text>
      <EntityGrid
        columns={recentColumns}
        items={recentEntries}
        emptyMessage="No timesheet entries yet. Start logging your work!"
        onRowClick={(item) => navigate(`/timesheets/${item._id}`)}
      />
    </div>
  );
}
