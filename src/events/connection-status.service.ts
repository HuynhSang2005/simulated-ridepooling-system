import { Injectable } from '@nestjs/common';

@Injectable()
export class ConnectionStatusService {
  private readonly connectedDrivers = new Map<string, string>(); // Map<driverId, socketId>
  private readonly connectedUsers = new Map<string, string>(); // Map<userId, socketId>

  // Driver methods
  addDriver(driverId: string, socketId: string) {
    this.connectedDrivers.set(driverId, socketId);
  }
  removeDriverBySocketId(socketId: string) {
    for (const [key, value] of this.connectedDrivers.entries()) {
      if (value === socketId) {
        this.connectedDrivers.delete(key);
        return key;
      }
    }
  }
  getSocketIdForDriver(driverId: string): string | undefined {
    return this.connectedDrivers.get(driverId);
  }

  // User methods
  addUser(userId: string, socketId: string) {
    this.connectedUsers.set(userId, socketId);
  }
  removeUserBySocketId(socketId: string) {
    for (const [key, value] of this.connectedUsers.entries()) {
      if (value === socketId) {
        this.connectedUsers.delete(key);
        return key;
      }
    }
  }
  getSocketIdsForUsers(userIds: string[]): string[] {
    return userIds
      .map((id) => this.connectedUsers.get(id))
      .filter((id): id is string => !!id);
  }
}