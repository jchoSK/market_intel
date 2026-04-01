"use client";

import { useState, useEffect, useCallback, Suspense, useRef } from 'react';
import { useRouter } from 'next/navigation';
import type { Business, SearchParams } from '@/types';
import UnifiedSearchForm, { type UnifiedSearchSubmission } from '@/components/unified-search-form';
import SearchResults from '@/components/search-results';
import GoogleMapEmbed from '@/components/google-map-embed';
import { useUnifiedSearch, type UnifiedBatch, type UnifiedJob } from '@/hooks/use-unified-search';
import { Loader2, AlertTriangle, Info, MapPinned, X as XIcon, Share2, FileText, KeyRound, ChevronDown, ChevronRight, StopCircle, CheckCircle2, Clock, Play, Eye, Ban, Trash2, Upload, FileJson, ExternalLink } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { generateMarketSummaryPDF } from '@/lib/pdf-export';
import { exportSearchDataAsJSON, parseImportedJSON, type ExportedSearchData } from '@/lib/json-export';
import { compareWithPreviousData, generateComparisonTable, formatReviewDelta, formatRatingDelta, formatAdsStatusChange, type BusinessWithDelta, type ComparisonResult, type ComparisonTableResult } from '@/lib/comparison';
import { ComparisonTable } from '@/components/comparison-table';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';

const ACCESS_GRANTED_FLAG_KEY = 'app_access_granted_flag_v1';
const AUTH_TOKEN_KEY = 'app_auth_token_v1';

