-- AlterEnum
ALTER TYPE "TripStatus" ADD VALUE 'FAILED';

-- AlterTable
ALTER TABLE "trips" ADD COLUMN     "currentStep" TEXT,
ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "longitude" DOUBLE PRECISION;
