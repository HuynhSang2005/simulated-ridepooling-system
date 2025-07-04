# Hệ thống Mô phỏng Dịch vụ Đi chung xe (Ride-Pooling System Simulation)

<p align="center">
  <img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" />
</p>

<p align="center">
  Một dự án backend mô phỏng hệ thống đi chung xe theo thời gian thực, được xây dựng bằng <strong>NestJS</strong>. Dự án này được tạo ra với mục tiêu học tập và nghiên cứu về cách vận hành của các bài toán định tuyến phương tiện (VRP), cụ thể là bài toán Dial-a-Ride (DARP).
</p>

<p align="center">
    <img src="https://img.shields.io/badge/NestJS-E0234E?style=for-the-badge&logo=nestjs&logoColor=white" alt="NestJS">
    <img src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript">
    <img src="https://img.shields.io/badge/Prisma-2D3748?style=for-the-badge&logo=prisma&logoColor=white" alt="Prisma">
    <img src="https://img.shields.io/badge/PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white" alt="PostgreSQL">
    <img src="https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white" alt="Docker">
    <img src="https://img.shields.io/badge/Socket.io-010101?style=for-the-badge&logo=socket.io&logoColor=white" alt="Socket.io">
</p>

---

## 📜 Tổng quan về Dự án

Dự án này là một API server mô phỏng hoạt động của một dịch vụ gọi xe đi chung. Thay vì người dùng chỉ có một điểm đến chung, hệ thống hỗ trợ mỗi yêu cầu (booking) có điểm đón và điểm trả riêng biệt (**Dial-a-Ride Problem**).

Hệ thống sẽ tự động gom các yêu cầu đang chờ, sử dụng thuật toán **Tham lam (Greedy)** để tìm ra lộ trình tối ưu nhằm phục vụ nhiều khách hàng nhất trong một chuyến đi, sau đó gán cho tài xế phù hợp và thông báo theo thời gian thực.

### Kiến trúc Hệ thống
-   **Backend:** Xây dựng bằng **NestJS**, một framework Node.js mạnh mẽ và có cấu trúc.
-   **Database:** **PostgreSQL**, được quản lý thông qua **Docker Compose** để dễ dàng cài đặt.
-   **ORM:** **Prisma** được sử dụng để tương tác với database một cách an toàn và hiệu quả.
-   **Dịch vụ Định tuyến:** Tích hợp với **OSRM (Open Source Routing Machine)** API để lấy dữ liệu thời gian di chuyển thực tế giữa các địa điểm.
-   **Real-time:** Sử dụng **WebSocket** (thông qua Socket.IO) để thông báo lộ trình cho tài xế và cập nhật vị trí cho khách hàng.

---

## ✨ Tính năng chính

-   **Đặt xe Động:** Người dùng có thể tạo các yêu cầu di chuyển với điểm đón và điểm trả tùy chỉnh.
-   **Tối ưu hóa Lộ trình Tự động:** Một tác vụ nền (Cron Job) tự động chạy định kỳ để:
    -   Gom các yêu cầu đang chờ.
    -   Gọi OSRM API để lấy ma trận thời gian di chuyển.
    -   Áp dụng thuật toán Tham lam để giải bài toán DARP, sắp xếp thứ tự các điểm Đón (PICKUP) và Trả (DROPOFF).
-   **Quản lý Trạng thái:** Hệ thống quản lý trạng thái của `Tài xế` (Rảnh/Bận), `Lộ trình` (Đang chạy/Hoàn thành) và `Booking` (Đang chờ/Đang di chuyển/Hoàn thành).
-   **Thông báo & Theo dõi Thời gian thực:**
    -   Tài xế nhận được lộ trình mới ngay lập tức qua WebSocket.
    -   Tài xế có thể gửi vị trí của mình, và hệ thống sẽ broadcast cho các khách hàng trên cùng chuyến đi.
-   **Dự đoán Lộ trình:** Hệ thống cung cấp các API để truy vấn thông tin dự đoán về thời gian đón và tổng thời gian di chuyển cho từng booking.

---

## 🖼️ Giao diện Client Mô phỏng

Một giao diện client đơn giản (`test-client.html`) được tạo ra để tương tác và kiểm thử trực quan toàn bộ hệ thống.

<div align="center">
  <figure>
    <img src="docs/imgs/admin-panel.jpeg" alt="Admin Panel Screenshot" width="600"/>
    <figcaption><b>Admin Panel:</b> Create drivers, users, and bookings. Monitor all system data in real time.</figcaption>
  </figure>
  <br/>
  <figure>
    <img src="docs/imgs/driver-panel.jpeg" alt="Driver Panel Screenshot" width="600"/>
    <figcaption><b>Driver Panel:</b> Drivers receive optimized routes, view assigned bookings, and update their location live.</figcaption>
  </figure>
  <br/>
  <figure>
    <img src="docs/imgs/cumstomer-panel.jpeg" alt="Customer Panel Screenshot" width="600"/>
    <figcaption><b>Customer Panel:</b> Customers track their ride, see driver location, and get trip predictions in real time.</figcaption>
  </figure>
</div>

---

## 🚀 Cài đặt và Cấu hình

