
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
// Place Details (New) API for fetching specific fields like website and phone
const PLACE_DETAILS_NEW_API_URL_BASE = "https://places.googleapis.com/v1/places"; // No /json here

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
    // Step 1: Discover businesses using Text Search (Classic API)
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
      id: place.place_id, // This is the place_id
      name: place.name,
      address: place.formatted_address,
      rating: place.rating,
      reviewsCount: place.user_ratings_total,
      phoneNumber: undefined,
      website: undefined,
    }));

    // Step 2: Fetch details (phone number, website) for each business using Place Details (New) API
    const detailedBusinesses = await Promise.all(
      businessesFromTextSearch.map(async (baseBusiness: Business) => {
        // Fields for Place Details (New) API
        // Correct field names for New API: internationalPhoneNumber, websiteUri
        const placeDetailsFieldsToFetch = "internationalPhoneNumber,websiteUri"; 
        const placeDetailsUrl = `${PLACE_DETAILS_NEW_API_URL_BASE}/${baseBusiness.id}?fields=${encodeURIComponent(placeDetailsFieldsToFetch)}`;
        
        let augmentedBusiness: Business = { ...baseBusiness };

        try {
          const detailsResponse = await fetch(placeDetailsUrl, {
            method: 'GET',
            headers: {
              'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY, // API Key in header for New API
              'Content-Type': 'application/json',
            }
          });

          if (detailsResponse.ok) {
            const detailsData = await detailsResponse.json();
            // Map new API field names to our Business type
            augmentedBusiness.phoneNumber = detailsData.internationalPhoneNumber;
            augmentedBusiness.website = detailsData.websiteUri;
          } else {
            let errorDetail = `Status: ${detailsResponse.status}`;
            try {
                const errorJson = await detailsResponse.json(); // detailsResponse.json() consumes the body
                if (errorJson.error && errorJson.error.message) {
                    errorDetail = errorJson.error.message;
                }
            } catch (e) { /* Ignore JSON parsing error, use status text or original error */ }
            console.warn(`Could not fetch details for place_id ${baseBusiness.id} using Place Details (New) API: ${errorDetail}`);
          }
        } catch (detailsError) {
          console.error(`Error fetching details for place_id ${baseBusiness.id} using Place Details (New) API:`, detailsError);
        }
        return augmentedBusiness;
      })
    );
    
    return detailedBusinesses;

  } catch (error) {
    console.error("Error in searchBusinessesAction:", error);
    if (error instanceof Error) {
        // This check might need to be more sophisticated if new API key errors are different
        if (error.message.includes("API key not valid") || error.message.includes("API key is missing")) {
             throw new Error("Invalid or missing Google Places API key. Please check your .env.local file and Google Cloud Console settings for the Places API (New).");
        }
        throw new Error(`An error occurred while searching for businesses: ${error.message}`);
    }
    throw new Error("An unknown error occurred while searching for businesses.");
  }
}
