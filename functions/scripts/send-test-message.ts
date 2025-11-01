import { QueueClient } from '@azure/storage-queue';
import { BlobServiceClient } from '@azure/storage-blob';
import * as fs from 'fs';
import * as path from 'path';

async function sendTestMessage() {
  // Load config from environment
  const storageConnectionString = process.env.AZURE_STORAGE_CONNECTION_STRING!;
  const queueName = process.env.IMAGE_PROCESSING_QUEUE_NAME || 'tastematcher-dev-indexing-jobs';
  
  if (!storageConnectionString) {
    console.error('❌ AZURE_STORAGE_CONNECTION_STRING not set');
    process.exit(1);
  }

  // Upload test image to blob storage
  const blobServiceClient = BlobServiceClient.fromConnectionString(storageConnectionString);
  const containerClient = blobServiceClient.getContainerClient('originals');
  
  // Ensure container exists
  await containerClient.createIfNotExists();
  
  const testImagePath = path.join(__dirname, '../test-fixtures/test-image.jpg');
  const blobName = `test-${Date.now()}.jpg`;
  const blockBlobClient = containerClient.getBlockBlobClient(blobName);
  
  console.log('📤 Uploading test image to blob storage...');
  
  if (fs.existsSync(testImagePath)) {
    await blockBlobClient.uploadFile(testImagePath);
    console.log(`✅ Uploaded: ${blobName}`);
  } else {
    console.log(`⚠️  Test image not found at ${testImagePath}, using blob name anyway`);
  }

  // Send message to queue
  const queueClient = new QueueClient(storageConnectionString, queueName);
  await queueClient.createIfNotExists();

  const message = {
    messageId: `test-msg-${Date.now()}`,
    artworkId: `artwork-${Date.now()}`,
    domainId: 'test-domain-001',
    containerName: 'originals',
    blobName: blobName,
    originalFilename: 'test-artwork.jpg',
    contentType: 'image/jpeg',
    enqueuedAt: new Date().toISOString(),
    correlationId: `corr-${Date.now()}`,
  };

  console.log('📨 Sending message to queue:', queueName);
  console.log('Message:', JSON.stringify(message, null, 2));

  await queueClient.sendMessage(Buffer.from(JSON.stringify(message)).toString('base64'));

  console.log('✅ Test message sent successfully!');
  console.log('👀 Watch your function logs for processing output');
}

sendTestMessage().catch((err) => {
  console.error('❌ Error:', err);
  process.exit(1);
});
