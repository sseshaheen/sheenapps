import { Pool } from 'pg';
import type { TaskPlan, Task, TaskDependency } from '../types/modular';
import { ulid } from 'ulid';

// Create pool lazily to ensure env vars are loaded
let pool: Pool | null | undefined = undefined;

function getPool(): Pool | null {
  if (pool === undefined) {
    pool = process.env.DATABASE_URL ? new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000, // 10 seconds for cloud DB
      query_timeout: 30000, // 30 seconds for query timeout
    }) : null;
  }
  return pool;
}

interface BuildRecord {
  id?: string;
  buildId: string;
  userId: string;
  projectId: string;
  prompt: string;
  status: 'planning' | 'executing' | 'completed' | 'failed';
  planId?: string;
  startedAt: Date;
  finishedAt?: Date;
  error?: string;
  metrics?: any;
}

export class TaskDatabase {
  // Create a new build record
  async createBuild(build: Omit<BuildRecord, 'id' | 'startedAt'>): Promise<BuildRecord> {
    const dbPool = getPool();
    if (!dbPool) {
      throw new Error('Database not configured');
    }

    const query = `
      INSERT INTO project_build_records (
        build_id, user_id, project_id, prompt, status, plan_id
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;

    const values = [
      build.buildId,
      build.userId,
      build.projectId,
      build.prompt,
      build.status,
      build.planId || null
    ];

    try {
      const result = await dbPool.query(query, values);
      return result.rows[0];
    } catch (error) {
      console.error('Error creating build record:', error);
      throw error;
    }
  }

  // Update build record
  async updateBuild(buildId: string, updates: Partial<BuildRecord>): Promise<void> {
    const dbPool = getPool();
    if (!dbPool) {
      throw new Error('Database not configured');
    }

    const allowedFields = ['status', 'plan_id', 'finished_at', 'error', 'metrics'];
    const updateFields: string[] = [];
    const updateValues: any[] = [];
    let paramIndex = 1;

    Object.entries(updates).forEach(([key, value]) => {
      const dbField = key.replace(/([A-Z])/g, '_$1').toLowerCase();
      if (allowedFields.includes(dbField)) {
        updateFields.push(`${dbField} = $${paramIndex}`);
        updateValues.push(value);
        paramIndex++;
      }
    });

    if (updateFields.length === 0) {
      return;
    }

    updateValues.push(buildId);
    const query = `
      UPDATE project_build_records
      SET ${updateFields.join(', ')}, updated_at = NOW()
      WHERE build_id = $${paramIndex}
    `;

    try {
      await dbPool.query(query, updateValues);
    } catch (error) {
      console.error('Error updating build record:', error);
      throw error;
    }
  }

  // Create task plan
  async createTaskPlan(plan: TaskPlan): Promise<void> {
    const dbPool = getPool();
    if (!dbPool) {
      throw new Error('Database not configured');
    }

    const client = await dbPool.connect();
    try {
      await client.query('BEGIN');

      // Insert plan
      const planQuery = `
        INSERT INTO worker_task_plans (
          plan_id, project_id, user_id, build_id, original_prompt,
          estimated_duration, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      `;

      await client.query(planQuery, [
        plan.id,
        plan.projectId,
        plan.userId,
        plan.buildId,
        plan.originalPrompt,
        plan.estimatedDuration,
        JSON.stringify(plan.metadata)
      ]);

      // Insert tasks
      for (const task of plan.tasks) {
        const taskQuery = `
          INSERT INTO worker_tasks (
            task_id, plan_id, build_id, type, name, description,
            estimated_duration, priority, status, input, fingerprint
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        `;

        await client.query(taskQuery, [
          task.id,
          plan.id,
          plan.buildId,
          task.type,
          task.name,
          task.description,
          task.estimatedDuration,
          task.priority,
          task.status,
          JSON.stringify(task.input),
          task.fingerprint || null
        ]);
      }

      // Insert dependencies
      for (const dep of plan.dependencies) {
        for (const dependsOn of dep.dependsOn) {
          const depQuery = `
            INSERT INTO worker_task_dependencies (task_id, depends_on)
            VALUES ($1, $2)
          `;

          await client.query(depQuery, [dep.taskId, dependsOn]);
        }
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error creating task plan:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  // Create a single task
  async createTask(task: Task): Promise<void> {
    const dbPool = getPool();
    if (!dbPool) {
      throw new Error('Database not configured');
    }

    const query = `
      INSERT INTO worker_tasks (
        task_id, plan_id, build_id, type, name, description,
        estimated_duration, priority, status, input, started_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `;

    const values = [
      task.id,
      task.planId,
      task.planId, // Using planId as buildId for now
      task.type,
      task.name,
      task.description,
      task.estimatedDuration,
      task.priority,
      task.status,
      JSON.stringify(task.input),
      task.startedAt || new Date()
    ];

    try {
      await dbPool.query(query, values);
    } catch (error) {
      console.error('Error creating task:', error);
      throw error;
    }
  }

  // Update task
  async updateTask(taskId: string, updates: Partial<Task> & { 
    error?: string; 
    duration?: number;
    tokenUsage?: any;
  }): Promise<void> {
    const dbPool = getPool();
    if (!dbPool) {
      throw new Error('Database not configured');
    }

    const allowedFields = [
      'status', 'output', 'error', 'finished_at', 
      'duration_ms', 'token_usage'
    ];
    const updateFields: string[] = [];
    const updateValues: any[] = [];
    let paramIndex = 1;

    // Map the updates to database fields
    const fieldMapping: Record<string, any> = {
      status: updates.status,
      output: updates.output ? JSON.stringify(updates.output) : undefined,
      error: updates.error,
      finished_at: updates.finishedAt,
      duration_ms: updates.duration,
      token_usage: updates.tokenUsage ? JSON.stringify(updates.tokenUsage) : undefined
    };

    Object.entries(fieldMapping).forEach(([dbField, value]) => {
      if (value !== undefined && allowedFields.includes(dbField)) {
        updateFields.push(`${dbField} = $${paramIndex}`);
        updateValues.push(value);
        paramIndex++;
      }
    });

    if (updateFields.length === 0) {
      return;
    }

    updateValues.push(taskId);
    const query = `
      UPDATE worker_tasks
      SET ${updateFields.join(', ')}, updated_at = NOW()
      WHERE task_id = $${paramIndex}
    `;

    try {
      await dbPool.query(query, updateValues);
    } catch (error) {
      console.error('Error updating task:', error);
      throw error;
    }
  }

  // Get task by ID
  async getTask(taskId: string): Promise<Task | null> {
    const dbPool = getPool();
    if (!dbPool) {
      throw new Error('Database not configured');
    }

    const query = `SELECT * FROM worker_tasks WHERE task_id = $1`;

    try {
      const result = await dbPool.query(query, [taskId]);
      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        id: row.task_id,
        planId: row.plan_id,
        type: row.type,
        name: row.name,
        description: row.description,
        estimatedDuration: row.estimated_duration,
        priority: row.priority,
        status: row.status,
        input: row.input,
        output: row.output,
        startedAt: row.started_at,
        finishedAt: row.finished_at,
        fingerprint: row.fingerprint
      };
    } catch (error) {
      console.error('Error getting task:', error);
      throw error;
    }
  }

  // Get build history
  async getBuildHistory(userId: string, limit = 50): Promise<BuildRecord[]> {
    const dbPool = getPool();
    if (!dbPool) {
      throw new Error('Database not configured');
    }

    const query = `
      SELECT * FROM project_build_records
      WHERE user_id = $1
      ORDER BY started_at DESC
      LIMIT $2
    `;

    try {
      const result = await dbPool.query(query, [userId, limit]);
      return result.rows;
    } catch (error) {
      console.error('Error getting build history:', error);
      throw error;
    }
  }

  // Update build metrics
  async updateBuildMetrics(buildId: string, metrics: any): Promise<void> {
    const dbPool = getPool();
    if (!dbPool) {
      throw new Error('Database not configured');
    }

    const query = `
      UPDATE project_build_records
      SET metrics = $2, finished_at = NOW(), status = 'completed'
      WHERE build_id = $1
    `;

    try {
      await dbPool.query(query, [buildId, JSON.stringify(metrics)]);
    } catch (error) {
      console.error('Error updating build metrics:', error);
      throw error;
    }
  }
}