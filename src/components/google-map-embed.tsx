
"use client";

import type { Business } from '@/types';
import React, { useEffect, useRef, useState } from 'react';
import { getLocalizedTextString } from '@/lib/utils';

interface GoogleMapEmbedProps {
  businesses: Business[];
  apiKey: string;
  searchedLocation?: { lat: number; lng: number };
  selectedBusinessIdFromList?: string | null;
  onMarkerClickedOnMap?: (businessId: string) => void;
}

const COMMON_SCRIPT_ID = 'google-maps-api-script';
const COMMON_CALLBACK_NAME = 'initGoogleMapsApiGlobally';

const GoogleMapEmbed: React.FC<GoogleMapEmbedProps> = ({ 
  businesses, 
  apiKey, 
  searchedLocation,
  selectedBusinessIdFromList,
  onMarkerClickedOnMap 
}) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  
  const businessMapElementsRef = useRef<Map<string, { marker: google.maps.marker.AdvancedMarkerElement; infoWindow: google.maps.InfoWindow }>>(new Map());
  const activeInfoWindowRef = useRef<google.maps.InfoWindow | null>(null);

  const [apiLoaded, setApiLoaded] = useState(false);
  const [scriptError, setScriptError] = useState<string | null>(null);

  useEffect(() => {
    if (!apiKey) {
      console.error("[MapLoad][Embed] GoogleMapEmbed: API key is missing.");
      setScriptError("Google Maps API Key is missing.");
      return;
    }

    // Check if API is already fully loaded (including necessary libraries)
    if (window.google && window.google.maps && window.google.maps.marker && window.google.maps.marker.AdvancedMarkerElement && window.google.maps.places) {
      console.log("[MapLoad][Embed] Google Maps API (including marker & places lib) already available.");
      setApiLoaded(true);
      return;
    }
    
    // Check if the common script tag already exists
    if (document.getElementById(COMMON_SCRIPT_ID)) {
      console.log(`[MapLoad][Embed] Common Google Maps script tag (${COMMON_SCRIPT_ID}) already exists. Waiting for it to load.`);
      // Listener to act once the existing script fully loads and fires our custom event
      const handleExistingScriptLoad = () => {
        if (window.google && window.google.maps && window.google.maps.marker && window.google.maps.marker.AdvancedMarkerElement && window.google.maps.places) {
          console.log("[MapLoad][Embed] Google Maps API (including marker & places lib) now available after waiting for existing script (event triggered).");
          setApiLoaded(true);
        } else {
          console.error("[MapLoad-CRITICAL][Embed] Event triggered, but Google Maps API or required libraries not ready for Embed.");
          setScriptError("Google Maps API did not load all required libraries for Embed. Check browser console for details.");
        }
      };
      window.addEventListener('googleMapsApiLoaded', handleExistingScriptLoad, { once: true });
      
      // If it's already loaded by the time this effect runs (e.g. very fast load or re-render)
      if (window.google && window.google.maps && window.google.maps.marker && window.google.maps.marker.AdvancedMarkerElement && window.google.maps.places) {
         handleExistingScriptLoad(); // Call it directly
         window.removeEventListener('googleMapsApiLoaded', handleExistingScriptLoad); // Clean up listener
      }

      return () => {
        window.removeEventListener('googleMapsApiLoaded', handleExistingScriptLoad);
      };
    }
    
    // If script doesn't exist, create and load it
    const script = document.createElement('script');
    script.id = COMMON_SCRIPT_ID;
    // Request all needed libraries: marker (for AdvancedMarkerElement) and places (for Autocomplete)
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=marker,places&callback=${COMMON_CALLBACK_NAME}`;
    script.async = true;
    script.defer = true;
    
    // Define the global callback function if it doesn't exist
    if (!(window as any)[COMMON_CALLBACK_NAME]) {
        (window as any)[COMMON_CALLBACK_NAME] = () => {
        console.log(`[MapLoad][Global] ${COMMON_CALLBACK_NAME} callback executed.`);
        if (window.google && window.google.maps && window.google.maps.marker && window.google.maps.places) {
            console.log("[MapLoad][Global] Google Maps API (including marker & places lib) loaded successfully via callback.");
            if (window.google.maps.marker.AdvancedMarkerElement) {
                 console.log("[MapLoad][Global] AdvancedMarkerElement IS available globally after callback.");
            } else {
                 console.error("[MapLoad-CRITICAL][Global] AdvancedMarkerElement IS MISSING globally after callback.");
            }
        } else {
            console.error("[MapLoad-CRITICAL][Global] Google Maps API loaded via callback, but marker/places library or AdvancedMarkerElement is missing.");
        }
        // Dispatch a custom event to notify all components waiting for the API
        const event = new Event('googleMapsApiLoaded');
        window.dispatchEvent(event);
        };
    }

    // This component listens for the custom event
    const handleApiLoadedEvent = () => {
        if (window.google && window.google.maps && window.google.maps.marker && window.google.maps.marker.AdvancedMarkerElement && window.google.maps.places) {
            setApiLoaded(true);
        } else {
             console.error("[MapLoad-CRITICAL][Embed] Custom event 'googleMapsApiLoaded' fired, but maps API or required libraries not ready for Embed.");
             setScriptError("Failed to initialize map: API not fully loaded after callback for Embed.");
        }
    };
    window.addEventListener('googleMapsApiLoaded', handleApiLoadedEvent, { once: true });

    script.onerror = () => {
      console.error("[MapLoad-CRITICAL][Embed] Google Maps script failed to load. Check src, network, or API key configuration.");
      setScriptError("Failed to load Google Maps script. Check API key and network.");
    };
    document.head.appendChild(script);

    return () => {
      // Clean up listener for this component instance
      window.removeEventListener('googleMapsApiLoaded', handleApiLoadedEvent);
      // Note: We don't remove the script itself here, as other components might be using it.
      // The common script ID and check prevents multiple additions.
    };
  }, [apiKey]);

  useEffect(() => {
    if (apiLoaded && mapRef.current && !map) {
      console.log("[MapInit] API loaded and mapRef available. Initializing map.");
      let centerLat = 40.7128; // Default to New York
      let centerLng = -74.0060;
      let zoomLevel = 12;

      const validBusinessesForInitialCenter = businesses.filter(b => b.latitude != null && b.longitude != null);

      if (validBusinessesForInitialCenter.length > 0 && validBusinessesForInitialCenter[0].latitude && validBusinessesForInitialCenter[0].longitude) {
        centerLat = validBusinessesForInitialCenter[0].latitude;
        centerLng = validBusinessesForInitialCenter[0].longitude;
      } else if (searchedLocation) {
        centerLat = searchedLocation.lat;
        centerLng = searchedLocation.lng;
      }
      
      try {
        if (!window.google || !window.google.maps || !window.google.maps.Map) {
          console.error("[MapInit-CRITICAL] window.google.maps.Map is not available. Cannot initialize map.");
          setScriptError("Cannot initialize map: Google Maps Map class not found.");
          return;
        }
        const mapId = "1683e9f67196a98049cc03bf"; // Your actual Map ID
        console.log(`[MapInit] Initializing Map with Map ID: ${mapId}`);
        const newMap = new window.google.maps.Map(mapRef.current!, {
          center: { lat: centerLat, lng: centerLng },
          zoom: zoomLevel,
          mapId: mapId,
        });
        setMap(newMap);
        console.log("[MapInit] Map initialized successfully.");
      } catch (e) {
        console.error("[MapInit-CRITICAL] Error initializing Google Map:", e);
        setScriptError("Error initializing Google Map. See console for details.");
      }
    }
  }, [apiLoaded, map, searchedLocation, businesses, apiKey]); // apiKey dependency added for re-init if key changes

  // Effect for creating/updating markers
  useEffect(() => {
    console.log(`[MarkerEffect] Running. Business count: ${businesses.length}. Map ready: ${!!map}. API Loaded: ${apiLoaded}`);
    if (!map || !apiLoaded) {
      console.log("[MarkerEffect] Skipped: Map not ready or API not loaded.");
      return;
    }
    
    // Ensure AdvancedMarkerElement is available
    if (!window.google || !window.google.maps || !window.google.maps.marker || !window.google.maps.marker.AdvancedMarkerElement) {
        console.error("[MarkerEffect-CRITICAL] Skipped: AdvancedMarkerElement class not available. Maps API might not have loaded the 'marker' library correctly.");
        setScriptError("AdvancedMarkerElement not available. Map markers cannot be created.");
        return;
    }
    const AdvancedMarkerElementClass = window.google.maps.marker.AdvancedMarkerElement;
    console.log(`[MarkerEffect] AdvancedMarkerElementClass constructor type: ${typeof AdvancedMarkerElementClass}`);

    // Clear existing markers from the map and from our ref
    businessMapElementsRef.current.forEach(({ marker }) => {
      marker.map = null; // Remove from map
    });
    businessMapElementsRef.current.clear();
    console.log("[MarkerEffect] Cleared old markers and elements from ref.");
    
    // Close any active info window
    activeInfoWindowRef.current?.close();
    activeInfoWindowRef.current = null;

    if (businesses.length > 0) {
      const bounds = new google.maps.LatLngBounds();
      let validMarkersCount = 0;

      businesses.forEach((business) => {
        if (business.latitude != null && business.longitude != null && business.id) {
          const position = { lat: business.latitude, lng: business.longitude };
          try {
            const marker = new AdvancedMarkerElementClass({ // Use the validated class
              map: map,
              position: position,
              title: business.name,
            });

            const websiteUrl = business.website 
              ? business.website.startsWith('http') ? business.website : `https://${business.website}`
              : null;
            const displayWebsite = business.website ? business.website.replace(/^https?:\/\//, '').replace(/\/$/, '') : 'Not Available';

            const websiteLink = websiteUrl
              ? `<div style="font-size: 13px; margin-bottom: 4px;">Website: <a href="${websiteUrl}" target="_blank" rel="noopener noreferrer" style="color: #E41F1B; text-decoration: none;">${displayWebsite}</a></div>`
              : `<div style="font-size: 13px; margin-bottom: 4px;">Website: Not Available</div>`;
            const phoneInfo = business.phoneNumber 
              ? `<div style="font-size: 13px; margin-bottom: 4px;">Phone: ${business.phoneNumber}</div>` 
              : `<div style="font-size: 13px; margin-bottom: 4px;">Phone: Not Available</div>`;
            const addressInfo = business.address
              ? `<div style="font-size: 13px; margin-bottom: 4px;">${business.address}</div>`
              : '';
            const ratingInfo = typeof business.rating === 'number'
              ? `<div style="font-size: 13px; margin-bottom: 4px;">Rating: ${business.rating.toFixed(1)} (${business.reviewsCount || 0} reviews)</div>`
              : `<div style="font-size: 13px; margin-bottom: 4px;">Rating: Not Available</div>`;
            
            const reviewSummaryText =
              getLocalizedTextString(business.reviewSummary?.mostRecentReview?.text) ??
              getLocalizedTextString(business.reviewSummary?.text);
            const reviewSummaryInfo = reviewSummaryText
              ? `<div style="font-size: 12px; margin-top: 5px; font-style: italic; color: #555;">"${reviewSummaryText}"</div>`
              : '';

            const infoWindowContent = 
              `<div style="font-family: var(--font-geist-sans), sans-serif; color: hsl(var(--foreground)); padding: 8px; max-width: 280px; line-height: 1.4;">` +
              `<strong style="font-size: 16px; display: block; margin-bottom: 5px; color: #E41F1B;">${business.name}</strong>` +
              `${addressInfo}` +
              `${phoneInfo}` +
              `${websiteLink}` +
              `${ratingInfo}` +
              `${reviewSummaryInfo}` +
              `</div>`;

            if (!window.google.maps.InfoWindow) {
                console.error("[MarkerEffect-CRITICAL] google.maps.InfoWindow class not available!");
                setScriptError("InfoWindow class not available. Cannot create popups.");
                return; // Exit this iteration if InfoWindow class is missing
            }
            const infoWindow = new window.google.maps.InfoWindow({
              content: infoWindowContent,
              maxWidth: 300,
            });
            
            const clickListener = marker.addListener('gmp-click', () => {
                console.log(`[Map Marker Click EVENT] Clicked on marker for business: ${business.name} (ID: ${business.id})`);
                if (onMarkerClickedOnMap) {
                  onMarkerClickedOnMap(business.id);
                } else {
                  console.warn("[Map Marker Click EVENT] onMarkerClickedOnMap handler is undefined.");
                }
            });
            console.log(`[MarkerEffect] Added gmp-click listener for ${business.name || 'Unnamed Business'}. Listener object:`, clickListener ? 'Exists' : 'null');


            businessMapElementsRef.current.set(business.id, { marker, infoWindow });
            bounds.extend(position);
            validMarkersCount++;
          } catch (e: any) {
            // Catch errors during AdvancedMarkerElement or InfoWindow creation
            console.error("[MarkerEffect] Error creating marker for business:", business.name, e.message, e.stack, e);
            setScriptError(`Error creating marker for ${business.name}. See console.`);
          }
        } else {
          console.warn("[MarkerEffect] Skipping marker for business with no coordinates or ID:", business.name);
        }
      });

      if (validMarkersCount > 0 && map.getBounds() && typeof map.fitBounds === 'function') { 
        if (validMarkersCount === 1 && businessMapElementsRef.current.size === 1) {
            // For a single marker, center and set a reasonable zoom
            const firstEntry = businessMapElementsRef.current.values().next().value;
            if (firstEntry?.marker?.position) {
                map.setCenter(firstEntry.marker.position);
                map.setZoom(15); // Zoom level for a single marker
            }
        } else {
          map.fitBounds(bounds);
        }
        console.log("[MarkerEffect] Adjusted map bounds/center.");
      } else if (searchedLocation) { // If no valid markers but a search location exists
        map.setCenter({ lat: searchedLocation.lat, lng: searchedLocation.lng });
        map.setZoom(12);
        console.log("[MarkerEffect] Centered map on searchedLocation.");
      }
    } else if (searchedLocation) { // No businesses, but a search location exists
        map.setCenter({ lat: searchedLocation.lat, lng: searchedLocation.lng });
        map.setZoom(12);
        console.log("[MarkerEffect] No businesses, centered map on searchedLocation.");
    }
  }, [map, businesses, searchedLocation, onMarkerClickedOnMap, apiLoaded, apiKey]); // apiKey in deps to re-init markers if it changes


  // Effect for handling InfoWindow opening when selectedBusinessIdFromList changes
  useEffect(() => {
    console.log(`[InfoWindowEffect] Running. Selected ID from list: ${selectedBusinessIdFromList}. Map ready: ${!!map}. API Loaded: ${apiLoaded}`);
    if (!map || !apiLoaded) { 
      console.log("[InfoWindowEffect] Skipped: Map not ready or API not loaded.");
      return;
    }

    // Close any currently active InfoWindow
    if (activeInfoWindowRef.current) {
      console.log("[InfoWindowEffect] Closing previously active InfoWindow.");
      activeInfoWindowRef.current.close();
      activeInfoWindowRef.current = null;
    }

    if (selectedBusinessIdFromList) {
      const targetElement = businessMapElementsRef.current.get(selectedBusinessIdFromList);
      if (targetElement) {
        console.log(`[InfoWindowEffect] Found target element for ID: ${selectedBusinessIdFromList}. Opening InfoWindow.`);
        
        if (!window.google || !window.google.maps || !window.google.maps.InfoWindow) {
            console.error("[InfoWindowEffect-CRITICAL] InfoWindow class not available!");
            setScriptError("InfoWindow class not available to open details.");
            return;
        }
        targetElement.infoWindow.open({ anchor: targetElement.marker, map });
        activeInfoWindowRef.current = targetElement.infoWindow;
        
        // Pan and zoom to the selected marker
        const markerPosition = targetElement.marker.position;
        if(markerPosition){
          map.panTo(markerPosition);
           if (map.getZoom()! < 14) { // If zoomed out too far, zoom in
             map.setZoom(15);
           }
        }
      } else {
        console.warn(`[InfoWindowEffect] No marker/infowindow found for selected ID: ${selectedBusinessIdFromList}. Available IDs:`, Array.from(businessMapElementsRef.current.keys()));
      }
    }
  }, [selectedBusinessIdFromList, map, apiLoaded]); // Dependencies for this effect


  if (!apiKey) {
    return <div className="p-4 text-destructive-foreground bg-destructive rounded-md">Google Maps API Key is missing. Map functionality disabled.</div>;
  }

  if (scriptError) {
    return <div className="p-4 text-destructive-foreground bg-destructive rounded-md">Error with Google Maps: {scriptError} Check the browser console for more details.</div>;
  }
  
  if (!apiLoaded) {
    return <div className="w-full h-full min-h-[400px] rounded-lg shadow-md flex items-center justify-center bg-muted text-muted-foreground">Loading Map...</div>;
  }

  return <div ref={mapRef} className="w-full h-full min-h-[400px] rounded-lg shadow-md" />;
};

export default GoogleMapEmbed;
    
 

    
