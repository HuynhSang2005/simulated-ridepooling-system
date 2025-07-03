import { Injectable } from '@nestjs/common';

@Injectable()
export class DriverStatusService {
  private readonly connectedDrivers = new Map<string, string>(); // Map<driverId, socketId>

  addDriver(driverId: string, socketId: string) {
    this.connectedDrivers.set(driverId, socketId);
  }

  removeDriver(driverId: string) {
    this.connectedDrivers.delete(driverId);
  }

  getSocketId(driverId: string): string | undefined {
    return this.connectedDrivers.get(driverId);
  }

  getDriverId(socketId: string): string | undefined {
    for (const [driverId, id] of this.connectedDrivers.entries()) {
      if (id === socketId) {
        return driverId;
      }
    }
    return undefined;
  }
}