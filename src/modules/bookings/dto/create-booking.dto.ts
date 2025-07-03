import { Type } from 'class-transformer';
import {
  IsJSON,
  IsNotEmpty,
  IsString,
  ValidateNested,
} from 'class-validator';

class LocationDto {
  @IsNotEmpty()
  lat: number;

  @IsNotEmpty()
  lng: number;
}

export class CreateBookingDto {
  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsString()
  @IsNotEmpty()
  pickupAddress: string;

  @ValidateNested()        // Validate cả object lồng bên trong
  @Type(() => LocationDto) // Chỉ định cho object lồng
  pickupLocation: LocationDto;
}