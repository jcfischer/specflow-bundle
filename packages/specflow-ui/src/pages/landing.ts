/**
 * F-4: Landing Page
 * HTML page showing project cards in a grid with progress bars.
 */

import type { ProjectWithData } from "../lib/database";

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
 * Render a single project card
 */
function renderProjectCard(project: ProjectWithData): string {
  const { name, stats } = project;
  const { complete, total, percentComplete } = stats;
  const safeName = escapeHtml(name);

  // Choose progress bar color based on completion
  let barColor = "bg-blue-500";
  if (percentComplete === 100) {
    barColor = "bg-green-500";
  } else if (percentComplete >= 50) {
    barColor = "bg-green-500";
  } else if (percentComplete > 0) {
    barColor = "bg-yellow-500";
  } else {
    barColor = "bg-gray-400";
  }

  // Show error state if project has issues
  if (project.hasError) {
    return `
    <div class="block bg-red-50 border border-red-200 rounded-lg shadow p-4">
      <h2 class="font-bold text-red-700">${safeName}</h2>
      <p class="text-sm text-red-600 mt-1">Error reading database</p>
    </div>`;
  }

  return `
    <a href="/project/${encodeURIComponent(name)}" class="block bg-white rounded-lg shadow p-4 hover:shadow-lg transition-shadow">
      <h2 class="font-bold text-gray-900">${safeName}</h2>
      <div class="bg-gray-200 rounded h-2 mt-2">
        <div class="${barColor} h-2 rounded" style="width: ${percentComplete}%"></div>
      </div>
      <p class="text-sm text-gray-600 mt-1">${complete}/${total} features (${percentComplete}%)</p>
    </a>`;
}

/**
 * Render the empty state when no projects are found
 */
function renderEmptyState(): string {
  return `
    <div class="text-center py-12">
      <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
      </svg>
      <h3 class="mt-2 text-sm font-medium text-gray-900">No projects found</h3>
      <p class="mt-1 text-sm text-gray-500">No SpecFlow projects found in ~/work/</p>
      <p class="mt-1 text-xs text-gray-400">Projects need a features.db file to appear here</p>
    </div>`;
}

/**
 * Render the full landing page
 */
export function renderLandingPage(projects: ProjectWithData[]): string {
  const projectCards =
    projects.length > 0
      ? projects.map(renderProjectCard).join("\n")
      : renderEmptyState();

  const projectCount = projects.length;
  const totalFeatures = projects.reduce((sum, p) => sum + p.stats.total, 0);
  const completedFeatures = projects.reduce(
    (sum, p) => sum + p.stats.complete,
    0
  );

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="refresh" content="5">
  <title>SpecFlow UI</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-100 min-h-screen">
  <div class="max-w-6xl mx-auto px-4 py-8">
    <!-- Header -->
    <div class="flex items-center justify-between mb-8">
      <div>
        <h1 class="text-3xl font-bold text-gray-900">SpecFlow UI</h1>
        <p class="text-gray-600 mt-1">
          ${projectCount} project${projectCount !== 1 ? "s" : ""} &middot;
          ${completedFeatures}/${totalFeatures} features complete
        </p>
      </div>
      <div class="flex gap-2">
        <a
          href="/new-project"
          class="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          <svg class="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
          </svg>
          New Project
        </a>
        <button
          onclick="window.location.reload()"
          class="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          <svg class="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
      </div>
    </div>

    <!-- Project Grid -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      ${projectCards}
    </div>
  </div>
</body>
</html>`;
}
