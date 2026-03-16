
"use client";

import type { Business } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Star, StarHalf, Building, Clock, ExternalLink, SearchCheck, SearchSlash, Percent } from "lucide-react";
import { cn, getLocalizedTextString } from "@/lib/utils";

// Clean up crawl error messages for display
const formatPromotionError = (websiteStatus: string): string => {
  if (websiteStatus.includes('Invalid Start URL')) {
    return 'Unable to scan website (invalid URL)';
  }
  if (websiteStatus.includes('422') || websiteStatus.includes('string_too_long')) {
    return 'Scan configuration error';
  }
  if (websiteStatus.includes('400')) {
    return 'Unable to scan website';
  }
  if (websiteStatus.includes('403') || websiteStatus.includes('Forbidden')) {
    return 'Website blocked access';
  }
  if (websiteStatus.includes('404') || websiteStatus.includes('Not Found')) {
    return 'Website not found';
  }
  if (websiteStatus.includes('timeout') || websiteStatus.includes('Timeout')) {
    return 'Website scan timed out';
  }
  if (websiteStatus.includes('ECONNREFUSED') || websiteStatus.includes('ENOTFOUND')) {
    return 'Unable to connect to website';
  }
  // For other errors, try to extract just the main message
  if (websiteStatus.startsWith('Crawl failed:')) {
    const errorPart = websiteStatus.replace('Crawl failed:', '').trim();
    // If it's still too long/technical, simplify it
    if (errorPart.length > 50 || errorPart.includes('{')) {
      return 'Website scan failed';
    }
    return `Scan failed: ${errorPart}`;
  }
  return websiteStatus;
};

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

