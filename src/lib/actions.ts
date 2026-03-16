
"use server";

import type { Business, SearchParams, AdsInfo, PromotionsScanResult } from "@/types";
import { z } from "zod";
import { fetchPromotionsWithFirecrawl } from "@/lib/firecrawl-promotions";

export type SearchLogEvent = {
  type: "log";
  level: "info" | "warn" | "error";
  message: string;
};

export type SearchProgressEvent = {
  type: "progress";
  stage: string;
  completed: number;
  total: number;
  percent: number;
  message?: string;
};

export type SearchEvent = SearchLogEvent | SearchProgressEvent;

export type SearchResult = {
  businesses: Business[] | null;
  searchedLocationCenter?: { lat: number; lng: number };
  logs: string[];
  error: string | null;
  totalAvailable?: number;
};


const searchSchema = z.object({
  category: z.string().min(1, "Business category is required.").max(100, "Category is too long"),
  location: z.string().min(2, "Location must be at least 2 characters.").max(100, "Location is too long"),
  radius: z.coerce.number().min(1, "Radius must be at least 1.").max(50, "Radius cannot exceed 50"),
  maxResults: z.coerce.number().min(1).max(20).optional().default(20), // Default to 20, max 20
});

const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY; // For server-side calls
const SEARCHAPI_IO_API_KEY = process.env.SEARCHAPI_IO_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY; // Ensure this is used by AI flows if they directly call OpenAI

const TEXT_SEARCH_NEW_API_URL = "https://places.googleapis.com/v1/places:searchText";
const PLACE_DETAILS_NEW_API_URL_BASE = "https://places.googleapis.com/v1/places";
const SEARCHAPI_IO_ADS_URL = "https://www.searchapi.io/api/v1/search";
const GEOCODING_API_URL = "https://maps.googleapis.com/maps/api/geocode/json";

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const splitCommaSeparatedValues = (value?: string) => {
  if (!value) return [];
  const normalized = value.trim();
  if (!normalized || normalized.toLowerCase() === 'not available' || normalized.toLowerCase() === 'none') {
    return [];
  }
  return normalized
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
};

function extractDomain(url?: string): string | null {
  if (!url) return null;
  try {
    let domain = new URL(url).hostname;
    domain = domain.replace(/^www\./, '');
    return domain;
  } catch (e) {
    // Fallback for URLs without protocol but clearly domains
    if (url.includes('.') && !url.includes(' ') && !url.startsWith('/')) {
        return url.replace(/^www\./, '');
    }
    return null;
  }
}

// Geocode a location string to get lat/lng coordinates
async function geocodeLocation(
  location: string,
  apiKey: string
): Promise<{ lat: number; lng: number } | null> {
  try {
    const response = await fetch(
      `${GEOCODING_API_URL}?address=${encodeURIComponent(location)}&key=${apiKey}`
    );
    const data = await response.json();

    if (data.status === 'OK' && data.results?.[0]?.geometry?.location) {
      const { lat, lng } = data.results[0].geometry.location;
      return { lat, lng };
    }
    return null;
  } catch (error) {
    console.error('Geocoding error:', error);
    return null;
  }
}

async function checkAdsWithSearchApi(
  domain: string,
  apiKey: string | undefined,
  logCollector: string[]
): Promise<AdsInfo> {
  const prefix = "[CLIENT-LOG][AdsAPI]";
  const clientLog = (message: string) => {
    console.log(message.replace('[CLIENT-LOG]', '[AdsCheckLog]'));
    logCollector.push(`${prefix} ${message}`);
  };
  const clientErrorLog = (message: string, error: any) => {
    console.error(message.replace('[CLIENT-LOG]', '[AdsCheckLog]'), error || '');
    logCollector.push(`${prefix} ERROR: ${message}` + (error ? ` Details: ${error?.message || error}` : ''));
  };

  if (!apiKey) {
    clientErrorLog("SearchApi.io API key is missing.", null);
    return { isRunningAds: null, adCount: 0, source: "SearchApi.io", error: "SearchApi.io API Key missing", adsTransparencyLink: undefined };
  }

  const params = new URLSearchParams({
    engine: "google_ads_transparency_center",
    domain: domain,
    time_period: "last_30_days",
    api_key: apiKey,
  });

  const requestUrl = `${SEARCHAPI_IO_ADS_URL}?${params.toString()}`;
  clientLog(`Requesting ${requestUrl}`);

  try {
    const response = await fetch(requestUrl, { cache: 'no-store' });
    const responseData = await response.json();

    if (!response.ok) {
      let errMsg = `SearchApi.io API Error: ${response.status} - ${responseData?.search_metadata?.status || responseData?.error || 'Unknown error'}`;
      // Specific error message handling for domain length
      const match = errMsg.match(/domain parameter '(.+?)' is too long\. Maximum length is 30 characters\./);
      if (match && match[0]) {
        errMsg = `domain parameter '${match[1]}' is too long. Maximum length is 30 characters.`;
      }
      clientErrorLog(errMsg, responseData);
      return { isRunningAds: null, adCount: 0, source: "SearchApi.io", error: errMsg, adsTransparencyLink: responseData?.search_metadata?.request_url };
    }

    if (responseData.search_metadata?.status !== "Success") {
      const errMsg = `SearchApi.io Search Failed: ${responseData.search_metadata?.status || 'Unknown failure reason'}`;
      clientErrorLog(errMsg, responseData);
      return { isRunningAds: null, adCount: 0, source: "SearchApi.io", error: errMsg, adsTransparencyLink: responseData?.search_metadata?.request_url };
    }

    const adCreatives = responseData.ad_creatives || [];
    const totalResults = responseData.search_information?.total_results;
    const adsTransparencyLink = responseData.search_metadata?.request_url; // Link to ATC search results

    const isRunning = adCreatives.length > 0 || (typeof totalResults === 'number' && totalResults > 0);
    const count = typeof totalResults === 'number' ? totalResults : adCreatives.length;

    clientLog(`SearchApi.io check for ${domain}: isRunningAds=${isRunning}, adCount=${count}, link=${adsTransparencyLink}`);
    return {
        isRunningAds: isRunning,
        adCount: count,
        source: "SearchApi.io",
        adsTransparencyLink: adsTransparencyLink, // Return the link
        error: null
    };

  } catch (error: any) {
    clientErrorLog(`Network or parsing error calling SearchApi.io for ${domain}`, error);
    return { isRunningAds: null, adCount: 0, source: "SearchApi.io", error: "Network/Parsing Error", adsTransparencyLink: undefined };
  }
}

