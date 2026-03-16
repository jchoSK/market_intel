'use client';

import React from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowUp, ArrowDown, Minus, Plus } from 'lucide-react';
import type { ComparisonTableResult, ComparisonRow } from '@/lib/comparison';

interface ComparisonTableProps {
  comparisonResult: ComparisonTableResult;
}

function formatAdsStatus(status: boolean | null): string {
  if (status === true) return 'Active';
  if (status === false) return 'Inactive';
  return 'Unknown';
}

function DeltaIndicator({ delta, format = 'number' }: { delta: number | null; format?: 'number' | 'decimal' }) {
  if (delta === null || delta === 0) return null;

  const formatted = format === 'decimal'
    ? (delta > 0 ? '+' : '') + delta.toFixed(1)
    : (delta > 0 ? '+' : '') + delta.toLocaleString();

  return (
    <span className={`text-xs font-medium ${delta > 0 ? 'text-green-600' : 'text-red-600'}`}>
      {delta > 0 ? <ArrowUp className="h-3 w-3 inline" /> : <ArrowDown className="h-3 w-3 inline" />}
      {formatted}
    </span>
  );
}

function ReviewsCells({ row }: { row: ComparisonRow }) {
  if (row.status === 'dropped') {
    return (
      <>
        <TableCell className="text-center text-muted-foreground">
          {row.previous?.reviewsCount?.toLocaleString() ?? 'N/A'}
        </TableCell>
        <TableCell className="text-center text-muted-foreground">—</TableCell>
      </>
    );
  }

  if (row.status === 'new') {
    return (
      <>
        <TableCell className="text-center text-muted-foreground">—</TableCell>
        <TableCell className="text-center">
          {row.current?.reviewsCount?.toLocaleString() ?? 'N/A'}
        </TableCell>
      </>
    );
  }

  // Matched
  const prev = row.previous?.reviewsCount ?? 0;
  const curr = row.current?.reviewsCount ?? 0;

  return (
    <>
      <TableCell className="text-center text-muted-foreground">
        {prev.toLocaleString()}
      </TableCell>
      <TableCell className="text-center">
        <div className="flex flex-col items-center gap-0.5">
          <span className="font-medium">{curr.toLocaleString()}</span>
          <DeltaIndicator delta={row.reviewCountDelta} />
        </div>
      </TableCell>
    </>
  );
}

function RatingCells({ row }: { row: ComparisonRow }) {
  if (row.status === 'dropped') {
    return (
      <>
        <TableCell className="text-center text-muted-foreground">
          {row.previous?.rating?.toFixed(1) ?? 'N/A'}
        </TableCell>
        <TableCell className="text-center text-muted-foreground">—</TableCell>
      </>
    );
  }

  if (row.status === 'new') {
    return (
      <>
        <TableCell className="text-center text-muted-foreground">—</TableCell>
        <TableCell className="text-center">
          {row.current?.rating?.toFixed(1) ?? 'N/A'}
        </TableCell>
      </>
    );
  }

  // Matched
  const prev = row.previous?.rating ?? 0;
  const curr = row.current?.rating ?? 0;

  return (
    <>
      <TableCell className="text-center text-muted-foreground">
        {prev.toFixed(1)}
      </TableCell>
      <TableCell className="text-center">
        <div className="flex flex-col items-center gap-0.5">
          <span className="font-medium">{curr.toFixed(1)}</span>
          <DeltaIndicator delta={row.ratingDelta} format="decimal" />
        </div>
      </TableCell>
    </>
  );
}

function AdsCells({ row }: { row: ComparisonRow }) {
  if (row.status === 'dropped') {
    return (
      <>
        <TableCell className="text-center">
          <span className={row.previousAdsStatus === true ? 'text-green-600' : 'text-muted-foreground'}>
            {formatAdsStatus(row.previousAdsStatus)}
          </span>
        </TableCell>
        <TableCell className="text-center text-muted-foreground">—</TableCell>
      </>
    );
  }

  if (row.status === 'new') {
    return (
      <>
        <TableCell className="text-center text-muted-foreground">—</TableCell>
        <TableCell className="text-center">
          <span className={row.currentAdsStatus === true ? 'text-green-600 font-medium' : ''}>
            {formatAdsStatus(row.currentAdsStatus)}
          </span>
        </TableCell>
      </>
    );
  }

  // Matched
  const prevStatus = formatAdsStatus(row.previousAdsStatus);
  const currStatus = formatAdsStatus(row.currentAdsStatus);

  return (
    <>
      <TableCell className="text-center">
        <span className={row.previousAdsStatus === true ? 'text-green-600' : 'text-muted-foreground'}>
          {prevStatus}
        </span>
      </TableCell>
      <TableCell className="text-center">
        <div className="flex flex-col items-center gap-0.5">
          <span className={row.currentAdsStatus === true ? 'text-green-600 font-medium' : ''}>
            {currStatus}
          </span>
          {row.adsStatusChanged && (
            <Badge variant={row.currentAdsStatus === true ? 'default' : 'secondary'} className="text-xs">
              {row.currentAdsStatus === true ? 'Started' : 'Stopped'}
            </Badge>
          )}
        </div>
      </TableCell>
    </>
  );
}

