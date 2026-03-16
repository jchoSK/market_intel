# Queue System Migration Guide: File System → Firestore

## Current Problem

Bulk search results are stored in `/tmp/queue-data/` which is:
- ❌ Cleared when Cloud Run instance scales to zero (~15 min idle)
- ❌ Not shared across multiple instances
- ❌ Lost if user refreshes after instance restart

## Solution: Migrate to Firestore

### Step 1: Create Firestore Collections

```
queue_batches/
  {batchId}/
    batchId: string
    createdAt: timestamp

    jobs (subcollection)/
      {jobId}/
        jobId: string
        status: "pending" | "running" | "completed" | "failed"
        searchParams: {category, location, radius, maxResults}
        result: {businesses, logs, error} // when completed
        startedAt: timestamp
        completedAt: timestamp
```

### Step 2: Create New Queue Utils (Firestore Version)

**File:** `src/lib/queue-utils-firestore.ts`

```typescript
import { db } from '@/lib/firebase-admin';
import type { QueueBatch, QueueJob, QueueJobStatus, SearchParams } from '@/types';

// Create a new batch
export async function createBatch(searchParamsArray: SearchParams[]): Promise<string> {
  const batchId = crypto.randomUUID();

  // Create batch document
  await db.collection('queue_batches').doc(batchId).set({
    batchId,
    createdAt: new Date(),
  });

  // Create job documents in subcollection
  const batch = db.batch();
  searchParamsArray.forEach((params) => {
    const jobId = crypto.randomUUID();
    const jobRef = db.collection('queue_batches').doc(batchId)
      .collection('jobs').doc(jobId);

    batch.set(jobRef, {
      jobId,
      status: 'pending',
      searchParams: params,
      createdAt: new Date(),
    });
  });

  await batch.commit();
  return batchId;
}

// Read a batch with all jobs
export async function readBatch(batchId: string): Promise<QueueBatch | null> {
  const batchDoc = await db.collection('queue_batches').doc(batchId).get();

  if (!batchDoc.exists) {
    return null;
  }

  const batchData = batchDoc.data();

  // Get all jobs from subcollection
  const jobsSnapshot = await db.collection('queue_batches').doc(batchId)
    .collection('jobs').get();

  const jobs: QueueJob[] = jobsSnapshot.docs.map(doc => ({
    ...doc.data(),
    // Convert Firestore timestamps to ISO strings
    startedAt: doc.data().startedAt?.toDate().toISOString(),
    completedAt: doc.data().completedAt?.toDate().toISOString(),
  })) as QueueJob[];

  return {
    batchId: batchData!.batchId,
    createdAt: batchData!.createdAt.toDate().toISOString(),
    jobs,
  };
}

// Update job status
export async function updateJobStatus(
  batchId: string,
  jobId: string,
  status: QueueJobStatus,
  result?: QueueJob['result'],
  error?: string
): Promise<void> {
  const jobRef = db.collection('queue_batches').doc(batchId)
    .collection('jobs').doc(jobId);

  const updateData: any = { status };

  if (status === 'running') {
    updateData.startedAt = new Date();
  }
  if (status === 'completed' || status === 'failed') {
    updateData.completedAt = new Date();
  }
  if (result) {
    updateData.result = result;
  }
  if (error) {
    updateData.error = error;
  }

  await jobRef.update(updateData);
}

// Get next pending job
export async function getNextPendingJob(batchId: string): Promise<QueueJob | null> {
  const jobsSnapshot = await db.collection('queue_batches').doc(batchId)
    .collection('jobs')
    .where('status', '==', 'pending')
    .orderBy('createdAt', 'asc')
    .limit(1)
    .get();

  if (jobsSnapshot.empty) {
    return null;
  }

  const jobDoc = jobsSnapshot.docs[0];
  return {
    ...jobDoc.data(),
    startedAt: jobDoc.data().startedAt?.toDate().toISOString(),
    completedAt: jobDoc.data().completedAt?.toDate().toISOString(),
  } as QueueJob;
}

// Get batch status
export async function getBatchStatus(batchId: string) {
  const batch = await readBatch(batchId);
  if (!batch) return null;

  const completed = batch.jobs.filter(j => j.status === 'completed').length;
  const failed = batch.jobs.filter(j => j.status === 'failed').length;
  const running = batch.jobs.filter(j => j.status === 'running').length;
  const pending = batch.jobs.filter(j => j.status === 'pending').length;

  return {
    batchId: batch.batchId,
    totalJobs: batch.jobs.length,
    completedJobs: completed,
    failedJobs: failed,
    runningJobs: running,
    pendingJobs: pending,
    jobs: batch.jobs,
  };
}

// List all batches
export async function listBatches() {
  const batchesSnapshot = await db.collection('queue_batches')
    .orderBy('createdAt', 'desc')
    .limit(50)
    .get();

  const batches = await Promise.all(
    batchesSnapshot.docs.map(async (doc) => {
      const batchData = doc.data();
      const jobsSnapshot = await db.collection('queue_batches').doc(doc.id)
        .collection('jobs').get();

      return {
        batchId: batchData.batchId,
        createdAt: batchData.createdAt.toDate().toISOString(),
        totalJobs: jobsSnapshot.size,
      };
    })
  );

  return { batches };
}

// Delete batch
export async function deleteBatch(batchId: string): Promise<void> {
  // Delete all jobs first
  const jobsSnapshot = await db.collection('queue_batches').doc(batchId)
    .collection('jobs').get();

  const batch = db.batch();
  jobsSnapshot.docs.forEach(doc => {
    batch.delete(doc.ref);
  });

  // Delete batch document
  batch.delete(db.collection('queue_batches').doc(batchId));

  await batch.commit();
}
```

### Step 3: Update API Routes

Change imports in these files:
- `src/app/api/queue/create/route.ts`
- `src/app/api/queue/process/[batchId]/route.ts`
- `src/app/api/queue/status/[batchId]/route.ts`
- `src/app/api/queue/list/route.ts`
- `src/app/api/queue/delete/[batchId]/route.ts`

From:
```typescript
import { createBatch } from '@/lib/queue-utils';
```

To:
```typescript
import { createBatch } from '@/lib/queue-utils-firestore';
```

### Step 4: Test Migration

1. **Keep old system** - Don't delete `queue-utils.ts` yet
2. **Deploy Firestore version** - Test with new batches
3. **Verify persistence** - Check results survive instance restarts
4. **Clean up** - Remove old file-based system once confirmed working

### Benefits After Migration

✅ **Persistent** - Results survive instance restarts
✅ **Shared** - Works across multiple Cloud Run instances
✅ **Reliable** - Professional production-ready storage
✅ **Scalable** - No /tmp size limits
✅ **Debuggable** - View data directly in Firebase Console
✅ **Resumable** - Can resume failed batches

### Firestore Costs

Very affordable for this use case:
- Document reads: $0.06 per 100,000
- Document writes: $0.18 per 100,000

**Example:** 100 bulk searches/month × 20 jobs each = 2,000 jobs
- Writes: 2,000 × 3 (create + 2 status updates) = 6,000 writes = **$0.01**
- Reads: ~10,000 reads (viewing results) = **$0.006**
- **Total: ~$0.02/month** for 100 bulk searches

## Current /tmp Workaround

**Good for:**
- Development/testing
- Low traffic
- Immediate processing and download

**Bad for:**
- Production with idle periods
- Multiple instances
- Users who return hours/days later

## Recommendation

Migrate to Firestore for production reliability!
