
export interface AdsInfo {
  isRunningAds: boolean | null;
  adType: string | null;
}

export interface BusinessResearch {
  owner?: string;
  employeeCount?: string;
  revenue?: string;
  brands?: string[];
  promotions?: string[];
  isResidential?: boolean;
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
  reviewSummary: {
    text?: string;
    languageCode?: string;
  } | any;
  adsInfo?: AdsInfo;
  research?: BusinessResearch;
}
