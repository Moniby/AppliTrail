import type {
  ObjectMetadata,
  ObjectStorage,
  StoredObject,
} from "./contracts";

type AzureModule = typeof import("@azure/storage-blob");
type ContainerClient = InstanceType<AzureModule["ContainerClient"]>;

class AzureStoredObject implements StoredObject {
  readonly body: ReadableStream;

  constructor(
    private readonly bytes: Uint8Array,
    readonly httpMetadata?: ObjectMetadata,
    readonly customMetadata?: Record<string, string>,
  ) {
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    this.body = new Blob([buffer]).stream();
  }

  async arrayBuffer() {
    return this.bytes.buffer.slice(
      this.bytes.byteOffset,
      this.bytes.byteOffset + this.bytes.byteLength,
    ) as ArrayBuffer;
  }

  writeHttpMetadata(headers: Headers) {
    if (this.httpMetadata?.contentType) headers.set("Content-Type", this.httpMetadata.contentType);
  }
}

function safeBlobKey(key: string) {
  const clean = key.split("/").filter(Boolean);
  if (!clean.length || clean.some((segment) => segment === "." || segment === "..")) {
    throw new Error("Object-storage keys must be safe relative paths.");
  }
  return clean.join("/");
}

class AzureBlobStorage implements ObjectStorage {
  constructor(private readonly container: ContainerClient) {}

  async put(
    key: string,
    value: ArrayBuffer | ReadableStream,
    options?: {
      httpMetadata?: ObjectMetadata;
      customMetadata?: Record<string, string>;
    },
  ) {
    const bytes = value instanceof ArrayBuffer
      ? new Uint8Array(value)
      : new Uint8Array(await new Response(value).arrayBuffer());
    const blob = this.container.getBlockBlobClient(safeBlobKey(key));
    await blob.uploadData(bytes, {
      blobHTTPHeaders: options?.httpMetadata?.contentType
        ? { blobContentType: options.httpMetadata.contentType }
        : undefined,
      metadata: options?.customMetadata,
    });
    return { key };
  }

  async get(key: string): Promise<StoredObject | null> {
    const blob = this.container.getBlockBlobClient(safeBlobKey(key));
    try {
      const [properties, buffer] = await Promise.all([
        blob.getProperties(),
        blob.downloadToBuffer(),
      ]);
      return new AzureStoredObject(
        new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength),
        properties.contentType ? { contentType: properties.contentType } : undefined,
        properties.metadata,
      );
    } catch (error) {
      const statusCode = (error as { statusCode?: number }).statusCode;
      if (statusCode === 404) return null;
      throw error;
    }
  }

  async delete(key: string | string[]) {
    for (const item of Array.isArray(key) ? key : [key]) {
      await this.container.deleteBlob(safeBlobKey(item), { deleteSnapshots: "include" });
    }
  }

  async list(options?: { prefix?: string; cursor?: string; limit?: number }) {
    const limit = Math.max(1, Math.min(options?.limit ?? 1_000, 1_000));
    const iterator = this.container
      .listBlobsFlat({ prefix: options?.prefix })
      .byPage({ continuationToken: options?.cursor, maxPageSize: limit });
    const page = await iterator.next();
    const segment = page.value;
    return {
      objects: (segment?.segment.blobItems ?? []).map((blob: { name: string }) => ({ key: blob.name })),
      truncated: Boolean(segment?.continuationToken),
      cursor: segment?.continuationToken || undefined,
    };
  }
}

export async function createAzureBlobStorage(): Promise<ObjectStorage> {
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING?.trim();
  if (!connectionString) {
    throw new Error("AZURE_STORAGE_CONNECTION_STRING is required when Azure Blob storage is selected.");
  }
  const containerName = process.env.AZURE_STORAGE_CONTAINER?.trim() || "resumes";
  if (!/^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])?$/.test(containerName)) {
    throw new Error("AZURE_STORAGE_CONTAINER must be a valid lowercase Blob container name.");
  }
  const moduleName = "@azure/storage-blob";
  const { BlobServiceClient } = await import(/* @vite-ignore */ moduleName) as AzureModule;
  const service = BlobServiceClient.fromConnectionString(connectionString);
  const container = service.getContainerClient(containerName);
  await container.createIfNotExists();
  return new AzureBlobStorage(container);
}
