import React, { useEffect, useRef, useState, useCallback } from 'react';
import type { Business } from '@/types';
import { Loader } from '@googlemaps/js-api-loader';

interface GoogleMapEmbedProps {
  businesses: Business[];
  apiKey: string;
  searchedLocation?: { lat: number; lng: number };
  selectedBusinessIdFromList?: string | null;
  onMarkerClickedOnMap: (businessId: string) => void;
}

const GoogleMapEmbed: React.FC<GoogleMapEmbedProps> = ({
  businesses,
  apiKey,
  searchedLocation,
  selectedBusinessIdFromList,
  onMarkerClickedOnMap,
}) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  // Use AdvancedMarkerElement for the state
  const [markers, setMarkers] = useState<google.maps.marker.AdvancedMarkerElement[]>([]);
  const [scriptError, setScriptError] = useState<string | null>(null);
  const [apiLoaded, setApiLoaded] = useState(false);
  const [currentInfoWindow, setCurrentInfoWindow] = useState<google.maps.InfoWindow | null>(null);

  const stableOnMarkerClickedOnMap = useCallback(onMarkerClickedOnMap, [onMarkerClickedOnMap]);

  // Effect to load Google Maps API
  useEffect(() => {
    if (!apiKey) {
      setScriptError("Google Maps API Key is missing.");
      console.error("Google Maps API Key is missing.");
      return;
    }

    const loader = new Loader({
      apiKey: apiKey,
      version: "weekly",
      libraries: ["marker", "places", "geometry"], // Ensure 'marker' library for AdvancedMarkerElement
    });

    loader.load()
      .then(() => {
        console.log("Google Maps API loaded successfully.");
        setApiLoaded(true);
        setScriptError(null);
      })
      .catch(e => {
        console.error("Failed to load Google Maps API:", e);
        setScriptError("Failed to load Google Maps script. Check API key and network.");
      });
  }, [apiKey]);

  // Effect to initialize the map
  useEffect(() => {
    if (apiLoaded && mapRef.current && !map) {
      const centerLat = searchedLocation?.lat || 40.7128;
      const centerLng = searchedLocation?.lng || -74.0060;
      const zoomLevel = searchedLocation ? 12 : 5;

      const newMapInstance = new window.google.maps.Map(mapRef.current!, {
        center: { lat: centerLat, lng: centerLng },
        zoom: zoomLevel,
        mapId: 'YOUR_MAP_ID' // IMPORTANT: Advanced Markers often work best with a Map ID (vector map).
                               // Create a Map ID in Google Cloud Console and enable vector maps for JS.
                               // If you don't use a Map ID, markers might have rendering issues or limitations.
      });
      setMap(newMapInstance);
    }
  }, [apiLoaded, mapRef, searchedLocation, map]);

  // Effect to update markers when businesses or map instance changes
  useEffect(() => {
    if (map && apiLoaded) {
      // Clear existing markers
      markers.forEach(marker => {
        marker.map = null; // For AdvancedMarkerElement, set map property to null
      });
      const newMarkersList: google.maps.marker.AdvancedMarkerElement[] = [];

      businesses.forEach(business => {
        if (business.latitude != null && business.longitude != null) {
          const marker = new window.google.maps.marker.AdvancedMarkerElement({
            map: map,
            position: { lat: business.latitude, lng: business.longitude },
            title: business.name || 'Business Location',
            // content: new window.google.maps.marker.PinElement().element, // Optional: For default pin appearance
          });

          // Event listener for AdvancedMarkerElement
          marker.addEventListener('gmp-click', () => {
            setCurrentInfoWindow(prevInfoWindow => {
              if (prevInfoWindow) {
                prevInfoWindow.close();
              }
              const infoWindow = new window.google.maps.InfoWindow({
                content: `
                  <div style="font-family: Arial, sans-serif; font-size: 14px; max-width: 250px;">
                    <h3 style="margin: 0 0 5px 0; font-size: 16px; color: #333;">${business.name || 'N/A'}</h3>
                    <p style="margin: 0 0 3px 0; color: #555;">${business.address || 'Address not available'}</p>
                    ${business.rating ? `<p style="margin: 0 0 3px 0; color: #555;">Rating: ${business.rating} (${business.reviewsCount || 0} reviews)</p>` : ''}
                    ${business.website ? `<p style="margin: 0; color: #555;"><a href="${business.website}" target="_blank" rel="noopener noreferrer">Website</a></p>` : ''}
                  </div>
                `,
              });
              infoWindow.open({ anchor: marker, map }); // AdvancedMarkerElement can be an anchor
              return infoWindow;
            });
            
            if (business.id) {
              stableOnMarkerClickedOnMap(business.id);
            }
          });
          newMarkersList.push(marker);
        }
      });
      setMarkers(newMarkersList);

      // Auto-zoom/center logic
      if (businesses.length > 0 && searchedLocation) {
         map.setCenter({ lat: searchedLocation.lat, lng: searchedLocation.lng });
         map.setZoom(12);
      } else if (businesses.length > 0 && newMarkersList.length > 0) {
        const bounds = new window.google.maps.LatLngBounds();
        newMarkersList.forEach(m => {
            if (m.position) { // Position is a property
                 bounds.extend(m.position as google.maps.LatLngLiteral); // Cast if necessary, LatLngLiteral is fine
            }
        });
        if (!bounds.isEmpty()) {
            map.fitBounds(bounds);
        }
      }
    }
  }, [map, businesses, apiLoaded, searchedLocation, stableOnMarkerClickedOnMap, setMarkers, setCurrentInfoWindow]);

  // Effect to handle business selection from the list
  useEffect(() => {
    if (map && selectedBusinessIdFromList) {
      const selectedBusinessDetails = businesses.find(b => b.id === selectedBusinessIdFromList);
      
      const selectedMarker = markers.find(
        marker => marker.title === selectedBusinessDetails?.name // Match by title, assuming it's unique
      );

      if (selectedMarker && selectedBusinessDetails) {
        const position = selectedMarker.position; // Position is a property
        if (position) {
            map.panTo(position as google.maps.LatLngLiteral);
            map.setZoom(15);
        }

        setCurrentInfoWindow(prevInfoWindow => {
          if (prevInfoWindow) {
            prevInfoWindow.close();
          }
          const infoWindow = new window.google.maps.InfoWindow({
            content: `
              <div style="font-family: Arial, sans-serif; font-size: 14px; max-width: 250px;">
                <h3 style="margin: 0 0 5px 0; font-size: 16px; color: #333;">${selectedBusinessDetails.name || 'N/A'}</h3>
                <p style="margin: 0 0 3px 0; color: #555;">${selectedBusinessDetails.address || 'Address not available'}</p>
                ${selectedBusinessDetails.rating ? `<p style="margin: 0 0 3px 0; color: #555;">Rating: ${selectedBusinessDetails.rating} (${selectedBusinessDetails.reviewsCount || 0} reviews)</p>` : ''}
                ${selectedBusinessDetails.website ? `<p style="margin: 0; color: #555;"><a href="${selectedBusinessDetails.website}" target="_blank" rel="noopener noreferrer">Website</a></p>` : ''}
              </div>
            `,
          });
          infoWindow.open({ anchor: selectedMarker, map });
          return infoWindow;
        });
      } else if (!selectedMarker && selectedBusinessDetails) {
        if (selectedBusinessDetails.latitude != null && selectedBusinessDetails.longitude != null) {
            map.panTo({ lat: selectedBusinessDetails.latitude, lng: selectedBusinessDetails.longitude });
            map.setZoom(15);
             setCurrentInfoWindow(prevInfoWindow => {
                if (prevInfoWindow) prevInfoWindow.close();
                return null;
             });
        }
      }
    } else {
      setCurrentInfoWindow(prevInfoWindow => {
        if (prevInfoWindow) prevInfoWindow.close();
        return null;
      });
    }
  }, [map, selectedBusinessIdFromList, businesses, markers, setCurrentInfoWindow]);

  // Render logic
  if (scriptError) {
    return <div className="flex items-center justify-center h-full text-red-500 p-4 text-center">{scriptError}</div>;
  }

  if (!apiLoaded) {
    return <div className="flex items-center justify-center h-full">Loading Map...</div>;
  }

  return (
    <div ref={mapRef} style={{ width: '100%', height: '100%', minHeight: '400px' }} />
  );
};

export default GoogleMapEmbed;
