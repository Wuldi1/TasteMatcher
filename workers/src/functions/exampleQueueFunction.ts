import { app, InvocationContext } from '@azure/functions';
import { getQueueServiceClient, getSecret } from '../utils/azureAuth';

export async function queueProcessor(queueItem: unknown, context: InvocationContext): Promise<void> {
    context.log('Queue processor function processed work item:', queueItem);

    try {
        // Access queue using managed identity
        const queueServiceClient = await getQueueServiceClient();
        const queueName = process.env.AZURE_QUEUE_NAME || await getSecret('queue-name');
        const queueClient = queueServiceClient.getQueueClient(queueName);

        // Example: Add message to queue
        await queueClient.sendMessage('Processed item');

        // Access other secrets from Key Vault as needed
        const databaseUrl = await getSecret('database-connection-string');
        
        context.log('Successfully processed queue item');
    } catch (error) {
        context.error('Error processing queue item:', error);
        throw error;
    }
}

app.storageQueue('queueProcessor', {
    queueName: '%AZURE_QUEUE_NAME%',
    connection: '', // Empty connection string to use managed identity
    handler: queueProcessor,
});
