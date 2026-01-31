/**
 * DEPRECATED: Transaction Service Stub
 * 
 * This service has been replaced by worker-based payment processing.
 * Transaction management should now be handled via worker APIs.
 * 
 * This stub exists to prevent build errors during migration.
 * TODO: Update transaction-related code to use worker APIs and remove this stub.
 */

export class TransactionService {
  async recordTransaction(data: any) {
    // Return success - this functionality moved to worker
    return {
      success: true,
      transactionId: 'stub-transaction'
    }
  }

  async getTransactionHistory(userId: string, limit: number = 50) {
    // Return empty history - this functionality moved to worker
    return []
  }
}