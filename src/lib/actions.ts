
"use server";

import type { Business } from "@/types";
import { z } from "zod";

const searchSchema = z.object({
  category: z.string().min(1, "Category is required").max(100, "Category is too long"),
  location: z.string().min(1, "Location is required").max(100, "Location is too long"),
  radius: z.coerce.number().min(1, "Radius must be at least 1").max(50, "Radius cannot exceed 50"),
});

const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY;

// Classic Text Search API for discovery
const TEXT_SEARCH_API_URL = "https://maps.googleapis.com/maps/api/place/textsearch/json";
// Place Details (New) API base URL
const PLACE_DETAILS_NEW_API_URL_BASE = "https://places.googleapis.com/v1/places";

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
  
  // Fields for the initial Text Search (classic API) - include geometry for lat/lng
  const textSearchFields = "place_id,name,formatted_address,rating,user_ratings_total,geometry";
  const textSearchApiUrl = `${TEXT_SEARCH_API_URL}?query=${encodeURIComponent(query)}&radius=${radiusInMeters}&fields=${encodeURIComponent(textSearchFields)}&key=${GOOGLE_PLACES_API_KEY}`;

  try {
    // Step 1: Discover businesses using Text Search (Classic API)
    console.log(`Fetching Text Search: ${textSearchApiUrl}`);
    const textSearchResponse = await fetch(textSearchApiUrl);
    const textSearchData = await textSearchResponse.json();

    if (!textSearchResponse.ok || (textSearchData.status !== "OK" && textSearchData.status !== "ZERO_RESULTS")) {
      console.error("Google Places API Error (Text Search):", textSearchData.status, textSearchData.error_message, textSearchData.info_messages);
      let errorMessage = "Failed to fetch data from Google Places API (Text Search).";
      if (textSearchData.error_message) {
        errorMessage = textSearchData.error_message;
      } else if (textSearchData.status) {
        errorMessage += ` Status: ${textSearchData.status}`;
      }
      throw new Error(errorMessage);
    }

    if (textSearchData.status === "ZERO_RESULTS" || !textSearchData.results || textSearchData.results.length === 0) {
      return [];
    }

    const businessesFromTextSearch = textSearchData.results.map((place: any) => ({
      id: place.place_id,
      name: place.name,
      address: place.formatted_address,
      rating: place.rating,
      reviewsCount: place.user_ratings_total,
      latitude: place.geometry?.location?.lat,
      longitude: place.geometry?.location?.lng,
      phoneNumber: undefined, 
      website: undefined,
      reviewSummary: undefined,
    }));

    // Step 2: Fetch details for each business using Place Details (New) API
    const placeDetailsFieldsToFetch = "internationalPhoneNumber,websiteUri,reviewSummary,location"; 

    const detailedBusinesses = await Promise.all(
      businessesFromTextSearch.map(async (baseBusiness: Business) => {
        if (!baseBusiness.id) {
          console.warn(`Skipping details fetch for business without place_id: ${baseBusiness.name}`);
          return baseBusiness;
        }
        
        const placeDetailsUrl = `${PLACE_DETAILS_NEW_API_URL_BASE}/${baseBusiness.id}`;
        let augmentedBusiness: Business = { ...baseBusiness };

        try {
          console.log(`Fetching Place Details (New) for ${baseBusiness.name} (${baseBusiness.id}): ${placeDetailsUrl} with FieldMask: ${placeDetailsFieldsToFetch}`);
          const detailsResponse = await fetch(placeDetailsUrl, {
            method: 'GET',
            headers: {
              'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY,
              'X-Goog-FieldMask': placeDetailsFieldsToFetch,
            }
          });

          const responseText = await detailsResponse.text(); 

          if (detailsResponse.ok) {
            const detailsData = JSON.parse(responseText);
            augmentedBusiness.phoneNumber = detailsData.internationalPhoneNumber;
            augmentedBusiness.website = detailsData.websiteUri;
            augmentedBusiness.reviewSummary = detailsData.reviewSummary;
             // Prefer details from Place Details (New) if available
            if (detailsData.location?.latitude && detailsData.location?.longitude) {
              augmentedBusiness.latitude = detailsData.location.latitude;
              augmentedBusiness.longitude = detailsData.location.longitude;
            }
            
            if (!detailsData.internationalPhoneNumber) console.warn(`Phone number missing in API response for ${baseBusiness.name} (${baseBusiness.id}).`);
            if (!detailsData.websiteUri) console.warn(`Website URI missing in API response for ${baseBusiness.name} (${baseBusiness.id}).`);
            if (!detailsData.reviewSummary) console.warn(`Review summary missing in API response for ${baseBusiness.name} (${baseBusiness.id}).`);
            if (!detailsData.location) console.warn(`Location data missing in Place Details API response for ${baseBusiness.name} (${baseBusiness.id})`);

          } else {
            let errorDetail = `Status: ${detailsResponse.status}. Response: ${responseText}`;
            console.warn(`Could not fetch details for ${baseBusiness.name} (ID: ${baseBusiness.id}) using Place Details (New) API: ${errorDetail}. URL: ${placeDetailsUrl}`);
          }
        } catch (detailsError) {
          console.error(`Error fetching or parsing details for ${baseBusiness.name} (ID: ${baseBusiness.id}) using Place Details (New) API:`, detailsError);
        }
        return augmentedBusiness;
      })
    );
    
    return detailedBusinesses;

  } catch (error) {
    console.error("Error in searchBusinessesAction:", error);
    if (error instanceof Error) {
        if (error.message.includes("API key not valid") || error.message.includes("API key is missing") || error.message.includes("API_KEY_INVALID") || error.message.includes("API key not authorized")) {
             throw new Error("Invalid, missing, or unauthorized Google Places API key. Please check your .env.local file, ensure the Places API (both classic and new v1 with relevant SKUs) and Maps JavaScript API are enabled, unrestricted for your server/app, and that billing is active in your Google Cloud Console.");
        }
        throw new Error(`An error occurred while searching for businesses: ${error.message}`);
    }
    throw new Error("An unknown error occurred while searching for businesses.");
  }
}

