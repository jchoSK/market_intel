
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
  const [apiLoaded, setApiLoaded] = useState(false);

  useEffect(() => {
    if (window.google && window.google.maps) {
      setApiLoaded(true);
      return;
    }

    if (document.getElementById('google-maps-script')) {
      // Script already requested, wait for it to load
      const checkInterval = setInterval(() => {
        if (window.google && window.google.maps) {
          setApiLoaded(true);
          clearInterval(checkInterval);
        }
      }, 100);
      return () => clearInterval(checkInterval);
    }
    
    const script = document.createElement('script');
    script.id = 'google-maps-script';
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=marker`;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      setApiLoaded(true);
    };
    script.onerror = () => {
      console.error("Google Maps script failed to load.");
    };
    document.head.appendChild(script);

    return () => {
      // Optional: Clean up script if component unmounts before load, though unlikely with `defer`
      const existingScript = document.getElementById('google-maps-script');
      if (existingScript && !apiLoaded) {
        // existingScript.remove(); // Be cautious with removal if other components might use it
      }
    };
  }, [apiKey, apiLoaded]);

  useEffect(() => {
    if (apiLoaded && mapRef.current && !map) {
      let center: google.maps.LatLngLiteral = { lat: 40.7128, lng: -74.0060 }; // Default to NYC
      if (businesses.length > 0 && businesses[0].latitude && businesses[0].longitude) {
        center = { lat: businesses[0].latitude, lng: businesses[0].longitude };
      } else if (searchedLocation) {
        center = searchedLocation;
      }

      const newMap = new window.google.maps.Map(mapRef.current, {
        center: center,
        zoom: 12,
        mapId: "SEARCHKINGS_MARKET_ANALYZER_MAP" // Optional: for cloud-based map styling
      });
      setMap(newMap);
    }
  }, [apiLoaded, mapRef, businesses, map, searchedLocation]);

  useEffect(() => {
    if (map && businesses.length > 0) {
      // Clear existing markers (if any) - simple approach
      // For more complex scenarios, manage markers array
      // For now, we assume map is re-rendered or markers don't persist across prop changes this way
      // A better way would be to store markers in state and update them.
      
      // Basic approach: just add new markers. This could lead to duplicates if props change without map re-init.
      // A robust solution would involve storing marker instances and clearing them.

      businesses.forEach((business, index) => {
        if (business.latitude && business.longitude) {
          const position = { lat: business.latitude, lng: business.longitude };
          const marker = new google.maps.marker.AdvancedMarkerElement({
            map: map,
            position: position,
            title: business.name,
            // You can customize the gmp-marker content here
            // content: buildContent(business, index + 1) // Example for custom marker
          });

          // Optional: Add info window
          const infoWindow = new google.maps.InfoWindow({
            content: `<div><strong>${business.name}</strong><br>${business.address}</div>`,
          });
          marker.addListener('click', () => {
            infoWindow.open(map, marker);
          });
        }
      });
       // Adjust map bounds to fit markers
      if (businesses.length > 0) {
        const bounds = new google.maps.LatLngBounds();
        businesses.forEach(business => {
          if (business.latitude && business.longitude) {
            bounds.extend(new google.maps.LatLng(business.latitude, business.longitude));
          }
        });
        if (businesses.length > 1) { // Only fit bounds if more than one marker
           map.fitBounds(bounds);
        } else if (businesses.length === 1 && businesses[0].latitude && businesses[0].longitude) {
           map.setCenter(new google.maps.LatLng(businesses[0].latitude, businesses[0].longitude));
           map.setZoom(15); // Zoom in for a single marker
        }
      }

    }
  }, [map, businesses]);

  if (!apiKey) {
    return <div className="p-4 text-destructive-foreground bg-destructive rounded-md">Google Maps API Key is missing. Please set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY.</div>;
  }

  return <div ref={mapRef} className="w-full h-full min-h-[400px] md:min-h-0 rounded-lg shadow-md" />;
};

export default GoogleMapEmbed;