export async function runBusinessSearch(
  params: SearchParams,
  options?: {
    onEvent?: (event: SearchEvent) => void;
    signal?: AbortSignal;
  }
): Promise<SearchResult> {
  const actionLogs: string[] = [];
  const emitEvent = options?.onEvent;
  const signal = options?.signal;
  const prefix = "[CLIENT-LOG][Action]";

  const serverLog = (message: string) => console.log(message);
  const clientLog = (message: string, collector: string[] = actionLogs) => {
    const fullMessage = `${prefix} ${message}`;
    serverLog(fullMessage.replace('[CLIENT-LOG]', ''));
    collector.push(fullMessage);
    emitEvent?.({ type: "log", level: "info", message });
  };
  const clientWarn = (message: string, collector: string[] = actionLogs) => {
    const fullMessage = `${prefix} WARN: ${message}`;
    console.warn(fullMessage.replace('[CLIENT-LOG]', ''));
    collector.push(fullMessage);
    emitEvent?.({ type: "log", level: "warn", message });
  }
  const clientErrorLog = (message: string, error?: any, collector: string[] = actionLogs) => {
    const fullMessage = `${prefix} ERROR: ${message}`;
    console.error(fullMessage.replace('[CLIENT-LOG]', ''), error || '');
    collector.push(fullMessage + (error ? ` Details: ${error?.message || error}` : ''));
    emitEvent?.({ type: "log", level: "error", message: error ? `${message} (${error?.message || error})` : message });
  };

  const emitProgress = (data: Omit<SearchProgressEvent, "type">) => {
    emitEvent?.({ type: "progress", ...data });
  };

  let abortLogged = false;
  const throwIfAborted = (stage: string) => {
    if (signal?.aborted) {
      if (!abortLogged) {
        clientWarn(`Abort signal received${stage ? ` during ${stage}` : ''}. Stopping search.`);
        abortLogged = true;
      }
      throw new Error("Search canceled by user");
    }
  };

  if (signal) {
    signal.addEventListener(
      "abort",
      () => {
        if (!abortLogged) {
          clientWarn("Abort signal received. Preparing to stop search...");
          abortLogged = true;
        }
      },
      { once: true }
    );
  }

  clientLog(`Search initiated with params: ${JSON.stringify(params)}`);
  const TASKS_PER_BUSINESS = 3; // details, ads, call outs
  let totalBusinesses = 0;
  let completedBusinesses = 0;
  let currentStep = 0; // Current step within current business (1=details, 2=ads, 3=call outs)
  const stepNames = ['details', 'ads check', 'call outs'];

  const computePercent = () => (totalBusinesses > 0 ? Math.min(100, Math.round((completedBusinesses / totalBusinesses) * 100)) : 100);

  const publishProgress = (stage: string, message?: string) => {
    emitProgress({ stage, completed: completedBusinesses, total: totalBusinesses, percent: computePercent(), message });
  };

  // Advance progress - shows both business count and current step
  const advanceProgress = (stage: string, message?: string) => {
    currentStep++;
    const stepName = stepNames[currentStep - 1] || stage;

    if (currentStep >= TASKS_PER_BUSINESS) {
      completedBusinesses++;
      currentStep = 0;
    }

    // Show "Business X of Y (step)"
    const progressMessage = totalBusinesses > 0
      ? `Business ${completedBusinesses + (currentStep > 0 ? 1 : 0)} of ${totalBusinesses} (${stepName})`
      : message;

    publishProgress(stage, progressMessage);
  };

  publishProgress("initializing", "Preparing search...");
  throwIfAborted("initialization");

  if (!GOOGLE_PLACES_API_KEY) {
    const errMsg = "Server configuration error: Google Places API key (GOOGLE_PLACES_API_KEY) missing. Ensure it is set in .env.local.";
    clientErrorLog(errMsg);
    publishProgress("complete", "Search aborted: missing Google Places API key.");
    return { businesses: null, logs: actionLogs, error: errMsg, totalAvailable: 0 };
  }
  if (!OPENAI_API_KEY) {
    clientWarn("OpenAI API key (OPENAI_API_KEY) is not set. AI-powered research features will not be fetched.");
  }


  const validation = searchSchema.safeParse(params);
  if (!validation.success) {
    const firstError = Object.values(validation.error.flatten().fieldErrors)[0]?.[0];
    const errMsg = firstError || "Invalid search parameters.";
    clientErrorLog(errMsg);
    publishProgress("complete", "Search aborted: invalid parameters.");
    return { businesses: null, logs: actionLogs, error: errMsg, totalAvailable: 0 };
  }

  const { category, location, radius, maxResults } = validation.data;
  const query = `${category} in ${location}`;
  throwIfAborted("pre-text-search");

  const textSearchFieldMask = "places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.websiteUri,places.internationalPhoneNumber";

  let searchedLocationCenter: {lat: number, lng: number} | undefined = undefined;

  // Geocode the location to get coordinates for radius-based search
  const locationCoords = await geocodeLocation(location, GOOGLE_PLACES_API_KEY!);
  if (locationCoords) {
    searchedLocationCenter = locationCoords;
    clientLog(`Geocoded location "${location}" to lat: ${locationCoords.lat}, lng: ${locationCoords.lng}`);
  } else {
    clientLog(`Could not geocode location "${location}", searching without radius restriction.`);
  }

  clientLog(`Starting Text Search (New) for query: "${query}", targeting up to ${maxResults} results within ${radius} mile radius.`);

  try {
    const requestBody: any = {
      textQuery: query,
      maxResultCount: maxResults,
    };

    // Add locationBias with radius if we have coordinates
    if (locationCoords) {
      // Convert miles to meters (1 mile = 1609.34 meters)
      const radiusInMeters = radius * 1609.34;
      requestBody.locationBias = {
        circle: {
          center: {
            latitude: locationCoords.lat,
            longitude: locationCoords.lng,
          },
          radius: radiusInMeters,
        },
      };
    }

    const textSearchLogMessage = `[TextSearch (New) API Call] URL: ${TEXT_SEARCH_NEW_API_URL}, Body: ${JSON.stringify(requestBody).substring(0,300)}... FieldMask: ${textSearchFieldMask}`;
    clientLog(textSearchLogMessage);

    throwIfAborted("text-search");
    const textSearchResponse = await fetch(TEXT_SEARCH_NEW_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY!,
        'X-Goog-FieldMask': textSearchFieldMask,
      },
      body: JSON.stringify(requestBody),
      cache: 'no-store',
      signal,
    });

    const textSearchData = await textSearchResponse.json();

    if (!textSearchResponse.ok || !textSearchData) {
      const errorDetail = textSearchData?.error?.message || (textSearchData?.details ? JSON.stringify(textSearchData.details) : 'Unknown API error structure');
      const errMsg = `Google Places API Error (Text Search - New): ${textSearchResponse.status} - ${errorDetail}`;
      clientErrorLog(errMsg, textSearchData);
      return { businesses: null, logs: actionLogs, error: errMsg, totalAvailable: 0 };
    }

    const foundPlaces = textSearchData.places || [];
    const totalAvailableBusinesses = foundPlaces.length;
    totalBusinesses = foundPlaces.length;

    clientLog(`[Text Search (New) Raw Places Data Example (First item if any)] ${foundPlaces.length > 0 ? JSON.stringify(foundPlaces[0]).substring(0, 300) + '...' : 'No places found.'}`);
    clientLog(`Text Search (New) successful. Requested: ${maxResults}, Google returned: ${foundPlaces.length}. Will process all in batches.`);
    if (foundPlaces.length < maxResults) {
      clientLog(`[Note] Google Places returned fewer results than requested. This is normal - Google only returns businesses that match the query within the specified area.`);
    }

    publishProgress("text-search", `Found ${foundPlaces.length} business${foundPlaces.length === 1 ? '' : 'es'}. Starting processing...`);

    if (foundPlaces.length > 0 && foundPlaces[0].location) {
      searchedLocationCenter = { lat: foundPlaces[0].location.latitude, lng: foundPlaces[0].location.longitude };
      clientLog(`[Text Search (New) - First Result Location Check] Lat: ${foundPlaces[0].location.latitude}, Lng: ${foundPlaces[0].location.longitude}`);
    } else if (foundPlaces.length > 0) {
      clientWarn(`[Text Search (New) - First Result Location Check] Location data missing for first result: ${JSON.stringify(foundPlaces[0].displayName?.text)}`);
    }

    if (foundPlaces.length === 0) {
      clientLog("Text Search (New) returned zero results.");
      publishProgress("finalizing", "No businesses found.");
      return {
        businesses: [],
        logs: actionLogs,
        error: null,
        searchedLocationCenter,
        totalAvailable: totalAvailableBusinesses,
      };
    }

    let businessesFromTextSearch: Partial<Business>[] = foundPlaces.map((place: any) => {
      const business: Partial<Business> = {
        id: place.id,
        name: place.displayName?.text || 'N/A',
        address: place.formattedAddress || 'N/A',
        rating: place.rating,
        reviewsCount: place.userRatingCount,
        latitude: place.location?.latitude,
        longitude: place.location?.longitude,
        phoneNumber: place.internationalPhoneNumber,
        website: place.websiteUri,
      };
      if (!business.latitude || !business.longitude) {
        clientWarn(`[Text Search Result] Missing coordinates for ${business.name} (ID: ${business.id})`);
      } else {
         clientLog(`[Text Search Result] Coordinates for ${business.name}: Lat ${business.latitude}, Lng ${business.longitude}`);
      }
      return business;
    });

    const placeDetailsFieldsToFetch = "reviewSummary,location,internationalPhoneNumber,websiteUri";

    const processBusiness = async (baseBusiness: Partial<Business>): Promise<Business> => {
      const businessLabel = baseBusiness.name || 'Unnamed business';
      throwIfAborted(`processing ${businessLabel}`);

      if (!baseBusiness.id || !baseBusiness.name) {
        clientWarn(`Skipping details fetch for business without place_id or name: ${JSON.stringify(baseBusiness)}`);
        advanceProgress("business-details", `Skipped details for ${businessLabel} (missing identifier).`);
        advanceProgress("ads-check", `Skipped ads check for ${businessLabel} (missing identifier).`);
        advanceProgress("call-outs-scan", `Skipped call outs scan for ${businessLabel} (missing identifier).`);
        return baseBusiness as Business;
      }

      let augmentedBusiness: Business = { ...baseBusiness } as Business;

      const placeDetailsUrl = `${PLACE_DETAILS_NEW_API_URL_BASE}/${baseBusiness.id}`;
      let detailsMessage = `Details processed for ${businessLabel}.`;
      try {
        throwIfAborted(`place details for ${businessLabel}`);
        clientLog(`[PlaceDetails] Fetching for ${baseBusiness.name} (${baseBusiness.id}) with FieldMask: ${placeDetailsFieldsToFetch}, URL: ${placeDetailsUrl}`);
        const detailsResponse = await fetch(placeDetailsUrl, {
          method: 'GET',
          headers: {
            'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY!,
            'X-Goog-FieldMask': placeDetailsFieldsToFetch,
          },
          cache: 'no-store',
          signal: signal,
        });

        if (detailsResponse.ok) {
          const detailsData = await detailsResponse.json();
          clientLog(`[PlaceDetails] Data received for ${baseBusiness.name}: Keys - ${JSON.stringify(Object.keys(detailsData))}`);
          if (detailsData.reviewSummary) augmentedBusiness.reviewSummary = detailsData.reviewSummary;

          let locationUpdated = false, phoneUpdated = false, websiteUpdated = false;

          if (detailsData.location?.latitude && detailsData.location?.longitude) {
             augmentedBusiness.latitude = detailsData.location.latitude;
             augmentedBusiness.longitude = detailsData.location.longitude;
             locationUpdated = true;
          }
          if (detailsData.internationalPhoneNumber) {
            augmentedBusiness.phoneNumber = detailsData.internationalPhoneNumber;
            phoneUpdated = true;
          }
          if (detailsData.websiteUri) {
            augmentedBusiness.website = detailsData.websiteUri;
            websiteUpdated = true;
          }
          clientLog(`[PlaceDetails Updates for ${baseBusiness.name}] Location: ${locationUpdated ? 'Updated' : 'Kept TextSearch val (if any)'} (Lat ${augmentedBusiness.latitude}, Lng ${augmentedBusiness.longitude}), Phone: ${phoneUpdated ? 'Updated' : 'Kept TextSearch val (if any)'} (${augmentedBusiness.phoneNumber}), Website: ${websiteUpdated ? 'Updated' : 'Kept TextSearch val (if any)'} (${augmentedBusiness.website})`);
        } else {
          const responseText = await detailsResponse.text().catch(() => "Could not get response text");
          clientErrorLog(`[PlaceDetails] Error for ${baseBusiness.name} (ID: ${baseBusiness.id}). Status: ${detailsResponse.status}. Response: ${responseText.substring(0, 200)}...`);
          detailsMessage = `Details unavailable for ${businessLabel}.`;
        }
      } catch (detailsError: any) {
        clientErrorLog(`[PlaceDetails] Network/Parsing Error for ${baseBusiness.name} (ID: ${baseBusiness.id})`, detailsError);
        detailsMessage = `Details fetch failed for ${businessLabel}.`;
      }
      advanceProgress("business-details", detailsMessage);

      let adsMessage: string;
      if (params.skipAdsCheck) {
        clientLog(`[AdsAPI] Skipping ads transparency check for ${businessLabel} (disabled by user).`);
        adsMessage = `Ads transparency check skipped for ${businessLabel} (disabled).`;
      } else {
        const domainForAdsCheck = extractDomain(augmentedBusiness.website);
        adsMessage = `Ads transparency check processed for ${businessLabel}.`;
        if (domainForAdsCheck && SEARCHAPI_IO_API_KEY) {
          try {
              throwIfAborted(`ads check for ${businessLabel}`);
              clientLog(`[AdsAPI] Checking for domain: ${domainForAdsCheck} (Business: ${augmentedBusiness.name})`);
              const adsData = await checkAdsWithSearchApi(domainForAdsCheck, SEARCHAPI_IO_API_KEY, actionLogs);
              augmentedBusiness.adsInfo = adsData;
              adsMessage = `Ads transparency check complete for ${businessLabel}.`;
          } catch (adsError: any) {
              clientErrorLog(`[AdsAPI] Error for domain ${domainForAdsCheck}: ${adsError.message}`, adsError);
              augmentedBusiness.adsInfo = { isRunningAds: null, adCount: 0, source: "SearchApi.io", error: "API Error", adsTransparencyLink: undefined };
              adsMessage = `Ads transparency check failed for ${businessLabel}.`;
          }
        } else if (!domainForAdsCheck) {
            augmentedBusiness.adsInfo = { isRunningAds: null, adCount: 0, source: "SearchApi.io", error: "No domain for Ads Check", adsTransparencyLink: undefined };
            adsMessage = `Ads transparency check skipped for ${businessLabel} (no domain).`;
        } else {
            clientWarn("[AdsAPI] SEARCHAPI_IO_API_KEY not set. Skipping ads check.", actionLogs);
            augmentedBusiness.adsInfo = { isRunningAds: null, adCount: 0, source: "SearchApi.io", error: "API key missing for Ads Check", adsTransparencyLink: undefined };
            adsMessage = `Ads transparency check skipped for ${businessLabel} (missing API key).`;
        }
      }
      advanceProgress("ads-check", adsMessage);

      // Mark call outs as pending - crawling happens in separate batched connections
      const todayISO = new Date().toISOString().split('T')[0];
      if (augmentedBusiness.website) {
        augmentedBusiness.promotionsScan = {
          websiteStatus: 'Pending crawl',
          dataVerificationDate: todayISO,
          promotions: [],
        };
      } else {
        augmentedBusiness.promotionsScan = {
          websiteStatus: 'No website available',
          dataVerificationDate: todayISO,
          promotions: [],
        };
      }
      advanceProgress("call-outs-scan", `Call outs pending for ${businessLabel}.`);

      return augmentedBusiness;
    };

    throwIfAborted("before business processing");
    const businessTasks = businessesFromTextSearch.map((baseBusiness: Partial<Business>) => () => processBusiness(baseBusiness));

    // Process businesses in batches to avoid Firebase App Hosting timeout
    // Fast search phase (no crawling) - can handle larger batches
    const BATCH_SIZE = 10; // Process 10 businesses at a time
    const detailedBusinesses: Business[] = [];

    const totalBatches = Math.ceil(businessTasks.length / BATCH_SIZE);
    clientLog(`[Batch Processing] Starting batch processing: ${businessTasks.length} businesses in ${totalBatches} batch${totalBatches === 1 ? '' : 'es'} of up to ${BATCH_SIZE}`);

    // Debug: Log websites for first few businesses
    const websitesPreview = businessesFromTextSearch.slice(0, 5).map(b => `${b.name}: ${b.website || 'NO WEBSITE'}`);
    clientLog(`[Debug] First 5 business websites: ${JSON.stringify(websitesPreview)}`);

    for (let i = 0; i < businessTasks.length; i += BATCH_SIZE) {
      throwIfAborted(`before batch ${Math.floor(i / BATCH_SIZE) + 1}`);
      const batchTasks = businessTasks.slice(i, i + BATCH_SIZE);
      const batchNumber = Math.floor(i / BATCH_SIZE) + 1;

      clientLog(`[Batch Processing] Processing batch ${batchNumber}/${totalBatches} (${batchTasks.length} businesses)`);
      publishProgress("batch-processing", `Processing batch ${batchNumber}/${totalBatches}...`);

      const batchResults = await Promise.all(batchTasks.map((task) => task()));
      throwIfAborted(`after batch ${batchNumber}`);
      detailedBusinesses.push(...batchResults);

      clientLog(`[Batch Processing] Completed batch ${batchNumber}/${totalBatches}. Total processed: ${detailedBusinesses.length}/${businessTasks.length}`);
    }

    completedBusinesses = totalBusinesses; // Ensure we show 100%
    publishProgress("finalizing", "Finalizing search results...");
    publishProgress("complete", `Complete! Processed ${totalBusinesses} businesses.`);
    clientLog(`All ${detailedBusinesses.length} businesses processed. Returning results.`);

    return {
      businesses: detailedBusinesses,
      logs: actionLogs,
      error: null,
      searchedLocationCenter,
      totalAvailable: totalAvailableBusinesses,
    };

  } catch (error: any) {
    if (error?.message === "Search canceled by user") {
      clientWarn("Search canceled by user before completion.");
      throw error;
    }
    let errorMessage = "An unknown error occurred while searching for businesses.";
    if (error instanceof Error) {
        errorMessage = `An error occurred while searching for businesses: ${error.message}`;
        if (error.message.includes("API key") || error.message.includes("API_KEY_INVALID") || error.message.includes("API key not authorized")) {
             errorMessage = "Invalid, missing, or unauthorized Google Places API key. Please check configuration and Google Cloud Console.";
        }
    }
    clientErrorLog(errorMessage, error.stack);
    publishProgress("finalizing", "Search ended with an error.");
    publishProgress("complete", "Search finished with an error.");
    return {
      businesses: null,
      logs: actionLogs,
      error: errorMessage,
      searchedLocationCenter,
      totalAvailable: 0,
    };
  }
}

