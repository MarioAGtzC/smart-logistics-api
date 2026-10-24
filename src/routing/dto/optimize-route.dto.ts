import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Min,
  ValidateNested,
} from 'class-validator';
import { CLOCK } from '../algorithm/peak-hours';

export class VehicleProfileDto {
  /** Free-form vehicle type, e.g. "truck" or "van"; it does not affect routing. */
  @IsString()
  @IsNotEmpty()
  type: string;

  /** Vehicle weight; edges with a lower maxWeight are skipped. */
  @IsNumber()
  @Min(0)
  weight: number;

  /** Carries hazardous materials; edges with noHazardous are skipped. */
  @IsBoolean()
  hazardous: boolean;
}

export class OptimizeRouteDto {
  @IsString()
  @IsNotEmpty()
  originNodeId: string;

  @IsString()
  @IsNotEmpty()
  destinationNodeId: string;

  /** Stops visited in this order between origin and destination. */
  @IsOptional()
  @IsArray()
  // Each stop is a full Dijkstra run in the worker; cap it at the trust boundary.
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  waypoints?: string[];

  /** Omit to route without weight or hazardous-load restrictions. */
  @IsOptional()
  @ValidateNested()
  @Type(() => VehicleProfileDto)
  vehicleProfile?: VehicleProfileDto;

  /** "HH:mm" (00:00-23:59). Peak-hour multipliers depend on it. */
  @Matches(CLOCK, { message: '$property must be a time in HH:mm format' })
  departureTime: string;
}
