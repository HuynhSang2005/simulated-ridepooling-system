/*
  Warnings:

  - Added the required column `dropoffAddress` to the `Booking` table without a default value. This is not possible if the table is not empty.
  - Added the required column `dropoffLocation` to the `Booking` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Booking` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "dropoffAddress" TEXT NOT NULL,
ADD COLUMN     "dropoffETA" TIMESTAMP(3),
ADD COLUMN     "dropoffLocation" JSONB NOT NULL,
ADD COLUMN     "pickupETA" TIMESTAMP(3),
ADD COLUMN     "tripDuration" INTEGER,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;
