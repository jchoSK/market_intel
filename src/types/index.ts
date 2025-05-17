export interface Business {
  id: string;
  name: string;
  address: string;
  phoneNumber?: string;
  website?: string;
  rating?: number;
  reviewsCount?: number;
  isAdWordsCustomer?: boolean;
}
