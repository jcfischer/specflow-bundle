/**
 * F-8: Feature Detail Page
 * HTML page showing rendered spec.md, plan.md, tasks.md content for a feature.
 */

import { getPhaseIndicatorStyles, renderPhaseIndicator } from "../components/phase-indicator";
import { markdownToHtml } from "../lib/markdown";
import type { ProjectWithData, Feature } from "../lib/database";

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
 * Get the CSS class for a status badge
 */
function getStatusBadgeClass(status: Feature["status"]): string {
  switch (status) {
    case "complete":
      return "bg-green-100 text-green-800";
    case "in_progress":
      return "bg-yellow-100 text-yellow-800";
    case "pending":
      return "bg-gray-100 text-gray-800";
    case "skipped":
      return "bg-red-100 text-red-800";
    default:
      return "bg-gray-100 text-gray-800";
  }
}

/**
 * Format status text for display
 */
function formatStatus(status: Feature["status"]): string {
  switch (status) {
    case "in_progress":
      return "in progress";
    default:
      return status;
  }
}

/**
 * Render a content section with a tab-like header
 */
function renderContentSection(
  title: string,
  content: string | null,
  isActive: boolean = true
): string {
  const headerClass = isActive
    ? "bg-blue-600 text-white"
    : "bg-gray-200 text-gray-700";

  if (!content) {
    return `
    <div class="mb-6">
      <div class="flex items-center ${headerClass} px-4 py-2 rounded-t-lg">
        <h3 class="text-lg font-semibold">${escapeHtml(title)}</h3>
      </div>
      <div class="bg-white border border-t-0 border-gray-200 rounded-b-lg p-6">
        <p class="text-gray-500 italic">No content available</p>
      </div>
    </div>`;
  }

  const renderedContent = markdownToHtml(content);

  return `
    <div class="mb-6">
      <div class="flex items-center ${headerClass} px-4 py-2 rounded-t-lg">
        <h3 class="text-lg font-semibold">${escapeHtml(title)}</h3>
      </div>
      <div class="bg-white border border-t-0 border-gray-200 rounded-b-lg p-6">
        <div class="prose max-w-none">
          ${renderedContent}
        </div>
      </div>
    </div>`;
}

/**
 * Render the feature detail page
 */
export function renderFeatureDetailPage(
  project: ProjectWithData,
  feature: Feature,
  specContent: string | null,
  planContent: string | null,
  tasksContent: string | null
): string {
  const safeProjectName = escapeHtml(project.name);
  const safeFeatureName = escapeHtml(feature.name);
  const safeFeatureId = escapeHtml(feature.id);
  const badgeClass = getStatusBadgeClass(feature.status);
  const statusText = formatStatus(feature.status);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="refresh" content="5">
  <title>${safeFeatureName} - ${safeProjectName} - SpecFlow UI</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    ${getPhaseIndicatorStyles()}
  </style>
</head>
<body class="bg-gray-100 min-h-screen">
  <div class="max-w-4xl mx-auto px-4 py-8">
    <!-- Breadcrumb -->
    <nav class="mb-6">
      <ol class="flex items-center space-x-2 text-sm">
        <li>
          <a href="/" class="text-blue-600 hover:text-blue-800">Projects</a>
        </li>
        <li class="text-gray-400">/</li>
        <li>
          <a href="/project/${encodeURIComponent(project.name)}" class="text-blue-600 hover:text-blue-800">${safeProjectName}</a>
        </li>
        <li class="text-gray-400">/</li>
        <li class="text-gray-600">${safeFeatureId}</li>
      </ol>
    </nav>

    <!-- Header -->
    <div class="bg-white rounded-lg shadow p-6 mb-6">
      <div class="flex items-start justify-between">
        <div>
          <h1 class="text-2xl font-bold text-gray-900 mb-2">${safeFeatureName}</h1>
          <p class="text-gray-500 font-mono text-sm mb-3">${safeFeatureId}</p>
          ${feature.description ? `<p class="text-gray-700 mb-4">${escapeHtml(feature.description)}</p>` : ""}
        </div>
        <span class="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${badgeClass}">
          ${statusText}
        </span>
      </div>
      <div class="mt-4 pt-4 border-t border-gray-200">
        <div class="flex items-center">
          <span class="text-sm text-gray-500 mr-3">Phase:</span>
          ${renderPhaseIndicator(feature.phase)}
        </div>
      </div>
    </div>

    <!-- Content Sections -->
    ${renderContentSection("Specification", specContent)}
    ${renderContentSection("Plan", planContent)}
    ${renderContentSection("Tasks", tasksContent)}

    <!-- Back Button -->
    <div class="mt-8">
      <a
        href="/project/${encodeURIComponent(project.name)}"
        class="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
      >
        <svg class="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        Back to Feature List
      </a>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Render the 404 not found page for a feature
 */
export function renderFeatureNotFoundPage(
  projectName: string,
  featureId: string
): string {
  const safeProjectName = escapeHtml(projectName);
  const safeFeatureId = escapeHtml(featureId);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Feature Not Found - SpecFlow UI</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-100 min-h-screen">
  <div class="max-w-6xl mx-auto px-4 py-8">
    <div class="text-center py-12">
      <svg class="mx-auto h-16 w-16 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <h1 class="mt-4 text-2xl font-bold text-gray-900">Feature Not Found</h1>
      <p class="mt-2 text-gray-600">
        The feature "<span class="font-medium">${safeFeatureId}</span>" could not be found in project "<span class="font-medium">${safeProjectName}</span>".
      </p>
      <p class="mt-4">
        <a href="/project/${encodeURIComponent(projectName)}" class="text-blue-600 hover:text-blue-800">
          &larr; Back to project
        </a>
      </p>
    </div>
  </div>
</body>
</html>`;
}
