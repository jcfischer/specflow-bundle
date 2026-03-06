/**
 * Pipeline Interceptor
 * Wraps phase execution with visibility tracking
 */

import type { SpecPhase, PipelineEvent, PipelineFailure } from "../types";
import { getSessionId } from "./session";
import { updateFeatureInPipeline, addFailureToPipeline } from "./pipeline-state";
import { dispatchNotification } from "./notifications";
import { classifyFailure, getFailureRoute } from "./failure";

export async function wrapPhaseExecution<T>(
  fn: () => Promise<T>,
  featureId: string,
  featureName: string,
  phase: SpecPhase,
  projectPath: string
): Promise<T> {
  const sessionId = getSessionId(projectPath);
  const startTime = performance.now();

  // Emit phase.started
  const startEvent: PipelineEvent = {
    type: "phase.started",
    timestamp: new Date().toISOString(),
    session_id: sessionId,
    feature_id: featureId,
    phase,
  };
  dispatchNotification(projectPath, startEvent);

  // Update pipeline state
  updateFeatureInPipeline(projectPath, sessionId, featureId, {
    name: featureName,
    phase,
    status: "in_progress",
    session_id: sessionId,
  });

  try {
    const result = await fn();
    const duration = performance.now() - startTime;

    // Emit phase.completed
    const completeEvent: PipelineEvent = {
      type: "phase.completed",
      timestamp: new Date().toISOString(),
      session_id: sessionId,
      feature_id: featureId,
      phase,
      data: { duration_ms: Math.round(duration) },
    };
    dispatchNotification(projectPath, completeEvent);

    // Update pipeline state
    updateFeatureInPipeline(projectPath, sessionId, featureId, {
      phase,
      status: "in_progress",
    });

    return result;
  } catch (error) {
    const duration = performance.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);
    const failureType = classifyFailure(errorMessage);
    const routeResult = getFailureRoute(failureType);

    // Record failure in pipeline state
    const failure: PipelineFailure = {
      feature_id: featureId,
      phase,
      failure_type: failureType,
      failure_route: routeResult.route,
      message: errorMessage,
      occurred_at: new Date().toISOString(),
      recovered: false,
      retry_count: 0,
    };
    addFailureToPipeline(projectPath, sessionId, failure);

    // Emit phase.failed
    const failedEvent: PipelineEvent = {
      type: "phase.failed",
      timestamp: new Date().toISOString(),
      session_id: sessionId,
      feature_id: featureId,
      phase,
      data: {
        duration_ms: Math.round(duration),
        failure_type: failureType,
        failure_route: routeResult.route,
        message: errorMessage,
      },
    };
    dispatchNotification(projectPath, failedEvent);

    // Update feature status
    if (routeResult.route === "escalate") {
      updateFeatureInPipeline(projectPath, sessionId, featureId, {
        status: "blocked",
        blocked_reason: errorMessage,
      });
    }

    throw error; // Re-throw so the command sees the original error
  }
}
