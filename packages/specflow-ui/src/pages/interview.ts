/**
 * F-10: Interview Page
 * Interactive interview questionnaire that walks through 8 phases, collecting answers.
 */

import {
  INTERVIEW_PHASES,
  TOTAL_PHASES,
  getPhase,
  type Phase,
  type Question,
} from "../lib/interview-questions";

/**
 * Escape HTML special characters to prevent XSS
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Render the progress bar showing current phase
 */
function renderProgressBar(currentPhase: number): string {
  const progress = Math.round((currentPhase / TOTAL_PHASES) * 100);

  return `
    <div class="mb-8">
      <div class="flex justify-between items-center mb-2">
        <span class="text-sm font-medium text-gray-700">Phase ${currentPhase} of ${TOTAL_PHASES}</span>
        <span class="text-sm text-gray-500">${progress}% complete</span>
      </div>
      <div class="w-full bg-gray-200 rounded-full h-2">
        <div class="bg-blue-600 h-2 rounded-full transition-all duration-300" style="width: ${progress}%"></div>
      </div>
      <div class="flex justify-between mt-2">
        ${INTERVIEW_PHASES.map(
          (phase) => `
          <div class="flex-1 text-center">
            <div class="w-3 h-3 mx-auto rounded-full ${
              phase.id < currentPhase
                ? "bg-green-500"
                : phase.id === currentPhase
                  ? "bg-blue-600"
                  : "bg-gray-300"
            }"></div>
          </div>
        `
        ).join("")}
      </div>
    </div>`;
}

/**
 * Render a single question field
 */
function renderQuestionField(
  question: Question,
  existingAnswer: string
): string {
  const safeText = escapeHtml(question.text);
  const safePlaceholder = question.placeholder
    ? escapeHtml(question.placeholder)
    : "";
  const safeAnswer = escapeHtml(existingAnswer);

  return `
    <div class="mb-6">
      <label for="${question.id}" class="block text-sm font-medium text-gray-700 mb-2">
        ${safeText}
      </label>
      <textarea
        id="${question.id}"
        name="${question.id}"
        rows="3"
        placeholder="${safePlaceholder}"
        class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-y"
      >${safeAnswer}</textarea>
    </div>`;
}

/**
 * Render the phase questions section
 */
function renderPhaseQuestions(
  phase: Phase,
  answers: Record<string, string>
): string {
  const questionFields = phase.questions
    .map((q) => renderQuestionField(q, answers[q.id] || ""))
    .join("");

  return `
    <div class="bg-white rounded-lg shadow p-6">
      <div class="mb-6">
        <h2 class="text-xl font-bold text-gray-900">${escapeHtml(phase.name)}</h2>
        <p class="text-gray-600 mt-1">${escapeHtml(phase.description)}</p>
      </div>
      ${questionFields}
    </div>`;
}

/**
 * Render navigation buttons (Previous, Next/Generate)
 */
function renderNavigation(currentPhase: number): string {
  const isFirstPhase = currentPhase === 1;
  const isLastPhase = currentPhase === TOTAL_PHASES;

  const prevButton = isFirstPhase
    ? `<span></span>` // Empty span for flexbox spacing
    : `<button
        type="submit"
        name="action"
        value="prev"
        class="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
      >
        <svg class="mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        Previous
      </button>`;

  const nextButton = isLastPhase
    ? `<button
        type="submit"
        name="action"
        value="generate"
        class="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
      >
        Generate Project
        <svg class="ml-2 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
        </svg>
      </button>`
    : `<button
        type="submit"
        name="action"
        value="next"
        class="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
      >
        Next
        <svg class="ml-2 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
        </svg>
      </button>`;

  return `
    <div class="mt-6 flex justify-between">
      ${prevButton}
      ${nextButton}
    </div>`;
}

/**
 * Render the interview not found page
 */
export function renderInterviewNotFoundPage(projectName: string): string {
  const safeName = escapeHtml(projectName);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Interview Not Found - SpecFlow UI</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-100 min-h-screen">
  <div class="max-w-2xl mx-auto px-4 py-8">
    <div class="text-center py-12">
      <svg class="mx-auto h-16 w-16 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <h1 class="mt-4 text-2xl font-bold text-gray-900">Interview Not Found</h1>
      <p class="mt-2 text-gray-600">
        No pending interview found for "<span class="font-medium">${safeName}</span>".
      </p>
      <p class="mt-1 text-sm text-gray-500">
        Start a new project to begin an interview.
      </p>
      <p class="mt-4">
        <a href="/new-project" class="text-blue-600 hover:text-blue-800">
          Create New Project
        </a>
        <span class="mx-2 text-gray-400">|</span>
        <a href="/" class="text-blue-600 hover:text-blue-800">
          Back to Projects
        </a>
      </p>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Render the full interview page
 */
export function renderInterviewPage(
  projectName: string,
  projectDescription: string,
  currentPhase: number,
  answers: Record<string, string>
): string {
  const safeName = escapeHtml(projectName);
  const safeDescription = escapeHtml(projectDescription);
  const phase = getPhase(currentPhase);

  if (!phase) {
    return renderInterviewNotFoundPage(projectName);
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Interview: ${safeName} - SpecFlow UI</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-100 min-h-screen">
  <div class="max-w-2xl mx-auto px-4 py-8">
    <!-- Header -->
    <div class="mb-6">
      <a href="/new-project" class="text-blue-600 hover:text-blue-800 text-sm">&larr; Back to New Project</a>
      <h1 class="text-2xl font-bold text-gray-900 mt-2">${safeName}</h1>
      <p class="text-gray-600 text-sm mt-1">${safeDescription}</p>
    </div>

    <!-- Progress Bar -->
    ${renderProgressBar(currentPhase)}

    <!-- Interview Form -->
    <form method="POST" action="/interview/${encodeURIComponent(projectName)}">
      <input type="hidden" name="currentPhase" value="${currentPhase}" />

      ${renderPhaseQuestions(phase, answers)}

      ${renderNavigation(currentPhase)}
    </form>
  </div>
</body>
</html>`;
}

export { INTERVIEW_PHASES, TOTAL_PHASES, getPhase };
