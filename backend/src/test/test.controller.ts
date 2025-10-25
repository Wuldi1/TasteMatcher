import { Controller, Get } from '@nestjs/common';
import { Artwork } from 'common';

@Controller('test')
export class TestController {
  @Get()
  test() {
    const sample: Artwork = {
      id: 'art-1',
      domainId: 'domain-1',
      title: 'Sample Art',
      imageUrl: 'http://placekitten.com/800/600'
    };
    return sample;
  }
}