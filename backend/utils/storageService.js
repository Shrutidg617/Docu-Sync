const { BlobServiceClient } = require("@azure/storage-blob");
const zlib = require("zlib");
const { promisify } = require("util");
const NodeCache = require("node-cache");

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

// Cache for 5 minutes, check every 1 minute
const blobCache = new NodeCache({ stdTTL: 300, checkperiod: 60 });

const THRESHOLD = 80000; // 80,000 characters
const CONTAINER_NAME = "documents";

let containerClient = null;

async function initAzure() {
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
  if (!connectionString) {
    if (process.env.NODE_ENV === "production") {
      console.error("CRITICAL: AZURE_STORAGE_CONNECTION_STRING is missing in production!");
    } else {
      console.warn("Azure Storage connection string missing. Backend will fallback to MongoDB only.");
    }
    return;
  }

  try {
    const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
    containerClient = blobServiceClient.getContainerClient(CONTAINER_NAME);
    await containerClient.createIfNotExists({ access: "container" });
    console.log(`Azure Blob Storage ready (Container: ${CONTAINER_NAME})`);
  } catch (err) {
    console.error("Azure Blob initialization failed:", err.message);
  }
}

/**
 * Saves content using hybrid logic.
 * Returns { storageType, blobUrl, compressedSize, data }
 */
async function saveContent(roomId, content, isSnapshot = false, timestamp = null) {
  const contentSize = content.length;
  
  // Decide storage type
  if (contentSize < THRESHOLD || !containerClient) {
    return {
      storageType: "mongodb",
      blobUrl: null,
      contentSize,
      data: content
    };
  }

  try {
    // Large content -> Azure Blob Storage
    const blobName = isSnapshot 
      ? `${roomId}/snapshot-${timestamp || Date.now()}.json`
      : `${roomId}/main.json`;
    
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);
    
    // Compress content
    const compressedData = await gzip(content);
    
    // Upload as application/json (wrapped in an object if needed, but here just raw string)
    await blockBlobClient.upload(compressedData, compressedData.length, {
      blobHTTPHeaders: { 
        blobContentType: "application/json",
        blobContentEncoding: "gzip"
      }
    });

    const blobUrl = blockBlobClient.url;
    
    // Update Cache
    blobCache.set(`${roomId}:${blobName}`, content);

    return {
      storageType: "azure",
      blobUrl,
      contentSize,
      data: "" // Clear mongo content field
    };
  } catch (err) {
    console.error(`Azure upload failed for room ${roomId}:`, err.message);
    // FALLBACK
    return {
      storageType: "mongodb",
      blobUrl: null,
      contentSize,
      data: content
    };
  }
}

/**
 * Loads content from either Mongo or Azure
 */
async function loadContent(doc, isSnapshot = false) {
  if (doc.storageType === "mongodb" || !doc.blobUrl) {
    return doc.content;
  }

  const blobName = isSnapshot 
    ? doc.blobUrl.split(`${CONTAINER_NAME}/`)[1] 
    : `${doc.roomId}/main.json`;

  // Check Cache
  const cached = blobCache.get(`${doc.roomId}:${blobName}`);
  if (cached) return cached;

  try {
    if (!containerClient) throw new Error("Azure client not initialized");

    const blockBlobClient = containerClient.getBlockBlobClient(blobName);
    const downloadResponse = await blockBlobClient.download();
    
    const body = await streamToBuffer(downloadResponse.readableStreamBody);
    
    // Decompress
    const decompressed = await gunzip(body);
    const content = decompressed.toString("utf8");

    // Cache it
    blobCache.set(`${doc.roomId}:${blobName}`, content);

    return content;
  } catch (err) {
    console.error(`Azure download failed for room ${doc.roomId}:`, err.message);
    return doc.content || ""; // Fallback to whatever is in Mongo
  }
}

async function deleteAllBlobs(roomId) {
  if (!containerClient) return;
  try {
    const prefix = `${roomId}/`;
    for await (const blob of containerClient.listBlobsFlat({ prefix })) {
      await containerClient.deleteBlob(blob.name);
      console.log(`Deleted blob: ${blob.name}`);
    }
  } catch (err) {
    console.error(`Failed to delete blobs for room ${roomId}:`, err.message);
  }
}

async function streamToBuffer(readableStream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    readableStream.on("data", (data) => {
      chunks.push(data instanceof Buffer ? data : Buffer.from(data));
    });
    readableStream.on("end", () => {
      resolve(Buffer.concat(chunks));
    });
    readableStream.on("error", reject);
  });
}

module.exports = {
  initAzure,
  saveContent,
  loadContent,
  deleteAllBlobs,
  blobCache
};
