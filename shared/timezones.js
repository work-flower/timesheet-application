/**
 * Common IANA timezones with human-readable labels including UTC offsets.
 * Shared across frontend (dropdowns) and backend (AI context).
 *
 * Label format: "Region/City (UTC±N [/ UTC±N DST] Abbrev)"
 * UTC offsets shown as standard / daylight where applicable.
 */
export const TIMEZONES = [
  // UK & Ireland
  { value: 'Europe/London', label: 'Europe/London (UTC+0 / UTC+1 BST)' },
  { value: 'Europe/Dublin', label: 'Europe/Dublin (UTC+0 / UTC+1 IST)' },

  // Western Europe
  { value: 'Europe/Paris', label: 'Europe/Paris (UTC+1 / UTC+2 CEST)' },
  { value: 'Europe/Berlin', label: 'Europe/Berlin (UTC+1 / UTC+2 CEST)' },
  { value: 'Europe/Amsterdam', label: 'Europe/Amsterdam (UTC+1 / UTC+2 CEST)' },
  { value: 'Europe/Brussels', label: 'Europe/Brussels (UTC+1 / UTC+2 CEST)' },
  { value: 'Europe/Zurich', label: 'Europe/Zurich (UTC+1 / UTC+2 CEST)' },
  { value: 'Europe/Madrid', label: 'Europe/Madrid (UTC+1 / UTC+2 CEST)' },
  { value: 'Europe/Rome', label: 'Europe/Rome (UTC+1 / UTC+2 CEST)' },

  // Eastern Europe
  { value: 'Europe/Helsinki', label: 'Europe/Helsinki (UTC+2 / UTC+3 EEST)' },
  { value: 'Europe/Athens', label: 'Europe/Athens (UTC+2 / UTC+3 EEST)' },
  { value: 'Europe/Bucharest', label: 'Europe/Bucharest (UTC+2 / UTC+3 EEST)' },
  { value: 'Europe/Istanbul', label: 'Europe/Istanbul (UTC+3)' },

  // Middle East & Africa
  { value: 'Asia/Dubai', label: 'Asia/Dubai (UTC+4)' },
  { value: 'Asia/Riyadh', label: 'Asia/Riyadh (UTC+3)' },
  { value: 'Africa/Johannesburg', label: 'Africa/Johannesburg (UTC+2)' },

  // South Asia
  { value: 'Asia/Kolkata', label: 'Asia/Kolkata (UTC+5:30)' },

  // East & Southeast Asia
  { value: 'Asia/Singapore', label: 'Asia/Singapore (UTC+8)' },
  { value: 'Asia/Hong_Kong', label: 'Asia/Hong_Kong (UTC+8)' },
  { value: 'Asia/Tokyo', label: 'Asia/Tokyo (UTC+9)' },
  { value: 'Asia/Shanghai', label: 'Asia/Shanghai (UTC+8)' },

  // Oceania
  { value: 'Australia/Sydney', label: 'Australia/Sydney (UTC+10 / UTC+11 AEDT)' },
  { value: 'Pacific/Auckland', label: 'Pacific/Auckland (UTC+12 / UTC+13 NZDT)' },

  // Americas
  { value: 'America/New_York', label: 'America/New_York (UTC-5 / UTC-4 EDT)' },
  { value: 'America/Chicago', label: 'America/Chicago (UTC-6 / UTC-5 CDT)' },
  { value: 'America/Denver', label: 'America/Denver (UTC-7 / UTC-6 MDT)' },
  { value: 'America/Los_Angeles', label: 'America/Los_Angeles (UTC-8 / UTC-7 PDT)' },
  { value: 'America/Toronto', label: 'America/Toronto (UTC-5 / UTC-4 EDT)' },
  { value: 'America/Sao_Paulo', label: 'America/Sao_Paulo (UTC-3)' },

  // UTC
  { value: 'UTC', label: 'UTC (UTC+0)' },
];

/** Look up the label for a timezone value. Returns the value itself if not found. */
export function getTimezoneLabel(value) {
  if (!value) return '';
  const entry = TIMEZONES.find(tz => tz.value === value);
  return entry ? entry.label : value;
}

export const DEFAULT_TIMEZONE = 'Europe/London';
