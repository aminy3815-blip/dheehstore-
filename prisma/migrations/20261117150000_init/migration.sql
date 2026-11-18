-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('CUSTOMER', 'PRODUCER', 'OWNER', 'ADMIN');

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "ComplaintStatus" AS ENUM ('OPEN', 'INVESTIGATING', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "ProducerStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "ProductCondition" AS ENUM ('NEW', 'USED');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'CONFIRMED', 'PREPARING', 'READY_FOR_PICKUP', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED', 'RETURNED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('TELEBIRR', 'CHAPA', 'BANK_TRANSFER', 'COD', 'STRIPE');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('UNPAID', 'PENDING', 'PAID', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "FinancialStatus" AS ENUM ('PENDING', 'AVAILABLE', 'SETTLED', 'REVERSED');

-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'REVERSED');

-- CreateEnum
CREATE TYPE "DestinationStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED', 'DISABLED');

-- CreateEnum
CREATE TYPE "WeeklyCommissionStatus" AS ENUM ('PENDING', 'AWAITING_VERIFICATION', 'PAID', 'OVERDUE', 'REJECTED');

-- CreateEnum
CREATE TYPE "CommissionSubmissionStatus" AS ENUM ('PENDING', 'AWAITING_VERIFICATION', 'CONFIRMED', 'REJECTED');

-- CreateEnum
CREATE TYPE "CommissionPaymentMethod" AS ENUM ('TELEBIRR', 'EBIRR', 'BANK_TRANSFER');

