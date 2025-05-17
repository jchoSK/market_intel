
"use server";

import type { Business } from "@/types";
import { z } from "zod";

const searchSchema = z.object({
  category: z.string().min(1, "Category is required").max(100, "Category is too long"),
  location: z.string().min(1, "Location is required").max(100, "Location is too long"),
  radius: z.coerce.number().min(1, "Radius must be at least 1").max(50, "Radius cannot exceed 50"),
});

const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY;
const PLACES_API_BASE_URL = "https://maps.googleapis.com/maps/api/place/textsearch/json";

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

  // Text Search biases results by radius but might include prominent results outside it.
  // The fields requested are generally returned by default in recent versions of the Text Search API.
  const apiUrl = `${PLACES_API_BASE_URL}?query=${encodeURIComponent(query)}&radius=${radiusInMeters}&key=${GOOGLE_PLACES_API_KEY}`;

  try {
    const response = await fetch(apiUrl);
    const data = await response.json();

    if (!response.ok || (data.status !== "OK" && data.status !== "ZERO_RESULTS")) {
      console.error("Google Places API Error:", data.status, data.error_message);
      throw new Error(data.error_message || `Failed to fetch data from Google Places API. Status: ${data.status}`);
    }

    if (data.status === "ZERO_RESULTS") {
      return [];
    }

    return data.results.map((place: any): Business => ({
      id: place.place_id,
      name: place.name,
      address: place.formatted_address,
      phoneNumber: place.international_phone_number, // May not always be present
      website: place.website, // May not always be present
      rating: place.rating,
      reviewsCount: place.user_ratings_total,
    }));

  } catch (error) {
    console.error("Error in searchBusinessesAction:", error);
    if (error instanceof Error) {
        throw new Error(`An error occurred while searching for businesses: ${error.message}`);
    }
    throw new Error("An unknown error occurred while searching for businesses.");
  }
}
