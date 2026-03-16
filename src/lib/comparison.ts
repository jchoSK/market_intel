import type { Business } from '@/types';
import type { ExportedSearchData } from './json-export';

export interface BusinessDelta {
  reviewCountDelta: number | null;
  ratingDelta: number | null;
  adsStatusChanged: boolean;
  previousAdsStatus: boolean | null;
  isNew: boolean;
  previousPromotions: string[];
  newPromotions: string[];
}

export interface BusinessWithDelta extends Business {
  delta?: BusinessDelta;
}

export type ComparisonStatus = 'matched' | 'new' | 'dropped';

export interface ComparisonRow {
  status: ComparisonStatus;
  current: Business | null;
  previous: Business | null;
  // For matched businesses
  reviewCountDelta: number | null;
  ratingDelta: number | null;
  adsStatusChanged: boolean;
  previousAdsStatus: boolean | null;
  currentAdsStatus: boolean | null;
  previousPromotions: string[];
  currentPromotions: string[];
  newPromotions: string[];
  removedPromotions: string[];
}

export interface ComparisonResult {
  businesses: BusinessWithDelta[];
  previousExportDate: string;
  matchedCount: number;
  newCount: number;
}

export interface ComparisonTableResult {
  rows: ComparisonRow[];
  previousExportDate: string;
  currentDate: string;
  matchedCount: number;
  newCount: number;
  droppedCount: number;
}

/**
 * Normalize business name and address for matching
 */
function normalizeForMatching(name: string, address: string): string {
  const normalized = `${name}|||${address}`
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  return normalized;
}

/**
 * Find a matching business in the previous data
 */
function findMatchingBusiness(
  business: Business,
  previousBusinesses: Business[]
): Business | null {
  const currentKey = normalizeForMatching(business.name, business.address);

  for (const prev of previousBusinesses) {
    const prevKey = normalizeForMatching(prev.name, prev.address);
    if (currentKey === prevKey) {
      return prev;
    }
  }

  return null;
}

/**
 * Calculate deltas between current and previous business data
 */
function calculateDeltas(current: Business, previous: Business | null): BusinessDelta {
  if (!previous) {
    return {
      reviewCountDelta: null,
      ratingDelta: null,
      adsStatusChanged: false,
      previousAdsStatus: null,
      isNew: true,
      previousPromotions: [],
      newPromotions: current.promotionsScan?.promotions || [],
    };
  }

  const currentReviews = current.reviewsCount ?? 0;
  const previousReviews = previous.reviewsCount ?? 0;
  const reviewCountDelta = currentReviews - previousReviews;

  const currentRating = current.rating ?? 0;
  const previousRating = previous.rating ?? 0;
  const ratingDelta = Math.round((currentRating - previousRating) * 100) / 100;

  const currentAdsStatus = current.adsInfo?.isRunningAds ?? null;
  const previousAdsStatus = previous.adsInfo?.isRunningAds ?? null;
  const adsStatusChanged = currentAdsStatus !== previousAdsStatus;

  const currentPromotions = current.promotionsScan?.promotions || [];
  const previousPromotions = previous.promotionsScan?.promotions || [];

  // Find new promotions (in current but not in previous)
  const previousPromosLower = previousPromotions.map(p => p.toLowerCase());
  const newPromotions = currentPromotions.filter(
    p => !previousPromosLower.includes(p.toLowerCase())
  );

  return {
    reviewCountDelta,
    ratingDelta,
    adsStatusChanged,
    previousAdsStatus,
    isNew: false,
    previousPromotions,
    newPromotions,
  };
}

/**
 * Compare current businesses with previously exported data
 */
export function compareWithPreviousData(
  currentBusinesses: Business[],
  previousData: ExportedSearchData
): ComparisonResult {
  const previousBusinesses = previousData.businesses;
  let matchedCount = 0;
  let newCount = 0;

  const businessesWithDeltas: BusinessWithDelta[] = currentBusinesses.map(business => {
    const previousMatch = findMatchingBusiness(business, previousBusinesses);

    if (previousMatch) {
      matchedCount++;
    } else {
      newCount++;
    }

    const delta = calculateDeltas(business, previousMatch);

    return {
      ...business,
      delta,
    };
  });

  return {
    businesses: businessesWithDeltas,
    previousExportDate: previousData.exportDate,
    matchedCount,
    newCount,
  };
}

/**
 * Format review count delta for display
 */
export function formatReviewDelta(delta: number | null): {
  text: string;
  color: 'green' | 'red' | 'gray';
} {
  if (delta === null) {
    return { text: '', color: 'gray' };
  }

  if (delta > 0) {
    return { text: `↑+${delta}`, color: 'green' };
  } else if (delta < 0) {
    return { text: `↓${delta}`, color: 'red' };
  } else {
    return { text: '—', color: 'gray' };
  }
}

/**
 * Format rating delta for display
 */
