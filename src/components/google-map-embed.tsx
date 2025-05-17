
"use client";

import type { Business } from '@/types';
import React, { useEffect, useRef, useState } from 'react';

interface GoogleMapEmbedProps {
  businesses: Business[];
  apiKey: string;
  searchedLocation?: { lat: number; lng: number }; // Optional: for centering map on search
}

const GoogleMapEmbed: React.FC<GoogleMapEmbedProps> = ({ businesses, apiKey, searchedLocation }) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [markers, setMarkers] = useState<google.maps.marker.AdvancedMarkerElement[]>([]);
  const [apiLoaded, setApiLoaded] = useState(false);
  const [scriptError, setScriptError] = useState<string | null>(null);

  useEffect(() => {
    if (!apiKey) {
      console.error("GoogleMapEmbed: API key is missing.");
      return;
    }

    if (window.google && window.google.maps) {
      console.log("Google Maps API already loaded.");
      setApiLoaded(true);
      return;
    }

    if (document.getElementById('google-maps-script')) {
      console.log("Google Maps script tag already exists. Waiting for it to load...");
      const checkInterval = setInterval(() => {
        if (window.google && window.google.maps) {
          console.log("Google Maps API loaded after waiting.");
          setApiLoaded(true);
          clearInterval(checkInterval);
        }
      }, 200);
      // Set a timeout for waiting, in case it never loads
      const waitTimeout = setTimeout(() => {
        clearInterval(checkInterval);
        if (!(window.google && window.google.maps)) {
            console.error("Google Maps API did not load after waiting for existing script.");
            setScriptError("Google Maps API did not load. Check browser console for details.");
        }
      }, 5000); // Wait for 5 seconds
      return () => {
        clearInterval(checkInterval);
        clearTimeout(waitTimeout);
      };
    }
    
    console.log("Attempting to load Google Maps API script...");
    const script = document.createElement('script');
    script.id = 'google-maps-script';
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=marker&callback=initMapEmbed`;
    script.async = true;
    script.defer = true; // defer is important
    
    // Attach a global callback function for the Maps API
    (window as any).initMapEmbed = () => {
      console.log("Google Maps API script loaded and callback executed.");
      setApiLoaded(true);
    };

    script.onerror = () => {
      console.error("Google Maps script failed to load. Check src, network, or API key configuration.");
      setScriptError("Failed to load Google Maps script. Check API key and network.");
      delete (window as any).initMapEmbed; // Clean up callback
    };
    document.head.appendChild(script);

    return () => {
      // Cleanup the global callback function when the component unmounts
      delete (window as any).initMapEmbed;
      const existingScript = document.getElementById('google-maps-script');
      if (existingScript && !apiLoaded) {
        // If component unmounts before script loads, and we added it, consider removing.
        // existingScript.remove(); // Cautious with removal if other instances might exist.
      }
    };
  }, [apiKey]); // Depend on apiKey

  useEffect(() => {
    if (apiLoaded && mapRef.current && !map) {
      console.log("API loaded, ref available, map not set. Initializing map...");
      let centerLat = 40.7128; // Default to NYC
      let centerLng = -74.0060;
      let zoomLevel = 12;

      const validBusinesses = businesses.filter(b => b.latitude != null && b.longitude != null);

      if (validBusinesses.length > 0) {
        centerLat = validBusinesses[0].latitude!;
        centerLng = validBusinesses[0].longitude!;
        if (validBusinesses.length === 1) {
            zoomLevel = 15;
        }
      } else if (searchedLocation) {
        centerLat = searchedLocation.lat;
        centerLng = searchedLocation.lng;
      }
      
      try {
        const newMap = new window.google.maps.Map(mapRef.current!, {
          center: { lat: centerLat, lng: centerLng },
          zoom: zoomLevel,
          mapId: "SEARCHKINGS_MARKET_ANALYZER_MAP" 
        });
        setMap(newMap);
        console.log("Map initialized successfully.");
      } catch (e) {
        console.error("Error initializing Google Map:", e);
        setScriptError("Error initializing Google Map. See console for details.");
      }
    }
  }, [apiLoaded, businesses, map, searchedLocation]); // mapRef is stable, no need to list

  useEffect(() => {
    // Clear existing markers
    markers.forEach(marker => marker.map = null); // AdvancedMarkerElement uses .map = null
    setMarkers([]); // Clear the state

    if (map && businesses.length > 0) {
      console.log(`Updating markers for ${businesses.length} businesses.`);
      const newMarkers: google.maps.marker.AdvancedMarkerElement[] = [];
      const bounds = new google.maps.LatLngBounds();
      let validMarkers = 0;

      businesses.forEach((business) => {
        if (business.latitude != null && business.longitude != null) {
          const position = { lat: business.latitude, lng: business.longitude };
          try {
            const marker = new google.maps.marker.AdvancedMarkerElement({
              map: map,
              position: position,
              title: business.name,
            });

            const infoWindow = new google.maps.InfoWindow({
              content: `<div style="color: black;"><strong>${business.name}</strong><br>${business.address}</div>`,
              // AdvancedMarkerElement does not directly support infoWindow in the same way as classic markers.
              // InfoWindows need to be managed and opened in relation to the map and marker's pixel position or LatLng.
            });
            // For AdvancedMarkerElement, add listener directly to the marker instance
            marker.addListener('click', () => {
                // Close other info windows if you have a reference to them
                infoWindow.open(map, marker); // infoWindow.open(map, marker) still works for AdvancedMarkerElement
            });

            newMarkers.push(marker);
            bounds.extend(position);
            validMarkers++;
          } catch (e) {
            console.error("Error creating marker for business:", business.name, e);
          }
        } else {
          console.warn("Skipping marker for business with no coordinates:", business.name);
        }
      });
      setMarkers(newMarkers);

      if (validMarkers > 0 && map.getBounds() !== undefined) { // Check if map has bounds (fully initialized)
        if (validMarkers > 1) {
          console.log("Fitting map to bounds of multiple markers.");
          map.fitBounds(bounds);
        } else {
          console.log("Centering map on single marker.");
          map.setCenter(bounds.getCenter());
          map.setZoom(15);
        }
      } else if (validMarkers === 0) {
          console.log("No valid markers to display. Map will remain at initial center/zoom.");
      }
    } else if (map && businesses.length === 0) {
        console.log("No businesses to display. Clearing markers.");
    }
  }, [map, businesses]);


  if (!apiKey) {
    return <div className="p-4 text-destructive-foreground bg-destructive rounded-md">Google Maps API Key is missing from component props.</div>;
  }

  if (scriptError) {
    return <div className="p-4 text-destructive-foreground bg-destructive rounded-md">Error with Google Maps: {scriptError} Check the browser console for more details.</div>;
  }

  return <div ref={mapRef} className="w-full h-full min-h-[400px] md:min-h-0 rounded-lg shadow-md" />;
};

export default GoogleMapEmbed;

    