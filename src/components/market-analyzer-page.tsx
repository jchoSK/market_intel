
"use client";

import { useState, useEffect } from 'react';
import type { Business } from '@/types';
import SearchForm from '@/components/search-form';
import SearchResults from '@/components/search-results';
import GoogleMapEmbed from '@/components/google-map-embed';
import { searchBusinessesAction } from '@/lib/actions';
import { Loader2, AlertTriangle, Info, MapPinned } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from "@/hooks/use-toast";
import Image from 'next/image';

export default function MarketAnalyzerPage() {
  const [results, setResults] = useState<Business[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const { toast } = useToast();
  const [showGreeting, setShowGreeting] = useState(true);
  const [searchedLocationCenter, setSearchedLocationCenter] = useState<{lat: number, lng: number} | undefined>(undefined);
  const [selectedBusinessId, setSelectedBusinessId] = useState<string | null>(null);

  const mapsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  useEffect(() => {
    if (!mapsApiKey) {
        console.warn("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is not set in .env.local or not available to the client. Map functionality will be limited.");
    }
    const timer = setTimeout(() => {
      setShowGreeting(false);
    }, 100);
    return () => clearTimeout(timer);
  }, [mapsApiKey]);

  const handleSearch = async (data: { category: string; location: string; radius: number }) => {
    setIsLoading(true);
    setError(null);
    setHasSearched(true);
    setShowGreeting(false);
    setSelectedBusinessId(null); // Reset selected business on new search
    try {
      const searchResults = await searchBusinessesAction(data);
      setResults(searchResults);
      
      const firstResultWithCoords = searchResults.find(r => r.latitude != null && r.longitude != null);
      if (firstResultWithCoords) {
        setSearchedLocationCenter({ lat: firstResultWithCoords.latitude!, lng: firstResultWithCoords.longitude! });
      } else {
        setSearchedLocationCenter(undefined); 
      }

      toast({
        title: "Search Complete",
        description: `Found ${searchResults.length} businesses.`,
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "An unknown error occurred during the search.";
      setError(errorMessage);
      setResults([]);
      setSearchedLocationCenter(undefined);
      toast({
        variant: "destructive",
        title: "Search Failed",
        description: errorMessage,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleBusinessSelectFromList = (businessId: string) => {
    setSelectedBusinessId(businessId);
  };

  const handleMapMarkerClick = (businessId: string) => {
    setSelectedBusinessId(businessId);
  };

  return (
    <div className="flex flex-col min-h-screen">
      <header className="text-center py-6 md:py-8 px-4 bg-card border-b">
        <div className="flex items-center justify-center space-x-3">
          <Image
            src="/searchkings-crown-stylized.png"
            alt="SearchKings Crown Logo"
            width={56}
            height={30} 
            className="w-14 h-auto md:w-16 md:h-auto"
          />
          <h1 className="text-3xl md:text-4xl font-extrabold text-primary tracking-tight">
            SearchKings Market Analyzer
          </h1>
        </div>
        <p className="text-md md:text-lg text-muted-foreground max-w-2xl mx-auto mt-2">
          Unlock local market insights. Discover businesses and analyze their online presence.
        </p>
      </header>

      <div className="container mx-auto px-4 py-6 md:py-8 flex-grow">
        <SearchForm onSubmit={handleSearch} isLoading={isLoading} />

        {isLoading && (
          <div className="flex flex-col justify-center items-center py-12 text-center mt-8">
            <Loader2 className="h-16 w-16 animate-spin text-primary mb-4" />
            <p className="text-xl font-semibold text-foreground">Searching for businesses...</p>
            <p className="text-muted-foreground">This might take a moment.</p>
          </div>
        )}

        {error && !isLoading && (
          <Card className="border-destructive bg-destructive/10 shadow-lg mt-8">
            <CardHeader className="flex-row items-center space-x-3">
              <AlertTriangle className="h-8 w-8 text-destructive" />
              <CardTitle className="text-2xl text-destructive">Search Error</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-destructive-foreground">
                {error} Please try adjusting your search terms or try again later.
              </p>
            </CardContent>
          </Card>
        )}

        {!isLoading && !error && hasSearched && (
          <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8 items-start">
            <div className="md:col-span-2 h-[500px] md:h-[600px] md:sticky md:top-6">
              {mapsApiKey ? (
                <GoogleMapEmbed 
                  businesses={results} 
                  apiKey={mapsApiKey} 
                  searchedLocation={searchedLocationCenter}
                  selectedBusinessIdFromList={selectedBusinessId}
                  onMarkerClickedOnMap={handleMapMarkerClick} 
                />
              ) : (
                <Card className="h-full flex flex-col items-center justify-center text-center">
                  <CardHeader>
                    <MapPinned className="h-12 w-12 text-muted-foreground mx-auto" />
                    <CardTitle className="text-destructive">Map Disabled</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground">
                      Google Maps API Key is not configured. Please set <code className="bg-muted px-1 py-0.5 rounded">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code> in your environment and restart your server.
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
            <div className="md:col-span-1 max-h-[calc(100vh-10rem)] overflow-y-auto">
              <SearchResults businesses={results} onBusinessSelect={handleBusinessSelectFromList} selectedBusinessId={selectedBusinessId} />
            </div>
          </div>
        )}
        
        {!isLoading && !error && !hasSearched && !showGreeting && (
          <Card className="bg-background/50 border-dashed border-primary/50 shadow mt-8">
            <CardHeader className="items-center text-center">
              <Info className="h-10 w-10 text-primary mb-3" />
              <CardTitle className="text-xl">Ready to Explore?</CardTitle>
            </CardHeader>
            <CardContent className="text-center">
              <p className="text-muted-foreground">
                Enter your search parameters above to begin your market analysis.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
      <footer className="text-center py-4 border-t bg-card text-sm text-muted-foreground">
        SearchKings Market Analyzer &copy; {new Date().getFullYear()}
      </footer>
    </div>
  );
}
    
