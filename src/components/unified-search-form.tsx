"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Building2, LocateFixed, MapPin, Search, Loader2, ListFilter, Plus, X as XIcon, Upload, ChevronDown, ChevronUp, Eye } from "lucide-react";
import { BusinessAutocompleteInput } from "./business-autocomplete-input";
import React, { useEffect, useRef, useState } from "react";
import type { SearchParams, DirectInputBusiness, MyBusiness } from "@/types";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";

const formSchema = z.object({
  category: z.string().max(50, {
    message: "Business category must not exceed 50 characters.",
  }).optional().default(""),
  location: z.string().min(2, {
    message: "Location must be at least 2 characters.",
  }).max(100, {
    message: "Location must not exceed 100 characters.",
  }),
  radius: z.coerce.number().min(1, {
    message: "Radius must be at least 1.",
  }).max(50, {
    message: "Radius cannot exceed 50.",
  }),
  maxResults: z.coerce.number().min(1, {
    message: "Max results must be at least 1.",
  }).max(20, {
    message: "Max results cannot exceed 20.",
  }).optional().default(20),
});

type SearchFormValues = z.infer<typeof formSchema>;

interface DirectInputBusinessWithId extends DirectInputBusiness {
  _id: string;
  source: 'manual' | 'csv'; // Track how the business was added
  isConfirmed?: boolean; // For manual entries, true once selected from autocomplete
}

export interface UnifiedSearchSubmission {
  searchParams: SearchParams;
  directBusinesses: DirectInputBusiness[];
  myBusiness?: MyBusiness;
}

interface UnifiedSearchFormProps {
  onSubmit: (data: UnifiedSearchSubmission) => void;
  isLoading: boolean;
}

const COMMON_SCRIPT_ID = 'google-maps-api-script';
const COMMON_CALLBACK_NAME = 'initGoogleMapsApiGlobally';

