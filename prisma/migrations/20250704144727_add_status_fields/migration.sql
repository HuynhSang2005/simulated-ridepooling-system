-- CreateEnum
CREATE TYPE "DriverStatus" AS ENUM ('IDLE', 'ON_ROUTE');

-- CreateEnum
CREATE TYPE "RouteStatus" AS ENUM ('PENDING_ASSIGNMENT', 'IN_PROGRESS', 'COMPLETED');

-- AlterTable
ALTER TABLE "Driver" ADD COLUMN     "status" "DriverStatus" NOT NULL DEFAULT 'IDLE';

-- AlterTable
ALTER TABLE "Route" ADD COLUMN     "status" "RouteStatus" NOT NULL DEFAULT 'PENDING_ASSIGNMENT';

-- AlterTable
ALTER TABLE "Stop" ADD COLUMN     "completedAt" TIMESTAMP(3);