const formatDisplayUrl = (url?: string): string => {
  if (!url) return 'Not Available';
  try {
    let cleanUrl = url.replace(/^https?:\/\//, '').replace(/\/$/, '');
    if (cleanUrl.length > 30) { 
        const parts = cleanUrl.split('/');
        if (parts.length > 1 && parts[0].length < 25) { 
            cleanUrl = parts[0] + "/...";
        } else {
             cleanUrl = cleanUrl.substring(0, 27) + "...";
        }
    }
    return cleanUrl;
  } catch (e) {
    return url; 
  }
};

const renderPromotionWithLinks = (promotionText: string) => {
  const linkRegex = /\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g;
  let lastIndex = 0;
  const parts: (string | JSX.Element)[] = [];
  let match;

  while ((match = linkRegex.exec(promotionText)) !== null) {
    if (match.index > lastIndex) {
      parts.push(promotionText.substring(lastIndex, match.index));
    }
    const displayText = match[1];
    const url = match[2];
    parts.push(
      <a
        key={url + match.index}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary hover:underline"
        onClick={(e) => e.stopPropagation()}
      >
        {displayText}
      </a>
    );
    lastIndex = linkRegex.lastIndex;
  }

  if (lastIndex < promotionText.length) {
    parts.push(promotionText.substring(lastIndex));
  }

  return <>{parts}</>;
};


export default function BusinessCard({ business, onSelect, isSelected }: BusinessCardProps) {
  const gbpUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(business.name)}&query_place_id=${business.id}`;

  const handleCardClick = () => {
    if (onSelect) {
      onSelect(business.id);
    }
  };

  const websiteUrl = business.website 
    ? business.website.startsWith('http') ? business.website : `https://${business.website}`
    : null;

  const lastReviewTime = 
    business.reviewSummary?.mostRecentReview?.relativePublishTimeDescription || 
    (business.reviewSummary?.mostRecentReview?.publishTime 
      ? new Date(business.reviewSummary.mostRecentReview.publishTime).toLocaleDateString() 
      : null);
  const reviewSummaryText = getLocalizedTextString(business.reviewSummary?.text);

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
            className="text-primary hover:underline flex items-center group"
            onClick={(e) => e.stopPropagation()} 
            aria-label={`View ${business.name} on Google Maps`}
          >
            <Building className="mr-2 h-5 w-5 text-primary/80 shrink-0" />
            <span className="truncate">{business.name}</span>
            <ExternalLink className="ml-1.5 h-4 w-4 text-primary/70 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
          </a>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-grow space-y-1.5 pt-2 text-sm">
        {business.address && (
          <p className="text-muted-foreground mb-2">{business.address}</p>
        )}
        
        <div className="mb-1">
          <span className="font-medium text-foreground">Phone: </span>
          <span className="text-muted-foreground truncate">{business.phoneNumber || 'Not Available'}</span>
        </div>

        <div className="mb-2 flex items-center">
          <span className="font-medium text-foreground mr-1">Website: </span>
          {websiteUrl && business.website && business.website !== 'Not Available' ? (
            <a 
              href={websiteUrl} 
              target="_blank" 
              rel="noopener noreferrer" 
              className="text-primary hover:underline truncate group inline-flex items-center"
              onClick={(e) => e.stopPropagation()} 
              aria-label={`Visit website for ${business.name}`}
              title={business.website}
            >
              {business.website}
              <ExternalLink className="ml-1 h-3.5 w-3.5 text-primary/70 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
            </a>
          ) : (
            <span className="text-muted-foreground">Not Available</span>
          )}
        </div>

        <div className="flex items-center space-x-2 pt-1">
          {renderStars(business.rating)}
          {typeof business.reviewsCount === 'number' && (
            <span className="text-muted-foreground">({business.reviewsCount} reviews)</span>
          )}
        </div>
        
        {lastReviewTime && (
          <div className="text-xs text-muted-foreground mt-1 flex items-center">
            <Clock className="mr-1 h-3 w-3" />
            <span>Last review: {lastReviewTime}</span>
          </div>
        )}

        {reviewSummaryText && (
            <p className="mt-2 text-xs text-muted-foreground italic">
              &quot;{reviewSummaryText}&quot;
            </p>
        )}

        {business.adsInfo && (
          <div className="mt-2 pt-2 border-t border-border/50">
            <p className="text-xs font-medium text-foreground mb-0.5">
              Google Ads:
            </p>
            {business.adsInfo.error ? (
              <div className="flex items-center text-xs text-destructive">
                <SearchSlash className="mr-1.5 h-3.5 w-3.5" />
                <span>
                  Status: {business.adsInfo.error}
                </span>
              </div>
            ) : business.adsInfo.isRunningAds === true ? (
               <div className="flex items-center text-xs text-green-600 dark:text-green-500">
                 <SearchCheck className="mr-1.5 h-3.5 w-3.5" />
                {business.adsInfo.adsTransparencyLink ? (
                  <a
                    href={business.adsInfo.adsTransparencyLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:underline group inline-flex items-center"
                    onClick={(e) => e.stopPropagation()}
                    aria-label={`View ads for ${business.name} on Google Ads Transparency Center`}
                  >
                    <span>
                      Running ({business.adsInfo.adCount > 0 ? `${business.adsInfo.adCount} ads found` : 'Detected'})
                    </span>
                    <ExternalLink className="ml-1 h-3 w-3 opacity-70 group-hover:opacity-100 transition-opacity shrink-0" />
                  </a>
                ) : (
                  <span>
                    Running ({business.adsInfo.adCount > 0 ? `${business.adsInfo.adCount} ads found` : 'Detected'})
                  </span>
                )}
              </div>
            ) : business.adsInfo.isRunningAds === false ? (
              <div className="flex items-center text-xs text-amber-600 dark:text-amber-500">
                <SearchSlash className="mr-1.5 h-3.5 w-3.5" />
                <span>
                  Not detected {business.adsInfo.adCount > 0 ? `(${business.adsInfo.adCount} ads from other domains found for advertiser)` : ''}
                </span>
              </div>
            ) : (
               <div className="flex items-center text-xs text-muted-foreground">
                 <SearchSlash className="mr-1.5 h-3.5 w-3.5" />
                <span>Status undetermined</span>
              </div>
            )}
          </div>
        )}

        {/* Call Outs Scan Details (Focused Scan) */}
        {business.promotionsScan && (
          <div className="mt-3 pt-3 border-t border-border/50 space-y-1.5">
            <h4 className="text-xs font-semibold text-muted-foreground flex items-center">
              <Percent className="mr-1.5 h-3.5 w-3.5" />
              Current Call Outs
            </h4>
            <p className="text-xs">
              <span className="font-medium text-foreground">Verified: </span>
              <span className="text-muted-foreground">{new Date(business.promotionsScan.dataVerificationDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
            </p>
            {business.promotionsScan.promotions.length > 0 ? (
              <div>
                <p className="text-xs font-medium text-foreground mt-1">Active Call Outs:</p>
                <ul className="list-disc list-inside text-xs text-muted-foreground pl-2 space-y-0.5">
                  {business.promotionsScan.promotions.map((promo, index) => (
                    <li key={`promo-${index}`}>{renderPromotionWithLinks(promo)}</li>
                  ))}
                </ul>
              </div>
            ) : business.promotionsScan.websiteStatus === 'Successfully crawled' ? (
              <p className="text-xs text-muted-foreground">No call outs found</p>
            ) : (
              <p className="text-xs text-amber-600 dark:text-amber-500">
                {formatPromotionError(business.promotionsScan.websiteStatus)}
              </p>
            )}
          </div>
        )}

      </CardContent>
    </Card>
  );
}
