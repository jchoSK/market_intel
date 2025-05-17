
"use client"; 

import type { Business } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Star, StarHalf, Building, ExternalLink, SearchCheck, SearchSlash } from "lucide-react";
import { cn } from "@/lib/utils";

interface BusinessCardProps {
  business: Business;
  onSelect?: (businessId: string) => void;
  isSelected?: boolean;
}

const renderStars = (rating?: number) => {
  if (typeof rating !== 'number' || rating < 0 || rating > 5) {
    return <span className="text-sm text-muted-foreground">No rating</span>;
  }
  
  const fullStars = Math.floor(rating);
  const halfStar = rating % 1 >= 0.25 && rating % 1 < 0.75;
  const effectivelyFullStar = rating % 1 >= 0.75;
  const displayFullStars = fullStars + (effectivelyFullStar ? 1 : 0);
  const displayHalfStar = halfStar && !effectivelyFullStar;

  const emptyStars = 5 - displayFullStars - (displayHalfStar ? 1 : 0);

  return (
    <div className="flex items-center">
      {[...Array(displayFullStars)].map((_, i) => <Star key={`full-${i}`} className="h-5 w-5 fill-primary text-primary" />)}
      {displayHalfStar && <StarHalf key="half" className="h-5 w-5 fill-primary text-primary" />}
      {[...Array(Math.max(0, emptyStars))].map((_, i) => <Star key={`empty-${i}`} className="h-5 w-5 text-primary/50" />)}
      <span className="ml-2 text-sm font-medium text-foreground">{rating.toFixed(1)}</span>
    </div>
  );
};

export default function BusinessCard({ business, onSelect, isSelected }: BusinessCardProps) {
  const gbpUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(business.name || '')}&query_place_id=${business.id}`;

  const handleCardClick = () => {
    if (onSelect && business.id) {
      onSelect(business.id);
    }
  };

  return (
    <Card 
      className={cn(
        "flex flex-col h-full shadow-md hover:shadow-lg transition-shadow duration-200",
        onSelect && "cursor-pointer",
        isSelected && "ring-2 ring-primary shadow-xl"
      )}
      onClick={handleCardClick}
      tabIndex={onSelect ? 0 : -1}
      onKeyDown={(e) => {
        if (onSelect && (e.key === 'Enter' || e.key === ' ')) {
          handleCardClick();
        }
      }}
      aria-pressed={isSelected}
      aria-label={`Select business: ${business.name}`}
    >
      <CardHeader className="pb-2">
        <CardTitle className="text-xl">
          <a
            href={gbpUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline flex items-center"
            onClick={(e) => e.stopPropagation()} 
            aria-label={`View ${business.name} on Google Maps`}
          >
            <Building className="mr-2 h-5 w-5 text-primary/80 shrink-0" />
            <span className="truncate">{business.name || "Unnamed Business"}</span>
          </a>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-grow space-y-1 pt-2">
        {business.address && (
          <p className="text-sm text-muted-foreground mb-2">{business.address}</p>
        )}
        
        {business.phoneNumber && (
          <div className="text-sm mb-1">
            <span className="font-medium text-foreground">Phone: </span>
            <span className="text-muted-foreground truncate">{business.phoneNumber}</span>
          </div>
        )}

        {business.website && (
          <div className="text-sm mb-2">
            <span className="font-medium text-foreground">Website: </span>
            <a 
              href={business.website.startsWith('http') ? business.website : `https://${business.website}`} 
              target="_blank" 
              rel="noopener noreferrer" 
              className="text-primary hover:underline truncate inline-flex items-center"
              onClick={(e) => e.stopPropagation()}
              aria-label={`Visit website for ${business.name}`}
            >
              Website <ExternalLink className="ml-1 h-3 w-3" />
            </a>
          </div>
        )}

        <div className="flex items-center space-x-2 pt-1">
          {renderStars(business.rating)}
          {typeof business.reviewsCount === 'number' && (
            <span className="text-sm text-muted-foreground">({business.reviewsCount} reviews)</span>
          )}
        </div>

        {business.reviewSummary?.text && (
            <p className="mt-2 text-xs text-muted-foreground italic">
              &quot;{business.reviewSummary.text}&quot;
            </p>
        )}

        {business.adsInfo && (
          <div className="mt-2 pt-2 border-t border-border/50">
            <p className="text-sm flex items-center">
              <span className="font-medium text-foreground mr-1">Google Ads:</span>
              {business.adsInfo.isRunningAds === true && (
                <span className="text-green-600 font-semibold flex items-center">
                  <SearchCheck className="mr-1 h-4 w-4" /> Active
                </span>
              )}
              {business.adsInfo.isRunningAds === false && (
                <span className="text-red-600 font-semibold flex items-center">
                  <SearchSlash className="mr-1 h-4 w-4" /> Inactive
                </span>
              )}
              {business.adsInfo.isRunningAds === null && (
                <span className="text-muted-foreground">
                  {business.adsInfo.adType || "Unknown"} 
                </span>
              )}
            </p>
            {business.adsInfo.isRunningAds === true && business.adsInfo.adType && business.adsInfo.adType !== "Google Ads" && (
              <p className="text-xs text-muted-foreground">({business.adsInfo.adType})</p>
            )}
             {business.adsInfo.isRunningAds === null && business.adsInfo.adType && (
              <p className="text-xs text-muted-foreground">({business.adsInfo.adType})</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

    