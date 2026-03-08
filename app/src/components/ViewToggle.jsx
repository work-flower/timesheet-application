import { Tooltip, ToggleButton } from '@fluentui/react-components';
import { GridRegular, ListRegular, ContentViewRegular } from '@fluentui/react-icons';

const modes = [
  { key: 'grid', icon: <GridRegular />, label: 'Grid view' },
  { key: 'list', icon: <ListRegular />, label: 'List view' },
  { key: 'card', icon: <ContentViewRegular />, label: 'Card view' },
];

export default function ViewToggle({ value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: '2px' }}>
      {modes.map((m) => (
        <Tooltip key={m.key} content={m.label} relationship="label" withArrow>
          <ToggleButton
            size="small"
            icon={m.icon}
            checked={value === m.key}
            onClick={() => onChange(m.key)}
            appearance={value === m.key ? undefined : 'subtle'}
            style={{ minWidth: 'auto' }}
          />
        </Tooltip>
      ))}
    </div>
  );
}
