/**
 * Plan Manager
 * 
 * Handles creation and execution of implementation plans for large projects.
 */

import type { Plan, PlanStep, PlanStatus, PlanStepStatus, TaskStatus, AgentEvent } from '../core/types';
import type { AgentSession } from './session';

// ============================================================================
// Plan Manager Class
// ============================================================================

export class PlanManager {
  private session: AgentSession;
  private activePlan: Plan | null = null;

  constructor(session: AgentSession) {
    this.session = session;
  }

  /**
   * Create a new plan (typically called from createPlan tool)
   */
  createPlan(
    title: string,
    description: string,
    steps: Array<{
      id: string;
      title: string;
      description: string;
      dependencies?: string[];
    }>
  ): Plan {
    const plan: Plan = {
      id: `plan_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      title,
      description,
      steps: steps.map((step, index) => ({
        id: step.id || `step_${index + 1}`,
        title: step.title,
        description: step.description,
        status: 'pending' as PlanStepStatus,
        dependencies: step.dependencies || [],
      })),
      status: 'draft' as PlanStatus,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.activePlan = plan;
    
    // Notify session about the plan
    this.session.handlePlanCreated(plan);
    
    return plan;
  }

  /**
   * Execute an approved plan step by step
   */
  async executePlan(plan: Plan): Promise<void> {
    this.activePlan = plan;
    plan.status = 'in_progress';
    // Note: Plan interface doesn't have startedAt, but we'll track it in the session if needed

    this.emitPlanUpdate(plan);

    // Get steps in execution order (respecting dependencies)
    const orderedSteps = this.getExecutionOrder(plan.steps);

    for (const step of orderedSteps) {
      // Check if we should skip (dependencies failed)
      if (this.shouldSkipStep(step, plan.steps)) {
        step.status = 'skipped';
        this.emitStepUpdate(plan.id, step);
        continue;
      }

      // Execute the step
      try {
        await this.executeStep(plan, step);
      } catch (error) {
        step.status = 'failed';
        step.error = error instanceof Error ? error.message : String(error);
        this.emitStepUpdate(plan.id, step);
        
        // Don't fail the whole plan, continue with independent steps
      }
    }

    // Determine final plan status
    const hasFailures = plan.steps.some(s => s.status === 'failed');
    const allComplete = plan.steps.every(s => 
      s.status === 'completed' || s.status === 'skipped'
    );

    if (allComplete && !hasFailures) {
      plan.status = 'completed';
    } else if (hasFailures) {
      plan.status = 'failed'; // Some steps failed
    }

    plan.completedAt = Date.now();
    this.emitPlanUpdate(plan);
  }

  /**
   * Get the currently active plan
   */
  getActivePlan(): Plan | null {
    return this.activePlan;
  }

  /**
   * Update a step's status
   */
  updateStepStatus(
    planId: string,
    stepId: string,
    status: PlanStep['status'],
    output?: string,
    error?: string
  ): void {
    if (!this.activePlan || this.activePlan.id !== planId) {
      return;
    }

    const step = this.activePlan.steps.find(s => s.id === stepId);
    if (step) {
      step.status = status;
      if (output) step.output = output;
      if (error) step.error = error;
      this.emitStepUpdate(planId, step);
    }
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  /**
   * Execute a single plan step
   */
  private async executeStep(plan: Plan, step: PlanStep): Promise<void> {
    step.status = 'in_progress';
    step.startedAt = Date.now();
    this.emitStepUpdate(plan.id, step);

    // The actual execution is done by the agent via the chat interface
    // We send a message instructing the agent to perform this step
    
    const stepPrompt = this.formatStepPrompt(step);
    
    // Note: In a full implementation, this would call back into the session
    // to run the agent on this specific step. For now, we mark it as the
    // responsibility of the caller (AgentSession) to handle.
    
    // This is a simplified version - real implementation would:
    // 1. Send the step as a new message to the agent
    // 2. Wait for completion
    // 3. Update status based on result

    step.status = 'completed';
    step.completedAt = Date.now();
    this.emitStepUpdate(plan.id, step);
  }

  /**
   * Format a step as a prompt for the agent
   */
  private formatStepPrompt(step: PlanStep): string {
    return `Execute step "${step.title}":

${step.description}

When complete, use the updatePlanStep tool to mark this step as completed with any relevant output.`;
  }

  /**
   * Get steps in execution order (topological sort)
   */
  private getExecutionOrder(steps: PlanStep[]): PlanStep[] {
    const result: PlanStep[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (step: PlanStep) => {
      if (visited.has(step.id)) return;
      if (visiting.has(step.id)) {
        throw new Error(`Circular dependency detected at step: ${step.id}`);
      }

      visiting.add(step.id);

      // Visit dependencies first
      for (const depId of step.dependencies || []) {
        const depStep = steps.find(s => s.id === depId);
        if (depStep) {
          visit(depStep);
        }
      }

      visiting.delete(step.id);
      visited.add(step.id);
      result.push(step);
    };

    for (const step of steps) {
      visit(step);
    }

    return result;
  }

  /**
   * Check if a step should be skipped (due to failed dependencies)
   */
  private shouldSkipStep(step: PlanStep, allSteps: PlanStep[]): boolean {
    for (const depId of step.dependencies || []) {
      const depStep = allSteps.find(s => s.id === depId);
      if (depStep && depStep.status === 'failed') {
        return true;
      }
    }
    return false;
  }

  /**
   * Emit plan update event
   */
  private emitPlanUpdate(plan: Plan): void {
    const event: AgentEvent = {
      type: 'plan_updated',
      plan,
      timestamp: Date.now(),
    };
    // Would emit through session
  }

  /**
   * Emit step update event
   */
  private emitStepUpdate(planId: string, step: PlanStep): void {
    // Map PlanStepStatus to TaskStatus
    let taskStatus: TaskStatus;
    switch (step.status) {
      case 'skipped':
        taskStatus = 'blocked';
        break;
      default:
        taskStatus = step.status as TaskStatus;
    }
    
    const event: AgentEvent = {
      type: 'plan_step_updated',
      planId,
      stepId: step.id,
      status: taskStatus,
      output: step.output,
      error: step.error,
      timestamp: Date.now(),
    };
    // Would emit through session
  }
}
