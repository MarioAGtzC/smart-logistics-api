import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
  NotContains,
  ValidateNested,
} from 'class-validator';

// Postgres text columns reject the NUL character; catch it here as a 400 instead of a 500.
const NUL = '\u0000';
const NUL_MESSAGE = '$property must not contain NUL characters';

export class EdgeDto {
  /** Origin node id. */
  @IsString()
  @IsNotEmpty()
  @NotContains(NUL, { message: NUL_MESSAGE })
  from: string;

  /** Destination node id; edges are directed (from -> to). */
  @IsString()
  @IsNotEmpty()
  @NotContains(NUL, { message: NUL_MESSAGE })
  to: string;

  /** Travel time in minutes. */
  @IsNumber()
  @Min(0)
  cost: number;

  /** Max vehicle weight allowed; no limit when omitted. */
  @IsOptional()
  @IsNumber()
  @IsPositive()
  maxWeight?: number;

  /** Bans hazardous loads when true; defaults to false. */
  @IsOptional()
  @IsBoolean()
  noHazardous?: boolean;

  /** Cost multiplier when the edge is entered during peak hours; defaults to 1. */
  @IsOptional()
  @IsNumber()
  @IsPositive()
  trafficMultiplier?: number;
}

export class UploadNetworkDto {
  /** Directed edges of the graph; nodes are derived from them. */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10000)
  @ValidateNested({ each: true })
  @Type(() => EdgeDto)
  edges: EdgeDto[];
}
