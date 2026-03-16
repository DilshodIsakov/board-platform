import { getIntlLocale } from "../i18n";

/** Format date: 01.03.2026 / Mar 1, 2026 / etc. */
export function formatDate(date: string | Date, lng?: string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return String(date);
  return new Intl.DateTimeFormat(getIntlLocale(lng), {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

/** Format date + time: 01.03.2026, 14:30 */
export function formatDateTime(date: string | Date, lng?: string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return String(date);
  return new Intl.DateTimeFormat(getIntlLocale(lng), {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

/** Format number with locale separators */
export function formatNumber(value: number, lng?: string): string {
  return new Intl.NumberFormat(getIntlLocale(lng)).format(value);
}

/**
 * Download a file from URL without navigating away or opening a new tab.
 * Fetches as blob, creates a temporary object URL, and triggers download via anchor click.
 */
export async function downloadFileByUrl(url: string, fileName: string): Promise<void> {
  const response = await fetch(url);
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(objectUrl);
}
