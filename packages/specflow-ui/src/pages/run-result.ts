/**
 * F-13: Run Phases Result Page
 * Shows the result of running SpecKit phases with Claude.
 */

import type { ProjectWithData } from "../lib/database";
import type { RunPhasesResult } from "../lib/runner";

export function renderRunPhasesResultPage(
  project: ProjectWithData,
  featureId: string,
  result: RunPhasesResult
): string {
  const successSection = result.success
    ? `
    <div class="bg-green-50 border border-green-200 rounded-lg p-6 mb-6">
      <div class="flex items-start">
        <svg class="h-6 w-6 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <div class="ml-4">
          <h3 class="text-lg font-medium text-green-800">SpecKit Phases Complete</h3>
          <p class="text-green-700 mt-1">
            Feature <strong>${featureId}</strong> has been specified, planned, and tasked.
          </p>
          <p class="text-green-600 text-sm mt-2">
            The feature is now ready for implementation.
          </p>
        </div>
      </div>
    </div>

    <div class="flex gap-3 mb-6">
      <a
        href="/project/${encodeURIComponent(project.name)}/run"
        class="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
      >
        <svg class="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        Get Implementation Prompt
      </a>
      <a
        href="/project/${encodeURIComponent(project.name)}/feature/${encodeURIComponent(featureId)}"
        class="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
      >
        View Spec/Plan/Tasks
      </a>
    </div>
    `
    : `
    <div class="bg-red-50 border border-red-200 rounded-lg p-6 mb-6">
      <div class="flex items-start">
        <svg class="h-6 w-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <div class="ml-4">
          <h3 class="text-lg font-medium text-red-800">SpecKit Phases Failed</h3>
          <p class="text-red-700 mt-1">
            There was an error running the SpecKit phases for feature <strong>${featureId}</strong>.
          </p>
          <p class="text-red-600 text-sm mt-2">
            ${escapeHtml(result.error || "Unknown error")}
          </p>
        </div>
      </div>
    </div>

    <a
      href="/project/${encodeURIComponent(project.name)}/run"
      class="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 mb-6"
    >
      <svg class="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
      </svg>
      Back to Run
    </a>
    `;

  const outputSection = result.output
    ? `
    <div class="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      <div class="px-4 py-3 bg-gray-50 border-b border-gray-200">
        <h3 class="text-sm font-medium text-gray-700">Claude Output</h3>
      </div>
      <div class="p-4 overflow-x-auto max-h-96 overflow-y-auto">
        <pre class="text-xs text-gray-700 whitespace-pre-wrap font-mono">${escapeHtml(result.output)}</pre>
      </div>
    </div>
    `
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Run Phases Result - ${project.name} - SpecFlow UI</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-100 min-h-screen">
  <div class="max-w-4xl mx-auto px-4 py-8">
    <!-- Breadcrumb -->
    <nav class="flex items-center text-sm text-gray-500 mb-6">
      <a href="/" class="hover:text-gray-700">Projects</a>
      <svg class="h-4 w-4 mx-2" fill="currentColor" viewBox="0 0 20 20">
        <path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd" />
      </svg>
      <a href="/project/${encodeURIComponent(project.name)}" class="hover:text-gray-700">${project.name}</a>
      <svg class="h-4 w-4 mx-2" fill="currentColor" viewBox="0 0 20 20">
        <path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd" />
      </svg>
      <span class="text-gray-900">Run Phases Result</span>
    </nav>

    <!-- Header -->
    <div class="mb-6">
      <h1 class="text-2xl font-bold text-gray-900">SpecKit Phases Result</h1>
      <p class="text-gray-600 mt-1">Feature ${featureId}</p>
    </div>

    ${successSection}
    ${outputSection}
  </div>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
