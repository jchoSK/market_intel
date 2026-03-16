'use client';

import { useState, useCallback, useRef } from 'react';
import type { Business, SearchParams, DirectInputBusiness, MyBusiness, PromotionsScanResult } from '@/types';

// ============================================================================
// CRAWL BATCH SIZE - Businesses per SSE connection
// ============================================================================
// Hobby plan: 5 concurrent browsers, 15 req/min rate limit
// With sliding window concurrency, we can process many businesses per connection.
// The server-side rate limiter handles the pacing automatically.
// ============================================================================
const CRAWL_BATCH_SIZE = 20;
// ============================================================================

// Job types
export type UnifiedJobType = 'google-places' | 'direct-input' | 'my-business';
export type UnifiedJobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'canceled';

export interface UnifiedJob {
  jobId: string;
  type: UnifiedJobType;
  status: UnifiedJobStatus;
  // For Google Places jobs
  searchParams?: SearchParams;
  businessIndex?: number; // Index within Google Places results
  // For Direct Input jobs
  directBusiness?: DirectInputBusiness;
  // For My Business jobs (skip promotions)
  myBusiness?: MyBusiness;
  isMyBusiness?: boolean;
  // Result
  result?: {
    business: Business;
    logs: string[];
    error: string | null;
  };
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
  progress?: {
    stage: string;
    percent: number;
    message?: string;
  };
}

export interface UnifiedBatch {
  batchId: string;
  createdAt: Date;
  searchParams: SearchParams;
  jobs: UnifiedJob[];
  // Stores the businesses found from Google Places text search (before individual processing)
  googlePlacesBusinesses?: Partial<Business>[];
  searchedLocationCenter?: { lat: number; lng: number };
  // Progress during Google Places search phase
  searchProgress?: {
    stage: string;
    percent: number;
    completed?: number;
    total?: number;
    message?: string;
  };
  // Progress during crawl phase (separate from main search)
  crawlProgress?: {
    stage: 'pending' | 'crawling' | 'complete';
    currentBatch: number;
    totalBatches: number;
    completedBusinesses: number;
    totalBusinesses: number;
    message?: string;
  };
}

