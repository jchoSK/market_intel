
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
import { v4 as uuidv4 } from 'uuid';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';

interface SearchResultItem {
  id: string;
  query: { category: string; location: string; radius: number };
  results: Business[];
  mapCenter: { lat: number; lng: number } | undefined;
  error: string | null;
}

export default function MarketAnalyzerPage() {
  const [searches, setSearches] = useState<SearchResultItem[]>([]);
  const [searchedLocationCenter, setSearchedLocationCenter] = useState<{lat: number, lng: number} | undefined>(undefined);
  const [selectedBusinessId, setSelectedBusinessId] = useState<string | null>(null);

  const mapsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const [isLoading, setIsLoading] = useState(false);
  const [activeSearchId, setActiveSearchId] = useState<string | null>(null);

  const { toast } = useToast();

  // Get the currently active search results and error
  const activeSearch = searches.find(s => s.id === activeSearchId);

  const handleSearch = async (data: { category: string; location: string; radius: number }) => {
    setIsLoading(true);
    const newSearchId = uuidv4(); // Generate a new ID for each search
    setSelectedBusinessId(null); // Reset selected business on new search

    const newSearch: SearchResultItem = {
      id: newSearchId,
      query: data,
      results: [],
      mapCenter: undefined,
      error: null,
    };{activeSearch && !activeSearch.error && ( // Display results and map for the active search if no error
  <div className="mt-8 grid grid-cols-1 md:col-span-2 gap-6 md:gap-8 items-start">
    {/* ... map and results components ... */}
  </div>
)}


    setSearches(prevSearches => [...prevSearches, newSearch]);
    // Set the newly created search as the active one
    if (searches.length === 0) {
      setActiveSearchId(newSearchId);
    }    

    try {
      const searchResults = await searchBusinessesAction(data);
      const firstResultWithCoords = searchResults.find(r => r.latitude != null && r.longitude != null);
      const mapCenter = firstResultWithCoords ? { lat: firstResultWithCoords.latitude!, lng: firstResultWithCoords.longitude! } : undefined;

      updateSearch(newSearchId, { results: searchResults, mapCenter: mapCenter, error: null });

      toast({
        title: "Search Complete",
        description: `Found ${searchResults.length} businesses.`,
      });

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : `An unknown error occurred during the search for ${data.location}.`;
      setSearchedLocationCenter(undefined);
      toast({
        variant: "destructive",
        title: "Search Failed for " + data.location,
        description: errorMessage,
      });
      updateSearch(newSearchId, { error: errorMessage, results: [], mapCenter: undefined });

    } finally {
      setIsLoading(false);
    }
  };

  // Helper function to update a specific search item in the searches array
  const updateSearch = (id: string, updates: Partial<SearchResultItem>) => {
    setSearches(prevSearches =>
      prevSearches.map(search => (search.id === id ? { ...search, ...updates } : search))
    );
  };

  const handleBusinessSelectFromList = (businessId: string) => {
    setSelectedBusinessId(businessId);
  };

  const handleMapMarkerClick = (businessId: string) => {
    setSelectedBusinessId(businessId);
  };

  const handleRemoveSearch = (id: string) => {
    setSearches(prevSearches => prevSearches.filter(search => search.id !== id));
    if (activeSearchId === id) {
      // If the removed search was active, set the active search to the last remaining search, or null if none exist
      setActiveSearchId(searches.length > 1 ? searches[searches.length - 2].id : null);
    }
  }

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
  <div className="flex items-center justify-center mt-4 text-primary">
    <Loader2 className="h-5 w-5 animate-spin mr-2" />
    <span>Loading...</span>
  </div>
)}


        {activeSearch?.error && !isLoading && ( // Display error for the active search
          <Card className="border-destructive bg-destructive/10 shadow-lg mt-8">
            <CardHeader className="flex-row items-center space-x-3">
              <AlertTriangle className="h-8 w-8 text-destructive" />
              <CardTitle className="text-2xl text-destructive">Search Error</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-destructive-foreground">
                {activeSearch.error} Please try adjusting your search terms or try again later.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Render Tabs only if there are searches */}
        {searches.length > 0 && (
          <Tabs value={activeSearchId || undefined} onValueChange={setActiveSearchId} className="mt-8">
            <TabsList className="overflow-x-auto whitespace-nowrap pb-2 max-w-full">
              {searches.map(search => (
                <TabsTrigger key={search.id} value={search.id}>
                  {`${search.query.category} in ${search.query.location}`}
                </TabsTrigger>
              ))}
            </TabsList>
            {/* TabsContent is not strictly necessary for this implementation since the map and results
                components are already conditionally rendered based on activeSearchId, but it's good practice
                if you were to place content *inside* each tab panel. */}
            {/* {searches.map(search => (
              <TabsContent key={search.id} value={search.id}>
              </TabsContent>
            ))} */}
          </Tabs>
        )}

        {activeSearch && !activeSearch.error && ( // Display results and map for the active search if no error
          <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8 items-start">
            <div className="md:col-span-2 h-[500px] md:h-[600px] md:sticky md:top-6">
              {mapsApiKey ? (
                <GoogleMapEmbed
                  businesses={activeSearch.results}
                  apiKey={mapsApiKey}
                  searchedLocation={activeSearch.mapCenter}
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
              <SearchResults businesses={activeSearch.results} onBusinessSelect={handleBusinessSelectFromList} selectedBusinessId={selectedBusinessId} />
            </div>
          </div>
        )}

{!isLoading && searches.length === 0 && (
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
    
