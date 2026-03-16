
export interface AdsInfo {
  isRunningAds: boolean | null;
  adCount: number;
  source: string;
  adsTransparencyLink?: string;
  error?: string | null;
}

export interface BusinessResearchOutput {
  ownerName: string;
  ownerPosition: string;
  ownerInfoSource?: string;
  employeeCount: string;
  employeeInfoYear: string;
  employeeInfoSource: string;
  estimatedRevenue?: string;
  revenueInfoSource?: string;
  yearsInBusiness: string;
  yearsInBusinessSource?: string;
}

export interface PromotionsScanInput {
  businessName: string;
  businessWebsite?: string;
}

export interface PromotionsScanResult {
  websiteStatus: string;
  dataVerificationDate: string;
  promotions: string[];
}

export interface WebsiteScanOutput {
  websiteStatus: string;
  dataVerificationDate: string;
  promotions: string[];
  brands: string[];
}

export type ServiceSegment = 'Residential' | 'Commercial' | 'Industrial';

export interface ServiceSegmentsResult {
  segments: ServiceSegment[];
  analysisStatus: string;
}

export interface OwnershipPEResult {
  hasPEPartnership: boolean;
  hasPEOwnership: boolean;
  isPrivatelyOwned: boolean;
  pePartners: string[];
  peOwners: string[];
  analysisStatus: string;
}

export interface LocalizedText {
  text?: string;
  languageCode?: string;
}

export type ZoningClassification = 'RESIDENTIAL' | 'COMMERCIAL' | 'UNKNOWN';

export interface Business {
  id: string;
  name: string;
  address: string;
  phoneNumber?: string;
  website?: string;
  rating?: number;
  reviewsCount?: number;
  reviewSummary?: {
    mostRecentReview?: {
        author?: string;
        publishTime?: string;
        rating?: number;
        text?: LocalizedText;
        relativePublishTimeDescription?: string;
    };
    text?: string | LocalizedText;
    languageCode?: string;
  };
  latitude?: number;
  longitude?: number;
  adsInfo?: AdsInfo;
  ownerName?: string;
  ownerPosition?: string;
  ownerInfoSource?: string;
  employeeCount?: string;
  employeeInfoYear?: string;
  employeeInfoSource?: string;
  estimatedRevenue?: string;
  revenueInfoSource?: string;
  yearsInBusiness?: string;
  yearsInBusinessSource?: string;
  mentionedBrands?: string[];
  promotionsScan?: PromotionsScanResult;
  serviceSegments?: ServiceSegmentsResult;
  ownershipPE?: OwnershipPEResult;
  zoningClassification?: ZoningClassification;
  hvacPrimaryBrand?: string;
  hvacOtherBrandsSold?: string[];
  hvacBrandSources?: string[];
  isMyBusiness?: boolean;
}

export interface SearchParams {
  category: string;
  location: string;
  radius: number;
  maxResults?: number;
  skipAdsCheck?: boolean;
}

export interface SearchSession {
  id:string;
  timestamp: Date;
  searchParams: SearchParams;
  businesses: Business[];
  searchedLocationCenter?: { lat: number; lng: number };
  error?: string | null;
  apiLogs?: string[];
}

// Direct Input Search types - skip Google Places lookup, run AI only
export interface DirectInputBusiness {
  businessName: string;
  website?: string;
  address?: string;
}

// My Business - the business we are representing (skip promotions scan)
export interface MyBusiness {
  businessName: string;
  address: string;
  website?: string;
  placeId?: string; // Google Places ID for more accurate matching
  businessType?: string; // Primary business type from Google Places (e.g., "plumber", "lawyer")
}

export interface DirectInputSearchParams {
  businesses: DirectInputBusiness[];
}

// Re-export comparison types for convenience
export type { BusinessDelta, BusinessWithDelta, ComparisonResult } from '@/lib/comparison';
export type { ExportedSearchData } from '@/lib/json-export';
