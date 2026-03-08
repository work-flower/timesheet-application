import {
  makeStyles,
  tokens,
  Button,
  Toolbar,
  ToolbarDivider,
} from '@fluentui/react-components';
import { ArrowLeftRegular, DeleteRegular, SaveRegular, SaveArrowRightRegular } from '@fluentui/react-icons';

const useStyles = makeStyles({
  bar: {
    display: 'flex',
    alignItems: 'center',
    padding: '8px 16px',
    backgroundColor: tokens.colorNeutralBackground1,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    gap: '4px',
    position: 'sticky',
    top: 0,
    zIndex: 10,
  },
});

export default function FormCommandBar({ onSave, onSaveAndClose, onBack, onDelete, saveDisabled, saving, locked, children }) {
  return (
    <div className={useStyles().bar}>
      <Button appearance="subtle" icon={<ArrowLeftRegular />} onClick={onBack} size="small">
        Back
      </Button>
      {!locked && (
        <>
          <ToolbarDivider />
          <Button
            appearance="primary"
            icon={<SaveRegular />}
            onClick={onSave}
            disabled={saving || saveDisabled}
            size="small"
          >
            {saving ? 'Saving...' : 'Save'}
          </Button>
          {onSaveAndClose && (
            <Button
              appearance="outline"
              icon={<SaveArrowRightRegular />}
              onClick={onSaveAndClose}
              disabled={saving || saveDisabled}
              size="small"
            >
              {saving ? 'Saving...' : 'Save & Close'}
            </Button>
          )}
          {onDelete && (
            <>
              <ToolbarDivider />
              <Button appearance="subtle" icon={<DeleteRegular />} onClick={onDelete} size="small">
                Delete
              </Button>
            </>
          )}
        </>
      )}
      {children && (
        <>
          <ToolbarDivider />
          {children}
        </>
      )}
    </div>
  );
}
