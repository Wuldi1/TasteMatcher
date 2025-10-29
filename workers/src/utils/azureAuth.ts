import { DefaultAzureCredential } from '@azure/identity';
import { SecretClient } from '@azure/keyvault-secrets';
import { QueueServiceClient } from '@azure/storage-queue';
import { BlobServiceClient } from '@azure/storage-blob';

const credential = new DefaultAzureCredential();
const keyVaultUrl = process.env.AZURE_KEY_VAULT_URL;

if (!keyVaultUrl) {
    throw new Error('AZURE_KEY_VAULT_URL environment variable is required');
}

const secretClient = new SecretClient(keyVaultUrl, credential);

// Cache for secrets to avoid repeated Key Vault calls
const secretCache = new Map<string, { value: string; expires: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function getSecret(secretName: string): Promise<string> {
    const now = Date.now();
    const cached = secretCache.get(secretName);
    
    if (cached && cached.expires > now) {
        return cached.value;
    }

    try {
        const secret = await secretClient.getSecret(secretName);
        const value = secret.value || '';
        
        // Cache the secret
        secretCache.set(secretName, {
            value,
            expires: now + CACHE_TTL
        });
        
        return value;
    } catch (error) {
        console.error(`Failed to retrieve secret ${secretName}:`, error);
        throw error;
    }
}

export async function getStorageAccountName(): Promise<string> {
    // Try environment variable first, then Key Vault
    return process.env.STORAGE_ACCOUNT_NAME || await getSecret('storage-account-name');
}

export async function getQueueServiceClient(): Promise<QueueServiceClient> {
    const storageAccountName = await getStorageAccountName();
    const storageUrl = `https://${storageAccountName}.queue.core.windows.net`;
    
    return new QueueServiceClient(storageUrl, credential);
}

export async function getBlobServiceClient(): Promise<BlobServiceClient> {
    const storageAccountName = await getStorageAccountName();
    const storageUrl = `https://${storageAccountName}.blob.core.windows.net`;
    
    return new BlobServiceClient(storageUrl, credential);
}

export { credential };
