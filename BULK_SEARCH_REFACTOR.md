# Bulk Search Refactor: Client-Side Storage (Like Single Search)

## Current Problem

1. ❌ Bulk search saves to `/tmp` on server
2. ❌ Results disappear if instance restarts (15 min idle after completion)
3. ❌ Complex server-side file management
4. ❌ 500 errors when trying to write files in Cloud Run

## Proposed Solution

**Store bulk search results in browser state** - exactly like single search!

---

## New Architecture

### Current (Complex):
```
Client                           Server
─────────────────────────────────────────────────────
Create batch    → POST /api/queue/create
                  ↓ saves to /tmp/batch.json

Poll status     → GET /api/queue/status/[id]
                  ↓ reads from /tmp/batch.json

Process job     → POST /api/queue/process/[id]
                  ↓ updates /tmp/batch.json

Download CSV    → GET /api/queue/status/[id]
                  ↓ reads from /tmp/batch.json
                  ↓ generates CSV
```

### New (Simple):
```
Client                           Server
─────────────────────────────────────────────────────
Create batch    → Store in React state
                  (no server file)

Process jobs    → Call /api/search/stream directly
sequentially      (same as single search!)

Store results   → Update React state
                  (same as single search!)

Download CSV    → Generate from React state
                  (same as single search!)
```

---

## Implementation Plan

### 1. New Types (client-side only)

```typescript
// src/types/index.ts

export interface BulkSearchBatch {
  batchId: string;
  createdAt: Date;
  searches: BulkSearchJob[];
}

export interface BulkSearchJob {
  jobId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  searchParams: SearchParams;
  result?: {
    businesses: Business[];
    searchedLocationCenter?: { lat: number; lng: number };
    logs: string[];
    error: string | null;
  };
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
}
```

### 2. Update BulkSearchForm

**File:** `src/components/bulk-search-form.tsx`

```typescript
// Remove API call to /api/queue/create
// Instead, just return the searches array

const handleSubmit = async () => {
  // ... validation ...

  // Remove _id field
  const searchParams = searches.map(({ _id, ...rest }) => rest);

  // Create batch ID client-side
  const batchId = crypto.randomUUID();

  // Pass to parent component
  onBatchCreated(batchId, searchParams);

  // Close dialog
  onOpenChange(false);
};
```

### 3. Create New Client-Side Batch Processor

**File:** `src/hooks/use-bulk-search.ts`