export default function UnifiedSearchForm({ onSubmit, isLoading }: UnifiedSearchFormProps) {
  const { toast } = useToast();
  const form = useForm<SearchFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      category: "",
      location: "",
      radius: 20,
      maxResults: 20,
    },
  });

  const locationInputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const myBusinessInputRef = useRef<HTMLInputElement>(null);
  const myBusinessAutocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const [mapsApiLoaded, setMapsApiLoaded] = useState(false);
  const [scriptError, setScriptError] = useState<string | null>(null);

  // Direct input businesses state
  const [directBusinesses, setDirectBusinesses] = useState<DirectInputBusinessWithId[]>([]);
  const [isDirectInputOpen, setIsDirectInputOpen] = useState(false);

  // My Business state (the business we are representing)
  const [myBusiness, setMyBusiness] = useState<MyBusiness | null>(null);
  const [showMyBusinessInput, setShowMyBusinessInput] = useState(false);

  // Google Ads Transparency check toggle (on by default)
  const [enableAdsCheck, setEnableAdsCheck] = useState(true);

  const mapsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  useEffect(() => {
    if (!mapsApiKey) {
      console.error("[MapLoad][Form] Google Maps API Key is missing for Autocomplete.");
      setScriptError("Google Maps API Key is missing for Autocomplete.");
      return;
    }

    if (window.google && window.google.maps && window.google.maps.places && window.google.maps.marker) {
      setMapsApiLoaded(true);
      return;
    }

    if (document.getElementById(COMMON_SCRIPT_ID)) {
      const handleExistingScriptLoad = () => {
        if (window.google && window.google.maps && window.google.maps.places && window.google.maps.marker) {
          setMapsApiLoaded(true);
        } else {
          setScriptError("Google Maps API did not load all required libraries.");
        }
      };
      window.addEventListener('googleMapsApiLoaded', handleExistingScriptLoad, { once: true });

      if (window.google && window.google.maps && window.google.maps.places && window.google.maps.marker) {
        handleExistingScriptLoad();
        window.removeEventListener('googleMapsApiLoaded', handleExistingScriptLoad);
      }

      return () => {
        window.removeEventListener('googleMapsApiLoaded', handleExistingScriptLoad);
      };
    }

    const script = document.createElement("script");
    script.id = COMMON_SCRIPT_ID;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${mapsApiKey}&libraries=places,marker&callback=${COMMON_CALLBACK_NAME}`;
    script.async = true;
    script.defer = true;

    if (!(window as any)[COMMON_CALLBACK_NAME]) {
      (window as any)[COMMON_CALLBACK_NAME] = () => {
        const event = new Event('googleMapsApiLoaded');
        window.dispatchEvent(event);
      };
    }

    const handleApiLoadedEvent = () => {
      if (window.google && window.google.maps && window.google.maps.places) {
        setMapsApiLoaded(true);
      } else {
        setScriptError("Failed to initialize autocomplete.");
      }
    };
    window.addEventListener('googleMapsApiLoaded', handleApiLoadedEvent, { once: true });

    script.onerror = () => {
      setScriptError("Failed to load Google Maps script.");
    };
    document.head.appendChild(script);

    return () => {
      window.removeEventListener('googleMapsApiLoaded', handleApiLoadedEvent);
    };
  }, [mapsApiKey]);

  useEffect(() => {
    if (mapsApiLoaded && locationInputRef.current && !autocompleteRef.current) {
      if (!window.google?.maps?.places?.Autocomplete) {
        setScriptError("Autocomplete class not available.");
        return;
      }
      try {
        const autocompleteInstance = new window.google.maps.places.Autocomplete(
          locationInputRef.current,
          {
            types: ["geocode"],
            fields: ["formatted_address", "geometry", "name"],
          }
        );
        autocompleteRef.current = autocompleteInstance;

        autocompleteInstance.addListener("place_changed", () => {
          const place = autocompleteInstance.getPlace();
          if (place?.formatted_address) {
            form.setValue("location", place.formatted_address, { shouldValidate: true });
          } else if (place?.name) {
            form.setValue("location", place.name, { shouldValidate: true });
          }
        });
      } catch (e) {
        setScriptError("Error initializing Autocomplete.");
      }
    }
  }, [mapsApiLoaded, form]);

  // Helper to extract the most specific business type from Google Places types array
  const extractPrimaryBusinessType = (types: string[] | undefined): string | undefined => {
    if (!types || types.length === 0) return undefined;

    // Filter out generic types, prefer specific business categories
    const genericTypes = ['point_of_interest', 'establishment', 'store', 'food', 'health'];
    const specificTypes = types.filter(t => !genericTypes.includes(t));

    // Return the first specific type, or fallback to first type if all are generic
    const primaryType = specificTypes[0] || types[0];

    // Convert from snake_case to readable format (e.g., "hvac_contractor" -> "HVAC Contractor")
    return primaryType
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  // Set up My Business autocomplete when input is shown
  useEffect(() => {
    if (mapsApiLoaded && showMyBusinessInput && myBusinessInputRef.current && !myBusinessAutocompleteRef.current) {
      if (!window.google?.maps?.places?.Autocomplete) {
        return;
      }
      try {
        const autocompleteInstance = new window.google.maps.places.Autocomplete(
          myBusinessInputRef.current,
          {
            types: ['establishment'],
            fields: ['place_id', 'name', 'formatted_address', 'website', 'types'],
          }
        );
        myBusinessAutocompleteRef.current = autocompleteInstance;

        autocompleteInstance.addListener('place_changed', () => {
          const place = autocompleteInstance.getPlace();
          if (place?.name && place?.formatted_address) {
            const businessType = extractPrimaryBusinessType(place.types);
            setMyBusiness({
              businessName: place.name,
              address: place.formatted_address,
              website: place.website || '',
              placeId: place.place_id,
              businessType,
            });
          }
        });
      } catch (e) {
        console.error('Error initializing My Business Autocomplete:', e);
      }
    }
  }, [mapsApiLoaded, showMyBusinessInput]);

  // My Business handlers
  const handleShowMyBusinessInput = () => {
    setShowMyBusinessInput(true);
    // Clear autocomplete ref so it reinitializes
    myBusinessAutocompleteRef.current = null;
  };

  const handleRemoveMyBusiness = () => {
    setMyBusiness(null);
    setShowMyBusinessInput(false);
    myBusinessAutocompleteRef.current = null;
    // Clear input value
    if (myBusinessInputRef.current) {
      myBusinessInputRef.current.value = '';
    }
  };

  // Direct input handlers
  const handleAddDirectBusiness = () => {
    const newBusiness: DirectInputBusinessWithId = {
      _id: crypto.randomUUID(),
      businessName: '',
      website: '',
      address: '',
      source: 'manual',
      isConfirmed: false,
    };
    setDirectBusinesses([...directBusinesses, newBusiness]);
    if (!isDirectInputOpen) setIsDirectInputOpen(true);
  };

  const handleUpdateDirectBusiness = (id: string, field: keyof DirectInputBusiness, value: string) => {
    setDirectBusinesses((prev) =>
      prev.map((business) =>
        business._id === id ? { ...business, [field]: value } : business
      )
    );
  };

  const handleConfirmDirectBusiness = (id: string, data: { businessName: string; address: string; website?: string }) => {
    setDirectBusinesses((prev) =>
      prev.map((business) =>
        business._id === id
          ? { ...business, ...data, isConfirmed: true }
          : business
      )
    );
  };

  const handleRemoveDirectBusiness = (id: string) => {
    setDirectBusinesses((prev) => prev.filter((b) => b._id !== id));
  };

  // CSV upload handler
  const handleCSVUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (!text) return;

      const lines = text.split('\n').filter(line => line.trim());
      if (lines.length === 0) {
        toast({ variant: 'destructive', title: 'Invalid CSV', description: 'The CSV file appears to be empty.' });
        return;
      }

      const header = lines[0].toLowerCase();
      const headerCols = parseCSVLine(header);

      const nameIdx = headerCols.findIndex(col =>
        col.includes('business') && col.includes('name') || col === 'name' || col === 'businessname'
      );
      const websiteIdx = headerCols.findIndex(col =>
        col.includes('website') || col.includes('url') || col.includes('site')
      );
      const addressIdx = headerCols.findIndex(col =>
        col.includes('address') || col.includes('location')
      );

      if (nameIdx === -1) {
        toast({ variant: 'destructive', title: 'Invalid CSV Format', description: 'CSV must have a "Business Name" or "Name" column.' });
        return;
      }

      if (addressIdx === -1) {
        toast({ variant: 'destructive', title: 'Invalid CSV Format', description: 'CSV must have an "Address" column.' });
        return;
      }

      const parsedBusinesses: DirectInputBusinessWithId[] = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = parseCSVLine(lines[i]);
        const businessName = cols[nameIdx]?.trim();
        if (!businessName) continue;

        parsedBusinesses.push({
          _id: crypto.randomUUID(),
          businessName,
          website: websiteIdx !== -1 ? cols[websiteIdx]?.trim() || '' : '',
          address: addressIdx !== -1 ? cols[addressIdx]?.trim() || '' : '',
          source: 'csv',
        });
      }

      if (parsedBusinesses.length === 0) {
        toast({ variant: 'destructive', title: 'No Data Found', description: 'No valid business entries found in the CSV.' });
        return;
      }

      if (parsedBusinesses.length > 5) {
        toast({ variant: 'destructive', title: 'Too Many Entries', description: `CSV contains ${parsedBusinesses.length} entries. Maximum is 5.` });
        return;
      }

      setDirectBusinesses(parsedBusinesses);
      setIsDirectInputOpen(true);
      toast({ title: 'CSV Imported', description: `Successfully imported ${parsedBusinesses.length} business${parsedBusinesses.length > 1 ? 'es' : ''}.` });
    };

    reader.onerror = () => {
      toast({ variant: 'destructive', title: 'File Read Error', description: 'Failed to read the CSV file.' });
    };

    reader.readAsText(file);
    event.target.value = '';
  };

  const parseCSVLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current);
    return result;
  };

  const handleFormSubmit = (values: SearchFormValues) => {
    // Determine the category to use: manual input takes priority, fallback to My Business type
    const effectiveCategory = values.category?.trim() || myBusiness?.businessType || '';

    // Validate that we have a category (either from input or My Business)
    if (!effectiveCategory) {
      toast({ variant: 'destructive', title: 'Validation Error', description: 'Please enter a Business Category or add My Business to auto-detect the category.' });
      return;
    }

    // Validate direct input businesses if any
    // For manual entries, they must be confirmed (selected from autocomplete)
    const unconfirmedManual = directBusinesses.find(b => b.source === 'manual' && !b.isConfirmed);
    if (unconfirmedManual) {
      toast({ variant: 'destructive', title: 'Validation Error', description: 'Please select a business from the dropdown for all manually added entries.' });
      return;
    }

    // For CSV entries, validate they have required fields
    const csvBusinesses = directBusinesses.filter(b => b.source === 'csv');
    const missingName = csvBusinesses.find(b => !b.businessName.trim());
    if (missingName) {
      toast({ variant: 'destructive', title: 'Validation Error', description: 'All CSV businesses must have a Business Name.' });
      return;
    }
    const missingAddress = csvBusinesses.find(b => !b.address?.trim());
    if (missingAddress) {
      toast({ variant: 'destructive', title: 'Validation Error', description: 'All CSV businesses must have an Address.' });
      return;
    }

    const submissionData: UnifiedSearchSubmission = {
      searchParams: {
        category: effectiveCategory,
        location: values.location,
        radius: values.radius,
        maxResults: values.maxResults || 20,
        skipAdsCheck: !enableAdsCheck,
      },
      directBusinesses: directBusinesses.map(({ _id, source, isConfirmed, ...rest }) => rest),
      myBusiness: myBusiness || undefined,
    };
    onSubmit(submissionData);
  };

  const totalBusinessCount = Number(form.watch('maxResults') || 20) + directBusinesses.length + (myBusiness ? 1 : 0);

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <CardTitle className="text-2xl">Find Businesses</CardTitle>
        <CardDescription>Search for businesses by category and location, plus add specific businesses to analyze.</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="category"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center">
                    <Building2 className="mr-2 h-4 w-4 text-muted-foreground" />
                    Business Category
                    {myBusiness?.businessType && (
                      <span className="ml-2 text-xs font-normal text-muted-foreground">(optional - using My Business type)</span>
                    )}
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder={myBusiness?.businessType ? `Using: ${myBusiness.businessType}` : "e.g., AC Repair, Plumbers"}
                      {...field}
                    />
                  </FormControl>
                  {myBusiness?.businessType && !field.value && (
                    <FormDescription>
                      Will use &quot;{myBusiness.businessType}&quot; from My Business. Enter a category to override.
                    </FormDescription>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="location"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center">
                    <MapPin className="mr-2 h-4 w-4 text-muted-foreground" />
                    Location
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g., New York, Toronto"
                      {...field}
                      ref={(e) => {
                        field.ref(e);
                        (locationInputRef as React.MutableRefObject<HTMLInputElement | null>).current = e;
                      }}
                    />
                  </FormControl>
                  {scriptError && <FormMessage>{scriptError}</FormMessage>}
                  {!scriptError && !mapsApiLoaded && mapsApiKey && <FormDescription>Loading location autocomplete...</FormDescription>}
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="radius"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center">
                      <LocateFixed className="mr-2 h-4 w-4 text-muted-foreground" />
                      Search Radius (miles)
                    </FormLabel>
                    <FormControl>
                      <Input type="number" placeholder="e.g., 10" {...field} />
                    </FormControl>
                    <FormDescription>Radius for search (1-50 miles).</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="maxResults"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center">
                      <ListFilter className="mr-2 h-4 w-4 text-muted-foreground" />
                      Max Results from Search
                    </FormLabel>
                    <FormControl>
                      <Input type="number" placeholder="e.g., 20" {...field} />
                    </FormControl>
                    <FormDescription>Max businesses from Google Places (1-20).</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Google Ads Transparency Toggle */}
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="flex items-center gap-2">
                <Eye className="h-4 w-4 text-muted-foreground" />
                <div>
                  <Label htmlFor="ads-check-toggle" className="text-sm font-medium">Google Ads Transparency Check</Label>
                  <p className="text-xs text-muted-foreground">Check if competitors are running Google Ads</p>
                </div>
              </div>
              <Switch
                id="ads-check-toggle"
                checked={enableAdsCheck}
                onCheckedChange={setEnableAdsCheck}
              />
            </div>

            {/* My Business Section */}
            <div className="border rounded-lg p-4 bg-blue-50/50 border-blue-200">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-sm">My Business</h3>
                  <p className="text-xs text-muted-foreground mt-1">The business you are representing (will skip call outs scan)</p>
                </div>
                {!showMyBusinessInput && !myBusiness && (
                  <Button type="button" variant="outline" size="sm" onClick={handleShowMyBusinessInput}>
                    <Plus className="mr-1 h-3 w-3" /> Add My Business
                  </Button>
                )}
              </div>

              {/* Autocomplete input for searching businesses */}
              {showMyBusinessInput && !myBusiness && (
                <div className="relative">
                  <Label htmlFor="my-business-search" className="text-xs text-blue-700">Search for your business</Label>
                  <div className="flex gap-2 mt-1">
                    <Input
                      id="my-business-search"
                      ref={myBusinessInputRef}
                      placeholder="Business name..."
                      className="h-9 text-sm flex-1"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleRemoveMyBusiness}
                      className="h-9 px-2"
                    >
                      <XIcon className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Select from the dropdown to auto-fill business details</p>
                </div>
              )}

              {/* Selected business display */}
              {myBusiness && (
                <div className="border rounded-lg p-3 bg-background border-blue-200">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-blue-700">{myBusiness.businessName}</p>
                        {myBusiness.businessType && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">
                            {myBusiness.businessType}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{myBusiness.address}</p>
                      {myBusiness.website && (
                        <p className="text-xs text-muted-foreground mt-0.5">{myBusiness.website}</p>
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleRemoveMyBusiness}
                      className="h-6 w-6 p-0 ml-2"
                    >
                      <XIcon className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Additional Direct Input Businesses */}
            <div className="border rounded-lg p-4 bg-muted/30">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-sm">Additional Businesses (Optional, max 5)</h3>
                  <p className="text-xs text-muted-foreground mt-2">Add specific businesses to analyze alongside the search results</p>
                  <p className="text-xs text-muted-foreground mt-2">
                    CSV columns: <span className="font-medium">Business Name</span> (required), <span className="font-medium">Address</span> (required), <span className="font-medium">Website</span>
                  </p>
                </div>
                <div className="flex gap-2">
                  <label>
                    <input type="file" accept=".csv" onChange={handleCSVUpload} className="hidden" />
                    <Button variant="outline" size="sm" asChild>
                      <span className="cursor-pointer">
                        <Upload className="mr-1 h-3 w-3" /> Import CSV
                      </span>
                    </Button>
                  </label>
                  <Button type="button" variant="outline" size="sm" onClick={handleAddDirectBusiness} disabled={directBusinesses.length >= 5}>
                    <Plus className="mr-1 h-3 w-3" /> Add Business
                  </Button>
                </div>
              </div>

              {directBusinesses.length > 0 && (
                <Collapsible open={isDirectInputOpen} onOpenChange={setIsDirectInputOpen}>
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm" className="w-full justify-between mb-2">
                      <span>{directBusinesses.length} additional business{directBusinesses.length > 1 ? 'es' : ''}</span>
                      {isDirectInputOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="space-y-3">
                    {directBusinesses.map((business, index) => (
                      <BusinessAutocompleteInput
                        key={business._id}
                        id={business._id}
                        index={index}
                        mapsApiLoaded={mapsApiLoaded}
                        onConfirm={handleConfirmDirectBusiness}
                        onRemove={handleRemoveDirectBusiness}
                        isCSV={business.source === 'csv'}
                        initialData={business.source === 'csv' ? {
                          businessName: business.businessName,
                          address: business.address || '',
                          website: business.website,
                        } : undefined}
                        onUpdate={handleUpdateDirectBusiness}
                      />
                    ))}
                    {directBusinesses.length < 5 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={handleAddDirectBusiness}
                        className="w-full border border-dashed text-muted-foreground hover:text-foreground"
                      >
                        <Plus className="mr-1 h-3 w-3" /> Add Another Business
                      </Button>
                    )}
                  </CollapsibleContent>
                </Collapsible>
              )}
            </div>

            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Total: up to <span className="font-semibold">{totalBusinessCount}</span> businesses will be analyzed
              </p>
              <Button
                type="submit"
                className="bg-accent hover:bg-accent/90 text-accent-foreground"
                disabled={!mapsApiKey || (!mapsApiLoaded && !!mapsApiKey)}
              >
                {isLoading ? (
                  <Plus className="mr-2 h-4 w-4" />
                ) : (
                  <Search className="mr-2 h-4 w-4" />
                )}
                {isLoading ? "Queue Search" : "Start Analysis"}
              </Button>
            </div>
            {!mapsApiKey && (
              <p className="text-xs text-destructive text-center mt-2">
                Google Maps API Key is missing. Autocomplete and search may be limited.
              </p>
            )}
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
