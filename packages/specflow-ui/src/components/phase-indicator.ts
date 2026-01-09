/**
 * Phase Indicator Component
 *
 * Renders a visual 4-step phase progress indicator for SpecKit workflow:
 * SPECIFY -> PLAN -> TASKS -> IMPLEMENT
 *
 * States:
 * - Gray (pending): Future step not yet reached
 * - Yellow (current): Active step being worked on
 * - Green (complete): Step finished
 */

export type SpecPhase = "none" | "specify" | "plan" | "tasks" | "implement";

const PHASES: SpecPhase[] = ["none", "specify", "plan", "tasks", "implement"];
const DISPLAY_PHASES: SpecPhase[] = ["specify", "plan", "tasks", "implement"];

type StepState = "phase-complete" | "phase-current" | "phase-pending";

/**
 * Determine the visual state for a step based on current phase
 *
 * Phase interpretation:
 * - "none": No phases started, all gray
 * - "specify": Currently in SPECIFY phase (yellow), rest gray
 * - "plan": SPECIFY complete (green), PLAN current (yellow), rest gray
 * - "tasks": SPECIFY/PLAN complete, TASKS current, IMPLEMENT gray
 * - "implement": All phases complete (all green) - represents finished state
 */
function getStepState(stepPhase: SpecPhase, currentPhase: SpecPhase): StepState {
  const stepIndex = PHASES.indexOf(stepPhase);
  const currentIndex = PHASES.indexOf(currentPhase);

  // Special case: "implement" means all complete (feature finished)
  if (currentPhase === "implement") {
    return "phase-complete";
  }

  if (stepIndex < currentIndex) return "phase-complete";
  if (stepIndex === currentIndex) return "phase-current";
  return "phase-pending";
}

/**
 * Render the phase indicator component as HTML string
 *
 * @param phase - Current phase of the feature
 * @returns HTML string for server-side rendering
 *
 * @example
 * renderPhaseIndicator("plan")
 * // SPECIFY (green) -> PLAN (yellow) -> TASKS (gray) -> IMPLEMENT (gray)
 *
 * @example
 * renderPhaseIndicator("none")
 * // All steps gray (nothing started)
 *
 * @example
 * renderPhaseIndicator("implement")
 * // All steps green (all complete)
 */
export function renderPhaseIndicator(phase: SpecPhase): string {
  const steps = DISPLAY_PHASES.map((stepPhase, index) => {
    const state = getStepState(stepPhase, phase);
    const label = stepPhase.toUpperCase();

    const stepHtml = `<div class="phase-step ${state}">
      <span class="phase-dot"></span>
      <span class="phase-label">${label}</span>
    </div>`;

    // Add arrow after each step except the last
    if (index < DISPLAY_PHASES.length - 1) {
      return `${stepHtml}<span class="phase-arrow">\u2192</span>`;
    }
    return stepHtml;
  });

  return `<div class="phase-indicator">${steps.join("")}</div>`;
}

/**
 * Get inline CSS styles for the phase indicator
 * Can be included in <style> tag or linked as external stylesheet
 */
export function getPhaseIndicatorStyles(): string {
  return `
.phase-indicator {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-family: system-ui, -apple-system, sans-serif;
  font-size: 12px;
}

.phase-step {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.phase-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  flex-shrink: 0;
}

.phase-label {
  font-weight: 500;
}

.phase-arrow {
  color: #9ca3af;
  font-size: 14px;
}

/* State: Complete (green) */
.phase-complete .phase-dot {
  background-color: #22c55e;
}
.phase-complete .phase-label {
  color: #22c55e;
}

/* State: Current (yellow) */
.phase-current .phase-dot {
  background-color: #eab308;
}
.phase-current .phase-label {
  color: #eab308;
}

/* State: Pending (gray) */
.phase-pending .phase-dot {
  background-color: #9ca3af;
}
.phase-pending .phase-label {
  color: #9ca3af;
}
`.trim();
}
