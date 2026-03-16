import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Business, SearchParams } from '@/types';
import type { BusinessWithDelta, ComparisonResult, ComparisonTableResult, ComparisonRow } from './comparison';

interface PDFExportOptions {
  businesses: Business[] | BusinessWithDelta[];
  searchParams: SearchParams;
  comparisonResult?: ComparisonResult;
  comparisonTableResult?: ComparisonTableResult;
  orientation?: 'portrait' | 'landscape';
}

// Cache for letterhead image
let letterheadImageCache: string | null = null;

// Load letterhead image and convert to base64
async function loadLetterheadImage(): Promise<string | null> {
  if (letterheadImageCache) {
    return letterheadImageCache;
  }

  try {
    const response = await fetch('/SK_Letterhead.jpg');
    if (!response.ok) {
      console.warn('Letterhead image not found');
      return null;
    }
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        letterheadImageCache = reader.result as string;
        resolve(letterheadImageCache);
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.warn('Failed to load letterhead image:', error);
    return null;
  }
}

// Helper to format delta for display
function formatDelta(value: number | null, prefix: string = ''): string {
  if (value === null || value === 0) return '';
  if (value > 0) return ` (${prefix}+${value})`;
  return ` (${prefix}${value})`;
}

function formatRatingDeltaText(value: number | null): string {
  if (value === null || value === 0) return '';
  if (value > 0) return ` (+${value.toFixed(1)})`;
  return ` (${value.toFixed(1)})`;
}

