import { app, InvocationContext } from '@azure/functions';
import { getBlobServiceClient, getQueueServiceClient, getSecret } from '../utils/azureAuth';

export async function indexerFunction(queueItem: unknown, context: InvocationContext): Promise<void> {
    context.log('Indexer function triggered:', queueItem);

    try {
        // Access blob storage using managed identity
        const blobServiceClient = await getBlobServiceClient();
        
        // Access queue storage using managed identity
        const queueServiceClient = await getQueueServiceClient();
        
        // Get other secrets from Key Vault as needed
        const searchServiceName = await getSecret('search-service-name');
        const searchApiKey = await getSecret('search-api-key');
        
        // Your existing indexing logic here
        // ...existing code...
        
        context.log('Successfully processed indexer item');
    } catch (error) {
        context.error('Error in indexer function:', error);
        throw error;
    }
}

app.storageQueue('indexer', {
    queueName: '%AZURE_QUEUE_NAME%',
    connection: '', // Empty to use managed identity
    handler: indexerFunction,
});