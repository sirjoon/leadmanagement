import { format, parseISO } from 'date-fns';

/**
 * Format a UTC date string to IST (Indian Standard Time, UTC+5:30)
 */
function toIST(date: Date): Date {
  // Get UTC time, then add 5:30 hours for IST
  const utc = date.getTime() + date.getTimezoneOffset() * 60000;
  return new Date(utc + 5.5 * 60 * 60000);
}

export function formatDateIST(dateStr: string, fmt: string = 'MMM d, yyyy'): string {
  const date = parseISO(dateStr);
  const ist = toIST(date);
  return format(ist, fmt);
}

export function formatDateTimeIST(dateStr: string): string {
  return formatDateIST(dateStr, 'MMM d, yyyy h:mm a');
}

export function formatTimeIST(dateStr: string): string {
  return formatDateIST(dateStr, 'h:mm a');
}

export function formatDateInputIST(dateStr: string): string {
  return formatDateIST(dateStr, "yyyy-MM-dd'T'HH:mm");
}
