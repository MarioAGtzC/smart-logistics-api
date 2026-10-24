import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { JobStatusResponseDto } from './dto/job-status.response.dto';
import { OptimizeRouteDto } from './dto/optimize-route.dto';
import { RoutingService } from './routing.service';

@Controller('route')
export class RoutingController {
  constructor(private readonly routing: RoutingService) {}

  /** Queues a route calculation on graph `id`; poll GET /route/status/{jobId} for the result. */
  @Post('optimize/:id')
  @HttpCode(202)
  optimize(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: OptimizeRouteDto,
  ): Promise<{ jobId: string }> {
    return this.routing.enqueue(id, dto);
  }

  /** Status of a route job: PENDING, PROCESSING, COMPLETED (with result) or FAILED (with error). */
  @Get('status/:jobId')
  status(@Param('jobId') jobId: string): Promise<JobStatusResponseDto> {
    return this.routing.getStatus(jobId);
  }
}
