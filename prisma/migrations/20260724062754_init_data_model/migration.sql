-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "setupPath" TEXT NOT NULL,
    "timeZone" TEXT NOT NULL DEFAULT 'Pacific/Auckland',
    "opensAt" TIMESTAMPTZ(3) NOT NULL,
    "revealAt" TIMESTAMPTZ(3) NOT NULL,
    "purgeAfter" TIMESTAMPTZ(3) NOT NULL,
    "pairingFrozenAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submissions" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "deviceToken" TEXT NOT NULL,
    "recoveryCode" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "request" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "groups" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "memberSubmissionIds" TEXT[],
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "groups_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sessions_setupPath_key" ON "sessions"("setupPath");

-- CreateIndex
CREATE INDEX "submissions_sessionId_idx" ON "submissions"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "submissions_sessionId_deviceToken_key" ON "submissions"("sessionId", "deviceToken");

-- CreateIndex
CREATE UNIQUE INDEX "submissions_sessionId_recoveryCode_key" ON "submissions"("sessionId", "recoveryCode");

-- CreateIndex
CREATE INDEX "groups_sessionId_idx" ON "groups"("sessionId");

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "groups" ADD CONSTRAINT "groups_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
