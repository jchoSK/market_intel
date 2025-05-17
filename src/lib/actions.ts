
"use server";

import type { Business, AdsInfo } from "@/types";
import { z } from "zod";
import puppeteer from 'puppeteer'; // Import puppeteer

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

async function checkBusinessForAdsWithPuppeteer(businessName: string): Promise<AdsInfo> {
  if (!businessName || businessName.trim() === "") {
    console.warn("[Puppeteer] Business name is empty, skipping Ads Transparency Check.");
    return { isRunningAds: null, adType: "Missing business name" };
  }

  let browser;
  try {
    console.log(`[Puppeteer] Launching browser for Ads Transparency Check for: ${businessName}`);
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu'
      ],
    });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');

    const transparencyBaseUrl = `https://adstransparency.google.com/`;
    console.log(`[Puppeteer] Navigating to: ${transparencyBaseUrl} to search for "${businessName}"`);
    await page.goto(transparencyBaseUrl, { waitUntil: 'networkidle2', timeout: 60000 });

    // ** CRITICAL: Selectors for search input and button might change. **
    // These are educated guesses based on common patterns on Google sites.
    // Inspect the Ads Transparency Center to confirm/update these selectors.
    const searchInputSelector = 'input[aria-label="Search advertisers or keywords"], input[aria-label="Search"], input[placeholder*="Search"]'; // Try multiple common selectors
    const searchButtonSelector = 'button[aria-label="Search"], button[type="submit"]'; // Try multiple common selectors

    try {
      console.log(`[Puppeteer] Waiting for search input: ${searchInputSelector}`);
      await page.waitForSelector(searchInputSelector, { timeout: 15000 });
      console.log(`[Puppeteer] Typing "${businessName}" into search input.`);
      await page.type(searchInputSelector, businessName);
      
      console.log(`[Puppeteer] Waiting for search button: ${searchButtonSelector}`);
      await page.waitForSelector(searchButtonSelector, { timeout: 10000 });
      console.log(`[Puppeteer] Clicking search button.`);
      await page.click(searchButtonSelector);
      
      console.log(`[Puppeteer] Search submitted for "${businessName}". Waiting for results page to load...`);
      // Wait for navigation or a clear indication that results have loaded.
      // This might need to be adjusted based on how the site loads results (e.g., SPA navigation).
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(e => {
        console.log(`[Puppeteer] waitForNavigation after search click failed or timed out for "${businessName}". Proceeding to check content. Error: ${e.message}`);
      });
      await new Promise(resolve => setTimeout(resolve, 7000)); // Additional wait for dynamic content loading

    } catch (interactionError) {
      console.error(`[Puppeteer] Error interacting with search form for "${businessName}": ${interactionError}`);
      // await page.screenshot({ path: `debug_interaction_error_${businessName.replace(/[^a-zA-Z0-9]/g, '_')}.png` });
      if (browser) await browser.close();
      return { isRunningAds: null, adType: "Interaction Error with ATC site" };
    }

    // ** CRITICAL: Selectors/text for ads presence might change. **
    // These are XPaths to find text indicating ads or no ads.
    const adsPresentIndicatorXPath = `//*[contains(text(), "ads by this advertiser") or contains(text(), "ads from this advertiser")]`;
    const noAdsIndicatorXPath = `//*[contains(text(), "No ads found for this advertiser") or contains(text(), "didn’t find any ads for this advertiser")]`;
    const tooManyResultsXPath = `//*[contains(text(), "too many results") or contains(text(), "results are too broad")]`; // Handle ambiguous searches

    let isRunningAds: boolean | null = null;
    let adType: string | null = null;

    try {
      console.log(`[Puppeteer] Checking for ad indicators on results page for "${businessName}"...`);
      
      const tooManyResultsElements = await page.$x(tooManyResultsXPath);
      if (tooManyResultsElements.length > 0) {
          console.log(`[Puppeteer] Search for "${businessName}" yielded too many results or was too broad. Ads status unclear.`);
          isRunningAds = null;
          adType = "Ambiguous Search / Too Broad";
      } else {
          const adsFoundElements = await page.$x(adsPresentIndicatorXPath);
          if (adsFoundElements.length > 0) {
            isRunningAds = true;
            adType = "Google Ads"; // Simplified - determining specific ad types is much harder
            console.log(`[Puppeteer] Ads found for "${businessName}"`);
          } else {
            const noAdsFoundElements = await page.$x(noAdsIndicatorXPath);
            if (noAdsFoundElements.length > 0) {
              isRunningAds = false;
              console.log(`[Puppeteer] No ads found for "${businessName}"`);
            } else {
              console.log(`[Puppeteer] Ads status unclear for "${businessName}". Neither specific indicator found. Page content might have changed or search was ineffective.`);
              // await page.screenshot({ path: `debug_ads_unclear_${businessName.replace(/[^a-zA-Z0-9]/g, '_')}.png` });
              isRunningAds = null; 
              adType = "Ads status undetermined";
            }
          }
      }
    } catch (scrapingError) {
      console.error(`[Puppeteer] Error during scraping ad indicators for "${businessName}": ${scrapingError}`);
      // await page.screenshot({ path: `debug_scraping_error_${businessName.replace(/[^a-zA-Z0-9]/g, '_')}.png` });
      isRunningAds = null;
      adType = "Scraping Error on ATC site";
    }
    
    console.log(`[Puppeteer] Closing browser for "${businessName}"`);
    await browser.close();
    return { isRunningAds, adType };

  } catch (error) {
    console.error(`[Puppeteer] General error in checkBusinessForAdsWithPuppeteer for "${businessName}":`, error);
    if (browser) {
      await browser.close().catch(e => console.error("[Puppeteer] Error closing browser in catch block:", e));
    }
    return { isRunningAds: null, adType: "General Puppeteer Error" };
  }
}

