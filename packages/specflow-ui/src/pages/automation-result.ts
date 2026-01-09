/**
 * F-14: Automation Result Page
 * Shows the result of running full automation loop.
 */

import type { ProjectWithData } from "../lib/database";

export interface AutomationResultData {
  success: boolean;
  completedFeatures: string[];
  error?: string;
}

export function renderAutomationResultPage(
  project: ProjectWithData,
  result: AutomationResultData
): string {
  const completedList =
    result.completedFeatures.length > 0
      ? `
    <div class="mt-4">
      <h4 class="text-sm font-medium text-gray-700 mb-2">Completed Features:</h4>
      <ul class="space-y-1">
        ${result.completedFeatures
          .map(
            (id) => `
          <li class="flex items-center text-sm text-green-700">
            <svg class="h-4 w-4 mr-2 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
            </svg>
            ${id}
          </li>
        `
          )
          .join("")}
      </ul>
    </div>
    `
      : "";

  const resultSection = result.success
    ? `
    <div class="bg-green-50 border border-green-200 rounded-lg p-6 mb-6">
      <div class="flex items-start">
        <svg class="h-8 w-8 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <div class="ml-4">
          <h3 class="text-xl font-medium text-green-800">Automation Complete!</h3>
          <p class="text-green-700 mt-1">
            All features have been successfully implemented.
          </p>
          ${completedList}
        </div>
      </div>
    </div>
    `
    : `
    <div class="bg-red-50 border border-red-200 rounded-lg p-6 mb-6">
      <div class="flex items-start">
        <svg class="h-8 w-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <div class="ml-4">
          <h3 class="text-xl font-medium text-red-800">Automation Stopped</h3>
          <p class="text-red-700 mt-1">
            ${escapeHtml(result.error || "An error occurred during automation.")}
          </p>
          ${completedList}
        </div>
      </div>
    </div>
    `;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Automation Result - ${project.name} - SpecFlow UI</title>
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
      <span class="text-gray-900">Automation Result</span>
    </nav>

    <!-- Header -->
    <div class="mb-6">
      <h1 class="text-2xl font-bold text-gray-900">Full Automation Result</h1>
      <p class="text-gray-600 mt-1">${project.name}</p>
    </div>

    ${resultSection}

    <div class="flex gap-3">
      <a
        href="/project/${encodeURIComponent(project.name)}"
        class="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
      >
        View Project
      </a>
      <a
        href="/project/${encodeURIComponent(project.name)}/run"
        class="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
      >
        Back to Run
      </a>
    </div>
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
