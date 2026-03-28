import { Tooltip, tokens } from '@fluentui/react-components';

/**
 * WeekIndicator — a compact segmented bar showing which day of the week a date falls on.
 * Each day is a rectangle with a circle inside. Filled circles = days reached.
 * Weekend rectangles are visually distinct from weekdays.
 *
 * Props:
 * - date (string, YYYY-MM-DD) — the date to represent
 * - size ('small' | 'default') — small for card views (default: 'default')
 */
export default function WeekIndicator({ date, size = 'default' }) {
  const dateObj = new Date(date + 'T00:00:00');
  const jsDay = dateObj.getDay();
  const dayNum = jsDay === 0 ? 7 : jsDay; // Mon=1 .. Sun=7
  const dayName = dateObj.toLocaleDateString('en-GB', { weekday: 'long' });

  const cell = size === 'small' ? 16 : 20;
  const dot = size === 'small' ? 8 : 10;

  return (
    <Tooltip content={dayName} relationship="label" positioning="above">
      <div style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '1px',
        borderRadius: '3px',
        overflow: 'hidden',
      }}>
        {Array.from({ length: 7 }, (_, i) => {
          const isWeekend = i >= 5;
          const isFilled = i < dayNum;

          // Subtle Fluent tokens — blends into background, doesn't grab attention
          const rectBg = isWeekend ? '#D1D1D1' : '#A0A0A0';
          const dotBg = isFilled ? rectBg : tokens.colorNeutralBackground1;

          return (
            <span
              key={i}
              style={{
                width: `${cell}px`,
                height: `${cell}px`,
                backgroundColor: rectBg,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <span
                style={{
                  width: `${dot}px`,
                  height: `${dot}px`,
                  borderRadius: '50%',
                  backgroundColor: dotBg,
                  display: 'inline-block',
                }}
              />
            </span>
          );
        })}
      </div>
    </Tooltip>
  );
}
