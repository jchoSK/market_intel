
"use client";

import { useState, useEffect } from 'react';
import type { Business } from '@/types';
import SearchForm from '@/components/search-form';
import SearchResults from '@/components/search-results';
import { searchBusinessesAction } from '@/lib/actions';
import { Loader2, AlertTriangle, Info } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from "@/hooks/use-toast";
import Image from 'next/image';

export default function MarketAnalyzerPage() {
  const [results, setResults] = useState<Business[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const { toast } = useToast();

  // State for initial animation/greeting
  const [showGreeting, setShowGreeting] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowGreeting(false);
    }, 100); // Short delay for greeting text to appear then components load
    return () => clearTimeout(timer);
  }, []);


  const handleSearch = async (data: { category: string; location: string; radius: number }) => {
    setIsLoading(true);
    setError(null);
    setHasSearched(true);
    setShowGreeting(false); // Hide greeting once search starts
    try {
      const searchResults = await searchBusinessesAction(data);
      setResults(searchResults);
      toast({
        title: "Search Complete",
        description: `Found ${searchResults.length} businesses.`,
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "An unknown error occurred during the search.";
      setError(errorMessage);
      setResults([]);
      toast({
        variant: "destructive",
        title: "Search Failed",
        description: errorMessage,
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 md:px-8 md:py-12 space-y-10 min-h-screen">
      <header className="text-center space-y-4"> {/* Increased space-y for logo */}
        <div className="flex items-center justify-center space-x-3">
          <Image
            src="/searchkings-crown-stylized.png" 
            alt="SearchKings Crown Logo"
            width={56} 
            height={30} 
            className="w-14 h-auto md:w-16 md:h-auto" 
          />
          <h1 className="text-4xl md:text-5xl font-extrabold text-primary tracking-tight">
            SearchKings Market Analyzer
          </h1>
        </div>
        <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto">
          Unlock local market insights. Enter your criteria to discover businesses and analyze their online presence.
        </p>
      </header>

      <SearchForm onSubmit={handleSearch} isLoading={isLoading} />

      {isLoading && (
        <div className="flex flex-col justify-center items-center py-12 text-center">
          <Loader2 className="h-16 w-16 animate-spin text-primary mb-4" />
          <p className="text-xl font-semibold text-foreground">Searching for businesses...</p>
          <p className="text-muted-foreground">This might take a moment.</p>
        </div>
      )}

      {error && !isLoading && (
        <Card className="border-destructive bg-destructive/10 shadow-lg">
          <CardHeader className="flex-row items-center space-x-3">
            <AlertTriangle className="h-8 w-8 text-destructive" />
            <CardTitle className="text-2xl text-destructive">Search Error</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-destructive-foreground_custom_darker_shade_if_needed_else_default">
              {error} Please try adjusting your search terms or try again later.
            </p>
          </CardContent>
        </Card>
      )}

      {!isLoading && !error && hasSearched && (
        <SearchResults businesses={results} />
      )}
      
      {!isLoading && !error && !hasSearched && !showGreeting && (
         <Card className="bg-background/50 border-dashed border-primary/50 shadow">
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
  );
}
