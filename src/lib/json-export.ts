import type { Business, SearchParams } from '@/types';

export interface ExportedSearchData {
  version: string;
  exportDate: string;
  searchParams: SearchParams;
  businesses: Business[];
}

export function exportSearchDataAsJSON(
  businesses: Business[],
  searchParams: SearchParams
): void {
  const exportData: ExportedSearchData = {
    version: '1.0',
    exportDate: new Date().toISOString().split('T')[0],
    searchParams,
    businesses,
  };

  const jsonString = JSON.stringify(exportData, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  // Generate filename
  const locationSlug = searchParams.location.replace(/[,\s]+/g, '_');
  const categorySlug = searchParams.category.replace(/\s+/g, '_');
  const dateSlug = exportData.exportDate;
  const filename = `${locationSlug}_${categorySlug}_${dateSlug}.json`;

  // Trigger download
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function parseImportedJSON(file: File): Promise<ExportedSearchData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const data = JSON.parse(content) as ExportedSearchData;

        // Validate the structure
        if (!data.version || !data.exportDate || !data.searchParams || !data.businesses) {
          reject(new Error('Invalid JSON structure. Missing required fields.'));
          return;
        }

        if (!Array.isArray(data.businesses)) {
          reject(new Error('Invalid JSON structure. Businesses must be an array.'));
          return;
        }

        resolve(data);
      } catch (error) {
        reject(new Error('Failed to parse JSON file. Please ensure it is a valid export file.'));
      }
    };

    reader.onerror = () => {
      reject(new Error('Failed to read file.'));
    };

    reader.readAsText(file);
  });
}
