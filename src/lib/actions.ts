
"use server";

import type { Business } from "@/types";
import { z } from "zod";

const searchSchema = z.object({
  category: z.string().min(1, "Category is required").max(100, "Category is too long"),
  location: z.string().min(1, "Location is required").max(100, "Location is too long"),
  radius: z.coerce.number().min(1, "Radius must be at least 1").max(50, "Radius cannot exceed 50"),
});

const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY;
const TEXT_SEARCH_API_URL = "https://maps.googleapis.com/maps/api/place/textsearch/json";
const PLACE_DETAILS_API_URL_BASE = "https://maps.googleapis.com/maps/api/place/details/json";

export async function searchBusinessesAction(
  params: { category: string; location: string; radius: number }
): Promise<Business[]> {
  if (!GOOGLE_PLACES_API_KEY) {
    console.error("Google Places API key is missing. Please set GOOGLE_PLACES_API_KEY environment variable in .env.local and restart your server.");
    throw new Error("Server configuration error: API key missing. Please ensure GOOGLE_PLACES_API_KEY is set.");
  }

  const validation = searchSchema.safeParse(params);
  if (!validation.success) {
    const firstError = Object.values(validation.error.flatten().fieldErrors)[0]?.[0];
    throw new Error(firstError || "Invalid search parameters.");
  }

  const { category, location, radius } = validation.data;

  const query = `${category} in ${location}`;
  const radiusInMeters = radius * 1609.34; // Convert miles to meters
  
  // Fields for the initial Text Search (basic info + place_id)
  const textSearchFields = "place_id,name,formatted_address,rating,user_ratings_total";
  const textSearchApiUrl = `${TEXT_SEARCH_API_URL}?query=${encodeURIComponent(query)}&radius=${radiusInMeters}&fields=${encodeURIComponent(textSearchFields)}&key=${GOOGLE_PLACES_API_KEY}`;

  try {
    const response = await fetch(textSearchApiUrl);
    const data = await response.json();

    if (!response.ok || (data.status !== "OK" && data.status !== "ZERO_RESULTS")) {
      console.error("Google Places API Error (Text Search):", data.status, data.error_message, data.info_messages);
      let errorMessage = "Failed to fetch data from Google Places API (Text Search).";
      if (data.error_message) {
        errorMessage = data.error_message;
      } else if (data.status) {
        errorMessage += ` Status: ${data.status}`;
      }
      throw new Error(errorMessage);
    }

    if (data.status === "ZERO_RESULTS" || !data.results || data.results.length === 0) {
      return [];
    }

    // Map initial results and prepare for Place Details calls
    const businessesFromTextSearch = data.results.map((place: any) => ({
      id: place.place_id,
      name: place.name,
      address: place.formatted_address,
      rating: place.rating,
      reviewsCount: place.user_ratings_total,
      phoneNumber: undefined, // To be filled by Place Details
      website: undefined,     // To be filled by Place Details
    }));

    // Fetch details (phone number, website) for each business
    const detailedBusinesses = await Promise.all(
      businessesFromTextSearch.map(async (baseBusiness: Omit<Business, 'phoneNumber' | 'website'> & { phoneNumber?: string; website?: string }) => {
        const placeDetailsFieldsToFetch = "place_id,international_phone_number,website";
        const placeDetailsUrl = `${PLACE_DETAILS_API_URL_BASE}?place_id=${baseBusiness.id}&fields=${encodeURIComponent(placeDetailsFieldsToFetch)}&key=${GOOGLE_PLACES_API_KEY}`;
        
        let augmentedBusiness: Business = { ...baseBusiness } as Business; // Assert type initially

        try {
          const detailsResponse = await fetch(placeDetailsUrl);
          const detailsData = await detailsResponse.json();

          if (detailsData.status === "OK" && detailsData.result) {
            augmentedBusiness.phoneNumber = detailsData.result.international_phone_number;
            augmentedBusiness.website = detailsData.result.website;
          } else {
            console.warn(`Could not fetch details for place_id ${baseBusiness.id}: ${detailsData.status} - ${detailsData.error_message || ''}`);
          }
        } catch (detailsError) {
          console.error(`Error fetching details for place_id ${baseBusiness.id}:`, detailsError);
        }
        return augmentedBusiness;
      })
    );
    
    return detailedBusinesses;

  } catch (error) {
    console.error("Error in searchBusinessesAction:", error);
    if (error instanceof Error) {
        if (error.message.includes("API key not valid")) {
             throw new Error("Invalid Google Places API key. Please check your .env.local file and Google Cloud Console settings.");
        }
        throw new Error(`An error occurred while searching for businesses: ${error.message}`);
    }
    throw new Error("An unknown error occurred while searching for businesses.");
  }
}
