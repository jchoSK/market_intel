
export interface Business {
  id: string;
  name: string;
  address: string;
  phoneNumber?: string;
  website?: string;
  rating?: number;
  reviewsCount?: number;
  reviewSummary?: {
    text?: string;
    languageCode?: string;
  };
  latitude?: number;
  longitude?: number;
}

export interface AdsInfo {
  isRunningAds: boolean | null; // null if check failed or not applicable
  adType: string | null; // e.g., "Promotion", "Service", "Unknown", or null
}

export interface Business {
  id: string;
  name: string | undefined;
  address: string | undefined;
  rating: number | undefined;
  reviewsCount: number | undefined;
  latitude: number | undefined;
  longitude: number | undefined;
  phoneNumber: string | undefined;
  website: string | undefined;
  reviewSummary: any; // Consider defining a more specific type for reviewSummary
  adsInfo?: AdsInfo; // Add the new adsInfo property
}