Làm theo các bước sau để chạy dự án trên máy của bạn.

### 1. Yêu cầu cài đặt
-   [Node.js](https://nodejs.org/) (v20 trở lên)
-   [pnpm](https://pnpm.io/installation)
-   [Docker](https://www.docker.com/products/docker-desktop/) và Docker Compose

### 2. Cài đặt
1.  **Clone repository:**
    ```bash
    git clone [https://github.com/HuynhSang2005/simulated-ridepooling-system.git](https://github.com/HuynhSang2005/simulated-ridepooling-system.git)
    cd simulated-ridepooling-system
    ```

2.  **Cài đặt các dependencies:**
    ```bash
    pnpm install
    ```

3.  **Cấu hình môi trường:**
    Tạo một file `.env` ở thư mục gốc và sao chép nội dung từ `.env.example` (nếu có) hoặc sử dụng nội dung sau. File này chứa chuỗi kết nối đến database.
    ```env
    DATABASE_URL="postgresql://user_dev:password_dev@localhost:5003/ride_pooling?schema=public"
    ```
    *Lưu ý: Port là `5003` như đã định nghĩa trong `docker-compose.yml`.*

4.  **Khởi động Database:**
    Chạy Docker Compose để tạo và khởi động container PostgreSQL.
    ```bash
    docker-compose up -d
    ```

5.  **Áp dụng Database Schema:**
    Chạy Prisma migrate để tạo các bảng trong database dựa trên file `schema.prisma`.
    ```bash
    npx prisma migrate dev
    ```

6.  **Chạy ứng dụng:**
    ```bash
    pnpm run start:dev
    ```
    API server sẽ chạy tại `http://localhost:3000`.

---

## 🛠️ Tài liệu API

Dưới đây là các endpoint chính của hệ thống.

| Endpoint | Method | Mô tả | Request Body (JSON) |
| :--- | :--- | :--- | :--- |
| `/users` | `POST` | Tạo một người dùng mới. | `{ "name": "...", "email": "..." }` |
| `/users` | `GET` | Lấy danh sách tất cả người dùng. | - |
| `/users/:userId/active-booking`| `GET` | Lấy thông tin chuyến đi đang hoạt động của người dùng. | - |
| `/drivers` | `POST` | Tạo một tài xế mới. | `{ "name": "..." }` |
| `/drivers` | `GET` | Lấy danh sách tất cả tài xế. | - |
| `/drivers/:driverId/active-route`| `GET` | Lấy thông tin lộ trình đang hoạt động của tài xế. | - |
| `/bookings` | `POST` | Tạo một yêu cầu di chuyển mới. | `{ "userId", "pickupAddress", "pickupLocation", "dropoffAddress", "dropoffLocation" }` |
| `/bookings/:id/predictions` | `GET` | Lấy thông tin dự đoán về chuyến đi. | - |
| `/stops/:id/complete`| `PATCH`| Tài xế đánh dấu một điểm dừng đã hoàn thành. | - |


### WebSocket Events

-   **Client gửi đến Server:**
    -   `update_location`: Tài xế gửi vị trí hiện tại.
        -   Payload: `{ lat: number, lng: number }`
-   **Server gửi đến Client:**
    -   `new_route`: Gửi lộ trình mới cho tài xế.
        -   Payload: `Route` object với đầy đủ thông tin `stops`.
    -   `driver_location_updated`: Gửi vị trí của tài xế cho khách hàng.
        -   Payload: `{ driverId: string, location: { lat, lng } }`

---

## ⚙️ Ví dụ sử dụng (Kịch bản Mô phỏng)

Sử dụng file `test-client.html` để thực hiện kịch bản sau:

1.  **Chuẩn bị Dữ liệu (Panel Admin):**
    -   Nhấn "Tạo Driver Mới" để tạo một tài xế.
    -   Nhấn "Tạo User Mới" để tạo hai người dùng (User A, User B).
    -   Copy lại các ID được log ra.

2.  **Tạo Bookings (Panel Admin):**
    -   Sử dụng ID của User A để tạo một booking với điểm đón và trả tùy chỉnh.
    -   Sử dụng ID của User B để tạo một booking khác.

3.  **Hệ thống Tối ưu hóa:**
    -   Chờ tối đa 30 giây để Cron Job chạy.
    -   Quan sát log ở terminal của NestJS để xem quá trình tối ưu hóa và thứ tự các điểm `PICKUP`, `DROPOFF` được tạo ra.

4.  **Tài xế nhận Lộ trình (Panel Tài xế):**
    -   Dán `driverId` đã tạo vào và nhấn "Kết nối".
    -   Giao diện sẽ tự động hiển thị lộ trình chi tiết vừa được gán.

5.  **Mô phỏng Chuyến đi:**
    -   **Tài xế:** Nhấn "Bắt đầu gửi Vị trí".
    -   **Khách hàng (Panel Khách hàng):** Dán `userId` của User A vào và "Kết nối". Giao diện sẽ bắt đầu hiển thị vị trí của tài xế.
    -   **Tài xế:** Nhấn các nút "Hoàn thành" tương ứng với từng điểm dừng trên lộ trình. Trạng thái của booking, route và tài xế sẽ được cập nhật trong database.