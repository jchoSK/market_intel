
"use client";

import type { Business } from '@/types';
import React, { useEffect, useRef, useState } from 'react';

interface GoogleMapEmbedProps {
  businesses: Business[];
  apiKey: string;
  searchedLocation?: { lat: number; lng: number };
}

const GoogleMapEmbed: React.FC<GoogleMapEmbedProps> = ({ businesses, apiKey, searchedLocation }) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [markers, setMarkers] = useState<google.maps.marker.AdvancedMarkerElement[]>([]);
  const [apiLoaded, setApiLoaded] = useState(false);
  const [scriptError, setScriptError] = useState<string | null>(null);
  const [activeInfoWindow, setActiveInfoWindow] = useState<google.maps.InfoWindow | null>(null);

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
      const waitTimeout = setTimeout(() => {
        clearInterval(checkInterval);
        if (!(window.google && window.google.maps)) {
            console.error("Google Maps API did not load after waiting for existing script.");
            setScriptError("Google Maps API did not load. Check browser console for details.");
        }
      }, 5000);
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
    script.defer = true;
    
    (window as any).initMapEmbed = () => {
      console.log("Google Maps API script loaded and callback executed.");
      setApiLoaded(true);
    };

    script.onerror = () => {
      console.error("Google Maps script failed to load. Check src, network, or API key configuration.");
      setScriptError("Failed to load Google Maps script. Check API key and network.");
      delete (window as any).initMapEmbed;
    };
    document.head.appendChild(script);

    return () => {
      delete (window as any).initMapEmbed;
    };
  }, [apiKey]);

  useEffect(() => {
    if (apiLoaded && mapRef.current && !map) {
      console.log("API loaded, ref available, map not set. Initializing map...");
      let centerLat = 40.7128; // Default to NYC
      let centerLng = -74.0060;
      let zoomLevel = 12;

      const validBusinessesForInitialCenter = businesses.filter(b => b.latitude != null && b.longitude != null);

      if (validBusinessesForInitialCenter.length > 0) {
        centerLat = validBusinessesForInitialCenter[0].latitude!;
        centerLng = validBusinessesForInitialCenter[0].longitude!;
         // Initial zoom will be adjusted by fitBounds later if there are markers
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
  }, [apiLoaded, map, searchedLocation, businesses]);

  useEffect(() => {
    // Clear existing markers and close active info window
    markers.forEach(marker => marker.map = null);
    setMarkers([]);
    if (activeInfoWindow) {
      activeInfoWindow.close();
      setActiveInfoWindow(null);
    }

    if (map && businesses.length > 0) {
      console.log(`Updating markers for ${businesses.length} businesses.`);
      const newMarkersArray: google.maps.marker.AdvancedMarkerElement[] = [];
      const bounds = new google.maps.LatLngBounds();
      let validMarkersCount = 0;

      businesses.forEach((business) => {
        if (business.latitude != null && business.longitude != null) {
          const position = { lat: business.latitude, lng: business.longitude };
          try {
            const marker = new google.maps.marker.AdvancedMarkerElement({
              map: map,
              position: position,
              title: business.name,
            });

            const websiteLink = business.website 
              ? `<div style="font-size: 13px; margin-bottom: 4px;"><a href="${business.website.startsWith('http') ? business.website : `https://${business.website}`}" target="_blank" rel="noopener noreferrer" style="color: #E41F1B; text-decoration: none;">Website</a></div>`
              : '';
            const phoneInfo = business.phoneNumber 
              ? `<div style="font-size: 13px; margin-bottom: 4px;">Phone: ${business.phoneNumber}</div>` 
              : '';
            const addressInfo = business.address
              ? `<div style="font-size: 13px; margin-bottom: 4px;">${business.address}</div>`
              : '';

            const infoWindowContent = 
              `<div style="font-family: Arial, Helvetica, sans-serif; color: #000000; padding: 8px; max-width: 280px; line-height: 1.4;">` +
              `<strong style="font-size: 16px; display: block; margin-bottom: 5px;">${business.name}</strong>` +
              `${addressInfo}` +
              `${phoneInfo}` +
              `${websiteLink}` +
              `</div>`;

            const infoWindow = new google.maps.InfoWindow({
              content: infoWindowContent,
              maxWidth: 300,
            });
            
            marker.addListener('click', () => {
                if (activeInfoWindow) {
                  activeInfoWindow.close();
                }
                infoWindow.open({ anchor: marker, map });
                setActiveInfoWindow(infoWindow);
            });

            newMarkersArray.push(marker);
            bounds.extend(position);
            validMarkersCount++;
          } catch (e) {
            console.error("Error creating marker for business:", business.name, e);
          }
        } else {
          console.warn("Skipping marker for business with no coordinates:", business.name);
        }
      });
      setMarkers(newMarkersArray);

      if (validMarkersCount > 0) {
        if (validMarkersCount === 1 && newMarkersArray[0].position) {
          map.setCenter(newMarkersArray[0].position);
          map.setZoom(15); 
          console.log("Single marker, centering and zooming to 15.");
        } else {
          map.fitBounds(bounds);
          console.log("Multiple markers, fitting map to bounds.");
        }
      } else {
        console.log("No valid markers to display. Map will remain at initial/default center/zoom.");
        if (searchedLocation) {
            map.setCenter({ lat: searchedLocation.lat, lng: searchedLocation.lng });
            map.setZoom(12); 
        }
      }
    } else if (map && businesses.length === 0) {
        console.log("No businesses to display. Clearing markers.");
        if (searchedLocation) {
            map.setCenter({ lat: searchedLocation.lat, lng: searchedLocation.lng });
            map.setZoom(12);
            console.log("No businesses, centering on searched location.");
        }
    }
  }, [map, businesses, searchedLocation]); // activeInfoWindow removed from deps to avoid re-rendering loop, managed inside


  if (!apiKey) {
    return <div className="p-4 text-destructive-foreground bg-destructive rounded-md">Google Maps API Key is missing from component props.</div>;
  }

  if (scriptError) {
    return <div className="p-4 text-destructive-foreground bg-destructive rounded-md">Error with Google Maps: {scriptError} Check the browser console for more details.</div>;
  }

  return <div ref={mapRef} className="w-full h-full min-h-[400px] rounded-lg shadow-md" />;
};

export default GoogleMapEmbed;
    
