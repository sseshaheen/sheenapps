import { ulid } from 'ulid';
import { z } from 'zod';
import type { TaskPlan, Task, TaskDependency, PlanContext, TokenUsage } from '../types/modular';
import { WebhookService } from './webhookService';
import type { AIProvider } from '../providers/aiProvider';

const TaskSchema = z.object({
  id: z.string(),
  planId: z.string().optional(), // Optional in schema, will be added by generator
  type: z.enum(['create_file', 'modify_file', 'create_component', 'setup_config', 'install_deps']),
  name: z.string(),
  description: z.string(),
  estimatedDuration: z.number(),
  priority: z.number(),
  status: z.enum(['pending', 'in_progress', 'completed', 'failed']).optional(), // Optional, will default to pending
  input: z.object({
    prompt: z.string().optional(),
    context: z.string().optional(),
    targetPath: z.string().optional(),
    dependencies: z.array(z.string()).optional(),
  }),
});

export class PlanGeneratorService {
  constructor(
    private webhookService: WebhookService,
    private aiProvider: AIProvider
  ) {}

  async generatePlan(prompt: string, context: PlanContext & { buildId: string; userId: string; projectId: string }): Promise<TaskPlan> {
    const planId = ulid();
    const startTime = Date.now();

    // Step 1: Generate plan with streaming (if provider supports it)
    const tasks: Task[] = [];
    let usage: TokenUsage | undefined;
    
    try {
      // Check if provider supports streaming
      if ('planStream' in this.aiProvider && typeof this.aiProvider.planStream === 'function') {
        // Use streaming approach
        const planStream = await this.aiProvider.planStream(prompt, context);
        
        for await (const partialPlan of planStream) {
          // Validate and auto-heal each task
          const validatedTasks = await this.validateAndHealTasks(partialPlan.tasks, planId);
          tasks.push(...validatedTasks);
          // Capture usage from last iteration
          usage = partialPlan.usage;

          // Send streaming update
          await this.webhookService.send({
            type: 'plan_partial',
            buildId: context.buildId,
            data: {
              planId,
              totalTasksSoFar: tasks.length,
              latestTasks: validatedTasks.map(t => ({
                name: t.name,
                type: t.type,
                description: t.description
              }))
            }
          });
        }
      } else {
        // Fall back to non-streaming approach
        const planResult = await this.aiProvider.plan(prompt, context);
        const validatedTasks = await this.validateAndHealTasks(planResult.tasks, planId);
        tasks.push(...validatedTasks);
        usage = planResult.usage;
      }

      // Step 2: Build dependency graph
      const dependencies = this.buildDependencyGraph(tasks);

      // Step 3: Calculate estimated duration
      const estimatedDuration = tasks.reduce((sum, t) => sum + t.estimatedDuration, 0);

      const plan: TaskPlan = {
        id: planId,
        projectId: context.projectId,
        userId: context.userId,
        buildId: context.buildId,
        originalPrompt: prompt,
        tasks,
        dependencies,
        estimatedDuration,
        usage,
        metadata: {
          framework: context.framework,
          projectType: 'web', // TODO: Detect from context
          complexity: this.determineComplexity(tasks)
        },
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Send final plan generated webhook
      await this.webhookService.send({
        type: 'plan_generated',
        buildId: context.buildId,
        data: {
          planId: plan.id,
          taskCount: plan.tasks.length,
          estimatedDuration: plan.estimatedDuration,
          tasks: plan.tasks.map(t => ({
            name: t.name,
            type: t.type,
            description: t.description
          }))
        }
      });

      return plan;

    } catch (error) {
      console.error('Error generating plan:', error);
      throw error;
    }
  }

  private async validateAndHealTasks(tasks: any[], planId: string): Promise<Task[]> {
    const validated: Task[] = [];

    for (const task of tasks) {
      try {
        // Try to parse with schema
        const validTask = TaskSchema.parse(task);
        // Add planId and status to the task
        validated.push({ 
          ...validTask, 
          planId,
          status: 'pending' as const
        });
      } catch (error) {
        // Auto-heal: Call LLM to fix the JSON
        console.warn('Invalid task format, attempting to heal:', error);
        const healed = await this.healTask(task, error);
        // Add planId and status to the healed task
        validated.push({ 
          ...healed, 
          planId,
          status: 'pending' as const
        });
      }
    }

    return validated;
  }

  private async healTask(brokenTask: any, error: any): Promise<Task> {
    const healPrompt = `
      Fix this task JSON to match the schema:
      ${JSON.stringify(brokenTask)}

      Error: ${error.message}

      Required fields: id, type, name, description, estimatedDuration, priority, input
      Valid types: create_file, modify_file, create_component, setup_config, install_deps
      
      Return only valid JSON that matches this schema.
    `;

    const healed = await this.aiProvider.transform({
      type: 'heal_json',
      input: healPrompt
    });

    const healedTask = TaskSchema.parse(healed.output);
    // Ensure status is set
    return {
      ...healedTask,
      status: healedTask.status || 'pending'
    } as Task;
  }

  private buildDependencyGraph(tasks: Task[]): TaskDependency[] {
    const dependencies: TaskDependency[] = [];

    // Simple heuristic: setup tasks should run first, then file creation, then modifications
    const setupTasks = tasks.filter(t => t.type === 'setup_config' || t.type === 'install_deps');
    const createTasks = tasks.filter(t => t.type === 'create_file' || t.type === 'create_component');
    const modifyTasks = tasks.filter(t => t.type === 'modify_file');

    // Setup tasks have no dependencies
    setupTasks.forEach(task => {
      dependencies.push({
        taskId: task.id,
        dependsOn: []
      });
    });

    // Create tasks depend on all setup tasks
    createTasks.forEach(task => {
      dependencies.push({
        taskId: task.id,
        dependsOn: setupTasks.map(t => t.id)
      });
    });

    // Modify tasks depend on the files they're modifying (if we can determine that)
    modifyTasks.forEach(task => {
      const deps = [...setupTasks.map(t => t.id)];
      
      // Try to find related create tasks based on target path
      if (task.input.targetPath) {
        const relatedCreate = createTasks.find(ct => 
          ct.input.targetPath === task.input.targetPath
        );
        if (relatedCreate) {
          deps.push(relatedCreate.id);
        }
      }

      dependencies.push({
        taskId: task.id,
        dependsOn: deps
      });
    });

    return dependencies;
  }

  private determineComplexity(tasks: Task[]): 'simple' | 'moderate' | 'complex' {
    if (tasks.length <= 3) return 'simple';
    if (tasks.length <= 10) return 'moderate';
    return 'complex';
  }
}