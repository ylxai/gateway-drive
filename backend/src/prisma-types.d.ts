// Prisma model type declarations
// These match the schema at prisma/schema.prisma
// Regenerate with: npx prisma generate

declare module "@prisma/client" {
  export class PrismaClient {
    constructor(opts?: any);
    $connect(): Promise<void>;
    $disconnect(): Promise<void>;
    user: ModelDelegate<any>;
    apiKey: ModelDelegate<any>;
    uploadRoutingPolicy: ModelDelegate<any>;
    userSession: ModelDelegate<any>;
    authHandoff: ModelDelegate<any>;
    providerConfig: ModelDelegate<ProviderConfig>;
    oauthState: ModelDelegate<any>;
    connectedAccount: ModelDelegate<ConnectedAccount>;
    s3StorageConfig: ModelDelegate<S3StorageConfig>;
    storageAccount: ModelDelegate<StorageAccount>;
    file: ModelDelegate<File>;
    fileShare: ModelDelegate<FileShare>;
    filePreviewToken: ModelDelegate;
    folder: ModelDelegate<Folder>;
    uploadSession: ModelDelegate<UploadSession>;
    auditLog: ModelDelegate<any>;
    workspaceInvite: ModelDelegate<any>;
    $transaction: any;
    $transaction<T>(fn: (fn: any) => Promise<T>): Promise<T>;
    $queryRaw<T>(strings: TemplateStringsArray, ...values: any[]): PrismaPromise<T>;
    $queryRawUnsafe(query: string, ...values: any[]): PrismaPromise<any>;
  }

  interface Thenable<T> extends PromiseLike<T> {}
  interface PrismaPromise<T> extends Promise<T> {}
  type ModelDelegate<T> = {
    create(args?: any): PrismaPromise<T>;
    findUnique(args?: any): PrismaPromise<T | null>;
    findUniqueOrThrow(args?: any): PrismaPromise<T>;
    findFirst(args?: any): PrismaPromise<T | null>;
    findFirstOrThrow(args?: any): PrismaPromise<T>;
    findMany(args?: any): PrismaPromise<T[]>;
    update(args?: any): PrismaPromise<T>;
    delete(args?: any): PrismaPromise<T>;
    upsert(args?: any): PrismaPromise<T>;
    count(args?: any): PrismaPromise<number>;
    updateMany(args?: any): PrismaPromise<{ count: number }>;
    deleteMany(args?: any): PrismaPromise<{ count: number }>;
    createMany(args?: any): PrismaPromise<{ count: number }>;
  };


  export type Prisma = typeof PrismaClient & {
    ModelName: Record<string, string>;
  };

  export interface ConnectedAccount {
    id: string;
    userId: string;
    providerConfigId: string | null;
    provider: string;
    providerAccountId: string;
    email: string;
    displayName: string | null;
    avatarUrl: string | null;
    accessTokenEncrypted: string | null;
    refreshTokenEncrypted: string | null;
    tokenExpiresAt: Date | null;
    scopes: any;
    status: string;
    lastError: string | null;
    createdAt: Date;
    updatedAt: Date;
    storageAccount?: StorageAccount | null;
    s3StorageConfig?: S3StorageConfig | null;
    files?: File[];
    folders?: Folder[];
    user?: User;
    files?: File[];
    folders?: Folder[];
    user?: User;
  }

export interface File {
    id: string;
    userId: string;
    connectedAccountId: string;
    folderId: string | null;
    provider: string;
    providerFileId: string;
    name: string;
    mimeType: string;
    sizeBytes: bigint;
    checksum: string | null;
    status: string;
    createdAt: Date;
    updatedAt: Date;
    deletedAt: Date | null;
    shares?: FileShare[];
    previewTokens?: FilePreviewToken[];
    connectedAccount: ConnectedAccount;
    folder?: Folder | null;
  }

  export interface ProviderConfig {
    id: string;
    userId: string | null;
    provider: string;
    clientIdEncrypted: string;
    clientSecretEncrypted: string;
    redirectUri: string;
    scopes: any;
    status: string;
    createdAt: Date;
    updatedAt: Date;
    connectedAccounts?: ConnectedAccount[];
    oauthStates?: OauthState[];
  }

  export interface S3StorageConfig {
    id: string;
    userId: string;
    connectedAccountId: string;
    name: string;
    bucket: string;
    region: string;
    endpoint: string | null;
    accessKeyIdEncrypted: string;
    secretAccessKeyEncrypted: string;
    forcePathStyle: boolean;
    prefix: string;
    quotaBytes: bigint | null;
    status: string;
    createdAt: Date;
    updatedAt: Date;
    file: File;
  }

  export interface FileShare {
    id: string;
    fileId: string;
    userId: string;
    token: string | null;
    tokenHash: string;
    enabled: boolean;
    expiresAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    file: File;
  }

  export interface StorageAccount {
    id: string;
    connectedAccountId: string;
    totalBytes: bigint | null;
    usedBytes: bigint;
    availableBytes: bigint | null;
    trashBytes: bigint | null;
    lastSyncedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    file: File;
  }

  export interface User {
    id: string;
    name: string;
    email: string;
  }

  export interface Folder {
    id: string;
    userId: string;
    parentId: string | null;
    connectedAccountId: string | null;
    provider: string;
    providerFolderId: string | null;
    name: string;
    color: string;
    iconUrl: string | null;
    createdAt: Date;
    updatedAt: Date;
    deletedAt: Date | null;
    connectedAccount: ConnectedAccount;
  }

  export interface UploadSession {
    id: string;
    userId: string;
    targetConnectedAccountId: string | null;
    folderId: string | null;
    fileName: string;
    mimeType: string;
    sizeBytes: bigint;
    status: string;
    googleSessionUri: string | null;
    errorMessage: string | null;
    createdAt: Date;
    completedAt: Date | null;
  }
}