export async function searchBusinessesAction(params: SearchParams): Promise<SearchResult> {
  return runBusinessSearch(params);
}

// Crawl batch types
export interface CrawlBatchItem {
  businessId: string;
  businessName: string;
  website: string;
}

export interface CrawlBatchResult {
  businessId: string;
  promotionsScan: {
    websiteStatus: string;
    dataVerificationDate: string;
    promotions: string[];
  };
}

export interface CrawlBatchResponse {
  results: CrawlBatchResult[];
  logs: string[];
  error: string | null;
}

/**
 * Run Firecrawl crawls for a batch of businesses.
 * This is called separately from the main search to avoid timeout issues.
 * Rate limited to 1 crawl per minute per Firecrawl free tier limits.
 */
export async function runCrawlBatch(
  businesses: CrawlBatchItem[],
  options?: {
    onEvent?: (event: SearchEvent) => void;
    signal?: AbortSignal;
  }
): Promise<CrawlBatchResponse> {
  const actionLogs: string[] = [];
  const emitEvent = options?.onEvent;
  const signal = options?.signal;
  const prefix = "[CLIENT-LOG][CrawlBatch]";

  const serverLog = (message: string) => console.log(message);
  const clientLog = (message: string) => {
    const fullMessage = `${prefix} ${message}`;
    serverLog(fullMessage.replace('[CLIENT-LOG]', ''));
    actionLogs.push(fullMessage);
    emitEvent?.({ type: "log", level: "info", message });
  };
  const clientErrorLog = (message: string, error?: any) => {
    const fullMessage = `${prefix} ERROR: ${message}`;
    console.error(fullMessage.replace('[CLIENT-LOG]', ''), error || '');
    actionLogs.push(fullMessage + (error ? ` Details: ${error?.message || error}` : ''));
    emitEvent?.({ type: "log", level: "error", message: error ? `${message} (${error?.message || error})` : message });
  };

  const emitProgress = (data: Omit<SearchProgressEvent, "type">) => {
    emitEvent?.({ type: "progress", ...data });
  };

  let abortLogged = false;
  const throwIfAborted = (stage: string) => {
    if (signal?.aborted) {
      if (!abortLogged) {
        clientLog(`Abort signal received during ${stage}. Stopping crawl batch.`);
        abortLogged = true;
      }
      throw new Error("Crawl batch canceled by user");
    }
  };

  clientLog(`Starting crawl batch for ${businesses.length} businesses (max 5 concurrent via sliding window)`);
  const todayISO = new Date().toISOString().split('T')[0];

  // Track progress
  let completedCount = 0;

  // Fire off all crawls at once - the concurrency limiter in firecrawl-promotions.ts
  // will keep max 5 running at a time using a sliding window (as one finishes, next starts)
  const crawlPromises = businesses.map(async (business) => {
    clientLog(`[Firecrawl] Queuing crawl for ${business.businessName} from ${business.website}`);

    try {
      const promotionsResult = await fetchPromotionsWithFirecrawl(
        business.website,
        business.businessName,
        (logMessage: string) => {
          // Send crawl status logs to client via SSE
          emitEvent?.({
            type: "log",
            level: "info",
            message: logMessage,
          });
        },
        signal
      );

      clientLog(`[Firecrawl] Crawl completed for ${business.businessName}: ${promotionsResult.promotions.length} items found (status: ${promotionsResult.websiteStatus}, job: ${promotionsResult.crawlJobId || 'none'})`);

      const result: CrawlBatchResult = {
        businessId: business.businessId,
        promotionsScan: {
          websiteStatus: promotionsResult.websiteStatus,
          dataVerificationDate: promotionsResult.dataVerificationDate,
          promotions: promotionsResult.promotions,
        },
      };

      // Update progress and emit result
      completedCount++;
      const percent = Math.round((completedCount / businesses.length) * 100);
      emitProgress({
        stage: "crawling",
        completed: completedCount,
        total: businesses.length,
        percent,
        message: `Completed ${completedCount}/${businesses.length}: ${business.businessName}`,
      });

      emitEvent?.({
        type: "log",
        level: "info",
        message: `CRAWL_RESULT:${JSON.stringify(result)}`,
      });

      return result;
    } catch (crawlError: any) {
      // Re-throw abort errors to stop all crawls
      if (crawlError?.message === "Aborted" || signal?.aborted) {
        clientLog(`[Firecrawl] Crawl aborted for ${business.businessName}`);
        throw crawlError;
      }

      clientErrorLog(`[Firecrawl] Error crawling ${business.businessName}`, crawlError);

      const result: CrawlBatchResult = {
        businessId: business.businessId,
        promotionsScan: {
          websiteStatus: `Crawl failed: ${crawlError?.message || 'Unknown error'}`,
          dataVerificationDate: todayISO,
          promotions: [],
        },
      };

      // Update progress and emit result
      completedCount++;
      const percent = Math.round((completedCount / businesses.length) * 100);
      emitProgress({
        stage: "crawling",
        completed: completedCount,
        total: businesses.length,
        percent,
        message: `Completed ${completedCount}/${businesses.length}: ${business.businessName} (failed)`,
      });

      emitEvent?.({
        type: "log",
        level: "info",
        message: `CRAWL_RESULT:${JSON.stringify(result)}`,
      });

      return result;
    }
  });

  // Wait for all to complete
  const results = await Promise.all(crawlPromises);
  clientLog(`[Firecrawl] All crawls completed. Total processed: ${results.length}/${businesses.length}`);

  emitProgress({
    stage: "complete",
    completed: businesses.length,
    total: businesses.length,
    percent: 100,
    message: `Crawl batch complete. Processed ${businesses.length} businesses.`,
  });

  clientLog(`Crawl batch complete. Processed ${businesses.length} businesses.`);

  return {
    results,
    logs: actionLogs,
    error: null,
  };
}

