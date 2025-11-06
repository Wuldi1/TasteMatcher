import { BadRequestException } from '@nestjs/common';
import { UploadController } from './upload.controller';
import { UploadService } from './upload.service';
import { ProcessingStatus } from '@tastematcher/common';

describe('UploadController', () => {
  let controller: UploadController;
  let uploadService: jest.Mocked<UploadService>;

  beforeEach(() => {
    uploadService = {
      uploadArtwork: jest.fn(),
    } as unknown as jest.Mocked<UploadService>;

    controller = new UploadController(uploadService);
  });

  it('parses stringified artwork metadata payloads', async () => {
    const file = {
      buffer: Buffer.from('test'),
      originalname: 'photo.jpg',
      mimetype: 'image/jpeg',
      // eslint-disable-next-line no-undef
    } as Express.Multer.File;

    const response: ProcessingStatus = {
      artId: 'art-123',
      status: 'enqueued',
      progress: 0,
    };

    uploadService.uploadFileAndEnqueue.mockResolvedValue(response);

    const body = {
      artwork: JSON.stringify({
        title: 'Title',
        artist: 'Artist',
        description: 'Desc',
        tags: ['Tag'],
      }),
    };

    await controller.uploadArtwork('domain-abc', file, body);

    expect(uploadService.uploadFileAndEnqueue).toHaveBeenCalledWith(
      'domain-abc',
      file,
      expect.objectContaining({
        title: 'Title',
        artist: 'Artist',
        description: 'Desc',
        tags: ['Tag'],
      }),
    );
  });

  it('throws BadRequest when artwork metadata JSON is invalid', async () => {
    const file = {
      buffer: Buffer.from('test'),
      originalname: 'photo.jpg',
      mimetype: 'image/jpeg',
      // eslint-disable-next-line no-undef
    } as Express.Multer.File;

    const body = {
      artwork: 'not-json',
    };

    await expect(controller.uploadArtwork('domain-abc', file, body)).rejects.toBeInstanceOf(
      BadRequestException,
    );

    expect(uploadService.uploadFileAndEnqueue).not.toHaveBeenCalled();
  });
});