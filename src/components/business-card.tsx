"use client"; // Needs to be client for Math.random if used directly, or if event handlers/hooks are added.
                 // Keeping it client for potential future interactions on the card.

import type { Business } from "@/types";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Star, StarHalf, Phone, Globe, CheckCircle2, XCircle, Building } from "lucide-react";

interface BusinessCardProps {
  business: Business;
}

const renderStars = (rating?: number) => {
  if (typeof rating !== 'number' || rating < 0 || rating > 5) {
    return <span className="text-sm text-muted-foreground">No rating</span>;
  }
  
  const fullStars = Math.floor(rating);
  const halfStar = rating % 1 >= 0.25 && rating % 1 < 0.75; // Threshold for half star
  const effectivelyFullStar = rating % 1 >= 0.75; // Treat .75 and above as full for rounding display
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
  return (
    <Card className="flex flex-col h-full shadow-md hover:shadow-lg transition-shadow duration-200">
      <CardHeader>
        <CardTitle className="text-xl text-primary flex items-center">
          <Building className="mr-2 h-5 w-5 text-primary/80" />
          {business.name}
        </CardTitle>
        <CardDescription>{business.address}</CardDescription>
      </CardHeader>
      <CardContent className="flex-grow space-y-3">
        <div className="flex items-center space-x-2">
          {renderStars(business.rating)}
          {typeof business.reviewsCount === 'number' && (
            <span className="text-sm text-muted-foreground">({business.reviewsCount} reviews)</span>
          )}
        </div>
        {business.phoneNumber && (
          <div className="flex items-center text-sm">
            <Phone className="mr-2 h-4 w-4 text-muted-foreground" />
            <span>{business.phoneNumber}</span>
          </div>
        )}
        {business.website && (
          <div className="flex items-center text-sm">
            <Globe className="mr-2 h-4 w-4 text-muted-foreground" />
            <a href={business.website.startsWith('http') ? business.website : `https://${business.website}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate">
              {business.website}
            </a>
          </div>
        )}
      </CardContent>
      <CardFooter>
        {typeof business.isAdWordsCustomer === 'boolean' && (
          <Badge variant={business.isAdWordsCustomer ? "default" : "secondary"} className={business.isAdWordsCustomer ? "bg-green-600 hover:bg-green-700 text-white" : "bg-red-500 hover:bg-red-600 text-white"}>
            {business.isAdWordsCustomer ? (
              <CheckCircle2 className="mr-1 h-4 w-4" />
            ) : (
              <XCircle className="mr-1 h-4 w-4" />
            )}
            Google Ads: {business.isAdWordsCustomer ? "Active" : "Inactive"}
          </Badge>
        )}
      </CardFooter>
    </Card>
  );
}