// Types for direct input search (skip Google Places, AI-only)
export interface DirectInputBusiness {
  businessName: string;
  website?: string;
  address?: string;
}

// Extended payload that includes skipPromotions flag for "My Business"
export interface DirectInputBusinessPayload extends DirectInputBusiness {
  skipPromotions?: boolean;
  isMyBusiness?: boolean;
  skipAdsCheck?: boolean;
}

export type DirectSearchResult = {
  business: Business | null;
  logs: string[];
  error: string | null;
};

/**
 * Run AI analysis on a single business with optional Google Places lookup.
 * This is used for "Direct Input Search" where the user provides business info directly.
 * If name and address are provided, we attempt to look up the business on Google Places
 * to get rating, reviews, phone, website, and coordinates.
 */
export async function runDirectBusinessSearch(
  input: DirectInputBusinessPayload,
  options?: {
    onEvent?: (event: SearchEvent) => void;
    signal?: AbortSignal;
  }
): Promise<DirectSearchResult> {
  const actionLogs: string[] = [];
  const emitEvent = options?.onEvent;
  const signal = options?.signal;
  const prefix = "[CLIENT-LOG][DirectAction]";

  const serverLog = (message: string) => console.log(message);
  const clientLog = (message: string, collector: string[] = actionLogs) => {
    const fullMessage = `${prefix} ${message}`;
    serverLog(fullMessage.replace('[CLIENT-LOG]', ''));
    collector.push(fullMessage);
    emitEvent?.({ type: "log", level: "info", message });
  };
  const clientWarn = (message: string, collector: string[] = actionLogs) => {
    const fullMessage = `${prefix} WARN: ${message}`;
    console.warn(fullMessage.replace('[CLIENT-LOG]', ''));
    collector.push(fullMessage);
    emitEvent?.({ type: "log", level: "warn", message });
  };
  const clientErrorLog = (message: string, error?: any, collector: string[] = actionLogs) => {
    const fullMessage = `${prefix} ERROR: ${message}`;
    console.error(fullMessage.replace('[CLIENT-LOG]', ''), error || '');
    collector.push(fullMessage + (error ? ` Details: ${error?.message || error}` : ''));
    emitEvent?.({ type: "log", level: "error", message: error ? `${message} (${error?.message || error})` : message });
  };

  const emitProgress = (data: Omit<SearchProgressEvent, "type">) => {
    emitEvent?.({ type: "progress", ...data });
  };

  let abortLogged = false;
  const throwIfAborted = (stage: string) => {
    if (signal?.aborted) {
      if (!abortLogged) {
        clientWarn(`Abort signal received${stage ? ` during ${stage}` : ''}. Stopping search.`);
        abortLogged = true;
      }
      throw new Error("Search canceled by user");
    }
  };

  if (signal) {
    signal.addEventListener(
      "abort",
      () => {
        if (!abortLogged) {
          clientWarn("Abort signal received. Preparing to stop search...");
          abortLogged = true;
        }
      },
      { once: true }
    );
  }

  const isMyBusiness = input.isMyBusiness || input.skipPromotions;
  clientLog(`Direct search initiated for business: "${input.businessName}"${isMyBusiness ? ' (My Business - skipping promotions)' : ''}`);

  // Total tasks: places-lookup, ads-check, brands/promotions/hvac/segments (website intelligence - only if website exists and not skipped)
  const hasWebsite = Boolean(input.website);
  const shouldFetchPromotions = hasWebsite && !input.skipPromotions;
  const TOTAL_TASKS = shouldFetchPromotions ? 3 : 2; // places-lookup, ads-check, and optionally promotions
  let completedTasks = 0;

  const computePercent = () => Math.min(100, Math.round((completedTasks / TOTAL_TASKS) * 100));
  const publishProgress = (stage: string, message?: string) => {
    emitProgress({ stage, completed: completedTasks, total: TOTAL_TASKS, percent: computePercent(), message });
  };
  const advanceProgress = (stage: string, message?: string) => {
    completedTasks = Math.min(TOTAL_TASKS, completedTasks + 1);
    publishProgress(stage, message);
  };

  publishProgress("initializing", `Starting analysis for "${input.businessName}"...`);
  throwIfAborted("initialization");

  if (!OPENAI_API_KEY) {
    const errMsg = "Server configuration error: OpenAI API key (OPENAI_API_KEY) missing. AI features require this key.";
    clientErrorLog(errMsg);
    completedTasks = TOTAL_TASKS;
    publishProgress("complete", "Search aborted: missing OpenAI API key.");
    return { business: null, logs: actionLogs, error: errMsg };
  }

  // Build initial business object from user input
  let business: Business = {
    id: `direct-${crypto.randomUUID()}`,
    name: input.businessName,
    address: input.address || 'Not provided',
    website: input.website,
    isMyBusiness: isMyBusiness || undefined,
  };

  const businessLabel = business.name;

  // Step 1: Try to look up the business on Google Places to get rating, reviews, phone, coordinates
  let placesLookupMessage = `Google Places lookup processed for ${businessLabel}.`;
  if (GOOGLE_PLACES_API_KEY) {
    try {
      throwIfAborted(`places lookup for ${businessLabel}`);

      // Build a search query from business name and address
      const searchQuery = input.address
        ? `${input.businessName} ${input.address}`
        : input.businessName;

      clientLog(`[PlacesLookup] Searching for: "${searchQuery}"`);

      const textSearchFieldMask = "places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.websiteUri,places.internationalPhoneNumber";

      const textSearchResponse = await fetch(TEXT_SEARCH_NEW_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY,
          'X-Goog-FieldMask': textSearchFieldMask,
        },
        body: JSON.stringify({
          textQuery: searchQuery,
          maxResultCount: 1, // We only want the top match
        }),
        cache: 'no-store',
        signal,
      });

      if (textSearchResponse.ok) {
        const textSearchData = await textSearchResponse.json();

        if (textSearchData.places && textSearchData.places.length > 0) {
          const place = textSearchData.places[0];
          clientLog(`[PlacesLookup] Found match: "${place.displayName?.text}" at "${place.formattedAddress}"`);

          // Update business with Google Places data
          if (place.id) business.id = place.id;
          if (place.formattedAddress) business.address = place.formattedAddress;
          if (place.location?.latitude) business.latitude = place.location.latitude;
          if (place.location?.longitude) business.longitude = place.location.longitude;
          if (place.rating) business.rating = place.rating;
          if (place.userRatingCount) business.reviewsCount = place.userRatingCount;
          if (place.internationalPhoneNumber) business.phoneNumber = place.internationalPhoneNumber;
          // Only update website if user didn't provide one
          if (!input.website && place.websiteUri) business.website = place.websiteUri;

          placesLookupMessage = `Found "${place.displayName?.text}" on Google Places (${business.rating || 'N/A'} stars, ${business.reviewsCount || 0} reviews).`;
          clientLog(`[PlacesLookup] Updated business with Places data: Rating=${business.rating}, Reviews=${business.reviewsCount}, Lat=${business.latitude}, Lng=${business.longitude}`);
        } else {
          clientLog(`[PlacesLookup] No matching business found for "${searchQuery}"`);
          placesLookupMessage = `No Google Places match found for ${businessLabel}. Using provided info only.`;
        }
      } else {
        const errorText = await textSearchResponse.text().catch(() => 'Unknown error');
        clientErrorLog(`[PlacesLookup] API error: ${textSearchResponse.status}`, errorText);
        placesLookupMessage = `Google Places lookup failed for ${businessLabel}. Using provided info only.`;
      }
    } catch (placesError: any) {
      if (placesError?.message === "Search canceled by user") throw placesError;
      clientErrorLog(`[PlacesLookup] Error looking up business`, placesError);
      placesLookupMessage = `Google Places lookup error for ${businessLabel}. Using provided info only.`;
    }
  } else {
    clientWarn("[PlacesLookup] GOOGLE_PLACES_API_KEY not set. Skipping Places lookup.");
    placesLookupMessage = `Google Places lookup skipped for ${businessLabel} (API key missing).`;
  }
  advanceProgress("places-lookup", placesLookupMessage);

  // Check for ads if we have a website domain
  let adsMessage: string;
  if (input.skipAdsCheck) {
    clientLog(`[AdsAPI] Skipping ads transparency check for ${businessLabel} (disabled by user).`);
    adsMessage = `Ads transparency check skipped for ${businessLabel} (disabled).`;
  } else {
    const domainForAdsCheck = extractDomain(business.website);
    adsMessage = `Ads transparency check processed for ${businessLabel}.`;
    if (domainForAdsCheck && SEARCHAPI_IO_API_KEY) {
      try {
        throwIfAborted(`ads check for ${businessLabel}`);
        clientLog(`[AdsAPI] Checking for domain: ${domainForAdsCheck} (Business: ${business.name})`);
        const adsData = await checkAdsWithSearchApi(domainForAdsCheck, SEARCHAPI_IO_API_KEY, actionLogs);
        business.adsInfo = adsData;
        adsMessage = `Ads transparency check complete for ${businessLabel}.`;
      } catch (adsError: any) {
        clientErrorLog(`[AdsAPI] Error for domain ${domainForAdsCheck}: ${adsError.message}`, adsError);
        business.adsInfo = { isRunningAds: null, adCount: 0, source: "SearchApi.io", error: "API Error", adsTransparencyLink: undefined };
        adsMessage = `Ads transparency check failed for ${businessLabel}.`;
      }
    } else if (!domainForAdsCheck) {
      business.adsInfo = { isRunningAds: null, adCount: 0, source: "SearchApi.io", error: "No domain for Ads Check", adsTransparencyLink: undefined };
      adsMessage = `Ads transparency check skipped for ${businessLabel} (no domain).`;
    } else {
      clientWarn("[AdsAPI] SEARCHAPI_IO_API_KEY not set. Skipping ads check.", actionLogs);
      business.adsInfo = { isRunningAds: null, adCount: 0, source: "SearchApi.io", error: "API key missing for Ads Check", adsTransparencyLink: undefined };
      adsMessage = `Ads transparency check skipped for ${businessLabel} (missing API key).`;
    }
  }
  advanceProgress("ads-check", adsMessage);

  // Fetch call outs using Firecrawl (skip for "My Business")
  let promotionsMessage = `Call outs scan completed for ${businessLabel}.`;
  if (input.skipPromotions) {
    // Skip call outs for "My Business"
    clientLog(`[Firecrawl] Skipping call outs fetch for ${business.name} (My Business - call outs scan disabled).`);
    const todayISO = new Date().toISOString().split('T')[0];
    business.promotionsScan = {
      websiteStatus: 'Skipped (My Business)',
      dataVerificationDate: todayISO,
      promotions: [],
    };
    promotionsMessage = `Call outs scan skipped for ${businessLabel} (My Business).`;
  } else if (business.website) {
    clientLog(`[Firecrawl] Fetching call outs for ${business.name} from ${business.website}`);
    try {
      throwIfAborted(`call outs fetch for ${businessLabel}`);
      const promotionsResult = await fetchPromotionsWithFirecrawl(
        business.website,
        business.name,
        undefined,
        signal
      );
      clientLog(`[Firecrawl] Call outs data received for ${business.name}: ${JSON.stringify(promotionsResult)}`);

      business.promotionsScan = {
        websiteStatus: promotionsResult.websiteStatus,
        dataVerificationDate: promotionsResult.dataVerificationDate,
        promotions: promotionsResult.promotions,
      };
      promotionsMessage = promotionsResult.promotions.length > 0
        ? `Captured ${promotionsResult.promotions.length} call out${promotionsResult.promotions.length === 1 ? '' : 's'} for ${businessLabel}.`
        : `No call outs found for ${businessLabel}.`;
    } catch (firecrawlError: any) {
      if (firecrawlError?.message === "Search canceled by user") {
        clientWarn("Search canceled by user before completion.");
        throw firecrawlError;
      }
      clientErrorLog(`[Firecrawl] Error fetching call outs for ${business.name}`, firecrawlError);
      business.promotionsScan = {
        websiteStatus: 'Call outs fetch failed',
        dataVerificationDate: new Date().toISOString().split('T')[0],
        promotions: [],
      };
      promotionsMessage = `Call outs scan failed for ${businessLabel}.`;
    }
    advanceProgress("call-outs-scan", promotionsMessage);
  } else {
    clientLog(`[Firecrawl] Skipping call outs fetch for ${business.name} as website is not available.`);
    const todayISO = new Date().toISOString().split('T')[0];
    business.promotionsScan = {
      websiteStatus: 'No website available',
      dataVerificationDate: todayISO,
      promotions: [],
    };
  }

  publishProgress("finalizing", "Finalizing results...");
  publishProgress("complete", "Analysis complete.");

  clientLog(`Direct search completed for "${business.name}".`);

  return {
    business,
    logs: actionLogs,
    error: null,
  };
}
