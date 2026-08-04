/**
 * One-time media migration: Supabase Storage (S3-compatible) → Google Cloud Storage.
 *
 * Copies every object key-for-key so Payload (pointed at GCS) resolves existing
 * media unchanged. Idempotent: objects already in GCS are skipped. Re-runnable.
 *
 * Run from deploy/:
 *   npm install
 *   gcloud auth application-default login      # GCS auth (ADC)
 *   ../deploy-gcp.ps1 -MigrateMedia            # (sets env + runs this), OR set env yourself:
 *   node migrate-media-to-gcs.mjs
 *
 * Required env: SUPABASE_S3_ENDPOINT, SUPABASE_S3_ACCESS_KEY_ID,
 *   SUPABASE_S3_SECRET_ACCESS_KEY, SUPABASE_BUCKET, GCS_BUCKET, GCS_PROJECT_ID
 *   (optional SUPABASE_S3_REGION, default us-east-1)
 */
import { S3Client, ListObjectsV2Command, GetObjectCommand } from "@aws-sdk/client-s3";
import { Storage } from "@google-cloud/storage";

const need = (k) => {
  const v = process.env[k];
  if (!v) {
    console.error(`Missing required env: ${k}`);
    process.exit(1);
  }
  return v;
};

const s3 = new S3Client({
  endpoint: need("SUPABASE_S3_ENDPOINT"),
  region: process.env.SUPABASE_S3_REGION || "us-east-1",
  forcePathStyle: true, // Supabase requires path-style addressing
  credentials: {
    accessKeyId: need("SUPABASE_S3_ACCESS_KEY_ID"),
    secretAccessKey: need("SUPABASE_S3_SECRET_ACCESS_KEY"),
  },
});
const srcBucket = need("SUPABASE_BUCKET");

const gcs = new Storage({ projectId: need("GCS_PROJECT_ID") });
const dstBucket = gcs.bucket(need("GCS_BUCKET"));

// Create the destination bucket if it doesn't exist (private + uniform access).
const [bucketExists] = await dstBucket.exists();
if (!bucketExists) {
  const location = process.env.GCS_LOCATION || "asia-south1";
  console.log(`Bucket gs://${process.env.GCS_BUCKET} not found — creating in ${location} (private, uniform access)…`);
  await gcs.createBucket(process.env.GCS_BUCKET, {
    location,
    iamConfiguration: { uniformBucketLevelAccess: { enabled: true } },
  });
  console.log("  bucket created.\n");
}

let token;
let total = 0;
let copied = 0;
let skipped = 0;

console.log(`Migrating gs(s3)://${srcBucket}  →  gs://${process.env.GCS_BUCKET}\n`);

do {
  const list = await s3.send(
    new ListObjectsV2Command({ Bucket: srcBucket, ContinuationToken: token })
  );
  for (const obj of list.Contents ?? []) {
    if (!obj.Key || obj.Key.endsWith("/")) continue; // skip folder markers
    total++;
    const file = dstBucket.file(obj.Key);
    const [exists] = await file.exists();
    if (exists) {
      skipped++;
      continue;
    }
    const res = await s3.send(new GetObjectCommand({ Bucket: srcBucket, Key: obj.Key }));
    const bytes = Buffer.from(await res.Body.transformToByteArray());
    await file.save(bytes, {
      resumable: false,
      contentType: res.ContentType || "application/octet-stream",
    });
    copied++;
    console.log(`  ✓ ${obj.Key} (${bytes.length} bytes)`);
  }
  token = list.IsTruncated ? list.NextContinuationToken : undefined;
} while (token);

console.log(`\nDone. ${total} objects seen — ${copied} copied, ${skipped} already present.`);
