import { PrismaClient } from '@prisma/client';

// Client cache for multi-tenant connections
const clients = new Map<string, PrismaClient>();

// Platform database client (for tenant registry)
let platformClient: PrismaClient | null = null;

/**
 * Get Prisma client for a specific tenant
 */
export const getPrismaClient = (tenantId: string): PrismaClient => {
  if (!clients.has(tenantId)) {
    const envKey = `DATABASE_URL_${tenantId.toUpperCase()}`;
    const connectionString = process.env[envKey];
    
    if (!connectionString) {
      // Fall back to default DATABASE_URL for development
      const defaultUrl = process.env.DATABASE_URL;
      if (!defaultUrl) {
        throw new Error(`No database URL found for tenant: ${tenantId}`);
      }
      
      clients.set(tenantId, new PrismaClient({
        datasources: { db: { url: defaultUrl } }
      }));
    } else {
      clients.set(tenantId, new PrismaClient({
        datasources: { db: { url: connectionString } }
      }));
    }
  }
  
  return clients.get(tenantId)!;
};

/**
 * Get Platform Prisma client (for tenant registry/metadata)
 */
export const getPlatformClient = (): PrismaClient => {
  if (!platformClient) {
    const url = process.env.PLATFORM_DATABASE_URL || process.env.DATABASE_URL;
    if (!url) {
      throw new Error('No platform database URL configured');
    }
    
    platformClient = new PrismaClient({
      datasources: { db: { url } }
    });
  }
  
  return platformClient;
};

/**
 * Default client for development/single-tenant mode
 */
export const prisma = new PrismaClient();

/**
 * Disconnect all clients (for graceful shutdown)
 */
export const disconnectAll = async (): Promise<void> => {
  const disconnectPromises: Promise<void>[] = [];
  
  for (const client of clients.values()) {
    disconnectPromises.push(client.$disconnect());
  }
  
  if (platformClient) {
    disconnectPromises.push(platformClient.$disconnect());
  }
  
  await Promise.all(disconnectPromises);
};
