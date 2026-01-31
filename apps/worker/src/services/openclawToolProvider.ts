/**
 * OpenClaw Tool Data Provider
 *
 * Provides data for OpenClaw AI Assistant tool calls.
 * Connects to project's actual data (orders, products, leads, customers).
 *
 * Security:
 * - All requests are scoped to a specific projectId
 * - Read-only operations by default
 * - Write operations require explicit permission
 *
 * Part of SHEENAPPS_OPENCLAW_ANALYSIS.md Phase: Processing Pipeline
 */

import { getPool } from './databaseWrapper';
import { ServerLoggingService } from './serverLoggingService';

// =============================================================================
// Constants
// =============================================================================

/** Maximum number of filters allowed per query (DoS protection) */
const MAX_FILTERS_PER_QUERY = 10;

/** Maximum number of items in an IN clause */
const MAX_IN_CLAUSE_ITEMS = 50;

/** Default result limit if not specified */
const DEFAULT_RESULT_LIMIT = 10;

/** Maximum result limit (hard cap) */
const MAX_RESULT_LIMIT = 100;

/** Maximum offset for pagination */
const MAX_OFFSET = 1000;

/** Product search max limit */
const PRODUCT_SEARCH_MAX_LIMIT = 50;

/** Order lookup max limit */
const ORDER_LOOKUP_MAX_LIMIT = 20;

// =============================================================================
// Types
// =============================================================================

export interface ToolContext {
  projectId: string;
  sessionId: string;
  channel: string;
  senderId?: string;
  locale?: string;
}

export interface QueryParams {
  table: 'orders' | 'products' | 'leads' | 'customers';
  filters?: Array<{
    column: string;
    operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'like' | 'ilike' | 'in';
    value: unknown;
  }>;
  select?: string[];
  orderBy?: { column: string; direction: 'asc' | 'desc' };
  limit?: number;
  offset?: number;
}

export interface QueryResult {
  success: boolean;
  data?: unknown[];
  count?: number;
  error?: string;
}

export interface ProductSearchParams {
  query: string;
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  inStock?: boolean;
  limit?: number;
}

export interface OrderLookupParams {
  customerPhone?: string;
  customerEmail?: string;
  orderId?: string;
  status?: string;
  limit?: number;
}

export interface LeadCreateParams {
  name?: string;
  phone?: string;
  email?: string;
  source: string;
  notes?: string;
  metadata?: Record<string, unknown>;
}

// =============================================================================
// Tool Provider
// =============================================================================

export class OpenClawToolProvider {
  private logger: ServerLoggingService;

  // Allowed tables for queries (prevent SQL injection)
  private static readonly ALLOWED_TABLES = ['orders', 'products', 'leads', 'customers'];

  // Allowed columns per table (prevent SQL injection)
  private static readonly ALLOWED_COLUMNS: Record<string, string[]> = {
    orders: ['id', 'status', 'total', 'currency', 'customer_name', 'customer_phone', 'customer_email', 'items', 'created_at', 'updated_at'],
    products: ['id', 'name', 'description', 'price', 'currency', 'category', 'sku', 'stock_quantity', 'is_active', 'images', 'created_at'],
    leads: ['id', 'name', 'phone', 'email', 'source', 'status', 'notes', 'created_at', 'updated_at'],
    customers: ['id', 'name', 'phone', 'email', 'total_orders', 'total_spent', 'first_order_at', 'last_order_at', 'created_at']
  };

  constructor() {
    this.logger = ServerLoggingService.getInstance();
  }

  // ===========================================================================
  // Query Tool (Read-only)
  // ===========================================================================

