import type { Business } from '@/types';
import BusinessCard from './business-card';
import { Ghost } from 'lucide-react';

interface SearchResultsProps {
  businesses: Business[];
}

export default function SearchResults({ businesses }: SearchResultsProps) {
  if (businesses.length === 0) {
    return (
      <div className="text-center py-16 bg-card rounded-lg shadow">
        <Ghost className="mx-auto h-16 w-16 text-muted-foreground mb-4" />
        <p className="text-xl font-semibold text-foreground">No Businesses Found</p>
        <p className="text-sm text-muted-foreground">
          Try adjusting your search terms or widening your radius.
        </p>
      </div>
    );
  }

  return (
    <section aria-labelledby="search-results-heading" className="mt-8">
      <h2 id="search-results-heading" className="text-3xl font-semibold mb-6 text-foreground">
        Search Results <span className="text-primary">({businesses.length})</span>
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {businesses.map((business) => (
          <BusinessCard key={business.id} business={business} />
        ))}
      </div>
    </section>
  );
}
