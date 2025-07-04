import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { PrismaService } from 'core/prisma/prisma.service';
import { ConnectionStatusService } from './connection-status.service';

@WebSocketGateway({ cors: { origin: '*' } })
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(EventsGateway.name);

  constructor(
    private readonly connectionStatus: ConnectionStatusService,
    private readonly prisma: PrismaService,
  ) {}

  // Handle khi có một client (tài xế) kết nối
  handleConnection(client: Socket) {
    const driverId = client.handshake.query.driverId as string;
    const userId = client.handshake.query.userId as string;

    if (driverId) {
      this.connectionStatus.addDriver(driverId, client.id);
      this.logger.log(`Driver connected: ${driverId}`);
    } else if (userId) {
      this.connectionStatus.addUser(userId, client.id);
      this.logger.log(`User connected: ${userId}`);
    } else {
      client.disconnect();
    }
  }

  // Xử lý khi client ngắt kết nối
  handleDisconnect(client: Socket) {
    const disconnectedDriver = this.connectionStatus.removeDriverBySocketId(client.id);
    if (disconnectedDriver) this.logger.log(`Driver disconnected: ${disconnectedDriver}`);
    
    const disconnectedUser = this.connectionStatus.removeUserBySocketId(client.id);
    if (disconnectedUser) this.logger.log(`User disconnected: ${disconnectedUser}`);
  }

  // Hàm này sẽ được gọi từ service khác để gửi dữ liệu
  sendNewRouteToDriver(driverId: string, routeData: any) {
    const socketId = this.connectionStatus.getSocketIdForDriver(driverId);
    if (socketId) {
      this.server.to(socketId).emit('new_route', routeData);
      this.logger.log(`Sent new route to driver ${driverId}`);
    }
  }
  
  @SubscribeMessage('update_location')
  async handleUpdateLocation(client: Socket, payload: { lat: number; lng: number }) {
    // Tìm driverId từ socketId
    const driverId = [...this.connectionStatus['connectedDrivers'].entries()]
      .find(([_, socketId]) => socketId === client.id)?.[0];
    if (!driverId) {
      this.logger.warn(`No driverId found for socket ${client.id}`);
      return;
    }

    this.logger.log(`Received location update from driver ${driverId}:`, payload);

    // 1. Tìm lộ trình đang hoạt động của tài xế (lộ trình mới nhất)
    const activeRoute = await this.prisma.route.findFirst({
      where: { driverId: driverId },
      orderBy: { createdAt: 'desc' },
      include: {
        stops: {
          where: {
            bookingId: { not: null },
          },
        },
      },
    });

    if (!activeRoute) {
      this.logger.warn(`No active route found for driver ${driverId}`);
      return;
    }

    // 2. Lấy ra danh sách các userId trên lộ trình đó
    const userIds = await this.getUserIdsFromRoute(activeRoute.id);
    if (userIds.length === 0) {
      this.logger.warn(`No userIds found on route ${activeRoute.id} for driver ${driverId}`);
      return;
    }

    const socketIds = this.connectionStatus.getSocketIdsForUsers(userIds);
    if (socketIds.length === 0) {
      this.logger.warn(`No user sockets found for userIds: ${userIds.join(', ')}`);
      return;
    }

    this.logger.log(`[Broadcast] Sending location of driver ${driverId} to users: ${userIds.join(', ')}`);

    this.server.to(socketIds).emit('driver_location_updated', {
      driverId,
      location: payload,
    });
  }

  private async getUserIdsFromRoute(routeId: string): Promise<string[]> {
    const bookings = await this.prisma.booking.findMany({
      where: {
        stop: {
          routeId: routeId,
        },
      },
      select: {
        userId: true,
      },
    });
    // Dùng Set để loại bỏ các userId trùng lặp (nếu một user đặt nhiều chuyến)
    return [...new Set(bookings.map((b) => b.userId))];
  }
}
