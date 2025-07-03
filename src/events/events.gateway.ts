import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { DriverStatusService } from './driver-status.service';
import { Logger } from '@nestjs/common';

@WebSocketGateway({ cors: { origin: '*' } }) // Cho phép kết nối từ mọi nguồn
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(EventsGateway.name);

  constructor(private readonly driverStatusService: DriverStatusService) {}

  // Xử lý khi có một client (tài xế) kết nối
  handleConnection(client: Socket) {
    const driverId = client.handshake.query.driverId as string;
    if (!driverId) {
      client.disconnect();
      return;
    }
    this.driverStatusService.addDriver(driverId, client.id);
    this.logger.log(`Driver connected: ${driverId} with socket ID: ${client.id}`);
  }

  // Xử lý khi client ngắt kết nối
  handleDisconnect(client: Socket) {
    const driverId = this.driverStatusService.getDriverId(client.id);
    if (driverId) {
      this.driverStatusService.removeDriver(driverId);
      this.logger.log(`Driver disconnected: ${driverId}`);
    }
  }

  // Hàm này sẽ được gọi từ service khác để gửi dữ liệu
  sendNewRouteToDriver(driverId: string, routeData: any) {
    const socketId = this.driverStatusService.getSocketId(driverId);
    if (socketId) {
      this.server.to(socketId).emit('new_route', routeData);
      this.logger.log(`Sent new route to driver ${driverId}`);
    }
  }
}