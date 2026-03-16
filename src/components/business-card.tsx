
"use client"; 

import type { Business } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Star, StarHalf, Building, ExternalLink, SearchCheck, SearchSlash, User, Users, DollarSign, Tag, Info, Home, Briefcase } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

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
      {[...Array(displayFullStars)].map((_, i) => <Star key={`full-${i}`} className="h-4 w-4 fill-primary text-primary" />)}
      {displayHalfStar && <StarHalf key="half" className="h-4 w-4 fill-primary text-primary" />}
      {[...Array(Math.max(0, emptyStars))].map((_, i) => <Star key={`empty-${i}`} className="h-4 w-4 text-primary/50" />)}
      <span className="ml-2 text-xs font-medium text-foreground">{rating.toFixed(1)}</span>
    </div>
  );
};

export default function BusinessCard({ business, onSelect, isSelected }: BusinessCardProps) {
  const gbpUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(business.name || '')}&query_place_id=${business.id}`;

  return (
    <Card 
      className={cn(
        "flex flex-col h-full shadow-md hover:shadow-lg transition-all duration-200",
        onSelect && "cursor-pointer",
        isSelected && "ring-2 ring-primary shadow-xl scale-[1.01]"
      )}
      onClick={() => onSelect?.(business.id)}
    >
      <CardHeader className="pb-2 space-y-1">
        <div className="flex justify-between items-start gap-2">
          <CardTitle className="text-lg leading-tight truncate">
            {business.name || "Unnamed Business"}
          </CardTitle>
          {business.research?.isResidential !== undefined && (
            <Badge variant="outline" className="shrink-0">
              {business.research.isResidential ? <Home className="h-3 w-3 mr-1" /> : <Briefcase className="h-3 w-3 mr-1" />}
              {business.research.isResidential ? "Residential" : "Commercial"}
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground truncate">{business.address}</p>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        <div className="flex items-center space-x-2">
          {renderStars(business.rating)}
          {business.reviewsCount !== undefined && (
            <span className="text-xs text-muted-foreground">({business.reviewsCount} reviews)</span>
          )}
        </div>

        {/* AI Research Grid */}
        <div className="grid grid-cols-2 gap-3 p-3 bg-muted/30 rounded-lg border border-border/50">
          <div className="space-y-1">
            <p className="text-[10px] uppercase font-bold text-muted-foreground flex items-center">
              <User className="h-3 w-3 mr-1" /> Owner/Exec
            </p>
            <p className="text-xs font-medium truncate">{business.research?.owner || 'Unknown'}</p>
          </div>
          <div className="space-y-1">
            <p className="text-[10px] uppercase font-bold text-muted-foreground flex items-center">
              <Users className="h-3 w-3 mr-1" /> Employees
            </p>
            <p className="text-xs font-medium">{business.research?.employeeCount || 'Unknown'}</p>
          </div>
          <div className="space-y-1">
            <p className="text-[10px] uppercase font-bold text-muted-foreground flex items-center">
              <DollarSign className="h-3 w-3 mr-1" /> Revenue
            </p>
            <p className="text-xs font-medium">{business.research?.revenue || 'Unknown'}</p>
          </div>
          <div className="space-y-1">
            <p className="text-[10px] uppercase font-bold text-muted-foreground flex items-center">
              <SearchCheck className="h-3 w-3 mr-1" /> Ads Status
            </p>
            <div className="text-xs flex items-center">
              {business.adsInfo?.isRunningAds ? (
                <span className="text-green-600 font-bold flex items-center"><SearchCheck className="h-3 w-3 mr-1" /> Active</span>
              ) : business.adsInfo?.isRunningAds === false ? (
                <span className="text-red-500 font-bold flex items-center"><SearchSlash className="h-3 w-3 mr-1" /> Inactive</span>
              ) : (
                <span className="text-muted-foreground">Unknown</span>
              )}
            </div>
          </div>
        </div>

        {/* Brands & Promos */}
        {(business.research?.brands?.length || 0) > 0 && (
          <div className="space-y-1">
            <p className="text-[10px] uppercase font-bold text-muted-foreground flex items-center">
              <Tag className="h-3 w-3 mr-1" /> Brands
            </p>
            <div className="flex flex-wrap gap-1">
              {business.research?.brands?.slice(0, 4).map((brand, i) => (
                <Badge key={i} variant="secondary" className="text-[10px] py-0">{brand}</Badge>
              ))}
            </div>
          </div>
        )}

        {/* Action Bar */}
        <div className="flex items-center justify-between pt-2 border-t border-border/50">
          <a href={gbpUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex items-center font-medium">
            Google Maps <ExternalLink className="ml-1 h-3 w-3" />
          </a>
          {business.website && (
            <a href={business.website} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex items-center font-medium">
              Website <ExternalLink className="ml-1 h-3 w-3" />
            </a>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
