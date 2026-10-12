-- Exact provider-order lookups must not scan the entire order history.
CREATE INDEX "Order_razorpayOrderId_idx" ON "Order"("razorpayOrderId");
-- Date-based reporting cannot use the status-first composite index efficiently.
CREATE INDEX "Order_createdAt_idx" ON "Order"("createdAt");
