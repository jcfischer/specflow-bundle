/**
 * F-11: Generation Page
 * Shows progress/status during generation, success with link to project, or errors.
 */

import type { GenerationResult } from "../lib/generator";

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
 * Render the generation in progress page (shown briefly)
 */
export function renderGeneratingPage(projectName: string): string {
  const safeName = escapeHtml(projectName);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Generating: ${safeName} - SpecFlow UI</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-100 min-h-screen">
  <div class="max-w-2xl mx-auto px-4 py-8">
    <div class="text-center py-12">
      <!-- Spinner -->
      <div class="inline-block animate-spin rounded-full h-16 w-16 border-4 border-blue-600 border-t-transparent"></div>
      <h1 class="mt-6 text-2xl font-bold text-gray-900">Generating Project</h1>
      <p class="mt-2 text-gray-600">
        Creating <span class="font-medium">${safeName}</span>...
      </p>
      <div class="mt-4 text-sm text-gray-500">
        <p>Creating project directory...</p>
        <p>Generating app-context.md...</p>
        <p>Generating features.json...</p>
        <p>Running specflow init...</p>
      </div>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Render the generation success page
 */
export function renderGenerationSuccessPage(
  projectName: string,
  projectPath: string,
  warning?: string
): string {
  const safeName = escapeHtml(projectName);
  const safePath = escapeHtml(projectPath);

  const warningHtml = warning
    ? `<div class="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-md">
        <div class="flex">
          <svg class="h-5 w-5 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <p class="ml-3 text-sm text-yellow-700">${escapeHtml(warning)}</p>
        </div>
      </div>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Success: ${safeName} - SpecFlow UI</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-100 min-h-screen">
  <div class="max-w-2xl mx-auto px-4 py-8">
    <div class="text-center py-12">
      <!-- Success Icon -->
      <div class="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-green-100">
        <svg class="h-10 w-10 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <h1 class="mt-6 text-2xl font-bold text-gray-900">Project Created!</h1>
      <p class="mt-2 text-gray-600">
        <span class="font-medium">${safeName}</span> has been generated successfully.
      </p>

      ${warningHtml}

      <div class="mt-6 bg-white rounded-lg shadow p-6 text-left">
        <h2 class="text-lg font-semibold text-gray-900 mb-4">Project Details</h2>
        <dl class="space-y-3">
          <div>
            <dt class="text-sm font-medium text-gray-500">Location</dt>
            <dd class="text-sm text-gray-900 font-mono bg-gray-50 p-2 rounded mt-1">${safePath}</dd>
          </div>
          <div>
            <dt class="text-sm font-medium text-gray-500">Files Created</dt>
            <dd class="text-sm text-gray-900 mt-1">
              <ul class="list-disc list-inside space-y-1">
                <li><code class="bg-gray-100 px-1 rounded">.specify/app-context.md</code> - Project context from interview</li>
                <li><code class="bg-gray-100 px-1 rounded">.specify/features.json</code> - Initial feature definitions</li>
              </ul>
            </dd>
          </div>
        </dl>
      </div>

      <div class="mt-8 space-y-3">
        <a
          href="/project/${encodeURIComponent(projectName)}"
          class="inline-flex items-center px-6 py-3 border border-transparent rounded-md shadow-sm text-base font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          View Project
          <svg class="ml-2 h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
          </svg>
        </a>
        <p class="text-sm text-gray-500">
          or <a href="/" class="text-blue-600 hover:text-blue-800">return to dashboard</a>
        </p>
      </div>

      <div class="mt-8 p-4 bg-gray-50 rounded-lg border border-gray-200">
        <h3 class="text-sm font-medium text-gray-900 mb-2">Next Steps</h3>
        <ol class="text-sm text-gray-600 text-left list-decimal list-inside space-y-1">
          <li>Review and edit the generated <code class="bg-gray-100 px-1 rounded">app-context.md</code></li>
          <li>Update <code class="bg-gray-100 px-1 rounded">features.json</code> with specific features</li>
          <li>Use SpecFlow to specify, plan, and implement each feature</li>
        </ol>
      </div>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Render the generation error page
 */
export function renderGenerationErrorPage(
  projectName: string,
  error: string
): string {
  const safeName = escapeHtml(projectName);
  const safeError = escapeHtml(error);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Error: ${safeName} - SpecFlow UI</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-100 min-h-screen">
  <div class="max-w-2xl mx-auto px-4 py-8">
    <div class="text-center py-12">
      <!-- Error Icon -->
      <div class="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-red-100">
        <svg class="h-10 w-10 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </div>
      <h1 class="mt-6 text-2xl font-bold text-gray-900">Generation Failed</h1>
      <p class="mt-2 text-gray-600">
        Failed to create project <span class="font-medium">${safeName}</span>.
      </p>

      <div class="mt-6 bg-red-50 border border-red-200 rounded-lg p-4 text-left">
        <h2 class="text-sm font-semibold text-red-800 mb-2">Error Details</h2>
        <pre class="text-sm text-red-700 whitespace-pre-wrap font-mono">${safeError}</pre>
      </div>

      <div class="mt-8 space-x-4">
        <a
          href="/interview/${encodeURIComponent(projectName)}"
          class="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          <svg class="mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back to Interview
        </a>
        <a
          href="/"
          class="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          Go to Dashboard
        </a>
      </div>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Render generation result page based on result
 */
export function renderGenerationResultPage(
  projectName: string,
  result: GenerationResult
): string {
  if (result.success && result.projectPath) {
    // Success with optional warning (e.g., specflow init failed)
    return renderGenerationSuccessPage(
      projectName,
      result.projectPath,
      result.error // This becomes a warning if present with success
    );
  } else {
    // Full failure
    return renderGenerationErrorPage(
      projectName,
      result.error || "Unknown error occurred"
    );
  }
}