// Wrapper function remains simple
async function checkBusinessForAds(businessName: string): Promise<AdsInfo> {
  return checkBusinessForAdsWithPuppeteer(businessName);
}

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
  
  const textSearchFields = "place_id,name,formatted_address,rating,user_ratings_total,geometry";
  const textSearchApiUrl = `${TEXT_SEARCH_API_URL}?query=${encodeURIComponent(query)}&radius=${radiusInMeters}&fields=${encodeURIComponent(textSearchFields)}&key=${GOOGLE_PLACES_API_KEY}`;

  try {
    console.log(`Fetching Text Search: ${textSearchApiUrl}`);
    const textSearchResponse = await fetch(textSearchApiUrl);
    if (!textSearchResponse.ok) {
      const errorData = await textSearchResponse.text();
      console.error("Google Places API Error (Text Search) - Non-OK response:", textSearchResponse.status, errorData);
      throw new Error(`Failed to fetch data from Google Places API (Text Search). Status: ${textSearchResponse.status}. Response: ${errorData}`);
    }
    const textSearchData = await textSearchResponse.json();


    if (textSearchData.status !== "OK" && textSearchData.status !== "ZERO_RESULTS") {
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
      adsInfo: undefined,
    }));

    const placeDetailsFieldsToFetch = "internationalPhoneNumber,websiteUri,reviewSummary,location"; 

    const detailedBusinessesPromises = businessesFromTextSearch.map(async (baseBusiness: Business) => {
      let augmentedBusiness: Business = { ...baseBusiness }; 
      
      if (baseBusiness.id) {
        const placeDetailsUrl = `${PLACE_DETAILS_NEW_API_URL_BASE}/${baseBusiness.id}`;
        try {
          const detailsResponse = await fetch(placeDetailsUrl, {
            method: 'GET',
            headers: { 
              'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY, 
              'X-Goog-FieldMask': placeDetailsFieldsToFetch 
            }
          });
          const responseText = await detailsResponse.text(); 
          if (detailsResponse.ok) {
            const detailsData = JSON.parse(responseText);
            augmentedBusiness.phoneNumber = detailsData.internationalPhoneNumber;
            augmentedBusiness.website = detailsData.websiteUri;
            augmentedBusiness.reviewSummary = detailsData.reviewSummary; // Contains text and languageCode
             if (detailsData.location?.latitude && detailsData.location?.longitude) {
              augmentedBusiness.latitude = detailsData.location.latitude;
              augmentedBusiness.longitude = detailsData.location.longitude;
            }
          } else {
            console.warn(`[Place Details API] Failed for ${baseBusiness.name} (ID: ${baseBusiness.id}). Status: ${detailsResponse.status}. Response: ${responseText.substring(0, 200)}`);
          }
        } catch (detailsError) {
          console.error(`[Place Details API] Error fetching details for ${baseBusiness.name} (ID: ${baseBusiness.id}):`, detailsError);
        }
      } else {
         console.warn(`Skipping details fetch for business without place_id: ${baseBusiness.name}`);
      }

      if (augmentedBusiness.name) {
        console.log(`[Ads Check] Initiating for: ${augmentedBusiness.name}`);
        augmentedBusiness.adsInfo = await checkBusinessForAds(augmentedBusiness.name);
      } else {
        console.log(`[Ads Check] No name for business ID ${augmentedBusiness.id}, skipping Ads Transparency check.`);
        augmentedBusiness.adsInfo = { isRunningAds: null, adType: "Business name missing" };
      }
      return augmentedBusiness;
    });
    
    const detailedBusinesses = await Promise.all(detailedBusinessesPromises);
    return detailedBusinesses;

  } catch (error) {
    console.error("Error in searchBusinessesAction:", error);
    if (error instanceof Error) {
        if (error.message.includes("API key not valid") || error.message.includes("API key is missing") || error.message.includes("API_KEY_INVALID") || error.message.includes("API key not authorized") || error.message.includes("Places API") ) {
             throw new Error("Invalid, missing, or unauthorized Google Places API key, or Places API not correctly configured. Please check your .env.local file, ensure the Places API (both classic and new v1 with relevant SKUs like Enterprise) and Maps JavaScript API are enabled, unrestricted for your server/app, and that billing is active in your Google Cloud Console.");
        }
        throw new Error(`An error occurred while searching for businesses: ${error.message}`);
    }
    throw new Error("An unknown error occurred while searching for businesses.");
  }
}

    