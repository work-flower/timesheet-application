import {
  makeStyles,
  tokens,
  Text,
  Button,
  Select,
} from '@fluentui/react-components';
import {
  ChevronLeftRegular,
  ChevronRightRegular,
} from '@fluentui/react-icons';
import { PAGE_SIZES } from '../hooks/usePagination.js';

const useStyles = makeStyles({
  bar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '6px 16px',
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
    gap: '8px',
    flexShrink: 0,
  },
  right: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
});

export default function PaginationControls({
  page,
  pageSize,
  totalItems,
  totalPages,
  onPageChange,
  onPageSizeChange,
}) {
  const styles = useStyles();

  if (totalItems <= Math.min(...PAGE_SIZES)) return null;

  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalItems);

  return (
    <div className={styles.bar}>
      <Text size={200}>
        Showing {start}–{end} of {totalItems}
      </Text>
      <div className={styles.right}>
        <Text size={200}>Rows per page</Text>
        <Select
          size="small"
          value={String(pageSize)}
          onChange={(e, data) => onPageSizeChange(Number(data.value))}
          style={{ minWidth: 'auto', width: 70 }}
        >
          {PAGE_SIZES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </Select>
        <Button
          size="small"
          appearance="subtle"
          icon={<ChevronLeftRegular />}
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        />
        <Text size={200}>
          Page {page} of {totalPages}
        </Text>
        <Button
          size="small"
          appearance="subtle"
          icon={<ChevronRightRegular />}
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        />
      </div>
    </div>
  );
}