```typescript
import { useState, useCallback } from 'react';
import type { SearchParams, Business, BulkSearchBatch, BulkSearchJob } from '@/types';

export function useBulkSearch() {
  const [batches, setBatches] = useState<BulkSearchBatch[]>([]);
  const [processingBatchId, setProcessingBatchId] = useState<string | null>(null);

  // Create a new batch
  const createBatch = useCallback((searches: SearchParams[]) => {
    const batchId = crypto.randomUUID();

    const jobs: BulkSearchJob[] = searches.map((params) => ({
      jobId: crypto.randomUUID(),
      status: 'pending',
      searchParams: params,
    }));

    const newBatch: BulkSearchBatch = {
      batchId,
      createdAt: new Date(),
      searches: jobs,
    };

    setBatches((prev) => [newBatch, ...prev]);
    return batchId;
  }, []);

  // Process a batch (sequentially)
  const processBatch = useCallback(async (batchId: string) => {
    setProcessingBatchId(batchId);

    setBatches((prev) =>
      prev.map((batch) =>
        batch.batchId === batchId
          ? { ...batch, searches: batch.searches.map(job => ({ ...job })) }
          : batch
      )
    );

    // Get the batch
    const batch = batches.find((b) => b.batchId === batchId);
    if (!batch) return;

    // Process jobs sequentially
    for (const job of batch.searches) {
      // Mark as running
      setBatches((prev) =>
        prev.map((b) =>
          b.batchId === batchId
            ? {
                ...b,
                searches: b.searches.map((j) =>
                  j.jobId === job.jobId
                    ? { ...j, status: 'running', startedAt: new Date() }
                    : j
                ),
              }
            : b
        )
      );

      try {
        // Call streaming search (same as single search!)
        const result = await performStreamingSearch(job.searchParams);

        // Store result
        setBatches((prev) =>
          prev.map((b) =>
            b.batchId === batchId
              ? {
                  ...b,
                  searches: b.searches.map((j) =>
                    j.jobId === job.jobId
                      ? {
                          ...j,
                          status: 'completed',
                          completedAt: new Date(),
                          result,
                        }
                      : j
                  ),
                }
              : b
          )
        );

        // Rate limit delay (2 seconds between jobs)
        await new Promise((resolve) => setTimeout(resolve, 2000));
      } catch (error: any) {
        // Mark as failed
        setBatches((prev) =>
          prev.map((b) =>
            b.batchId === batchId
              ? {
                  ...b,
                  searches: b.searches.map((j) =>
                    j.jobId === job.jobId
                      ? {
                          ...j,
                          status: 'failed',
                          completedAt: new Date(),
                          error: error?.message || 'Search failed',
                        }
                      : j
                  ),
                }
              : b
          )
        );
      }
    }

    setProcessingBatchId(null);
  }, [batches]);

  // Helper: Call streaming search
  const performStreamingSearch = async (
    params: SearchParams
  ): Promise<{
    businesses: Business[];
    searchedLocationCenter?: { lat: number; lng: number };
    logs: string[];
    error: string | null;
  }> => {
    return new Promise((resolve, reject) => {
      const payload = encodeURIComponent(JSON.stringify(params));
      const url = `/api/search/stream?payload=${payload}`;
      const eventSource = new EventSource(url);

      let result: any = null;

      eventSource.addEventListener('complete', (event: MessageEvent) => {
        try {
          result = JSON.parse(event.data);
          eventSource.close();
          resolve(result);
        } catch (error) {
          eventSource.close();
          reject(new Error('Failed to parse search result'));
        }
      });

      eventSource.onerror = (event: Event) => {
        eventSource.close();
        reject(new Error('Failed to establish streaming connection'));
      };
    });
  };

  // Delete a batch
  const deleteBatch = useCallback((batchId: string) => {
    setBatches((prev) => prev.filter((b) => b.batchId !== batchId));
  }, []);

  return {
    batches,
    processingBatchId,
    createBatch,
    processBatch,
    deleteBatch,
  };
}
```

### 4. Simplify QueueManagementView

**File:** `src/components/queue-management-view.tsx`

Remove all API calls and use the `useBulkSearch` hook instead:

```typescript
export default function QueueManagementView({ newBatchId }: QueueManagementViewProps) {
  const { batches, processingBatchId, processBatch, deleteBatch } = useBulkSearch();
  const { toast } = useToast();

  // Auto-start processing for new batch
  useEffect(() => {
    if (newBatchId) {
      processBatch(newBatchId);
    }
  }, [newBatchId, processBatch]);

  // Rest of the component uses batches from state
  // No more polling, no more API calls!
}
```

---

## Benefits

✅ **Simple** - Just React state (like single search)
✅ **No 500 errors** - No server-side file writes
✅ **No /tmp issues** - Nothing stored on server
✅ **Predictable** - Results available as long as page is open
✅ **Same behavior** - Matches single search (disappears on refresh)
✅ **No polling** - Direct EventSource streams
✅ **Less code** - Remove entire queue API layer

---

## Tradeoffs

⚠️ **Refresh = data gone** (but user wants this!)
⚠️ **Close tab = data gone** (same as single search)
⚠️ **Can't resume** - But not needed for this use case

---

## Migration Steps

1. Create `src/hooks/use-bulk-search.ts`
2. Update `bulk-search-form.tsx` to not call API
3. Refactor `queue-management-view.tsx` to use hook
4. **DELETE** these API routes (no longer needed):
   - `src/app/api/queue/create/route.ts`
   - `src/app/api/queue/process/[batchId]/route.ts`
   - `src/app/api/queue/status/[batchId]/route.ts`
   - `src/app/api/queue/list/route.ts`
   - `src/app/api/queue/delete/[batchId]/route.ts`
5. **DELETE** `src/lib/queue-utils.ts`
6. Test bulk search
7. Deploy

---

## Result

Bulk search becomes a **client-side only feature** that works exactly like single search, just processes multiple searches sequentially. No server-side complexity, no file storage issues, no 15-minute idle timeout problems!