function PromotionsCells({ row }: { row: ComparisonRow }) {
  if (row.status === 'dropped') {
    return (
      <>
        <TableCell>
          {row.previousPromotions.length === 0 ? (
            <span className="text-muted-foreground text-xs">None</span>
          ) : (
            <ul className="text-xs text-muted-foreground space-y-0.5">
              {row.previousPromotions.map((promo, i) => (
                <li key={i} className="truncate max-w-[200px]">• {promo}</li>
              ))}
            </ul>
          )}
        </TableCell>
        <TableCell className="text-center text-muted-foreground">—</TableCell>
      </>
    );
  }

  if (row.status === 'new') {
    return (
      <>
        <TableCell className="text-center text-muted-foreground">—</TableCell>
        <TableCell>
          {row.currentPromotions.length === 0 ? (
            <span className="text-muted-foreground text-xs">None</span>
          ) : (
            <ul className="text-xs space-y-0.5">
              {row.currentPromotions.map((promo, i) => (
                <li key={i} className="truncate max-w-[200px]">• {promo}</li>
              ))}
            </ul>
          )}
        </TableCell>
      </>
    );
  }

  // Matched - show previous and current with change indicators
  const unchangedPromos = row.currentPromotions.filter(
    p => !row.newPromotions.map(np => np.toLowerCase()).includes(p.toLowerCase())
  );

  return (
    <>
      <TableCell>
        {row.previousPromotions.length === 0 ? (
          <span className="text-muted-foreground text-xs">None</span>
        ) : (
          <ul className="text-xs text-muted-foreground space-y-0.5">
            {row.previousPromotions.map((promo, i) => {
              const wasRemoved = row.removedPromotions.some(
                rp => rp.toLowerCase() === promo.toLowerCase()
              );
              return (
                <li
                  key={i}
                  className={`truncate max-w-[200px] ${wasRemoved ? 'line-through text-red-500' : ''}`}
                >
                  • {promo}
                </li>
              );
            })}
          </ul>
        )}
      </TableCell>
      <TableCell>
        {row.currentPromotions.length === 0 ? (
          <span className="text-muted-foreground text-xs">None</span>
        ) : (
          <ul className="text-xs space-y-0.5">
            {row.currentPromotions.map((promo, i) => {
              const isNew = row.newPromotions.some(
                np => np.toLowerCase() === promo.toLowerCase()
              );
              return (
                <li
                  key={i}
                  className={`truncate max-w-[200px] ${isNew ? 'text-green-600 font-medium' : ''}`}
                >
                  {isNew && <Plus className="h-3 w-3 inline mr-0.5" />}
                  • {promo}
                </li>
              );
            })}
          </ul>
        )}
      </TableCell>
    </>
  );
}

export function ComparisonTable({ comparisonResult }: ComparisonTableProps) {
  const { rows, previousExportDate, currentDate, matchedCount, newCount, droppedCount } = comparisonResult;

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="text-lg">Comparison Results</CardTitle>
        <CardDescription>
          Comparing {previousExportDate} vs {currentDate} • {matchedCount} matched, {newCount} new, {droppedCount} dropped
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead rowSpan={2} className="min-w-[160px] align-bottom border-r">Company</TableHead>
                <TableHead colSpan={2} className="text-center border-b">Reviews</TableHead>
                <TableHead colSpan={2} className="text-center border-b">Rating</TableHead>
                <TableHead colSpan={2} className="text-center border-b">Google Ads</TableHead>
                <TableHead colSpan={2} className="text-center border-b">Call Outs</TableHead>
              </TableRow>
              <TableRow>
                <TableHead className="text-center text-xs text-muted-foreground w-[70px]">{previousExportDate}</TableHead>
                <TableHead className="text-center text-xs w-[70px]">{currentDate}</TableHead>
                <TableHead className="text-center text-xs text-muted-foreground w-[60px]">{previousExportDate}</TableHead>
                <TableHead className="text-center text-xs w-[60px]">{currentDate}</TableHead>
                <TableHead className="text-center text-xs text-muted-foreground w-[70px]">{previousExportDate}</TableHead>
                <TableHead className="text-center text-xs w-[70px]">{currentDate}</TableHead>
                <TableHead className="text-center text-xs text-muted-foreground min-w-[150px]">{previousExportDate}</TableHead>
                <TableHead className="text-center text-xs min-w-[150px]">{currentDate}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, index) => {
                const business = row.current ?? row.previous;
                const uniqueKey = `${row.status}-${business?.id ?? index}`;

                return (
                  <TableRow
                    key={uniqueKey}
                    className={row.status === 'dropped' ? 'bg-red-50/50' : row.status === 'new' ? 'bg-green-50/50' : ''}
                  >
                    <TableCell className="font-medium border-r">
                      <div className="flex items-center gap-2">
                        {row.status === 'new' && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-green-100 text-green-800 font-medium shrink-0">NEW</span>
                        )}
                        {row.status === 'dropped' && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-red-100 text-red-800 font-medium shrink-0">DROPPED</span>
                        )}
                        <span className="truncate">{business?.name ?? 'Unknown'}</span>
                      </div>
                    </TableCell>
                    <ReviewsCells row={row} />
                    <RatingCells row={row} />
                    <AdsCells row={row} />
                    <PromotionsCells row={row} />
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
