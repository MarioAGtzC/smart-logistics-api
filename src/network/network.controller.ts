import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { NetworkNodesResponseDto } from './dto/network-nodes.response.dto';
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

  /** Lists the nodes of a stored graph. */
  @Get('nodes/:id')
  async nodes(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<NetworkNodesResponseDto> {
    const graph = await this.network.getGraph(id);
    return { graphId: graph.id, nodes: graph.nodes };
  }
}