function MarketAnalyzerContent() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const { toast } = useToast();

  // Unified search hook
  const unifiedSearch = useUnifiedSearch();
  const { batches, processingBatchId, createBatch, processBatch, cancelBatchProcessing, deleteBatch, getBatch, getBatchBusinesses } = unifiedSearch;

  // UI state
  const [expandedBatchId, setExpandedBatchId] = useState<string | null>(null);
  const [selectedBusinessId, setSelectedBusinessId] = useState<string | null>(null);
  const [viewingJob, setViewingJob] = useState<UnifiedJob | null>(null);
  const [jobListCollapsed, setJobListCollapsed] = useState<Record<string, boolean>>({});
  const autoStartedRef = useRef<Set<string>>(new Set());

  // Comparison state - stores imported previous data per batch
  const [comparisonDataMap, setComparisonDataMap] = useState<Record<string, ExportedSearchData>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  const mapsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  useEffect(() => {
    const hasAccess = sessionStorage.getItem(ACCESS_GRANTED_FLAG_KEY) === 'true';
    const token = sessionStorage.getItem(AUTH_TOKEN_KEY);
    const isValidToken = token && token.length > 0 && token.includes('-');

    if (hasAccess && isValidToken) {
      setIsAuthenticated(true);
    } else {
      setIsAuthenticated(false);
      const currentPath = window.location.pathname + window.location.search;
      if (window.location.pathname !== '/app-login') {
        router.replace(`/app-login?redirect=${encodeURIComponent(currentPath)}`);
      }
    }
    setIsAuthLoading(false);
  }, [router]);

  useEffect(() => {
    if (!mapsApiKey) {
      console.warn("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is not set. Map functionality will be limited.");
    }
  }, [mapsApiKey]);

  const handleLogout = () => {
    sessionStorage.removeItem(ACCESS_GRANTED_FLAG_KEY);
    sessionStorage.removeItem(AUTH_TOKEN_KEY);
    setIsAuthenticated(false);
    router.replace('/app-login');
    toast({
      title: "Logged Out",
      description: "You have been logged out.",
    });
  };

  // Handle unified search submission
  const handleUnifiedSearch = useCallback((data: UnifiedSearchSubmission) => {
    const batchId = createBatch(data.searchParams, data.directBusinesses, data.myBusiness);
    setExpandedBatchId(batchId);

    // Auto-start processing
    setTimeout(() => {
      if (!autoStartedRef.current.has(batchId)) {
        autoStartedRef.current.add(batchId);
        processBatch(batchId).then(() => {
          toast({
            title: 'Analysis Complete',
            description: 'All businesses have been analyzed.',
          });
        }).catch((error) => {
          toast({
            variant: 'destructive',
            title: 'Processing Error',
            description: error?.message || 'An error occurred while processing.',
          });
        });
      }
    }, 100);
  }, [createBatch, processBatch, toast]);

  // Start processing a batch manually
  const startProcessing = useCallback(async (batchId: string) => {
    setExpandedBatchId(batchId);
    try {
      await processBatch(batchId);
      toast({
        title: 'Analysis Complete',
        description: 'All businesses have been analyzed.',
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Processing Error',
        description: error?.message || 'An error occurred while processing.',
      });
    }
  }, [processBatch, toast]);

  // Delete batch handler
  const handleDelete = useCallback((batchId: string) => {
    deleteBatch(batchId);
    toast({
      title: 'Batch Deleted',
      description: 'The batch has been removed.',
    });
  }, [deleteBatch, toast]);

  // Toggle expand
  const toggleExpand = useCallback((batchId: string) => {
    setExpandedBatchId(expandedBatchId === batchId ? null : batchId);
  }, [expandedBatchId]);

  // Export batch as PDF
  const exportBatchAsPDF = useCallback(async (batch: UnifiedBatch, orientation: 'portrait' | 'landscape' = 'portrait') => {
    const businesses = getBatchBusinesses(batch.batchId);
    if (businesses.length === 0) {
      toast({ variant: 'destructive', title: 'No Data', description: 'No completed businesses to export.' });
      return;
    }

    // Get comparison data if available
    const previousData = comparisonDataMap[batch.batchId];
    const comparisonTableResult = previousData
      ? generateComparisonTable(businesses, previousData)
      : undefined;

    try {
      await generateMarketSummaryPDF({
        businesses,
        searchParams: batch.searchParams,
        comparisonTableResult,
        orientation,
      });
      toast({ title: "PDF Generated", description: `Market summary PDF (${orientation}) has been downloaded.` });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'PDF Generation Failed', description: error.message || 'Could not generate PDF.' });
    }
  }, [getBatchBusinesses, comparisonDataMap, toast]);

  // Export batch as JSON
  const exportBatchAsJSON = useCallback((batch: UnifiedBatch) => {
    const businesses = getBatchBusinesses(batch.batchId);
    if (businesses.length === 0) {
      toast({ variant: 'destructive', title: 'No Data', description: 'No completed businesses to export.' });
      return;
    }

    try {
      exportSearchDataAsJSON(businesses, batch.searchParams);
      toast({ title: "JSON Exported", description: "Search data has been exported for future comparison." });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Export Failed', description: error.message || 'Could not export JSON.' });
    }
  }, [getBatchBusinesses, toast]);

  // Import previous data for comparison
  const [importingForBatchId, setImportingForBatchId] = useState<string | null>(null);

  const handleImportClick = useCallback((batchId: string) => {
    setImportingForBatchId(batchId);
    fileInputRef.current?.click();
  }, []);

  const handleFileImport = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !importingForBatchId) {
      setImportingForBatchId(null);
      return;
    }

    try {
      const importedData = await parseImportedJSON(file);

      // Get current batch's businesses to check for My Business match
      const currentBusinesses = getBatchBusinesses(importingForBatchId);
      const currentMyBusiness = currentBusinesses.find(b => b.isMyBusiness);
      const importedMyBusiness = importedData.businesses.find(b => b.isMyBusiness);

      // Validate My Business match
      if (currentMyBusiness && importedMyBusiness) {
        // Both have My Business - check if they match (by name, case-insensitive)
        const currentName = currentMyBusiness.name.toLowerCase().trim();
        const importedName = importedMyBusiness.name.toLowerCase().trim();
        if (currentName !== importedName) {
          toast({
            variant: 'destructive',
            title: 'Comparison Not Possible',
            description: `My Business mismatch: Current search has "${currentMyBusiness.name}" but imported data has "${importedMyBusiness.name}". Comparison requires the same My Business.`,
          });
          return;
        }
      } else if (currentMyBusiness && !importedMyBusiness) {
        // Current has My Business but imported doesn't
        toast({
          variant: 'destructive',
          title: 'Comparison Not Possible',
          description: `Current search includes My Business ("${currentMyBusiness.name}") but the imported data does not have a My Business. Comparison requires matching My Business.`,
        });
        return;
      } else if (!currentMyBusiness && importedMyBusiness) {
        // Imported has My Business but current doesn't
        toast({
          variant: 'destructive',
          title: 'Comparison Not Possible',
          description: `Imported data includes My Business ("${importedMyBusiness.name}") but the current search does not have a My Business. Comparison requires matching My Business.`,
        });
        return;
      }
      // If neither has My Business, comparison is allowed

      setComparisonDataMap(prev => ({
        ...prev,
        [importingForBatchId]: importedData,
      }));
      toast({
        title: "Previous Data Imported",
        description: `Imported data from ${importedData.exportDate}. Comparison mode enabled.`,
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Import Failed',
        description: error.message || 'Could not parse the JSON file.',
      });
    } finally {
      setImportingForBatchId(null);
      // Reset the file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [importingForBatchId, getBatchBusinesses, toast]);

  // Clear comparison data for a batch
  const clearComparisonData = useCallback((batchId: string) => {
    setComparisonDataMap(prev => {
      const next = { ...prev };
      delete next[batchId];
      return next;
    });
    toast({ title: "Comparison Cleared", description: "Comparison mode disabled." });
  }, [toast]);

  // Get current batch for display
  const activeBatch = expandedBatchId ? getBatch(expandedBatchId) : batches[0];
  const activeBusinesses = activeBatch ? getBatchBusinesses(activeBatch.batchId) : [];
  const mapCenter = activeBatch?.searchedLocationCenter;

  if (isAuthLoading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
        <Loader2 className="h-16 w-16 animate-spin text-primary" />
        <p className="mt-4 text-muted-foreground">Verifying access...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
        <KeyRound className="h-16 w-16 text-destructive mb-4" />
        <h1 className="text-2xl font-semibold mb-2">Access Denied</h1>
        <p className="text-muted-foreground mb-6">Redirecting to login...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen">
      <header className="text-center py-6 md:py-8 px-4 bg-card border-b">
        <div className="flex items-center justify-center space-x-3">
          <Image
            src="/searchkings-crown-stylized.png"
            alt="SearchKings Crown Logo"
            width={56}
            height={30}
            className="w-14 h-auto md:w-16 md:h-auto"
            data-ai-hint="crown logo"
          />
          <h1 className="text-3xl md:text-4xl font-extrabold text-primary tracking-tight">
            Market Intel - Customer Tool
          </h1>
        </div>
        <div className="flex justify-center items-center mt-2">
          <p className="text-md md:text-lg text-muted-foreground max-w-2xl mx-auto">
            Unlock local market insights. Discover businesses and analyze their online presence.
          </p>
          <div className="ml-4 flex items-center space-x-2">
            <Button onClick={handleLogout} variant="ghost" size="sm" className="text-xs">
              <KeyRound className="mr-1 h-3.5 w-3.5" /> Logout
            </Button>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6 md:py-8 flex-grow">
        {/* Search Form */}
        <UnifiedSearchForm onSubmit={handleUnifiedSearch} isLoading={processingBatchId !== null} />

        {/* Batch Results */}
        {batches.length > 0 && (
          <div className="mt-8 space-y-4">
            <h2 className="text-xl font-semibold">Search Results</h2>

            {batches.map((batch) => {
              const isProcessing = processingBatchId === batch.batchId || (batch.crawlProgress && batch.crawlProgress.stage === 'crawling');
              const isExpanded = expandedBatchId === batch.batchId;

              const completedJobs = batch.jobs.filter((j) => j.status === 'completed').length;
              const failedJobs = batch.jobs.filter((j) => j.status === 'failed').length;
              const canceledJobs = batch.jobs.filter((j) => j.status === 'canceled').length;
              const runningJobs = batch.jobs.filter((j) => j.status === 'running').length;
              const pendingJobs = batch.jobs.filter((j) => j.status === 'pending').length;
              const totalJobs = batch.jobs.length;
              const crawlComplete = !batch.crawlProgress || batch.crawlProgress.stage === 'complete';
              const isComplete = pendingJobs === 0 && runningJobs === 0 && totalJobs > 0 && crawlComplete;

              const googlePlacesCount = batch.jobs.filter((j) => j.type === 'google-places').length;

              // Check if we're in the Google Places search phase (before Google Places jobs are created)
              const isInSearchPhase = isProcessing && googlePlacesCount === 0 && batch.searchProgress;
              // Check if we're in the crawl phase
              const isInCrawlPhase = batch.crawlProgress && batch.crawlProgress.stage !== 'complete';
              const progress = isInSearchPhase
                ? (batch.searchProgress?.percent || 0)
                : isInCrawlPhase
                  ? (batch.crawlProgress.completedBusinesses / batch.crawlProgress.totalBusinesses) * 100
                  : totalJobs > 0
                    ? ((completedJobs + failedJobs + canceledJobs) / totalJobs) * 100
                    : 0;
              const directInputCount = batch.jobs.filter((j) => j.type === 'direct-input').length;
              const myBusinessCount = batch.jobs.filter((j) => j.type === 'my-business').length;
              // Show expected Google Places count if search hasn't run yet
              const expectedGooglePlacesCount = googlePlacesCount > 0 ? googlePlacesCount : (batch.searchParams.maxResults || 20);

              // Get comparison data if available
              const previousData = comparisonDataMap[batch.batchId];
              const hasComparison = !!previousData;

              return (
                <Card key={batch.batchId}>
                  <CardHeader
                    className="cursor-pointer hover:bg-accent/50 transition-colors"
                    onClick={() => toggleExpand(batch.batchId)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <CardTitle className="text-lg">
                            {batch.searchParams.category} in {batch.searchParams.location}
                          </CardTitle>
                          <ChevronDown
                            className={`h-5 w-5 text-muted-foreground transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                          />
                        </div>
                        <CardDescription>
                          {isInSearchPhase ? (
                            <>
                              Searching Google Places... {batch.searchProgress?.stage && `(${batch.searchProgress.stage})`}
                              {batch.searchProgress?.completed !== undefined && batch.searchProgress?.total !== undefined && (
                                <> • {batch.searchProgress.completed}/{batch.searchProgress.total} businesses</>
                              )}
                            </>
                          ) : isInCrawlPhase ? (
                            <>
                              Crawling websites for call outs... {batch.crawlProgress.completedBusinesses}/{batch.crawlProgress.totalBusinesses} complete
                              {batch.crawlProgress.totalBatches > 1 && (
                                <> • Batch {batch.crawlProgress.currentBatch}/{batch.crawlProgress.totalBatches}</>
                              )}
                            </>
                          ) : (
                            <>
                              {googlePlacesCount > 0
                                ? `Found ${googlePlacesCount} of ${batch.searchParams.maxResults || 20} requested`
                                : `Up to ${expectedGooglePlacesCount}`} from Google Places
                              {myBusinessCount > 0 ? `, ${myBusinessCount} My Business` : ''}
                              {directInputCount > 0 ? `, ${directInputCount} additional` : ''} •{' '}
                              {completedJobs} completed, {failedJobs} failed, {runningJobs} running, {pendingJobs} pending
                            </>
                          )}
                          {hasComparison && (
                            <span className="ml-2 text-xs px-2 py-0.5 bg-blue-100 text-blue-800 rounded">
                              Comparing with {previousData.exportDate}
                            </span>
                          )}
                        </CardDescription>
                      </div>
                      <div className="flex items-center gap-2">
                        {isProcessing && <Loader2 className="h-5 w-5 animate-spin text-primary" />}
                        {isComplete && !isProcessing && <CheckCircle2 className="h-5 w-5 text-green-600" />}
                        {isProcessing && (
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              cancelBatchProcessing(batch.batchId);
                            }}
                          >
                            <StopCircle className="mr-2 h-4 w-4" />
                            Stop
                          </Button>
                        )}
                        {!isProcessing && !isComplete && totalJobs > 0 && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              startProcessing(batch.batchId);
                            }}
                          >
                            <Play className="mr-2 h-4 w-4" /> Resume
                          </Button>
                        )}
                        {completedJobs > 0 && (
                          <>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={isProcessing}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <FileText className="mr-2 h-4 w-4" />
                                  PDF
                                  <ChevronDown className="ml-1 h-3 w-3" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="start" onClick={(e) => e.stopPropagation()}>
                                <DropdownMenuItem onClick={() => exportBatchAsPDF(batch, 'portrait')}>
                                  Portrait
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => exportBatchAsPDF(batch, 'landscape')}>
                                  Landscape
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                exportBatchAsJSON(batch);
                              }}
                              disabled={isProcessing}
                            >
                              <FileJson className="mr-2 h-4 w-4" />
                              JSON
                            </Button>
                            {comparisonDataMap[batch.batchId] ? (
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  clearComparisonData(batch.batchId);
                                }}
                                disabled={isProcessing}
                              >
                                <XIcon className="mr-2 h-4 w-4" />
                                Clear Compare
                              </Button>
                            ) : (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleImportClick(batch.batchId);
                                }}
                                disabled={isProcessing}
                              >
                                <Upload className="mr-2 h-4 w-4" />
                                Compare
                              </Button>
                            )}
                          </>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(batch.batchId);
                          }}
                          disabled={isProcessing}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <Progress value={progress} className="mt-2" />
                  </CardHeader>

                  {isExpanded && (
                    <CardContent>
                      {/* Map and Results Grid */}
                      {activeBusinesses.length > 0 && (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                          <div className="md:col-span-2 h-[1000px]">
                            {mapsApiKey ? (
                              <GoogleMapEmbed
                                businesses={activeBusinesses}
                                apiKey={mapsApiKey}
                                searchedLocation={mapCenter}
                                selectedBusinessIdFromList={selectedBusinessId}
                                onMarkerClickedOnMap={(id) => setSelectedBusinessId(id)}
                              />
                            ) : (
                              <Card className="h-full flex flex-col items-center justify-center text-center">
                                <CardHeader>
                                  <MapPinned className="h-12 w-12 text-muted-foreground mx-auto" />
                                  <CardTitle className="text-destructive">Map Disabled</CardTitle>
                                </CardHeader>
                                <CardContent>
                                  <p className="text-muted-foreground">
                                    Google Maps API Key is not configured.
                                  </p>
                                </CardContent>
                              </Card>
                            )}
                          </div>
                          <div className="md:col-span-1 h-[1000px] overflow-y-auto">
                            <SearchResults
                              businesses={activeBusinesses}
                              onBusinessSelect={(id) => setSelectedBusinessId(id)}
                              selectedBusinessId={selectedBusinessId}
                            />
                          </div>
                        </div>
                      )}

                      {/* Job List - only show after Google Places search completes */}
                      {totalJobs > 0 ? (
                      <Collapsible
                        open={!jobListCollapsed[batch.batchId]}
                        onOpenChange={(open) => setJobListCollapsed(prev => ({ ...prev, [batch.batchId]: !open }))}
                      >
                        <CollapsibleTrigger asChild>
                          <button className="flex items-center gap-2 font-medium text-sm text-muted-foreground mb-2 hover:text-foreground transition-colors">
                            {jobListCollapsed[batch.batchId] ? (
                              <ChevronRight className="h-4 w-4" />
                            ) : (
                              <ChevronDown className="h-4 w-4" />
                            )}
                            All Businesses ({totalJobs})
                          </button>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="space-y-2">
                        {batch.jobs.map((job, index) => {
                          // Calculate delta for this job if comparison is active
                          let jobDelta: BusinessWithDelta['delta'] | undefined;
                          if (hasComparison && job.status === 'completed' && job.result?.business) {
                            const comparisonResult = compareWithPreviousData([job.result.business], previousData);
                            jobDelta = comparisonResult.businesses[0]?.delta;
                          }

                          return (
                            <div
                              key={job.jobId}
                              className="flex items-center justify-between p-2 border rounded text-sm"
                            >
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium">#{index + 1}:</span>{' '}
                                  {job.type === 'google-places'
                                    ? job.result?.business?.name || 'Loading...'
                                    : job.type === 'my-business'
                                      ? job.myBusiness?.businessName || job.directBusiness?.businessName
                                      : job.directBusiness?.businessName}
                                  {job.type === 'my-business' || job.isMyBusiness ? (
                                    <span className="text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 font-medium">
                                      My Business
                                    </span>
                                  ) : (
                                    <span className="text-xs px-1.5 py-0.5 rounded bg-muted">
                                      {job.type === 'google-places' ? 'Search Result' : 'Direct Input'}
                                    </span>
                                  )}
                                  {jobDelta?.isNew && (
                                    <span className="text-xs px-1.5 py-0.5 rounded bg-green-100 text-green-800 font-medium">
                                      New
                                    </span>
                                  )}
                                </div>
                                {/* Show delta indicators when comparison is active */}
                                {hasComparison && job.status === 'completed' && job.result?.business && jobDelta && !jobDelta.isNew && (
                                  <div className="flex items-center gap-3 mt-1 text-xs">
                                    {/* Reviews delta */}
                                    <span>
                                      Reviews: {job.result.business.reviewsCount || 0}
                                      {jobDelta.reviewCountDelta !== null && jobDelta.reviewCountDelta !== 0 && (
                                        <span className={jobDelta.reviewCountDelta > 0 ? 'text-green-600 ml-1' : 'text-red-600 ml-1'}>
                                          {formatReviewDelta(jobDelta.reviewCountDelta).text}
                                        </span>
                                      )}
                                    </span>
                                    {/* Rating delta */}
                                    <span>
                                      Rating: {job.result.business.rating || 'N/A'}
                                      {jobDelta.ratingDelta !== null && jobDelta.ratingDelta !== 0 && (
                                        <span className={jobDelta.ratingDelta > 0 ? 'text-green-600 ml-1' : 'text-red-600 ml-1'}>
                                          {formatRatingDelta(jobDelta.ratingDelta).text}
                                        </span>
                                      )}
                                    </span>
                                    {/* Ads status change */}
                                    {jobDelta.adsStatusChanged && (
                                      <span className="text-blue-600">
                                        Ads: {formatAdsStatusChange(
                                          job.result.business.adsInfo?.isRunningAds,
                                          jobDelta.adsStatusChanged,
                                          jobDelta.previousAdsStatus
                                        )}
                                      </span>
                                    )}
                                  </div>
                                )}
                                {job.progress && (
                                  <div className="text-xs text-muted-foreground mt-1">
                                    {job.progress.stage} - {job.progress.percent}%
                                  </div>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                {job.status === 'completed' && (
                                  <>
                                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                                    {job.result?.business && (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setViewingJob(job)}
                                        className="h-6 px-2 text-xs"
                                      >
                                        <Eye className="h-3 w-3 mr-1" />
                                        View
                                      </Button>
                                    )}
                                  </>
                                )}
                                {job.status === 'failed' && (
                                  <>
                                    <AlertTriangle className="h-4 w-4 text-red-600" />
                                    <span className="text-xs text-red-600">{job.error}</span>
                                  </>
                                )}
                                {job.status === 'canceled' && (
                                  <>
                                    <Ban className="h-4 w-4 text-amber-600" />
                                    <span className="text-xs text-amber-600">{job.error || 'Canceled'}</span>
                                  </>
                                )}
                                {job.status === 'running' && (
                                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                                )}
                                {job.status === 'pending' && (
                                  <Clock className="h-4 w-4 text-muted-foreground" />
                                )}
                              </div>
                            </div>
                          );
                        })}
                        </CollapsibleContent>
                      </Collapsible>
                      ) : isInSearchPhase ? (
                        <div className="flex items-center justify-center py-8 text-muted-foreground">
                          <Loader2 className="h-5 w-5 animate-spin mr-2" />
                          <span>Searching for businesses...</span>
                        </div>
                      ) : !isProcessing ? (
                        <div className="text-center py-10">
                          <MapPinned className="mx-auto h-12 w-12 text-muted-foreground mb-3" />
                          <p className="text-lg font-semibold text-foreground">No Businesses Found</p>
                          <p className="text-sm text-muted-foreground mt-1">
                            No requested businesses were found in this area. Try adjusting your search terms or widening your radius.
                          </p>
                        </div>
                      ) : null}

                      {/* Comparison Table - show when comparison data is loaded */}
                      {hasComparison && totalJobs > 0 && (() => {
                        const businesses = batch.jobs
                          .filter((j) => j.status === 'completed' && j.result?.business)
                          .map((j) => j.result!.business);
                        const comparisonTableResult = generateComparisonTable(businesses, previousData);
                        return <ComparisonTable comparisonResult={comparisonTableResult} />;
                      })()}
                    </CardContent>
                  )}
                </Card>
              );
            })}
          </div>
        )}

        {/* Empty State */}
        {batches.length === 0 && (
          <Card className="bg-background/50 border-dashed border-primary/50 shadow mt-8">
            <CardHeader className="items-center text-center">
              <Info className="h-10 w-10 text-primary mb-3" />
              <CardTitle className="text-xl">Ready to Explore?</CardTitle>
            </CardHeader>
            <CardContent className="text-center">
              <p className="text-muted-foreground">
                Enter your search parameters above to begin your market analysis.
                You can also add specific businesses to include in the analysis.
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Job Details Dialog */}
      <Dialog open={!!viewingJob} onOpenChange={() => setViewingJob(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>
              Business Details: {viewingJob?.result?.business?.name}
            </DialogTitle>
            <DialogDescription>
              Analysis results for this business
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            {viewingJob?.result?.business && (
              <div className="p-4 space-y-4">
                {/* Basic Info */}
                <div>
                  <h4 className="font-semibold text-lg">{viewingJob.result.business.name}</h4>
                  <p className="text-sm text-muted-foreground">{viewingJob.result.business.address}</p>
                  {viewingJob.result.business.phoneNumber && (
                    <p className="text-sm">{viewingJob.result.business.phoneNumber}</p>
                  )}
                  {viewingJob.result.business.website && (
                    <a href={viewingJob.result.business.website} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline">
                      {viewingJob.result.business.website}
                    </a>
                  )}
                </div>

                {/* Rating */}
                {(viewingJob.result.business.rating || viewingJob.result.business.reviewsCount) && (
                  <div className="pt-4 border-t">
                    <p className="text-sm font-medium mb-1">Google Rating</p>
                    {viewingJob.result.business.rating && (
                      <p className="text-sm">
                        {viewingJob.result.business.rating} stars
                        {viewingJob.result.business.reviewsCount && ` (${viewingJob.result.business.reviewsCount} reviews)`}
                      </p>
                    )}
                  </div>
                )}

                {/* Google Ads */}
                <div className="pt-4 border-t">
                  <p className="text-sm font-medium mb-1">Google Ads</p>
                  <p className="text-sm">
                    {viewingJob.result.business.adsInfo?.isRunningAds === true ? (
                      viewingJob.result.business.adsInfo.adsTransparencyLink ? (
                        <a
                          href={viewingJob.result.business.adsInfo.adsTransparencyLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-green-600 hover:underline inline-flex items-center gap-1"
                        >
                          Running Ads{viewingJob.result.business.adsInfo.adCount ? ` (${viewingJob.result.business.adsInfo.adCount} ads)` : ''}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : (
                        <span className="text-green-600">Running Ads{viewingJob.result.business.adsInfo.adCount ? ` (${viewingJob.result.business.adsInfo.adCount} ads)` : ''}</span>
                      )
                    ) : viewingJob.result.business.adsInfo?.isRunningAds === false ? (
                      <span className="text-red-600">Not Running Ads</span>
                    ) : (
                      <span className="text-muted-foreground">Unknown</span>
                    )}
                  </p>
                </div>

                {/* Call Outs */}
                <div className="pt-4 border-t">
                  <p className="text-sm font-medium mb-1">Current Call Outs</p>
                  {viewingJob.result.business.promotionsScan?.promotions?.length ? (
                    <ul className="text-sm list-disc list-inside space-y-1">
                      {viewingJob.result.business.promotionsScan.promotions.map((promo, i) => (
                        <li key={i}>{promo}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">No call outs found</p>
                  )}
                </div>
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <footer className="text-center py-4 border-t bg-card text-sm text-muted-foreground">
        Market Intel - Customer Tool &copy; {new Date().getFullYear()}
      </footer>

      {/* Hidden file input for JSON import */}
      <input
        type="file"
        ref={fileInputRef}
        accept=".json"
        onChange={handleFileImport}
        className="hidden"
      />
    </div>
  );
}

export default function MarketAnalyzerPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
        <Loader2 className="h-16 w-16 animate-spin text-primary" />
        <p className="mt-4 text-muted-foreground">Loading Market Analyzer...</p>
      </div>
    }>
      <MarketAnalyzerContent />
    </Suspense>
  );
}
