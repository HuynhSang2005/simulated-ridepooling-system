import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { DriverStatusService } from './driver-status.service';
import { Logger } from '@nestjs/common';
import { PrismaService } from 'core/prisma/prisma.service';

@WebSocketGateway({ cors: { origin: '*' } }) // Cho phép kết nối từ mọi nguồn
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(EventsGateway.name);

  constructor(
    private readonly driverStatusService: DriverStatusService,
    private readonly prisma: PrismaService,
  ) {}

  // Xử lý khi có một client (tài xế) kết nối
  handleConnection(client: Socket) {
    const driverId = client.handshake.query.driverId as string;
    if (!driverId) {
      client.disconnect();
      return;
    }
    this.driverStatusService.addDriver(driverId, client.id);
    this.logger.log(
      `Driver connected: ${driverId} with socket ID: ${client.id}`,
    );
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
  
  @SubscribeMessage('update_location')
  async handleUpdateLocation(client: Socket, payload: { lat: number; lng: number }): Promise<void> {
    const driverId = this.driverStatusService.getDriverId(client.id);
    if (!driverId) return;

    this.logger.log(`Received location update from driver ${driverId}:`, payload);

    // --- LOGIC MỚI ---
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

    if (!activeRoute) return;

    // 2. Lấy ra danh sách các userId trên lộ trình đó
    const userIds = await this.getUserIdsFromRoute(activeRoute.id);

    if (userIds.length > 0) {
      this.logger.log(`[Broadcast] Sending location of driver ${driverId} to users: ${userIds.join(', ')}`);
      // Logic gửi WebSocket đến các user sẽ được thêm ở bước sau
    }
  }

  // --- THÊM HÀM HELPER ---
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
