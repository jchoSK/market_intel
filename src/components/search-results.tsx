
import type { Business } from '@/types';
import BusinessCard from './business-card';
import { Ghost } from 'lucide-react';

interface SearchResultsProps {
  businesses: Business[];
  onBusinessSelect?: (businessId: string) => void;
  selectedBusinessId?: string | null;
}

export default function SearchResults({ businesses, onBusinessSelect, selectedBusinessId }: SearchResultsProps) {
  if (businesses.length === 0) {
    return (
      <div className="text-center py-10 bg-card rounded-lg shadow">
        <Ghost className="mx-auto h-12 w-12 text-muted-foreground mb-3" />
        <p className="text-lg font-semibold text-foreground">No Businesses Found</p>
        <p className="text-xs text-muted-foreground">
          Try adjusting your search terms or widening your radius.
        </p>
      </div>
    );
  }

  return (
    <section aria-labelledby="search-results-heading">
      <h2 id="search-results-heading" className="text-2xl font-semibold mb-4 text-foreground sticky top-0 bg-background py-2 z-10">
        Businesses <span className="text-primary">({businesses.length})</span>
      </h2>
      <div className="space-y-4">
        {businesses.map((business) => (
          <BusinessCard 
            key={business.id} 
            business={business} 
            onSelect={onBusinessSelect} 
            isSelected={selectedBusinessId === business.id}
          />
        ))}
      </div>
    </section>
  );
}