  /**
   * Execute a generic query against project data
   * Phase 1 (Read-only): Only SELECT operations allowed
   */
  async executeQuery(ctx: ToolContext, params: QueryParams): Promise<QueryResult> {
    const pool = getPool();
    if (!pool) {
      return { success: false, error: 'Database not available' };
    }

    // Validate table name
    if (!OpenClawToolProvider.ALLOWED_TABLES.includes(params.table)) {
      return { success: false, error: `Invalid table: ${params.table}` };
    }

    // Build SELECT clause
    // Table is validated above, so allowedColumns is guaranteed to exist
    const allowedColumns = OpenClawToolProvider.ALLOWED_COLUMNS[params.table]!;
    const selectColumns = params.select
      ? params.select.filter(col => allowedColumns.includes(col))
      : [...allowedColumns]; // Create a copy to avoid mutation

    if (selectColumns.length === 0) {
      return { success: false, error: 'No valid columns specified' };
    }

    // Validate filter count (DoS protection)
    if (params.filters && params.filters.length > MAX_FILTERS_PER_QUERY) {
      return { success: false, error: `Too many filters (max ${MAX_FILTERS_PER_QUERY})` };
    }

    const client = await pool.connect();
    try {
      // Build query
      let query = `SELECT ${selectColumns.join(', ')} FROM ${params.table} WHERE project_id = $1`;
      const values: unknown[] = [ctx.projectId];
      let paramIndex = 2;

      // Add filters
      if (params.filters && params.filters.length > 0) {
        for (const filter of params.filters) {
          // Validate column name
          if (!allowedColumns.includes(filter.column)) {
            continue; // Skip invalid columns
          }

          const operator = this.getOperator(filter.operator);
          if (operator === 'IN') {
            const rawArray = Array.isArray(filter.value) ? filter.value : [filter.value];
            // Limit IN clause size (DoS protection)
            const valueArray = rawArray.slice(0, MAX_IN_CLAUSE_ITEMS);
            const placeholders = valueArray.map((_, i) => `$${paramIndex + i}`).join(', ');
            query += ` AND ${filter.column} IN (${placeholders})`;
            values.push(...valueArray);
            paramIndex += valueArray.length;
          } else {
            query += ` AND ${filter.column} ${operator} $${paramIndex}`;
            values.push(filter.value);
            paramIndex++;
          }
        }
      }

      // Add ORDER BY
      if (params.orderBy && allowedColumns.includes(params.orderBy.column)) {
        const direction = params.orderBy.direction === 'desc' ? 'DESC' : 'ASC';
        query += ` ORDER BY ${params.orderBy.column} ${direction}`;
      } else {
        query += ` ORDER BY created_at DESC`;
      }

      // Add LIMIT and OFFSET
      const limit = Math.min(params.limit || DEFAULT_RESULT_LIMIT, MAX_RESULT_LIMIT);
      query += ` LIMIT ${limit}`;

      if (params.offset && params.offset > 0) {
        query += ` OFFSET ${Math.min(params.offset, MAX_OFFSET)}`;
      }

      const result = await client.query(query, values);

      // Log tool usage
      await this.logToolUsage(ctx, 'sheenapps.query', {
        table: params.table,
        filterCount: params.filters?.length || 0,
        resultCount: result.rows.length
      });

      return {
        success: true,
        data: result.rows,
        count: result.rows.length
      };
    } catch (error) {
      this.logger.logServerEvent('error', 'error', 'OpenClaw query failed', {
        projectId: ctx.projectId,
        table: params.table,
        error: (error as Error).message
      }).catch(() => { /* non-critical */ });
      return {
        success: false,
        error: 'Query failed'
      };
    } finally {
      client.release();
    }
  }

  // ===========================================================================
  // Product Search Tool
  // ===========================================================================

  /**
   * Search products with text search and filters
   */
  async searchProducts(ctx: ToolContext, params: ProductSearchParams): Promise<QueryResult> {
    const pool = getPool();
    if (!pool) {
      return { success: false, error: 'Database not available' };
    }

    const client = await pool.connect();
    try {
      let query = `
        SELECT
          id, name, description, price, currency, category, sku,
          stock_quantity, is_active, images
        FROM products
        WHERE project_id = $1
          AND is_active = true
      `;
      const values: unknown[] = [ctx.projectId];
      let paramIndex = 2;

      // Text search
      if (params.query && params.query.trim()) {
        query += ` AND (name ILIKE $${paramIndex} OR description ILIKE $${paramIndex} OR sku ILIKE $${paramIndex})`;
        values.push(`%${params.query}%`);
        paramIndex++;
      }

      // Category filter
      if (params.category) {
        query += ` AND category = $${paramIndex}`;
        values.push(params.category);
        paramIndex++;
      }

      // Price filters
      if (params.minPrice !== undefined) {
        query += ` AND price >= $${paramIndex}`;
        values.push(params.minPrice);
        paramIndex++;
      }

      if (params.maxPrice !== undefined) {
        query += ` AND price <= $${paramIndex}`;
        values.push(params.maxPrice);
        paramIndex++;
      }

      // Stock filter
      if (params.inStock === true) {
        query += ` AND stock_quantity > 0`;
      }

      // Order by relevance (simple: exact name match first, then by name)
      query += ` ORDER BY
        CASE WHEN name ILIKE $${paramIndex} THEN 0 ELSE 1 END,
        name ASC
      `;
      values.push(params.query || '');
      paramIndex++;

      // Limit
      const limit = Math.min(params.limit || DEFAULT_RESULT_LIMIT, PRODUCT_SEARCH_MAX_LIMIT);
      query += ` LIMIT ${limit}`;

      const result = await client.query(query, values);

      // Log tool usage
      await this.logToolUsage(ctx, 'sheenapps.products.search', {
        query: params.query,
        category: params.category,
        resultCount: result.rows.length
      });

      return {
        success: true,
        data: result.rows,
        count: result.rows.length
      };
    } catch (error) {
      this.logger.logServerEvent('error', 'error', 'OpenClaw product search failed', {
        projectId: ctx.projectId,
        query: params.query,
        error: (error as Error).message
      }).catch(() => { /* non-critical */ });
      return {
        success: false,
        error: 'Product search failed'
      };
    } finally {
      client.release();
    }
  }

