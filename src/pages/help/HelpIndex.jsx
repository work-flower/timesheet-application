import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  makeStyles,
  tokens,
  Text,
  Card,
  Badge,
  Input,
  Breadcrumb,
  BreadcrumbItem,
} from '@fluentui/react-components';
import { SearchRegular, DocumentTextRegular, ArrowRightRegular } from '@fluentui/react-icons';
import topics from '../../help/topics.js';

const useStyles = makeStyles({
  page: {
    padding: '24px',
  },
  breadcrumb: {
    marginBottom: '8px',
  },
  title: {
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase600,
    display: 'block',
    marginBottom: '20px',
  },
  searchBox: {
    maxWidth: '400px',
    marginBottom: '24px',
  },
  cards: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '16px',
  },
  card: {
    width: '300px',
    padding: '0',
    cursor: 'pointer',
    overflow: 'hidden',
    transitionProperty: 'box-shadow, transform',
    transitionDuration: '200ms',
    transitionTimingFunction: 'ease',
    '&:hover': {
      boxShadow: tokens.shadow16,
      transform: 'translateY(-2px)',
    },
  },
  cardBanner: {
    width: '100%',
    height: '120px',
    objectFit: 'cover',
    display: 'block',
  },
  cardAccent: {
    height: '4px',
    backgroundColor: tokens.colorBrandBackground,
  },
  cardBody: {
    padding: '20px',
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginBottom: '10px',
  },
  cardIcon: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '36px',
    height: '36px',
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorBrandBackground2,
    color: tokens.colorBrandForeground2,
    fontSize: '18px',
    flexShrink: 0,
  },
  cardTitle: {
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase400,
  },
  cardDescription: {
    color: tokens.colorNeutralForeground2,
    fontSize: tokens.fontSizeBase300,
    display: 'block',
    marginBottom: '14px',
    lineHeight: tokens.lineHeightBase300,
  },
  cardFooter: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tags: {
    display: 'flex',
    gap: '6px',
    flexWrap: 'wrap',
  },
  arrowIcon: {
    color: tokens.colorBrandForeground1,
    fontSize: '16px',
    display: 'flex',
    alignItems: 'center',
  },
  empty: {
    color: tokens.colorNeutralForeground3,
    marginTop: '32px',
    textAlign: 'center',
    display: 'block',
  },
});

export default function HelpIndex() {
  const styles = useStyles();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return topics;
    const q = search.toLowerCase();
    return topics.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.tags.some((tag) => tag.toLowerCase().includes(q))
    );
  }, [search]);

  return (
    <div className={styles.page}>
      <Breadcrumb className={styles.breadcrumb}>
        <BreadcrumbItem>Help</BreadcrumbItem>
      </Breadcrumb>
      <Text className={styles.title}>Help & Documentation</Text>
      <Input
        className={styles.searchBox}
        contentBefore={<SearchRegular />}
        placeholder="Search help topics..."
        value={search}
        onChange={(_, data) => setSearch(data.value)}
      />
      <div className={styles.cards}>
        {filtered.map((topic) => (
          <Card
            key={topic.id}
            className={styles.card}
            onClick={() => navigate(`/help/${topic.id}`)}
          >
            {topic.banner
              ? <img src={topic.banner} alt="" className={styles.cardBanner} />
              : <div className={styles.cardAccent} />
            }
            <div className={styles.cardBody}>
              <div className={styles.cardHeader}>
                <span className={styles.cardIcon}>
                  <DocumentTextRegular />
                </span>
                <Text className={styles.cardTitle}>{topic.title}</Text>
              </div>
              <Text className={styles.cardDescription}>{topic.description}</Text>
              <div className={styles.cardFooter}>
                <div className={styles.tags}>
                  {topic.tags.map((tag) => (
                    <Badge key={tag} appearance="tint" size="small" color="brand">
                      {tag}
                    </Badge>
                  ))}
                </div>
                <span className={styles.arrowIcon}>
                  <ArrowRightRegular />
                </span>
              </div>
            </div>
          </Card>
        ))}
      </div>
      {filtered.length === 0 && (
        <Text className={styles.empty}>No topics match your search.</Text>
      )}
    </div>
  );
}
