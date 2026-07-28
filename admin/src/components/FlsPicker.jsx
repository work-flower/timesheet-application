import { useState } from 'react';
import {
  Tag,
  TagPicker,
  TagPickerControl,
  TagPickerGroup,
  TagPickerInput,
  TagPickerList,
  TagPickerOption,
} from '@fluentui/react-components';

// Tag list for one op's hidden fields: pick from sampled field names or type
// a custom value and press Enter (the data layer is schemaless — unknown
// fields are ignored silently at runtime). `inline` renders the suggestion
// list in DOM order instead of a portal — required inside a Popover, where a
// portalled listbox would trigger the outside-click dismiss.
export default function FlsPicker({ value, options, onChange, placeholder, inline }) {
  const [query, setQuery] = useState('');
  const suggestions = (options || []).filter(
    (o) => !value.includes(o) && (!query || o.toLowerCase().includes(query.toLowerCase()))
  );

  const addField = (field) => {
    const trimmed = (field || '').trim();
    if (!trimmed || value.includes(trimmed)) return;
    onChange([...value, trimmed]);
    setQuery('');
  };

  return (
    <TagPicker
      inline={inline}
      selectedOptions={value}
      onOptionSelect={(e, data) => {
        if (data.value === '__no_match__') return;
        onChange(data.selectedOptions.filter((v) => v !== '__no_match__'));
        setQuery('');
      }}
    >
      <TagPickerControl>
        <TagPickerGroup aria-label="Hidden fields">
          {value.map((field) => (
            <Tag key={field} shape="rounded" value={field} dismissible dismissIcon={{ 'aria-label': 'remove' }}>
              {field}
            </Tag>
          ))}
        </TagPickerGroup>
        <TagPickerInput
          aria-label="Hidden fields"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && query.trim()) {
              e.preventDefault();
              addField(query);
            }
          }}
          placeholder={value.length ? '' : placeholder}
        />
      </TagPickerControl>
      <TagPickerList>
        {suggestions.length > 0 ? (
          suggestions.map((option) => (
            <TagPickerOption value={option} key={option}>{option}</TagPickerOption>
          ))
        ) : (
          <TagPickerOption value="__no_match__">
            {query.trim() ? `Press Enter to add "${query.trim()}"` : 'No sampled fields — type a name and press Enter'}
          </TagPickerOption>
        )}
      </TagPickerList>
    </TagPicker>
  );
}