  // ===========================================================================
  // Order Lookup Tool
  // ===========================================================================

  /**
   * Look up orders by customer phone, email, or order ID
   */
  async lookupOrders(ctx: ToolContext, params: OrderLookupParams): Promise<QueryResult> {
    const pool = getPool();
    if (!pool) {
      return { success: false, error: 'Database not available' };
    }

    // Must have at least one lookup parameter
    if (!params.customerPhone && !params.customerEmail && !params.orderId) {
      return {
        success: false,
        error: 'Must provide customerPhone, customerEmail, or orderId'
      };
    }

    const client = await pool.connect();
    try {
      let query = `
        SELECT
          id, status, total, currency,
          customer_name, customer_phone, customer_email,
          items, shipping_address, tracking_number,
          created_at, updated_at
        FROM orders
        WHERE project_id = $1
      `;
      const values: unknown[] = [ctx.projectId];
      let paramIndex = 2;

      // Add lookup filters (orderId, phone, email are OR'ed - any match works)
      const lookupConditions: string[] = [];

      if (params.orderId) {
        lookupConditions.push(`id = $${paramIndex}`);
        values.push(params.orderId);
        paramIndex++;
      }

      if (params.customerPhone) {
        // Normalize phone number (remove spaces, dashes)
        const normalizedPhone = params.customerPhone.replace(/[\s\-\(\)]/g, '');
        lookupConditions.push(`REPLACE(REPLACE(REPLACE(REPLACE(customer_phone, ' ', ''), '-', ''), '(', ''), ')', '') LIKE $${paramIndex}`);
        values.push(`%${normalizedPhone}%`);
        paramIndex++;
      }

      if (params.customerEmail) {
        lookupConditions.push(`customer_email ILIKE $${paramIndex}`);
        values.push(params.customerEmail);
        paramIndex++;
      }

      // Apply lookup conditions (OR logic - find by any identifier)
      if (lookupConditions.length > 0) {
        query += ` AND (${lookupConditions.join(' OR ')})`;
      }

      // Apply status filter separately (AND logic - additional filter)
      if (params.status) {
        query += ` AND status = $${paramIndex}`;
        values.push(params.status);
        paramIndex++;
      }

      // Order by most recent first
      query += ` ORDER BY created_at DESC`;

      // Limit
      const limit = Math.min(params.limit || 5, ORDER_LOOKUP_MAX_LIMIT);
      query += ` LIMIT ${limit}`;

      const result = await client.query(query, values);

      // Format orders for AI consumption
      const formattedOrders = result.rows.map(order => ({
        id: order.id,
        status: order.status,
        total: `${order.total} ${order.currency}`,
        customerName: order.customer_name,
        customerPhone: order.customer_phone,
        itemCount: order.items?.length || 0,
        items: order.items?.slice(0, 5), // First 5 items only
        trackingNumber: order.tracking_number,
        createdAt: order.created_at
      }));

      // Log tool usage
      await this.logToolUsage(ctx, 'sheenapps.orders.lookup', {
        hasPhone: !!params.customerPhone,
        hasEmail: !!params.customerEmail,
        hasOrderId: !!params.orderId,
        resultCount: result.rows.length
      });

      return {
        success: true,
        data: formattedOrders,
        count: formattedOrders.length
      };
    } catch (error) {
      this.logger.logServerEvent('error', 'error', 'OpenClaw order lookup failed', {
        projectId: ctx.projectId,
        hasPhone: !!params.customerPhone,
        hasEmail: !!params.customerEmail,
        hasOrderId: !!params.orderId,
        error: (error as Error).message
      }).catch(() => { /* non-critical */ });
      return {
        success: false,
        error: 'Order lookup failed'
      };
    } finally {
      client.release();
    }
  }

