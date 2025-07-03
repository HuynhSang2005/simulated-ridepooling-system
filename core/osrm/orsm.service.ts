import { HttpService } from '@nestjs/axios';
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';

// interface cho các điểm tọa độ để code tường minh hơn
export interface Point {
  lat: number;
  lng: number;
}

@Injectable()
export class OsrmService {
  private readonly osrmBaseUrl = 'http://router.project-osrm.org';

  constructor(private readonly httpService: HttpService) {}

  /**
   * Lấy ma trận thời gian di chuyển (tính bằng giây) giữa một tập hợp các điểm.
   * @param points Mảng các điểm tọa độ
   * @returns Một ma trận 2D chứa thời gian di chuyển
   */

  async getDurationMatrix(points: Point[]): Promise<number[][]> {
    if (points.length < 2) {
      return [[]];
    }

    // 1. Format tọa độ thành chuỗi OSRM yêu cầu: {lng},{lat};{lng},{lat}...
    const coordsString = points.map((p) => `${p.lng},${p.lat}`).join(';');

    // 2. Xây dựng URL cho API 'table'
    const url = `${this.osrmBaseUrl}/table/v1/driving/${coordsString}?annotations=duration`;

    try {
      // 3. Call API và lấy dữ liệu
      const response = await firstValueFrom(this.httpService.get(url));

      // 4. Kiểm tra và trả về ma trận 'durations'
      if (response.data && response.data.code === 'Ok') {
        return response.data.durations;
      } else {
        throw new InternalServerErrorException('Error fetching data from OSRM');
      }
    } catch (error) {
      console.error('OSRM API Error:', error.message);
      throw new InternalServerErrorException('Failed to connect to OSRM service');
    }
  }
}