import { DiscoveredProspect } from '../api/discovery.api';

/**
 * Escapes a single value according to RFC 4180 rules.
 * - Encloses strings with commas, quotes, or newlines in double quotes.
 * - Escapes internal double quotes by doubling them ("").
 */
export function escapeCsvValue(val: any): string {
  if (val === null || val === undefined) {
    return '';
  }
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Exports a list of discovered prospects to an RFC 4180 compliant CSV file
 * and triggers a native browser download.
 */
export function exportProspectsToCsv(
  prospects: DiscoveredProspect[],
  query: string
): { filename: string; count: number } {
  const headers = [
    'Name',
    'Category',
    'Email',
    'Phone',
    'Website',
    'Address',
    'City',
    'State',
    'Country',
    'PostalCode',
    'Source',
    'ExternalID'
  ];

  const rows = prospects.map((p) => {
    return [
      escapeCsvValue(p.name || ''),
      escapeCsvValue(p.category || ''),
      escapeCsvValue(p.email || ''),
      escapeCsvValue(p.phone || ''),
      escapeCsvValue(p.website || ''),
      escapeCsvValue(p.location?.address || ''),
      escapeCsvValue(p.location?.city || ''),
      escapeCsvValue(p.location?.state || ''),
      escapeCsvValue(p.location?.country || ''),
      escapeCsvValue(p.location?.postalCode || ''),
      escapeCsvValue(p.source || 'discovery'),
      escapeCsvValue(p.externalId || p.id || '')
    ].join(',');
  });

  const csvContent = [headers.join(','), ...rows].join('\r\n');

  const sanitizedQuery = (query || 'prospects')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30) || 'prospects';

  const filename = `leadflow-discovery-${sanitizedQuery}-${Date.now()}.csv`;

  // Create Blob and trigger native browser download
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const objectUrl = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(objectUrl);

  return { filename, count: prospects.length };
}