  // ===========================================================================
  // Lead Creation Tool (Phase 2 - Write Operation)
  // ===========================================================================

  /**
   * Create a new lead from AI conversation
   * Phase 2: This is a write operation, requires explicit permission
   */
  async createLead(ctx: ToolContext, params: LeadCreateParams): Promise<QueryResult> {
    const pool = getPool();
    if (!pool) {
      return { success: false, error: 'Database not available' };
    }

    // Must have at least name or phone
    if (!params.name && !params.phone && !params.email) {
      return {
        success: false,
        error: 'Must provide at least name, phone, or email'
      };
    }

    const client = await pool.connect();
    try {
      const result = await client.query(`
        INSERT INTO leads (
          project_id,
          name,
          phone,
          email,
          source,
          notes,
          metadata
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7
        )
        ON CONFLICT (project_id, phone) WHERE phone IS NOT NULL
        DO UPDATE SET
          name = COALESCE(EXCLUDED.name, leads.name),
          email = COALESCE(EXCLUDED.email, leads.email),
          notes = CASE
            WHEN leads.notes IS NULL THEN EXCLUDED.notes
            WHEN EXCLUDED.notes IS NULL THEN leads.notes
            ELSE leads.notes || E'\\n---\\n' || EXCLUDED.notes
          END,
          updated_at = NOW()
        RETURNING id, name, phone, email, source, created_at
      `, [
        ctx.projectId,
        params.name || null,
        params.phone || null,
        params.email || null,
        params.source || `openclaw:${ctx.channel}`,
        params.notes || null,
        JSON.stringify({
          ...params.metadata,
          capturedBy: 'openclaw',
          channel: ctx.channel,
          sessionId: ctx.sessionId,
          senderId: ctx.senderId
        })
      ]);

      const lead = result.rows[0];

      // Log tool usage
      await this.logToolUsage(ctx, 'sheenapps.leads.create', {
        leadId: lead?.id,
        hasPhone: !!params.phone,
        hasEmail: !!params.email
      });

      return {
        success: true,
        data: [lead],
        count: 1
      };
    } catch (error) {
      this.logger.logServerEvent('error', 'error', 'OpenClaw lead creation failed', {
        projectId: ctx.projectId,
        channel: ctx.channel,
        hasPhone: !!params.phone,
        hasEmail: !!params.email,
        error: (error as Error).message
      }).catch(() => { /* non-critical */ });
      return {
        success: false,
        error: 'Lead creation failed'
      };
    } finally {
      client.release();
    }
  }

  // ===========================================================================
  // Helper Methods
  // ===========================================================================

  private getOperator(op: string): string {
    const operators: Record<string, string> = {
      'eq': '=',
      'neq': '!=',
      'gt': '>',
      'gte': '>=',
      'lt': '<',
      'lte': '<=',
      'like': 'LIKE',
      'ilike': 'ILIKE',
      'in': 'IN'
    };
    return operators[op] || '=';
  }

  private async logToolUsage(
    ctx: ToolContext,
    toolName: string,
    metadata: Record<string, unknown>
  ): Promise<void> {
    const pool = getPool();
    if (!pool) return;

    try {
      await pool.query(`
        INSERT INTO openclaw_tool_usage (
          project_id,
          session_id,
          channel,
          sender_id,
          tool_name,
          metadata,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
      `, [
        ctx.projectId,
        ctx.sessionId,
        ctx.channel,
        ctx.senderId || null,
        toolName,
        JSON.stringify(metadata)
      ]);
    } catch (error) {
      // Non-critical - log but don't throw
      this.logger.logServerEvent('error', 'warn', 'Failed to log OpenClaw tool usage', {
        projectId: ctx.projectId,
        toolName,
        error: (error as Error).message
      }).catch(() => { /* non-critical */ });
    }
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let providerInstance: OpenClawToolProvider | null = null;

/**
 * Get the OpenClaw Tool Provider instance
 */
export function getOpenClawToolProvider(): OpenClawToolProvider {
  if (!providerInstance) {
    providerInstance = new OpenClawToolProvider();
  }
  return providerInstance;
}
