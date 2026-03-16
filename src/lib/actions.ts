
"use server";

import type { Business, AdsInfo, BusinessResearch } from "@/types";
import { z } from "zod";
import { researchBusiness } from "@/ai/flows/market-research-flow";

const searchSchema = z.object({
  category: z.string().min(1, "Category is required").max(100, "Category is too long"),
  location: z.string().min(1, "Location is required").max(100, "Location is too long"),
  radius: z.coerce.number().min(1, "Radius must be at least 1").max(50, "Radius cannot exceed 50"),
});

const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY;

const TEXT_SEARCH_API_URL = "https://maps.googleapis.com/maps/api/place/textsearch/json";
const PLACE_DETAILS_NEW_API_URL_BASE = "https://places.googleapis.com/v1/places";

export async function searchBusinessesAction(
  params: { category: string; location: string; radius: number }
): Promise<Business[]> {
  if (!GOOGLE_PLACES_API_KEY) {
    throw new Error("Server configuration error: API key missing.");
  }

  const validation = searchSchema.safeParse(params);
  if (!validation.success) {
    const firstError = Object.values(validation.error.flatten().fieldErrors)[0]?.[0];
    throw new Error(firstError || "Invalid search parameters.");
  }

  const { category, location, radius } = validation.data;
  const query = `${category} in ${location}`;
  const radiusInMeters = radius * 1609.34;
  
  const textSearchFields = "place_id,name,formatted_address,rating,user_ratings_total,geometry";
  const textSearchApiUrl = `${TEXT_SEARCH_API_URL}?query=${encodeURIComponent(query)}&radius=${radiusInMeters}&fields=${encodeURIComponent(textSearchFields)}&key=${GOOGLE_PLACES_API_KEY}`;

  try {
    const textSearchResponse = await fetch(textSearchApiUrl);
    if (!textSearchResponse.ok) throw new Error("Failed to fetch from Places API.");
    
    const textSearchData = await textSearchResponse.json();
    if (textSearchData.status === "ZERO_RESULTS" || !textSearchData.results) return [];

    const businesses = textSearchData.results.map((place: any) => ({
      id: place.place_id,
      name: place.name,
      address: place.formatted_address,
      rating: place.rating,
      reviewsCount: place.user_ratings_total,
      latitude: place.geometry?.location?.lat,
      longitude: place.geometry?.location?.lng,
    }));

    // Process businesses in small batches to respect rate limits
    const BATCH_SIZE = 5;
    const finalBusinesses: Business[] = [];

    for (let i = 0; i < businesses.length; i += BATCH_SIZE) {
      const batch = businesses.slice(i, i + BATCH_SIZE);
      const processedBatch = await Promise.all(batch.map(async (baseBusiness: any) => {
        let augmentedBusiness: Business = { ...baseBusiness };
        
        // 1. Fetch Details (sequential per business)
        if (baseBusiness.id) {
          const detailsResponse = await fetch(`${PLACE_DETAILS_NEW_API_URL_BASE}/${baseBusiness.id}`, {
            headers: { 
              'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY, 
              'X-Goog-FieldMask': "internationalPhoneNumber,websiteUri,reviewSummary" 
            }
          });
          if (detailsResponse.ok) {
            const detailsData = await detailsResponse.json();
            augmentedBusiness.phoneNumber = detailsData.internationalPhoneNumber;
            augmentedBusiness.website = detailsData.websiteUri;
            augmentedBusiness.reviewSummary = detailsData.reviewSummary;
          }
        }

        // 2. AI Research (one consolidated call per business)
        if (augmentedBusiness.name) {
          const research = await researchBusiness({ 
            businessName: augmentedBusiness.name, 
            location: augmentedBusiness.address || location 
          });
          augmentedBusiness.adsInfo = research.adsInfo;
          augmentedBusiness.research = {
            owner: research.owner,
            employeeCount: research.employeeCount,
            revenue: research.revenue,
            brands: research.brands,
            promotions: research.promotions,
            isResidential: research.isResidential,
          };
        }

        return augmentedBusiness;
      }));
      finalBusinesses.push(...processedBatch);
    }

    return finalBusinesses;

  } catch (error) {
    console.error("Search Action Error:", error);
    throw new Error("Search failed. Please check your API configuration.");
  }
}
