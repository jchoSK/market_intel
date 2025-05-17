
"use client"; 

import type { Business } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Star, StarHalf, Building } from "lucide-react";

interface BusinessCardProps {
  business: Business;
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

export default function BusinessCard({ business }: BusinessCardProps) {
  const gbpUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(business.name)}&query_place_id=${business.id}`;

  return (
    <Card className="flex flex-col h-full shadow-md hover:shadow-lg transition-shadow duration-200">
      <CardHeader className="pb-2">
        <CardTitle className="text-xl text-primary">
          <a
            href={gbpUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:underline flex items-center"
            aria-label={`View ${business.name} on Google Maps`}
          >
            <Building className="mr-2 h-5 w-5 text-primary/80 shrink-0" />
            <span className="truncate">{business.name}</span>
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
              className="text-primary hover:underline truncate"
              aria-label={`Visit website for ${business.name}`}
            >
              Website
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
      </CardContent>
      {/* CardFooter can be used for future additions if needed */}
    </Card>
  );
}