export function formatRatingDelta(delta: number | null): {
  text: string;
  color: 'green' | 'red' | 'gray';
} {
  if (delta === null) {
    return { text: '', color: 'gray' };
  }

  if (delta > 0) {
    return { text: `↑+${delta.toFixed(1)}`, color: 'green' };
  } else if (delta < 0) {
    return { text: `↓${delta.toFixed(1)}`, color: 'red' };
  } else {
    return { text: '—', color: 'gray' };
  }
}

/**
 * Format ads status change for display
 */
export function formatAdsStatusChange(
  currentStatus: boolean | null | undefined,
  adsStatusChanged: boolean,
  previousStatus: boolean | null
): string {
  if (!adsStatusChanged || previousStatus === null) {
    return '';
  }

  const previousText = previousStatus ? 'Active' : 'Inactive';
  return `(was ${previousText})`;
}

/**
 * Generate comparison table rows with matched, new, and dropped businesses
 */
export function generateComparisonTable(
  currentBusinesses: Business[],
  previousData: ExportedSearchData
): ComparisonTableResult {
  const previousBusinesses = previousData.businesses;
  const rows: ComparisonRow[] = [];
  const matchedPreviousIds = new Set<string>();

  let matchedCount = 0;
  let newCount = 0;
  let droppedCount = 0;

  // Process current businesses - find matches or mark as new
  for (const current of currentBusinesses) {
    const previousMatch = findMatchingBusiness(current, previousBusinesses);

    if (previousMatch) {
      // Matched business
      matchedCount++;
      matchedPreviousIds.add(normalizeForMatching(previousMatch.name, previousMatch.address));

      const currentReviews = current.reviewsCount ?? 0;
      const previousReviews = previousMatch.reviewsCount ?? 0;
      const reviewCountDelta = currentReviews - previousReviews;

      const currentRating = current.rating ?? 0;
      const previousRating = previousMatch.rating ?? 0;
      const ratingDelta = Math.round((currentRating - previousRating) * 100) / 100;

      const currentAdsStatus = current.adsInfo?.isRunningAds ?? null;
      const previousAdsStatus = previousMatch.adsInfo?.isRunningAds ?? null;
      const adsStatusChanged = currentAdsStatus !== previousAdsStatus;

      const currentPromotions = current.promotionsScan?.promotions || [];
      const previousPromotions = previousMatch.promotionsScan?.promotions || [];

      const previousPromosLower = previousPromotions.map(p => p.toLowerCase());
      const currentPromosLower = currentPromotions.map(p => p.toLowerCase());

      const newPromotions = currentPromotions.filter(
        p => !previousPromosLower.includes(p.toLowerCase())
      );
      const removedPromotions = previousPromotions.filter(
        p => !currentPromosLower.includes(p.toLowerCase())
      );

      rows.push({
        status: 'matched',
        current,
        previous: previousMatch,
        reviewCountDelta,
        ratingDelta,
        adsStatusChanged,
        previousAdsStatus,
        currentAdsStatus,
        previousPromotions,
        currentPromotions,
        newPromotions,
        removedPromotions,
      });
    } else {
      // New business
      newCount++;
      rows.push({
        status: 'new',
        current,
        previous: null,
        reviewCountDelta: null,
        ratingDelta: null,
        adsStatusChanged: false,
        previousAdsStatus: null,
        currentAdsStatus: current.adsInfo?.isRunningAds ?? null,
        previousPromotions: [],
        currentPromotions: current.promotionsScan?.promotions || [],
        newPromotions: current.promotionsScan?.promotions || [],
        removedPromotions: [],
      });
    }
  }

  // Find dropped businesses (in previous but not in current)
  for (const previous of previousBusinesses) {
    const previousKey = normalizeForMatching(previous.name, previous.address);
    if (!matchedPreviousIds.has(previousKey)) {
      droppedCount++;
      rows.push({
        status: 'dropped',
        current: null,
        previous,
        reviewCountDelta: null,
        ratingDelta: null,
        adsStatusChanged: false,
        previousAdsStatus: previous.adsInfo?.isRunningAds ?? null,
        currentAdsStatus: null,
        previousPromotions: previous.promotionsScan?.promotions || [],
        currentPromotions: [],
        newPromotions: [],
        removedPromotions: [],
      });
    }
  }

  // Sort: matched first (by review count desc), then new, then dropped
  rows.sort((a, b) => {
    const statusOrder = { matched: 0, new: 1, dropped: 2 };
    if (statusOrder[a.status] !== statusOrder[b.status]) {
      return statusOrder[a.status] - statusOrder[b.status];
    }
    // Within same status, sort by review count descending
    const aReviews = (a.current?.reviewsCount ?? a.previous?.reviewsCount) ?? 0;
    const bReviews = (b.current?.reviewsCount ?? b.previous?.reviewsCount) ?? 0;
    return bReviews - aReviews;
  });

  // Format dates consistently
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  return {
    rows,
    previousExportDate: formatDate(previousData.exportDate),
    currentDate: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }),
    matchedCount,
    newCount,
    droppedCount,
  };
}