export async function generateMarketSummaryPDF({ businesses, searchParams, comparisonResult, comparisonTableResult, orientation = 'portrait' }: PDFExportOptions): Promise<void> {
  const hasComparison = !!comparisonTableResult || !!comparisonResult;
  const isLandscape = orientation === 'landscape';

  // Load letterhead image
  const letterheadImage = await loadLetterheadImage();

  // Use specified orientation
  const doc = new jsPDF({
    orientation: orientation,
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;

  // Letterhead dimensions - aspect ratio is about 7.45:1 (2550x342)
  const letterheadHeight = letterheadImage ? (pageWidth / 7.45) : 0;
  let yPos = letterheadImage ? letterheadHeight + 10 : margin;

  // Helper function to add header to each page
  const addHeader = () => {
    if (letterheadImage) {
      // Add letterhead image spanning full width at top
      doc.addImage(letterheadImage, 'JPEG', 0, 0, pageWidth, letterheadHeight);
    } else {
      // Fallback to text header if image not available
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0, 0, 0);
      doc.text('SearchKings', pageWidth - margin, 10, { align: 'right' });
    }
  };

  // Add header to first page
  addHeader();

  // Extract location for title (e.g., "Santa Clara, CA 95050, USA" -> "Santa Clara (CA)")
  const locationParts = searchParams.location.split(',').map(p => p.trim());
  let cityName = locationParts[0] || searchParams.location;
  let stateAbbrev = '';
  for (const part of locationParts) {
    // Match state abbreviation with optional zip code (e.g., "CA 95050" or "CA")
    const match = part.match(/^([A-Z]{2})(?:\s+\d{5})?$/);
    if (match) {
      stateAbbrev = match[1];
      break;
    }
  }

  // Title: "Market Analyzer- Santa Clara (CA)"
  const title = stateAbbrev
    ? `Market Analyzer- ${cityName} (${stateAbbrev})`
    : `Market Analyzer- ${cityName}`;

  // Title styling
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);

  // Calculate title width and adjust font size if needed to fit within margins
  const maxTitleWidth = pageWidth - (margin * 2);
  let titleFontSize = 20;
  doc.setFontSize(titleFontSize);

  while (doc.getTextWidth(title) > maxTitleWidth && titleFontSize > 14) {
    titleFontSize -= 1;
    doc.setFontSize(titleFontSize);
  }

  // If still too wide, use text splitting
  if (doc.getTextWidth(title) > maxTitleWidth) {
    const splitTitle = doc.splitTextToSize(title, maxTitleWidth);
    doc.text(splitTitle, margin, yPos);
    yPos += (splitTitle.length - 1) * 7;
  } else {
    doc.text(title, margin, yPos);
  }

  // Date range
  yPos += 7;
  doc.setFontSize(11);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(80, 80, 80);

  if (hasComparison) {
    const prevDate = comparisonTableResult?.previousExportDate || comparisonResult?.previousExportDate || '';
    const currDate = comparisonTableResult?.currentDate || new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    doc.text(`Date range: ${prevDate} - ${currDate}`, margin, yPos);
  } else {
    const currentDate = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    doc.text(`Date: ${currentDate}`, margin, yPos);
  }

  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'normal');

  // Calculate statistics
  const totalBusinesses = businesses.length;
  const hasAnyAdsData = businesses.some(b => b.adsInfo !== undefined);
  const businessesWithAds = businesses.filter(b => b.adsInfo?.isRunningAds === true).length;

  // Active Google Advertisers line (only show if ads check was enabled)
  if (hasAnyAdsData) {
    yPos += 8;
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text(`Active Google Advertisers: `, margin, yPos);
    const labelWidth = doc.getTextWidth('Active Google Advertisers: ');
    doc.setFont('helvetica', 'normal');
    doc.text(`${businessesWithAds} of ${totalBusinesses} businesses.`, margin + labelWidth, yPos);
  }

  // Helper functions for formatting
  const formatAdsStatus = (status: boolean | null | undefined): string => {
    if (status === true) return 'Active';
    if (status === false) return 'Inactive';
    return 'Unknown';
  };

  // Normalize text for PDF rendering - replace problematic Unicode characters
  const normalizeTextForPDF = (text: string): string => {
    return text
      // Replace various Unicode hyphens/dashes with regular hyphen
      .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/g, '-')
      // Replace fancy quotes with regular quotes
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')
      // Replace other problematic characters
      .replace(/\u2026/g, '...')  // ellipsis
      .replace(/\u00A0/g, ' ');   // non-breaking space
  };

  // Variables for table
  let tableData: (string | { content: string; styles?: any })[][];
  let tableHeaders: any[][];
  let columnStyles: Record<number, any>;
  let adsColumnIndex: number;
  const adsTransparencyLinks: Map<number, string> = new Map();
  const rowStatuses: Map<number, ComparisonRow['status']> = new Map();

  // Separate new businesses for the bottom section in comparison mode
  let newBusinessesData: (string | { content: string; styles?: any })[][] = [];
  let newBusinessesAdsLinks: Map<number, string> = new Map();

  // Use new comparison table format if available
  if (comparisonTableResult) {
    const prevDate = comparisonTableResult.previousExportDate;
    const currDate = comparisonTableResult.currentDate;

    // Single row header with dates in parentheses
    const prevDateShort = prevDate.split(',')[0].trim();
    const currDateShort = currDate.split(',')[0].trim();
    tableHeaders = [
      ['Company', `Reviews\n(${prevDateShort})`, `Reviews\n(${currDateShort})`, 'Rating', 'Google\nAds', `Call Outs (${prevDateShort})`, `Call Outs (${currDateShort})`],
    ];

    // Filter: only matched businesses in main table, new businesses in separate section
    // Dropped businesses (in previous but not in current) are excluded entirely
    const matchedRows = comparisonTableResult.rows.filter(row => row.status === 'matched');
    const newRows = comparisonTableResult.rows.filter(row => row.status === 'new');

    tableData = matchedRows.map((row, index) => {
      const business = row.current!;
      rowStatuses.set(index, row.status);

      // Company name
      const companyName = business.name || 'Unknown';

      // Reviews - two columns
      const prevReviews = (row.previous?.reviewsCount ?? 0).toLocaleString();
      let currReviews = (row.current?.reviewsCount ?? 0).toLocaleString();
      if (row.reviewCountDelta && row.reviewCountDelta !== 0) {
        currReviews += `\n(${row.reviewCountDelta > 0 ? '+' : ''}${row.reviewCountDelta})`;
      }

      // Rating - single column (latest only)
      const currRating = (row.current?.rating ?? 0).toFixed(1);

      // Google Ads - single column showing latest status
      const currAds = formatAdsStatus(row.currentAdsStatus);

      // Store ads link
      const adsLink = row.current?.adsInfo?.adsTransparencyLink;
      if (adsLink) {
        adsTransparencyLinks.set(index, adsLink);
      }

      // Promotions - two columns
      // Previous promotions
      let prevPromos: string;
      if (row.previousPromotions.length === 0) {
        prevPromos = 'No call outs found';
      } else {
        prevPromos = row.previousPromotions.map(p => normalizeTextForPDF(p)).join('; ');
      }

      // Current promotions
      let currPromos: string;
      const currSuccessful = row.current?.promotionsScan?.websiteStatus === 'Successfully crawled';
      const currNoWebsite = row.current?.promotionsScan?.websiteStatus === 'No website available';
      if (row.currentPromotions.length === 0) {
        currPromos = currSuccessful ? 'No call outs found' : currNoWebsite ? 'No website available' : '';
      } else {
        currPromos = row.currentPromotions.map(p => normalizeTextForPDF(p)).join('; ');
      }

      return [companyName, prevReviews, currReviews, currRating, currAds, prevPromos, currPromos];
    });

    // Prepare new businesses data for separate table
    newRows.forEach((row, index) => {
      const business = row.current!;
      const companyName = business.name || 'Unknown';
      const reviews = (business.reviewsCount ?? 0).toLocaleString();
      const rating = business.rating?.toFixed(1) ?? 'N/A';
      const adsStatus = formatAdsStatus(row.currentAdsStatus);

      if (business.adsInfo?.adsTransparencyLink) {
        newBusinessesAdsLinks.set(index, business.adsInfo.adsTransparencyLink);
      }

      // Key Call Outs - combine into single column
      let callOuts = '';
      const currSuccessful = business.promotionsScan?.websiteStatus === 'Successfully crawled';
      const currNoWebsite = business.promotionsScan?.websiteStatus === 'No website available';
      if (row.currentPromotions.length > 0) {
        callOuts = row.currentPromotions.map(p => normalizeTextForPDF(p)).join('; ');
      } else if (currSuccessful) {
        callOuts = 'No call outs found';
      } else if (currNoWebsite) {
        callOuts = 'No website available';
      }

      newBusinessesData.push([companyName, reviews, rating, adsStatus, callOuts]);
    });

    // Adjust column widths based on orientation
    if (isLandscape) {
      columnStyles = {
        0: { cellWidth: 50, fontStyle: 'bold' as const }, // Company (wider)
        1: { cellWidth: 22, halign: 'center' as const, fontSize: 9 }, // Reviews (prev)
        2: { cellWidth: 22, halign: 'center' as const, fontSize: 9 }, // Reviews (curr)
        3: { cellWidth: 18, halign: 'center' as const, fontSize: 9 }, // Rating
        4: { cellWidth: 22, halign: 'center' as const, fontSize: 9 }, // Ads
        5: { cellWidth: 'auto' as const, fontSize: 8 }, // Promotions (prev)
        6: { cellWidth: 'auto' as const, fontSize: 8 }, // Promotions (curr)
      };
    } else {
      columnStyles = {
        0: { cellWidth: 35, fontStyle: 'bold' as const }, // Company
        1: { cellWidth: 18, halign: 'center' as const, fontSize: 8 }, // Reviews (prev)
        2: { cellWidth: 18, halign: 'center' as const, fontSize: 8 }, // Reviews (curr)
        3: { cellWidth: 14, halign: 'center' as const, fontSize: 8 }, // Rating
        4: { cellWidth: 18, halign: 'center' as const, fontSize: 8 }, // Ads
        5: { cellWidth: 'auto' as const, fontSize: 7 }, // Promotions (prev)
        6: { cellWidth: 'auto' as const, fontSize: 7 }, // Promotions (curr)
      };
    }
    adsColumnIndex = 4;

  } else if (hasAnyAdsData) {
    // Standard format (no comparison): Company, Reviews, Rating, Google Ads, Promotions
    const sortedBusinesses = [...businesses].sort((a, b) => (b.reviewsCount || 0) - (a.reviewsCount || 0));

    tableData = sortedBusinesses.map((business, index) => {
      // Company name
      const companyName = business.name || 'Unknown';

      // Reviews
      const reviews = (business.reviewsCount ?? 0).toLocaleString();

      // Rating
      const rating = business.rating?.toFixed(1) || 'N/A';

      // Google Ads status
      const adsStatus = business.adsInfo?.isRunningAds === true
        ? 'Active'
        : business.adsInfo?.isRunningAds === false
          ? 'Inactive'
          : 'Unknown';

      // Store ads link
      if (business.adsInfo?.adsTransparencyLink) {
        adsTransparencyLinks.set(index, business.adsInfo.adsTransparencyLink);
      }

      // Call Outs - show status based on crawl result
      let promotions = '';
      if (business.promotionsScan?.promotions && business.promotionsScan.promotions.length > 0) {
        promotions = business.promotionsScan.promotions
          .map(p => `- ${normalizeTextForPDF(p)}`)
          .join('\n');
      } else if (business.promotionsScan?.websiteStatus === 'Successfully crawled') {
        promotions = 'No call outs found';
      } else if (business.promotionsScan?.websiteStatus === 'No website available') {
        promotions = 'No website available';
      }

      return [companyName, reviews, rating, adsStatus, promotions];
    });

    tableHeaders = [['Company', 'Reviews', 'Rating', 'Google Ads', 'Call Outs']];

    // Adjust column widths based on orientation
    if (isLandscape) {
      columnStyles = {
        0: { cellWidth: 60, fontStyle: 'bold' as const }, // Company (wider)
        1: { cellWidth: 28, halign: 'center' as const }, // Reviews
        2: { cellWidth: 22, halign: 'center' as const }, // Rating
        3: { cellWidth: 35, halign: 'left' as const }, // Google Ads
        4: { cellWidth: 'auto' as const }, // Promotions (gets remaining space)
      };
    } else {
      columnStyles = {
        0: { cellWidth: 45, fontStyle: 'bold' as const }, // Company
        1: { cellWidth: 22, halign: 'center' as const }, // Reviews
        2: { cellWidth: 18, halign: 'center' as const }, // Rating
        3: { cellWidth: 28, halign: 'left' as const }, // Google Ads
        4: { cellWidth: 'auto' as const }, // Promotions
      };
    }

    adsColumnIndex = 3;
  } else {
    // Standard format without Google Ads column (ads check disabled)
    const sortedBusinesses = [...businesses].sort((a, b) => (b.reviewsCount || 0) - (a.reviewsCount || 0));

    tableData = sortedBusinesses.map((business) => {
      const companyName = business.name || 'Unknown';
      const reviews = (business.reviewsCount ?? 0).toLocaleString();
      const rating = business.rating?.toFixed(1) || 'N/A';

      let promotions = '';
      if (business.promotionsScan?.promotions && business.promotionsScan.promotions.length > 0) {
        promotions = business.promotionsScan.promotions
          .map(p => `- ${normalizeTextForPDF(p)}`)
          .join('\n');
      } else if (business.promotionsScan?.websiteStatus === 'Successfully crawled') {
        promotions = 'No call outs found';
      } else if (business.promotionsScan?.websiteStatus === 'No website available') {
        promotions = 'No website available';
      }

      return [companyName, reviews, rating, promotions];
    });

    tableHeaders = [['Company', 'Reviews', 'Rating', 'Call Outs']];

    if (isLandscape) {
      columnStyles = {
        0: { cellWidth: 60, fontStyle: 'bold' as const },
        1: { cellWidth: 28, halign: 'center' as const },
        2: { cellWidth: 22, halign: 'center' as const },
        3: { cellWidth: 'auto' as const },
      };
    } else {
      columnStyles = {
        0: { cellWidth: 45, fontStyle: 'bold' as const },
        1: { cellWidth: 22, halign: 'center' as const },
        2: { cellWidth: 18, halign: 'center' as const },
        3: { cellWidth: 'auto' as const },
      };
    }

    adsColumnIndex = -1; // No ads column
  }

  // Main Table
  yPos += 8;
  autoTable(doc, {
    startY: yPos,
    head: tableHeaders,
    body: tableData,
    margin: { left: margin, right: margin, top: letterheadHeight + 5 },
    styles: {
      fontSize: 9,
      cellPadding: 2,
      lineColor: [0, 0, 0],
      lineWidth: 0.1,
      textColor: [0, 0, 0],
    },
    headStyles: {
      fillColor: [0, 0, 0], // Black header
      textColor: [255, 255, 255], // White text
      fontStyle: 'bold',
      lineWidth: 0.1,
      lineColor: [0, 0, 0],
    },
    columnStyles: columnStyles,
    bodyStyles: {
      lineWidth: 0.1,
      lineColor: [0, 0, 0],
    },
    alternateRowStyles: {
      fillColor: [255, 255, 255],
    },
    didDrawPage: () => {
      // Add header to each page
      addHeader();
    },
    didDrawCell: (data) => {
      // Add clickable link to Google Ads column cells
      if (data.column.index === adsColumnIndex && data.section === 'body') {
        const link = adsTransparencyLinks.get(data.row.index);
        if (link) {
          // Create a clickable region over the cell
          doc.link(data.cell.x, data.cell.y, data.cell.width, data.cell.height, { url: link });

          // Draw underline to indicate it's a link
          const text = data.cell.text.join('');
          const fontSize = data.cell.styles.fontSize || 9;
          doc.setFontSize(fontSize);
          const textWidth = doc.getTextWidth(text);

          // Calculate text X position based on alignment
          let textX: number;
          const halign = data.cell.styles.halign || 'left';
          if (halign === 'center') {
            textX = data.cell.x + (data.cell.width - textWidth) / 2;
          } else if (halign === 'right') {
            textX = data.cell.x + data.cell.width - data.cell.padding('right') - textWidth;
          } else {
            textX = data.cell.x + data.cell.padding('left');
          }

          // Calculate text baseline
          const textY = data.cell.y + data.cell.padding('top') + (fontSize * 0.35) + 0.5;

          // Set underline color to match text color
          if (text.includes('Active') && !text.includes('was Active')) {
            doc.setDrawColor(0, 128, 0); // Green
          } else {
            doc.setDrawColor(128, 128, 128); // Gray
          }
          doc.setLineWidth(0.2);
          doc.line(textX, textY, textX + textWidth, textY);
        }
      }
    },
    didParseCell: (data) => {
      // Style Company column (column 0) with grey background and white text
      if (data.column.index === 0 && data.section === 'body') {
        data.cell.styles.fillColor = [128, 128, 128]; // Grey background
        data.cell.styles.textColor = [255, 255, 255]; // White text
        data.cell.styles.fontStyle = 'bold';
      }

      // Style the Google Ads column
      if (data.column.index === adsColumnIndex && data.section === 'body') {
        const text = data.cell.text.join('');
        if (text.includes('Active') && !text.includes('→ Inactive') && !text.includes('was Active')) {
          data.cell.styles.textColor = [0, 128, 0]; // Green for active
        } else if (text.includes('Inactive') && !text.includes('→ Active') && !text.includes('was Inactive')) {
          data.cell.styles.textColor = [128, 128, 128]; // Gray for inactive
        }
      }
    },
  });

  // Add New Businesses section if there are any (comparison mode only)
  if (hasComparison && newBusinessesData.length > 0) {
    const currDate = comparisonTableResult?.currentDate || new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

    // Get the final Y position after main table
    const finalY = (doc as any).lastAutoTable?.finalY || yPos + 50;

    // Check if we need a new page
    const spaceNeeded = 40 + (newBusinessesData.length * 15);
    if (finalY + spaceNeeded > pageHeight - margin) {
      doc.addPage();
      addHeader();
      yPos = letterheadHeight + 15;
    } else {
      yPos = finalY + 15;
    }

    // Section title
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(0, 0, 0);
    doc.text(`New Businesses (Joined ${currDate})`, margin, yPos);

    yPos += 8;

    // New businesses table with green styling
    autoTable(doc, {
      startY: yPos,
      head: [['Company', 'Reviews', 'Rating', 'Ads', 'Key Call Outs']],
      body: newBusinessesData,
      margin: { left: margin, right: margin, top: letterheadHeight + 5 },
      styles: {
        fontSize: 9,
        cellPadding: 2,
        lineColor: [0, 0, 0],
        lineWidth: 0.1,
        textColor: [0, 0, 0],
      },
      headStyles: {
        fillColor: [0, 0, 0], // Black header
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        lineWidth: 0.1,
        lineColor: [0, 0, 0],
      },
      columnStyles: isLandscape ? {
        0: { cellWidth: 60, fontStyle: 'bold' as const }, // Company (wider)
        1: { cellWidth: 28, halign: 'center' as const }, // Reviews
        2: { cellWidth: 22, halign: 'center' as const }, // Rating
        3: { cellWidth: 28, halign: 'center' as const }, // Ads
        4: { cellWidth: 'auto' as const }, // Call Outs
      } : {
        0: { cellWidth: 45, fontStyle: 'bold' as const }, // Company
        1: { cellWidth: 20, halign: 'center' as const }, // Reviews
        2: { cellWidth: 18, halign: 'center' as const }, // Rating
        3: { cellWidth: 20, halign: 'center' as const }, // Ads
        4: { cellWidth: 'auto' as const }, // Call Outs
      },
      bodyStyles: {
        lineWidth: 0.1,
        lineColor: [0, 0, 0],
      },
      didDrawPage: () => {
        addHeader();
      },
      didDrawCell: (data) => {
        // Add clickable link to Ads column (index 3)
        if (data.column.index === 3 && data.section === 'body') {
          const link = newBusinessesAdsLinks.get(data.row.index);
          if (link) {
            doc.link(data.cell.x, data.cell.y, data.cell.width, data.cell.height, { url: link });
            const text = data.cell.text.join('');
            const fontSize = data.cell.styles.fontSize || 9;
            doc.setFontSize(fontSize);
            const textWidth = doc.getTextWidth(text);
            const textX = data.cell.x + (data.cell.width - textWidth) / 2;
            const textY = data.cell.y + data.cell.padding('top') + (fontSize * 0.35) + 0.5;
            if (text.includes('Active')) {
              doc.setDrawColor(0, 100, 0);
            } else {
              doc.setDrawColor(128, 128, 128);
            }
            doc.setLineWidth(0.2);
            doc.line(textX, textY, textX + textWidth, textY);
          }
        }
      },
      didParseCell: (data) => {
        // All cells get light green background (matching reference PDF)
        if (data.section === 'body') {
          data.cell.styles.fillColor = [198, 224, 180]; // Soft sage green from reference
          data.cell.styles.textColor = [0, 0, 0];
        }

        // Company column: same light green background, dark green text
        if (data.column.index === 0 && data.section === 'body') {
          data.cell.styles.fillColor = [198, 224, 180]; // Same soft sage green
          data.cell.styles.textColor = [56, 87, 35]; // Forest green text from reference
          data.cell.styles.fontStyle = 'bold';
        }

        // Ads column styling
        if (data.column.index === 3 && data.section === 'body') {
          const text = data.cell.text.join('');
          if (text.includes('Active')) {
            data.cell.styles.textColor = [0, 128, 0]; // Green for active
          } else if (text.includes('Inactive')) {
            data.cell.styles.textColor = [128, 128, 128]; // Gray for inactive
          }
        }
      },
    });
  }

  // Generate filename
  const locationSlug = searchParams.location.replace(/[,\s]+/g, '_');
  const categorySlug = searchParams.category.replace(/\s+/g, '_');
  const dateSuffix = hasComparison ? '_Comparison' : '';
  const orientationSuffix = isLandscape ? '_Landscape' : '';
  const filename = `${locationSlug}_${categorySlug}_Market_Summary${dateSuffix}${orientationSuffix}.pdf`;

  // Save the PDF
  doc.save(filename);
}
