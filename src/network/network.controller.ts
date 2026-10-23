import { Body, Controller, Post } from '@nestjs/common';
import { UploadNetworkDto } from './dto/upload-network.dto';
import { NetworkService } from './network.service';

@Controller('network')
export class NetworkController {
  constructor(private readonly network: NetworkService) {}

  /** Stores a directed graph and returns its id. */
  @Post('upload')
  upload(@Body() dto: UploadNetworkDto): Promise<{ id: string }> {
    return this.network.create(dto);
  }
}