-- CreateEnum
CREATE TYPE "CommissionReminderKind" AS ENUM ('STATEMENT_GENERATED', 'DEADLINE_UPCOMING', 'DUE_TODAY', 'OVERDUE');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'CUSTOMER',
    "accountStatus" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "suspensionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shop" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "district" TEXT,
    "logoUrl" TEXT,
    "status" "ProducerStatus" NOT NULL DEFAULT 'PENDING',
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "codEnabled" BOOLEAN NOT NULL DEFAULT true,
    "deliveryFee" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Shop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "icon" TEXT NOT NULL DEFAULT '✦',

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "compareAtPrice" INTEGER,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "condition" "ProductCondition" NOT NULL DEFAULT 'NEW',
    "available" BOOLEAN NOT NULL DEFAULT true,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unitCostSantim" INTEGER,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Address" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "district" TEXT,
    "neighborhood" TEXT,
    "street" TEXT,
    "building" TEXT,
    "instructions" TEXT,
    "phone" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Address_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "addressId" TEXT NOT NULL,
    "subtotal" INTEGER NOT NULL,
    "deliveryFee" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "paymentMethod" "PaymentMethod" NOT NULL,
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "transactionRef" TEXT,
    "chapaPaymentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unitPrice" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitCostSantim" INTEGER,
    "discountSantim" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "verifiedPurchase" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Complaint" (
    "id" TEXT NOT NULL,
    "reporterId" TEXT,
    "subject" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "orderNumber" TEXT,
    "status" "ComplaintStatus" NOT NULL DEFAULT 'OPEN',
    "resolution" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Complaint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "href" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "details" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketplaceSettings" (
    "id" TEXT NOT NULL DEFAULT 'marketplace',
    "platformName" TEXT NOT NULL DEFAULT 'DHEEHSTORE',
    "globalCommissionBps" INTEGER NOT NULL DEFAULT 0,
    "netProfitCommissionBps" INTEGER NOT NULL DEFAULT 300,
    "supportEmail" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketplaceSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CategoryCommission" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "commissionBps" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CategoryCommission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChapaPayment" (
    "id" TEXT NOT NULL,
    "txRef" TEXT NOT NULL,
    "chapaReference" TEXT,
    "checkoutUrl" TEXT,
    "amountSantim" INTEGER NOT NULL,
    "feeSantim" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChapaPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayoutDestination" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "destinationType" TEXT NOT NULL,
    "accountHolderEncrypted" TEXT NOT NULL,
    "accountNumberEncrypted" TEXT NOT NULL,
    "accountLast4" TEXT NOT NULL,
    "bankCode" TEXT,
    "chapaSubaccountId" TEXT,
    "status" "DestinationStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayoutDestination_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialTransaction" (
    "id" TEXT NOT NULL,
    "orderId" TEXT,
    "orderItemId" TEXT,
    "paymentId" TEXT,
    "customerId" TEXT,
    "sellerId" TEXT,
    "productId" TEXT,
    "kind" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "grossSaleSantim" INTEGER NOT NULL DEFAULT 0,
    "productCostSantim" INTEGER NOT NULL DEFAULT 0,
    "eligibleProfitSantim" INTEGER NOT NULL DEFAULT 0,
    "commissionSantim" INTEGER NOT NULL DEFAULT 0,
    "sellerAmountSantim" INTEGER NOT NULL DEFAULT 0,
    "processingFeeSantim" INTEGER NOT NULL DEFAULT 0,
    "refundSantim" INTEGER NOT NULL DEFAULT 0,
    "settlementStatus" "FinancialStatus" NOT NULL DEFAULT 'PENDING',
    "reversesId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancialTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerPosting" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "account" TEXT NOT NULL,
    "debitSantim" INTEGER NOT NULL DEFAULT 0,
    "creditSantim" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerPosting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayoutRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "destinationId" TEXT NOT NULL,
    "amountSantim" INTEGER NOT NULL,
    "reference" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "providerReference" TEXT,
    "status" "PayoutStatus" NOT NULL DEFAULT 'PENDING',
    "failureReason" TEXT,
    "transactionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "PayoutRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialWallet" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pendingSantim" INTEGER NOT NULL DEFAULT 0,
    "availableSantim" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialWallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionSale" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "eligibleAt" TIMESTAMP(3) NOT NULL,
    "saleSantim" INTEGER NOT NULL,
    "commissionSantim" INTEGER NOT NULL,
    "refundedSantim" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommissionSale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeeklyCommissionStatement" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "deadline" TIMESTAMP(3) NOT NULL,
    "salesSantim" INTEGER NOT NULL,
    "commissionSantim" INTEGER NOT NULL,
    "carriedSantim" INTEGER NOT NULL DEFAULT 0,
    "totalDueSantim" INTEGER NOT NULL,
    "status" "WeeklyCommissionStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WeeklyCommissionStatement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionPaymentSubmission" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "submitterId" TEXT NOT NULL,
    "reviewerId" TEXT,
    "destinationId" TEXT NOT NULL,
    "destinationProvider" TEXT NOT NULL,
    "destinationLast4" TEXT NOT NULL,
    "method" "CommissionPaymentMethod" NOT NULL,
    "amountSantim" INTEGER NOT NULL,
    "confirmedSantim" INTEGER NOT NULL DEFAULT 0,
    "reference" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "receipt" BYTEA,
    "receiptMimeType" TEXT,
    "receiptFileName" TEXT,
    "status" "CommissionSubmissionStatus" NOT NULL DEFAULT 'PENDING',
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "CommissionPaymentSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionPaymentAllocation" (
    "id" TEXT NOT NULL,
    "statementId" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "amountSantim" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommissionPaymentAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionCredit" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "refundSantim" INTEGER NOT NULL,
    "commissionCreditSantim" INTEGER NOT NULL,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommissionCredit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionCreditAllocation" (
    "id" TEXT NOT NULL,
    "statementId" TEXT NOT NULL,
    "creditId" TEXT NOT NULL,
    "amountSantim" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommissionCreditAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionReminder" (
    "id" TEXT NOT NULL,
    "statementId" TEXT NOT NULL,
    "kind" "CommissionReminderKind" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommissionReminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OwnerCommissionDestination" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "accountHolderEncrypted" TEXT NOT NULL,
    "accountNumberEncrypted" TEXT NOT NULL,
    "accountLast4" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OwnerCommissionDestination_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Shop_ownerId_key" ON "Shop"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "Shop_slug_key" ON "Shop"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Category_name_key" ON "Category"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Category_slug_key" ON "Category"("slug");

-- CreateIndex
CREATE INDEX "Product_categoryId_available_idx" ON "Product"("categoryId", "available");

-- CreateIndex
CREATE INDEX "Product_name_idx" ON "Product"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Product_shopId_slug_key" ON "Product"("shopId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "Order_orderNumber_key" ON "Order"("orderNumber");

-- CreateIndex
CREATE INDEX "Order_paymentStatus_createdAt_idx" ON "Order"("paymentStatus", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Review_userId_productId_key" ON "Review"("userId", "productId");

-- CreateIndex
CREATE INDEX "Complaint_status_createdAt_idx" ON "Complaint"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_createdAt_idx" ON "Notification"("userId", "readAt", "createdAt");

-- CreateIndex
CREATE INDEX "ActivityLog_createdAt_idx" ON "ActivityLog"("createdAt");

-- CreateIndex
CREATE INDEX "ActivityLog_entity_entityId_idx" ON "ActivityLog"("entity", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "CategoryCommission_categoryId_key" ON "CategoryCommission"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "ChapaPayment_txRef_key" ON "ChapaPayment"("txRef");

-- CreateIndex
CREATE UNIQUE INDEX "ChapaPayment_chapaReference_key" ON "ChapaPayment"("chapaReference");

-- CreateIndex
CREATE INDEX "ChapaPayment_status_createdAt_idx" ON "ChapaPayment"("status", "createdAt");

-- CreateIndex
CREATE INDEX "PayoutDestination_userId_status_idx" ON "PayoutDestination"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialTransaction_orderItemId_key" ON "FinancialTransaction"("orderItemId");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialTransaction_reference_key" ON "FinancialTransaction"("reference");

-- CreateIndex
CREATE INDEX "FinancialTransaction_sellerId_settlementStatus_createdAt_idx" ON "FinancialTransaction"("sellerId", "settlementStatus", "createdAt");

-- CreateIndex
CREATE INDEX "FinancialTransaction_kind_createdAt_idx" ON "FinancialTransaction"("kind", "createdAt");

-- CreateIndex
CREATE INDEX "FinancialTransaction_orderId_idx" ON "FinancialTransaction"("orderId");

-- CreateIndex
CREATE INDEX "LedgerPosting_account_createdAt_idx" ON "LedgerPosting"("account", "createdAt");

-- CreateIndex
CREATE INDEX "LedgerPosting_transactionId_idx" ON "LedgerPosting"("transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "PayoutRequest_reference_key" ON "PayoutRequest"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "PayoutRequest_idempotencyKey_key" ON "PayoutRequest"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "PayoutRequest_transactionId_key" ON "PayoutRequest"("transactionId");

-- CreateIndex
CREATE INDEX "PayoutRequest_userId_status_createdAt_idx" ON "PayoutRequest"("userId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialWallet_userId_key" ON "FinancialWallet"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CommissionSale_orderItemId_key" ON "CommissionSale"("orderItemId");

-- CreateIndex
CREATE INDEX "CommissionSale_shopId_periodStart_idx" ON "CommissionSale"("shopId", "periodStart");

-- CreateIndex
CREATE INDEX "CommissionSale_eligibleAt_idx" ON "CommissionSale"("eligibleAt");

-- CreateIndex
CREATE INDEX "WeeklyCommissionStatement_shopId_deadline_status_idx" ON "WeeklyCommissionStatement"("shopId", "deadline", "status");

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyCommissionStatement_shopId_periodStart_key" ON "WeeklyCommissionStatement"("shopId", "periodStart");

-- CreateIndex
CREATE UNIQUE INDEX "CommissionPaymentSubmission_reference_key" ON "CommissionPaymentSubmission"("reference");

-- CreateIndex
CREATE INDEX "CommissionPaymentSubmission_shopId_status_createdAt_idx" ON "CommissionPaymentSubmission"("shopId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CommissionPaymentSubmission_shopId_idempotencyKey_key" ON "CommissionPaymentSubmission"("shopId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "CommissionPaymentAllocation_statementId_submissionId_key" ON "CommissionPaymentAllocation"("statementId", "submissionId");

-- CreateIndex
CREATE UNIQUE INDEX "CommissionCredit_reference_key" ON "CommissionCredit"("reference");

-- CreateIndex
CREATE INDEX "CommissionCredit_shopId_createdAt_idx" ON "CommissionCredit"("shopId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CommissionCreditAllocation_statementId_creditId_key" ON "CommissionCreditAllocation"("statementId", "creditId");

-- CreateIndex
CREATE UNIQUE INDEX "CommissionReminder_statementId_kind_key" ON "CommissionReminder"("statementId", "kind");

-- CreateIndex
CREATE INDEX "OwnerCommissionDestination_isDefault_idx" ON "OwnerCommissionDestination"("isDefault");

-- AddForeignKey
ALTER TABLE "Shop" ADD CONSTRAINT "Shop_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Address" ADD CONSTRAINT "Address_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_addressId_fkey" FOREIGN KEY ("addressId") REFERENCES "Address"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_chapaPaymentId_fkey" FOREIGN KEY ("chapaPaymentId") REFERENCES "ChapaPayment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Complaint" ADD CONSTRAINT "Complaint_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoryCommission" ADD CONSTRAINT "CategoryCommission_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoutDestination" ADD CONSTRAINT "PayoutDestination_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialTransaction" ADD CONSTRAINT "FinancialTransaction_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialTransaction" ADD CONSTRAINT "FinancialTransaction_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialTransaction" ADD CONSTRAINT "FinancialTransaction_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "ChapaPayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialTransaction" ADD CONSTRAINT "FinancialTransaction_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialTransaction" ADD CONSTRAINT "FinancialTransaction_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "Shop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialTransaction" ADD CONSTRAINT "FinancialTransaction_reversesId_fkey" FOREIGN KEY ("reversesId") REFERENCES "FinancialTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerPosting" ADD CONSTRAINT "LedgerPosting_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "FinancialTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoutRequest" ADD CONSTRAINT "PayoutRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoutRequest" ADD CONSTRAINT "PayoutRequest_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "PayoutDestination"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoutRequest" ADD CONSTRAINT "PayoutRequest_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "FinancialTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialWallet" ADD CONSTRAINT "FinancialWallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionSale" ADD CONSTRAINT "CommissionSale_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionSale" ADD CONSTRAINT "CommissionSale_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionSale" ADD CONSTRAINT "CommissionSale_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionSale" ADD CONSTRAINT "CommissionSale_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyCommissionStatement" ADD CONSTRAINT "WeeklyCommissionStatement_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionPaymentSubmission" ADD CONSTRAINT "CommissionPaymentSubmission_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionPaymentSubmission" ADD CONSTRAINT "CommissionPaymentSubmission_submitterId_fkey" FOREIGN KEY ("submitterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionPaymentSubmission" ADD CONSTRAINT "CommissionPaymentSubmission_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionPaymentSubmission" ADD CONSTRAINT "CommissionPaymentSubmission_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "OwnerCommissionDestination"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionPaymentAllocation" ADD CONSTRAINT "CommissionPaymentAllocation_statementId_fkey" FOREIGN KEY ("statementId") REFERENCES "WeeklyCommissionStatement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionPaymentAllocation" ADD CONSTRAINT "CommissionPaymentAllocation_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "CommissionPaymentSubmission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionCredit" ADD CONSTRAINT "CommissionCredit_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionCredit" ADD CONSTRAINT "CommissionCredit_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionCredit" ADD CONSTRAINT "CommissionCredit_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "CommissionSale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionCredit" ADD CONSTRAINT "CommissionCredit_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionCreditAllocation" ADD CONSTRAINT "CommissionCreditAllocation_statementId_fkey" FOREIGN KEY ("statementId") REFERENCES "WeeklyCommissionStatement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionCreditAllocation" ADD CONSTRAINT "CommissionCreditAllocation_creditId_fkey" FOREIGN KEY ("creditId") REFERENCES "CommissionCredit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionReminder" ADD CONSTRAINT "CommissionReminder_statementId_fkey" FOREIGN KEY ("statementId") REFERENCES "WeeklyCommissionStatement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