export function useUnifiedSearch() {
  const [batches, setBatches] = useState<UnifiedBatch[]>([]);
  const [processingBatchId, setProcessingBatchId] = useState<string | null>(null);
  const [queuedBatchIds, setQueuedBatchIds] = useState<string[]>([]);
  const currentEventSourceRef = useRef<EventSource | null>(null);
  const currentRejectRef = useRef<((error: Error) => void) | null>(null);
  const cancelledBatchesRef = useRef<Set<string>>(new Set());
  const batchesRef = useRef<UnifiedBatch[]>([]);
  const processingBatchIdRef = useRef<string | null>(null);
  // Ref for queue to enable synchronous access (state updates are async/batched)
  const queuedBatchIdsRef = useRef<string[]>([]);

  // Keep refs in sync with state
  batchesRef.current = batches;
  processingBatchIdRef.current = processingBatchId;

  // Create a new batch with search params and optional direct businesses
  const createBatch = useCallback((
    searchParams: SearchParams,
    directBusinesses: DirectInputBusiness[] = [],
    myBusiness?: MyBusiness
  ) => {
    const batchId = crypto.randomUUID();

    // Create job for My Business (if provided) - first in list
    const myBusinessJob: UnifiedJob[] = myBusiness
      ? [{
          jobId: crypto.randomUUID(),
          type: 'my-business' as UnifiedJobType,
          status: 'pending' as UnifiedJobStatus,
          myBusiness,
          isMyBusiness: true,
          directBusiness: {
            businessName: myBusiness.businessName,
            address: myBusiness.address,
            website: myBusiness.website,
          },
        }]
      : [];

    // Create jobs for direct input businesses
    const directJobs: UnifiedJob[] = directBusinesses.map((business) => ({
      jobId: crypto.randomUUID(),
      type: 'direct-input' as UnifiedJobType,
      status: 'pending' as UnifiedJobStatus,
      directBusiness: business,
    }));

    const newBatch: UnifiedBatch = {
      batchId,
      createdAt: new Date(),
      searchParams,
      jobs: [...myBusinessJob, ...directJobs], // My Business first, then direct input; Google Places jobs added after search
    };

    setBatches((prev) => [newBatch, ...prev]);
    return batchId;
  }, []);

  // Helper: Perform streaming search for a direct input business
  const performDirectInputSearch = useCallback((
    business: DirectInputBusiness,
    onProgress?: (progress: { stage: string; percent: number; message?: string }) => void,
    options?: { skipPromotions?: boolean; isMyBusiness?: boolean; skipAdsCheck?: boolean }
  ): Promise<{
    business: Business;
    logs: string[];
    error: string | null;
  }> => {
    return new Promise((resolve, reject) => {
      let eventSource: EventSource | null = null;
      let settled = false;

      const query = new URLSearchParams();
      query.set('payload', JSON.stringify({
        ...business,
        skipPromotions: options?.skipPromotions || false,
        isMyBusiness: options?.isMyBusiness || false,
        skipAdsCheck: options?.skipAdsCheck || false,
      }));
      const url = `/api/direct-search/stream?${query.toString()}`;

      eventSource = new EventSource(url);

      const rejectionHandler = (error: Error) => {
        if (settled) return;
        settled = true;
        if (currentEventSourceRef.current === eventSource) {
          currentEventSourceRef.current = null;
        }
        if (currentRejectRef.current === rejectionHandler) {
          currentRejectRef.current = null;
        }
        eventSource?.close();
        reject(error);
      };

      const resolutionHandler = (value: any) => {
        if (settled) return;
        settled = true;
        if (currentEventSourceRef.current === eventSource) {
          currentEventSourceRef.current = null;
        }
        if (currentRejectRef.current === rejectionHandler) {
          currentRejectRef.current = null;
        }
        eventSource?.close();
        resolve(value);
      };

      currentEventSourceRef.current = eventSource;
      currentRejectRef.current = rejectionHandler;

      eventSource.addEventListener('progress', (event: MessageEvent) => {
        try {
          const progressData = JSON.parse(event.data);
          onProgress?.(progressData);
        } catch (error) {
          console.warn('Failed to parse progress event:', error);
        }
      });

      eventSource.addEventListener('complete', (event: MessageEvent) => {
        try {
          if (!event.data) {
            throw new Error('Missing search result payload');
          }
          const parsedResult = JSON.parse(event.data);
          resolutionHandler(parsedResult);
        } catch (error) {
          rejectionHandler(new Error('Failed to parse search result'));
        }
      });

      eventSource.addEventListener('search-error', (event: MessageEvent) => {
        try {
          if (!event.data) {
            rejectionHandler(new Error('Search error'));
            return;
          }
          const errorData = JSON.parse(event.data);
          rejectionHandler(new Error(errorData?.message || 'Search error'));
        } catch (error) {
          rejectionHandler(new Error('Search error'));
        }
      });

      eventSource.onerror = (event: Event | MessageEvent) => {
        if ('data' in event && event.data) {
          try {
            const parsed = JSON.parse(event.data);
            rejectionHandler(new Error(parsed?.message || 'Search stream error'));
            return;
          } catch (error) {
            rejectionHandler(new Error('Search stream error'));
            return;
          }
        }

        if (eventSource?.readyState === EventSource.CLOSED) {
          rejectionHandler(new Error('Streaming connection closed unexpectedly'));
        }
      };
    });
  }, []);

  // Helper: Perform crawl batch for a set of businesses
  const performCrawlBatch = useCallback((
    businesses: Array<{ businessId: string; businessName: string; website: string }>,
    onProgress?: (progress: { stage: string; percent: number; message?: string }) => void,
    onCrawlResult?: (result: { businessId: string; promotionsScan: PromotionsScanResult }) => void
  ): Promise<{
    results: Array<{ businessId: string; promotionsScan: PromotionsScanResult }>;
    logs: string[];
    error: string | null;
  }> => {
    return new Promise((resolve, reject) => {
      let eventSource: EventSource | null = null;
      let settled = false;

      const query = new URLSearchParams();
      query.set('payload', JSON.stringify({ businesses }));
      const url = `/api/search/crawl-batch?${query.toString()}`;

      console.log(`[UnifiedSearch] Starting crawl batch for ${businesses.length} businesses`);
      eventSource = new EventSource(url);

      const rejectionHandler = (error: Error) => {
        if (settled) return;
        settled = true;
        eventSource?.close();
        reject(error);
      };

      const resolutionHandler = (value: any) => {
        if (settled) return;
        settled = true;
        eventSource?.close();
        resolve(value);
      };

      eventSource.addEventListener('progress', (event: MessageEvent) => {
        try {
          const progressData = JSON.parse(event.data);
          onProgress?.(progressData);
        } catch (error) {
          console.warn('[UnifiedSearch] Failed to parse crawl progress event:', error);
        }
      });

      eventSource.addEventListener('log', (event: MessageEvent) => {
        try {
          const logData = JSON.parse(event.data);
          // Check if this is a crawl result message
          if (logData.message?.startsWith('CRAWL_RESULT:')) {
            const resultJson = logData.message.substring('CRAWL_RESULT:'.length);
            const result = JSON.parse(resultJson);
            console.log(`[UnifiedSearch] Crawl result received for business ${result.businessId}`);
            onCrawlResult?.(result);
          } else {
            console.log('[UnifiedSearch] Crawl log:', logData);
          }
        } catch (error) {
          console.warn('[UnifiedSearch] Failed to parse crawl log event:', error);
        }
      });

      eventSource.addEventListener('complete', (event: MessageEvent) => {
        try {
          if (!event.data) {
            throw new Error('Missing crawl batch result payload');
          }
          const parsedResult = JSON.parse(event.data);
          console.log(`[UnifiedSearch] Crawl batch complete: ${parsedResult.results?.length || 0} results`);
          resolutionHandler(parsedResult);
        } catch (error) {
          rejectionHandler(new Error('Failed to parse crawl batch result'));
        }
      });

      eventSource.addEventListener('crawl-error', (event: MessageEvent) => {
        try {
          if (!event.data) {
            rejectionHandler(new Error('Crawl batch error'));
            return;
          }
          const errorData = JSON.parse(event.data);
          console.error('[UnifiedSearch] Crawl batch error:', errorData);
          rejectionHandler(new Error(errorData?.message || 'Crawl batch error'));
        } catch (error) {
          rejectionHandler(new Error('Crawl batch error'));
        }
      });

      eventSource.onerror = (event: Event | MessageEvent) => {
        if ('data' in event && event.data) {
          try {
            const parsed = JSON.parse(event.data);
            rejectionHandler(new Error(parsed?.message || 'Crawl stream error'));
            return;
          } catch (error) {
            rejectionHandler(new Error('Crawl stream error'));
            return;
          }
        }

        if (eventSource?.readyState === EventSource.CLOSED) {
          console.error('[UnifiedSearch] Crawl EventSource connection error:', event);
          rejectionHandler(new Error('Crawl streaming connection closed unexpectedly'));
        }
      };
    });
  }, []);

  // Helper: Perform Google Places text search (single request, server handles batching internally)
  const performGooglePlacesTextSearch = useCallback(async (
    searchParams: SearchParams,
    onProgress?: (progress: { stage: string; percent: number; completed?: number; total?: number; message?: string }) => void
  ): Promise<{
    businesses: Business[];
    searchedLocationCenter?: { lat: number; lng: number };
    logs: string[];
    error: string | null;
  }> => {
    return new Promise((resolve, reject) => {
      let eventSource: EventSource | null = null;
      let settled = false;

      const params = new URLSearchParams();
      params.set('payload', JSON.stringify(searchParams));
      const url = `/api/search/stream?${params.toString()}`;

      console.log('[UnifiedSearch] Starting Google Places search');
      console.log('[UnifiedSearch] Attempting to connect to:', url.substring(0, 100) + '...');

      eventSource = new EventSource(url);

      const rejectionHandler = (error: Error) => {
        if (settled) return;
        settled = true;
        eventSource?.close();
        reject(error);
      };

      const resolutionHandler = (value: any) => {
        if (settled) return;
        settled = true;
        eventSource?.close();
        resolve(value);
      };

      eventSource.addEventListener('progress', (event: MessageEvent) => {
        try {
          const progressData = JSON.parse(event.data);
          // Forward progress with completed/total info
          onProgress?.({
            stage: progressData.stage,
            percent: progressData.percent,
            completed: progressData.completed,
            total: progressData.total,
            message: progressData.message,
          });
        } catch (error) {
          console.warn('Failed to parse progress event:', error);
        }
      });

      eventSource.addEventListener('log', (event: MessageEvent) => {
        try {
          const logData = JSON.parse(event.data);
          console.log('[UnifiedSearch] Server log:', logData);
        } catch (error) {
          console.warn('[UnifiedSearch] Failed to parse log event:', error);
        }
      });

      eventSource.addEventListener('complete', (event: MessageEvent) => {
        try {
          if (!event.data) {
            throw new Error('Missing search result payload');
          }
          const parsedResult = JSON.parse(event.data);
          eventSource?.close();

          console.log(`[UnifiedSearch] Search complete: ${parsedResult.businesses?.length || 0} businesses received`);

          resolutionHandler({
            businesses: parsedResult.businesses || [],
            searchedLocationCenter: parsedResult.searchedLocationCenter,
            logs: parsedResult.logs || [],
            error: parsedResult.error,
          });
        } catch (error) {
          eventSource?.close();
          rejectionHandler(new Error('Failed to parse search result'));
        }
      });

      eventSource.addEventListener('search-error', (event: MessageEvent) => {
        try {
          if (!event.data) {
            console.error('[UnifiedSearch] Server sent empty error payload');
            eventSource?.close();
            rejectionHandler(new Error('Search error'));
            return;
          }
          const errorData = JSON.parse(event.data);
          console.error('[UnifiedSearch] Server error event:', errorData);
          eventSource?.close();
          rejectionHandler(new Error(errorData?.message || 'Search error'));
        } catch (error) {
          console.error('[UnifiedSearch] Failed to parse search-error event payload:', error);
          eventSource?.close();
          rejectionHandler(new Error('Search error'));
        }
      });

      eventSource.onerror = (event: Event | MessageEvent) => {
        if ('data' in event && event.data) {
          try {
            const parsed = JSON.parse(event.data);
            eventSource?.close();
            rejectionHandler(new Error(parsed?.message || 'Search stream error'));
            return;
          } catch (error) {
            eventSource?.close();
            rejectionHandler(new Error('Search stream error'));
            return;
          }
        }

        if (eventSource?.readyState === EventSource.CLOSED) {
          console.error('[UnifiedSearch] EventSource connection error:', event);
          eventSource?.close();
          rejectionHandler(new Error('Streaming connection closed unexpectedly'));
        } else {
          console.warn('[UnifiedSearch] EventSource transient error (will retry automatically):', event);
        }
      };
    });
  }, []);

  // Internal function to actually run batch processing
  const runBatchProcessing = useCallback(
    async (batchId: string, onProgress?: (jobIndex: number, progress: any) => void) => {
      // IMPORTANT: Check if already processing this batch to prevent duplicate runs
      // This can happen if React StrictMode double-invokes or due to race conditions
      if (processingBatchIdRef.current === batchId) {
        console.log(`[UnifiedSearch] Batch ${batchId.slice(0, 8)} already processing, skipping duplicate run`);
        return;
      }

      cancelledBatchesRef.current.delete(batchId);

      // Update ref IMMEDIATELY (synchronously) to prevent race conditions
      // The state update is async and won't prevent duplicate calls in time
      processingBatchIdRef.current = batchId;
      setProcessingBatchId(batchId);

      // Use ref to get latest batches (avoids stale closure issue)
      const batch = batchesRef.current.find((b) => b.batchId === batchId);
      if (!batch) {
        console.error(`Batch ${batchId} not found`);
        return;
      }

      const shouldCancel = () => cancelledBatchesRef.current.has(batchId);
      const waitBetweenJobs = async () => {
        await new Promise((resolve) => setTimeout(resolve, 2000));
      };

      try {
        // Step 1: Perform Google Places text search
        console.log(`[UnifiedSearch] Starting Google Places search for batch ${batchId}`);

        const searchResult = await performGooglePlacesTextSearch(batch.searchParams, (progress) => {
          // Update batch with search progress
          setBatches((prev) =>
            prev.map((b) =>
              b.batchId === batchId
                ? { ...b, searchProgress: progress }
                : b
            )
          );
        });

        if (shouldCancel()) {
          console.log(`[UnifiedSearch] Batch ${batchId} canceled during Google Places search`);
          return;
        }

        if (searchResult.error) {
          console.error(`[UnifiedSearch] Google Places search error:`, searchResult.error);
        }

        // Store Google Places businesses and create jobs for them
        const googlePlacesBusinesses = searchResult.businesses || [];
        const googlePlacesJobs: UnifiedJob[] = googlePlacesBusinesses.map((business, index) => ({
          jobId: crypto.randomUUID(),
          type: 'google-places' as UnifiedJobType,
          status: 'completed' as UnifiedJobStatus, // Already processed by the stream
          businessIndex: index,
          result: {
            business: business as Business,
            logs: [],
            error: null,
          },
          completedAt: new Date(),
        }));

        // Update batch with Google Places results
        setBatches((prev) =>
          prev.map((b) =>
            b.batchId === batchId
              ? {
                  ...b,
                  googlePlacesBusinesses,
                  searchedLocationCenter: searchResult.searchedLocationCenter,
                  jobs: [...googlePlacesJobs, ...b.jobs], // Google Places jobs first, then direct input
                }
              : b
          )
        );

        // Step 2: Start crawl batches for businesses with websites
        const businessesToCrawl = googlePlacesBusinesses
          .filter((b) => b.website && b.id && b.name)
          .map((b) => ({
            businessId: b.id!,
            businessName: b.name!,
            website: b.website!,
          }));

        if (businessesToCrawl.length > 0 && !shouldCancel()) {
          console.log(`[UnifiedSearch] Starting crawl phase for ${businessesToCrawl.length} businesses in batches of ${CRAWL_BATCH_SIZE}`);

          const totalBatches = Math.ceil(businessesToCrawl.length / CRAWL_BATCH_SIZE);
          let completedCrawls = 0;

          // Initialize crawl progress
          setBatches((prev) =>
            prev.map((b) =>
              b.batchId === batchId
                ? {
                    ...b,
                    crawlProgress: {
                      stage: 'crawling',
                      currentBatch: 1,
                      totalBatches,
                      completedBusinesses: 0,
                      totalBusinesses: businessesToCrawl.length,
                      message: `Starting crawl phase...`,
                    },
                  }
                : b
            )
          );

          // Process crawl batches sequentially (each batch is a separate connection)
          for (let i = 0; i < businessesToCrawl.length; i += CRAWL_BATCH_SIZE) {
            if (shouldCancel()) break;

            const crawlBatch = businessesToCrawl.slice(i, i + CRAWL_BATCH_SIZE);
            const batchNum = Math.floor(i / CRAWL_BATCH_SIZE) + 1;

            console.log(`[UnifiedSearch] Starting crawl batch ${batchNum}/${totalBatches} (${crawlBatch.length} businesses)`);

            // Update crawl progress for new batch
            setBatches((prev) =>
              prev.map((b) =>
                b.batchId === batchId
                  ? {
                      ...b,
                      crawlProgress: {
                        stage: 'crawling',
                        currentBatch: batchNum,
                        totalBatches,
                        completedBusinesses: completedCrawls,
                        totalBusinesses: businessesToCrawl.length,
                        message: `Crawling batch ${batchNum} of ${totalBatches}...`,
                      },
                    }
                  : b
              )
            );

            try {
              await performCrawlBatch(
                crawlBatch,
                // Progress callback - not used for main progress anymore
                () => {},
                // Crawl result callback - update business immediately when result arrives
                (crawlResult) => {
                  completedCrawls++;
                  setBatches((prev) =>
                    prev.map((b) => {
                      if (b.batchId !== batchId) return b;

                      return {
                        ...b,
                        crawlProgress: {
                          stage: 'crawling',
                          currentBatch: batchNum,
                          totalBatches,
                          completedBusinesses: completedCrawls,
                          totalBusinesses: businessesToCrawl.length,
                          message: `Crawled ${completedCrawls} of ${businessesToCrawl.length} websites`,
                        },
                        jobs: b.jobs.map((j) => {
                          if (j.result?.business?.id !== crawlResult.businessId) return j;

                          return {
                            ...j,
                            result: {
                              ...j.result,
                              business: {
                                ...j.result.business,
                                promotionsScan: crawlResult.promotionsScan,
                              },
                            },
                          };
                        }),
                      };
                    })
                  );
                }
              );

              console.log(`[UnifiedSearch] Crawl batch ${batchNum}/${totalBatches} complete`);
            } catch (crawlError: any) {
              console.error(`[UnifiedSearch] Crawl batch ${batchNum} failed:`, crawlError);
              // Continue with next batch even if one fails
            }
          }

          console.log('[UnifiedSearch] All crawl batches complete');

          // Mark crawl phase as complete
          setBatches((prev) =>
            prev.map((b) =>
              b.batchId === batchId
                ? {
                    ...b,
                    crawlProgress: {
                      stage: 'complete',
                      currentBatch: totalBatches,
                      totalBatches,
                      completedBusinesses: businessesToCrawl.length,
                      totalBusinesses: businessesToCrawl.length,
                      message: `Crawl complete`,
                    },
                  }
                : b
            )
          );
        }

        // Get direct input jobs from the original batch (before Google Places jobs were added)
        const directInputJobs = batch.jobs.filter((j) => j.type === 'direct-input' || j.type === 'my-business');

        // Step 2: Process direct input businesses one by one
        for (let i = 0; i < directInputJobs.length; i++) {
          if (shouldCancel()) {
            break;
          }

          const job = directInputJobs[i];

          // Mark as running
          setBatches((prev) =>
            prev.map((b) =>
              b.batchId === batchId
                ? {
                    ...b,
                    jobs: b.jobs.map((j) =>
                      j.jobId === job.jobId
                        ? { ...j, status: 'running', startedAt: new Date() }
                        : j
                    ),
                  }
                : b
            )
          );

          try {
            const isMyBusiness = job.type === 'my-business' || job.isMyBusiness;
            const result = await performDirectInputSearch(
              job.directBusiness!,
              (progressEvent) => {
                // Update job progress
                setBatches((prev) =>
                  prev.map((b) =>
                    b.batchId === batchId
                      ? {
                          ...b,
                          jobs: b.jobs.map((j) =>
                            j.jobId === job.jobId
                              ? { ...j, progress: progressEvent }
                              : j
                          ),
                        }
                      : b
                  )
                );
                onProgress?.(googlePlacesBusinesses.length + i, progressEvent);
              },
              { skipPromotions: isMyBusiness, isMyBusiness, skipAdsCheck: batch.searchParams.skipAdsCheck }
            );

            // Store completed result
            setBatches((prev) =>
              prev.map((b) =>
                b.batchId === batchId
                  ? {
                      ...b,
                      jobs: b.jobs.map((j) =>
                        j.jobId === job.jobId
                          ? {
                              ...j,
                              status: 'completed',
                              completedAt: new Date(),
                              result,
                              progress: undefined,
                            }
                          : j
                      ),
                    }
                  : b
              )
            );

            if (shouldCancel()) {
              break;
            }

            if (i < directInputJobs.length - 1) {
              await waitBetweenJobs();
            }
          } catch (error: any) {
            console.error(`Job ${job.jobId} failed:`, error);
            const isCanceledError =
              error?.message === 'Search canceled by user' || error?.message === 'Search canceled';

            // Mark as failed or canceled
            setBatches((prev) =>
              prev.map((b) =>
                b.batchId === batchId
                  ? {
                      ...b,
                      jobs: b.jobs.map((j) =>
                        j.jobId === job.jobId
                          ? {
                              ...j,
                              status: isCanceledError ? 'canceled' : 'failed',
                              completedAt: new Date(),
                              error: isCanceledError ? 'Canceled by user' : error?.message || 'Search failed',
                              progress: undefined,
                            }
                          : j
                      ),
                    }
                  : b
              )
            );

            if (isCanceledError || shouldCancel()) {
              break;
            }

            if (i < directInputJobs.length - 1) {
              await waitBetweenJobs();
            }
          }
        }
      } catch (error: any) {
        console.error(`[UnifiedSearch] Error processing batch ${batchId}:`, error);
      }

      cancelledBatchesRef.current.delete(batchId);

      // Clear processing state synchronously via ref to prevent race conditions
      if (processingBatchIdRef.current === batchId) {
        processingBatchIdRef.current = null;
      }
      setProcessingBatchId((prev) => (prev === batchId ? null : prev));

      // Process next queued batch if any
      // Use ref for synchronous access (state updates are batched/async)
      if (queuedBatchIdsRef.current.length > 0) {
        const [nextBatchId, ...remainingQueue] = queuedBatchIdsRef.current;
        queuedBatchIdsRef.current = remainingQueue;
        setQueuedBatchIds(remainingQueue);

        console.log(`[UnifiedSearch] Processing next queued batch: ${nextBatchId.slice(0, 8)}`);
        setTimeout(() => {
          runBatchProcessing(nextBatchId);
        }, 100);
      }
    },
    [performGooglePlacesTextSearch, performDirectInputSearch, performCrawlBatch]
  );

  // Public function to process a batch - queues if another batch is already processing
  const processBatch = useCallback(
    (batchId: string, onProgress?: (jobIndex: number, progress: any) => void) => {
      // Check if already processing using ref (avoids stale closure)
      if (processingBatchIdRef.current !== null) {
        console.log(`[UnifiedSearch] Batch ${batchId.slice(0, 8)} queued (currently processing ${processingBatchIdRef.current.slice(0, 8)})`);
        // Update ref synchronously for immediate access
        queuedBatchIdsRef.current = [...queuedBatchIdsRef.current, batchId];
        setQueuedBatchIds(queuedBatchIdsRef.current);
        return;
      }

      // No batch processing, start immediately
      runBatchProcessing(batchId, onProgress);
    },
    [runBatchProcessing]
  );

  const cancelBatchProcessing = useCallback((batchId: string) => {
    cancelledBatchesRef.current.add(batchId);

    // Remove from queue if queued (update ref synchronously)
    queuedBatchIdsRef.current = queuedBatchIdsRef.current.filter((id) => id !== batchId);
    setQueuedBatchIds(queuedBatchIdsRef.current);

    setBatches((prev) =>
      prev.map((b) =>
        b.batchId === batchId
          ? {
              ...b,
              jobs: b.jobs.map((j) =>
                j.status === 'pending'
                  ? {
                      ...j,
                      status: 'canceled',
                      completedAt: new Date(),
                      error: 'Canceled before start',
                      progress: undefined,
                    }
                  : j
              ),
            }
          : b
      )
    );

    setProcessingBatchId((current) => (current === batchId ? null : current));

    if (currentEventSourceRef.current) {
      currentEventSourceRef.current.close();
      currentEventSourceRef.current = null;
    }

    if (currentRejectRef.current) {
      currentRejectRef.current(new Error('Search canceled by user'));
      currentRejectRef.current = null;
    }
  }, []);

  // Delete a batch
  const deleteBatch = useCallback((batchId: string) => {
    if (processingBatchId === batchId) {
      cancelBatchProcessing(batchId);
    }
    cancelledBatchesRef.current.delete(batchId);
    setBatches((prev) => prev.filter((b) => b.batchId !== batchId));
  }, [processingBatchId, cancelBatchProcessing]);

  // Get batch by ID
  const getBatch = useCallback(
    (batchId: string) => {
      return batches.find((b) => b.batchId === batchId);
    },
    [batches]
  );

  // Get all businesses from a batch (deduplicated by ID)
  const getBatchBusinesses = useCallback(
    (batchId: string): Business[] => {
      const batch = batches.find((b) => b.batchId === batchId);
      if (!batch) return [];

      const businesses = batch.jobs
        .filter((j) => j.status === 'completed' && j.result?.business)
        .map((j) => j.result!.business);

      // Deduplicate by business ID to prevent React key warnings
      const seen = new Set<string>();
      const duplicates: string[] = [];
      const result = businesses.filter((b) => {
        if (seen.has(b.id)) {
          duplicates.push(`${b.name} (ID: ${b.id})`);
          return false;
        }
        seen.add(b.id);
        return true;
      });

      if (duplicates.length > 0) {
        console.log(`[getBatchBusinesses] Filtered ${duplicates.length} duplicate(s):`, duplicates);
      }

      return result;
    },
    [batches]
  );

  return {
    batches,
    processingBatchId,
    queuedBatchIds,
    createBatch,
    processBatch,
    cancelBatchProcessing,
    deleteBatch,
    getBatch,
    getBatchBusinesses,
  };
}
