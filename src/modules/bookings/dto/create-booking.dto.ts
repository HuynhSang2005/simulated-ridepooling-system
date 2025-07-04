import { Type } from 'class-transformer';
import {
  IsJSON,
  IsNotEmpty,
  IsNumber,
  IsString,
  ValidateNested,
} from 'class-validator';

class LocationDto {
  @IsNotEmpty()
  @IsNumber()
  lat: number;

  @IsNotEmpty()
  @IsNumber()
  lng: number;
}

export class CreateBookingDto {
  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsString()
  @IsNotEmpty()
  pickupAddress: string;

  @ValidateNested()
  @Type(() => LocationDto)
  pickupLocation: LocationDto;

  @IsString()
  @IsNotEmpty()
  dropoffAddress: string;

  @ValidateNested()
  @Type(() => LocationDto)
  dropoffLocation: LocationDto;
}