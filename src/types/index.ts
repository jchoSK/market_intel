
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

