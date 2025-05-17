
"use client";

import type { Business } from '@/types';
import React, { useEffect, useRef, useState } from 'react';

interface GoogleMapEmbedProps {
  businesses: Business[];
  apiKey: string;
  searchedLocation?: { lat: number; lng: number };
  selectedBusinessIdFromList?: string | null;
  onMarkerClickedOnMap?: (businessId: string) => void;
}

const GoogleMapEmbed: React.FC<GoogleMapEmbedProps> = ({ 
  businesses, 
  apiKey, 
  searchedLocation,
  selectedBusinessIdFromList,
  onMarkerClickedOnMap 
}) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  
  // Use a ref to store marker and infowindow instances, mapped by business.id
  const businessMapElementsRef = useRef<Map<string, { marker: google.maps.marker.AdvancedMarkerElement; infoWindow: google.maps.InfoWindow }>>(new Map());
  const activeInfoWindowRef = useRef<google.maps.InfoWindow | null>(null);

  const [apiLoaded, setApiLoaded] = useState(false);
  const [scriptError, setScriptError] = useState<string | null>(null);

  useEffect(() => {
    if (!apiKey) {
      console.error("GoogleMapEmbed: API key is missing.");
      return;
    }

    if (window.google && window.google.maps) {
      setApiLoaded(true);
      return;
    }

    if (document.getElementById('google-maps-script')) {
      const checkInterval = setInterval(() => {
        if (window.google && window.google.maps) {
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
    
    const script = document.createElement('script');
    script.id = 'google-maps-script';
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=marker&callback=initMapEmbedGlobally`;
    script.async = true;
    script.defer = true;
    
    (window as any).initMapEmbedGlobally = () => {
      setApiLoaded(true);
    };

    script.onerror = () => {
      console.error("Google Maps script failed to load. Check src, network, or API key configuration.");
      setScriptError("Failed to load Google Maps script. Check API key and network.");
      delete (window as any).initMapEmbedGlobally;
    };
    document.head.appendChild(script);

    return () => {
      delete (window as any).initMapEmbedGlobally;
    };
  }, [apiKey]);

  useEffect(() => {
    if (apiLoaded && mapRef.current && !map) {
      let centerLat = 40.7128; 
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
        const newMap = new window.google.maps.Map(mapRef.current!, {
          center: { lat: centerLat, lng: centerLng },
          zoom: zoomLevel,
          mapId: "SEARCHKINGS_MARKET_ANALYZER_MAP" 
        });
        setMap(newMap);
      } catch (e) {
        console.error("Error initializing Google Map:", e);
        setScriptError("Error initializing Google Map. See console for details.");
      }
    }
  }, [apiLoaded, map, searchedLocation, businesses]);

  useEffect(() => {
    if (!map) return;

    // Clear previous markers from map and internal ref
    businessMapElementsRef.current.forEach(({ marker }) => {
      marker.map = null;
    });
    businessMapElementsRef.current.clear();
    
    activeInfoWindowRef.current?.close();
    activeInfoWindowRef.current = null;

    if (businesses.length > 0) {
      const bounds = new google.maps.LatLngBounds();
      let validMarkersCount = 0;

      businesses.forEach((business) => {
        if (business.latitude != null && business.longitude != null && business.id) {
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
                activeInfoWindowRef.current?.close();
                infoWindow.open({ anchor: marker, map });
                activeInfoWindowRef.current = infoWindow;
                onMarkerClickedOnMap?.(business.id);
            });

            businessMapElementsRef.current.set(business.id, { marker, infoWindow });
            bounds.extend(position);
            validMarkersCount++;
          } catch (e) {
            console.error("Error creating marker for business:", business.name, e);
          }
        } else {
          console.warn("Skipping marker for business with no coordinates or ID:", business.name);
        }
      });

      if (validMarkersCount > 0) {
        if (validMarkersCount === 1 && businessMapElementsRef.current.values().next().value?.marker?.position) {
          map.setCenter(businessMapElementsRef.current.values().next().value.marker.position!);
          map.setZoom(15); 
        } else {
          map.fitBounds(bounds);
        }
      } else if (searchedLocation) {
        map.setCenter({ lat: searchedLocation.lat, lng: searchedLocation.lng });
        map.setZoom(12);
      }
    } else if (searchedLocation) {
        map.setCenter({ lat: searchedLocation.lat, lng: searchedLocation.lng });
        map.setZoom(12);
    }
  }, [map, businesses, searchedLocation, onMarkerClickedOnMap]);


  useEffect(() => {
    if (map && selectedBusinessIdFromList) {
      const targetElement = businessMapElementsRef.current.get(selectedBusinessIdFromList);
      if (targetElement) {
        activeInfoWindowRef.current?.close(); 
        targetElement.infoWindow.open({ anchor: targetElement.marker, map });
        activeInfoWindowRef.current = targetElement.infoWindow;
        
        const markerPosition = targetElement.marker.position;
        if(markerPosition){
          map.panTo(markerPosition);
          // Only zoom if current zoom is too far out, or consider not zooming to respect user's zoom
           if (map.getZoom()! < 14) {
             map.setZoom(15);
           }
        }
      }
    } else if (map && !selectedBusinessIdFromList) {
      // If nothing is selected from list, close the active info window
      activeInfoWindowRef.current?.close();
      activeInfoWindowRef.current = null;
    }
  }, [selectedBusinessIdFromList, map]);


  if (!apiKey) {
    return <div className="p-4 text-destructive-foreground bg-destructive rounded-md">Google Maps API Key is missing from component props.</div>;
  }

  if (scriptError) {
    return <div className="p-4 text-destructive-foreground bg-destructive rounded-md">Error with Google Maps: {scriptError} Check the browser console for more details.</div>;
  }

  return <div ref={mapRef} className="w-full h-full min-h-[400px] rounded-lg shadow-md" />;
};

export default GoogleMapEmbed;
    
