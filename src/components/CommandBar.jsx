import {
  makeStyles,
  tokens,
  Button,
  Input,
  Toolbar,
  ToolbarButton,
  ToolbarDivider,
} from '@fluentui/react-components';
import {
  AddRegular,
  DeleteRegular,
  SearchRegular,
} from '@fluentui/react-icons';

const useStyles = makeStyles({
  bar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 16px',
    backgroundColor: tokens.colorNeutralBackground1,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    gap: '8px',
    flexWrap: 'wrap',
  },
  left: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  right: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
});

export default function CommandBar({
  onNew,
  newLabel = 'New',
  onDelete,
  deleteDisabled = true,
  searchValue,
  onSearchChange,
  children,
}) {
  const styles = useStyles();

  return (
    <div className={styles.bar}>
      <div className={styles.left}>
        {onNew && (
          <Button appearance="primary" icon={<AddRegular />} onClick={onNew} size="small">
            {newLabel}
          </Button>
        )}
        {onDelete && (
          <Button
            appearance="subtle"
            icon={<DeleteRegular />}
            onClick={onDelete}
            disabled={deleteDisabled}
            size="small"
          >
            Delete
          </Button>
        )}
        {children}
      </div>
      <div className={styles.right}>
        {onSearchChange && (
          <Input
            contentBefore={<SearchRegular />}
            placeholder="Search..."
            size="small"
            value={searchValue || ''}
            onChange={(e, data) => onSearchChange(data.value)}
          />
        )}
      </div>
    </div>
  );
}
