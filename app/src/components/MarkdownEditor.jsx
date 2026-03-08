import MDEditor, { commands } from '@uiw/react-md-editor';
import { tokens, makeStyles } from '@fluentui/react-components';

const useStyles = makeStyles({
  wrapper: {
    '& .w-md-editor': {
      borderRadius: tokens.borderRadiusMedium,
      border: `1px solid ${tokens.colorNeutralStroke1}`,
      boxShadow: 'none',
      backgroundColor: tokens.colorNeutralBackground1,
      fontFamily: tokens.fontFamilyBase,
    },
    '& .w-md-editor:focus-within': {
      borderColor: tokens.colorBrandStroke1,
      borderBottomWidth: '2px',
    },
    '& .w-md-editor-toolbar': {
      backgroundColor: tokens.colorNeutralBackground3,
      borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
      padding: '4px 8px',
    },
    '& .w-md-editor-toolbar li > button': {
      color: tokens.colorNeutralForeground1,
      height: '28px',
      width: '28px',
    },
    '& .w-md-editor-toolbar li > button:hover': {
      backgroundColor: tokens.colorNeutralBackground1Hover,
      color: tokens.colorBrandForeground1,
    },
    '& .w-md-editor-content': {
      fontFamily: tokens.fontFamilyBase,
      fontSize: tokens.fontSizeBase300,
      lineHeight: tokens.lineHeightBase300,
    },
    '& .wmde-markdown': {
      fontFamily: tokens.fontFamilyBase,
      fontSize: tokens.fontSizeBase300,
    },
  },
  label: {
    display: 'block',
    marginBottom: '4px',
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground1,
  },
});

const toolbarCommands = [
  commands.bold,
  commands.italic,
  commands.strikethrough,
  commands.divider,
  commands.unorderedListCommand,
  commands.orderedListCommand,
  commands.checkedListCommand,
  commands.divider,
  commands.code,
  commands.codeBlock,
  commands.divider,
  commands.link,
];

const extraToolbarCommands = [
  commands.codeEdit,
  commands.codeLive,
  commands.codePreview,
];

export default function MarkdownEditor({ value, onChange, label, placeholder, height = 200 }) {
  const styles = useStyles();

  return (
    <div className={styles.wrapper} data-color-mode="light">
      {label && <label className={styles.label}>{label}</label>}
      <MDEditor
        value={value}
        onChange={(val) => onChange(val || '')}
        height={height}
        preview="edit"
        textareaProps={{ placeholder }}
        commands={toolbarCommands}
        extraCommands={extraToolbarCommands}
      />
    </div>
  );
}
