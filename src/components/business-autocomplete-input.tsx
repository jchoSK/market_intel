"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { X as XIcon } from "lucide-react";

interface BusinessData {
  businessName: string;
  address: string;
  website?: string;
}

interface BusinessAutocompleteInputProps {
  id: string;
  index: number;
  mapsApiLoaded: boolean;
  onConfirm: (id: string, data: BusinessData) => void;
  onRemove: (id: string) => void;
  // For CSV entries that are already filled
  initialData?: BusinessData;
  isCSV?: boolean;
  onUpdate?: (id: string, field: keyof BusinessData, value: string) => void;
}

export function BusinessAutocompleteInput({
  id,
  index,
  mapsApiLoaded,
  onConfirm,
  onRemove,
  initialData,
  isCSV = false,
  onUpdate,
}: BusinessAutocompleteInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const [confirmedBusiness, setConfirmedBusiness] = useState<BusinessData | null>(
    isCSV && initialData ? initialData : null
  );
  const [needsReinit, setNeedsReinit] = useState(false);

  useEffect(() => {
    // Only set up autocomplete for manual entries (not CSV)
    if (isCSV) return;

    if (mapsApiLoaded && inputRef.current && (!autocompleteRef.current || needsReinit)) {
      if (!window.google?.maps?.places?.Autocomplete) {
        return;
      }
      try {
        const autocompleteInstance = new window.google.maps.places.Autocomplete(
          inputRef.current,
          {
            types: ['establishment'],
            fields: ['place_id', 'name', 'formatted_address', 'website'],
          }
        );
        autocompleteRef.current = autocompleteInstance;
        setNeedsReinit(false);

        autocompleteInstance.addListener('place_changed', () => {
          const place = autocompleteInstance.getPlace();
          if (place?.name && place?.formatted_address) {
            const data: BusinessData = {
              businessName: place.name,
              address: place.formatted_address,
              website: place.website || '',
            };
            setConfirmedBusiness(data);
            onConfirm(id, data);
          }
        });
      } catch (e) {
        console.error('Error initializing Business Autocomplete:', e);
      }
    }
  }, [mapsApiLoaded, id, onConfirm, isCSV, needsReinit]);

  const handleClear = () => {
    setConfirmedBusiness(null);
    if (inputRef.current) {
      inputRef.current.value = '';
    }
    // Reset the autocomplete ref and trigger re-initialization
    autocompleteRef.current = null;
    setNeedsReinit(true);
  };

  // For CSV entries, show editable fields
  if (isCSV && initialData) {
    return (
      <div className="border rounded-lg p-3 bg-background relative">
        <div className="flex justify-between items-center mb-2">
          <span className="text-xs font-medium text-muted-foreground">
            Additional Business #{index + 1}
            <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-muted">CSV</span>
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onRemove(id)}
            className="h-6 w-6 p-0"
          >
            <XIcon className="h-4 w-4" />
          </Button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <div>
            <Label htmlFor={`name-${id}`} className="text-xs">Business Name *</Label>
            <Input
              id={`name-${id}`}
              placeholder="e.g., ABC HVAC"
              value={initialData.businessName}
              onChange={(e) => onUpdate?.(id, 'businessName', e.target.value)}
              className="h-8 text-sm"
            />
          </div>
          <div>
            <Label htmlFor={`address-${id}`} className="text-xs">Address *</Label>
            <Input
              id={`address-${id}`}
              placeholder="123 Main St, City, ST"
              value={initialData.address || ''}
              onChange={(e) => onUpdate?.(id, 'address', e.target.value)}
              className="h-8 text-sm"
            />
          </div>
          <div>
            <Label htmlFor={`website-${id}`} className="text-xs">Website</Label>
            <Input
              id={`website-${id}`}
              placeholder="https://..."
              value={initialData.website || ''}
              onChange={(e) => onUpdate?.(id, 'website', e.target.value)}
              className="h-8 text-sm"
            />
          </div>
        </div>
      </div>
    );
  }

  // For manual entries with autocomplete
  if (confirmedBusiness) {
    // Show confirmed business display
    return (
      <div className="border rounded-lg p-3 bg-background relative">
        <div className="flex justify-between items-center mb-2">
          <span className="text-xs font-medium text-muted-foreground">Additional Business #{index + 1}</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onRemove(id)}
            className="h-6 w-6 p-0"
          >
            <XIcon className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex justify-between items-start">
          <div className="flex-1">
            <p className="font-medium text-sm">{confirmedBusiness.businessName}</p>
            <p className="text-xs text-muted-foreground mt-1">{confirmedBusiness.address}</p>
            {confirmedBusiness.website && (
              <p className="text-xs text-muted-foreground mt-0.5">{confirmedBusiness.website}</p>
            )}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleClear}
            className="ml-2 text-xs h-7"
          >
            Change
          </Button>
        </div>
      </div>
    );
  }

  // Show autocomplete input for manual entries
  return (
    <div className="border rounded-lg p-3 bg-background relative">
      <div className="flex justify-between items-center mb-2">
        <span className="text-xs font-medium text-muted-foreground">Additional Business #{index + 1}</span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onRemove(id)}
          className="h-6 w-6 p-0"
        >
          <XIcon className="h-4 w-4" />
        </Button>
      </div>
      <div>
        <Label htmlFor={`search-${id}`} className="text-xs">Search for business</Label>
        <Input
          id={`search-${id}`}
          ref={inputRef}
          placeholder="Business name..."
          className="h-8 text-sm"
        />
        <p className="text-xs text-muted-foreground mt-1">Select from dropdown to confirm</p>
      </div>
    </div>
  );
}
