/**
 * F-6 & F-15: Project Detail Page
 * HTML page showing feature table with phase visualization and live streaming output.
 */

import {
  renderPhaseIndicator,
  getPhaseIndicatorStyles,
} from "../components/phase-indicator";
import type { ProjectWithData, Feature } from "../lib/database";
import { getSession } from "../lib/session-manager";

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
 * Render a single feature table row
 */
function renderFeatureRow(feature: Feature, projectName: string): string {
  const safeName = escapeHtml(feature.name);
  const badgeClass = getStatusBadgeClass(feature.status);
  const statusText = formatStatus(feature.status);
  const featureUrl = `/project/${encodeURIComponent(projectName)}/feature/${encodeURIComponent(feature.id)}`;

  return `
    <tr class="border-b border-gray-200 hover:bg-gray-50 cursor-pointer" onclick="window.location.href='${featureUrl}'">
      <td class="py-3 px-4 font-mono text-sm text-gray-600">${escapeHtml(feature.id)}</td>
      <td class="py-3 px-4 text-gray-900">
        <a href="${featureUrl}" class="text-blue-600 hover:text-blue-800 hover:underline">${safeName}</a>
      </td>
      <td class="py-3 px-4">${renderPhaseIndicator(feature.phase)}</td>
      <td class="py-3 px-4">
        <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${badgeClass}">
          ${statusText}
        </span>
      </td>
    </tr>`;
}

/**
 * Render the feature table
 */
function renderFeatureTable(features: Feature[], projectName: string): string {
  if (features.length === 0) {
    return `
      <div class="text-center py-12 bg-white rounded-lg shadow">
        <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
        <h3 class="mt-2 text-sm font-medium text-gray-900">No features</h3>
        <p class="mt-1 text-sm text-gray-500">This project has no features defined yet.</p>
      </div>`;
  }

  const rows = features.map((f) => renderFeatureRow(f, projectName)).join("\n");

  return `
    <div class="bg-white rounded-lg shadow overflow-hidden">
      <table class="min-w-full">
        <thead class="bg-gray-50">
          <tr>
            <th class="py-3 px-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
            <th class="py-3 px-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
            <th class="py-3 px-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Phase</th>
            <th class="py-3 px-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-200">
          ${rows}
        </tbody>
      </table>
    </div>`;
}

/**
 * Render the project detail page
 */
export function renderDetailPage(project: ProjectWithData, projectPath?: string): string {
  const safeName = escapeHtml(project.name);
  const { stats, features } = project;
  const { complete, total, percentComplete } = stats;

  // Check if there are features that can be run (pending or in_progress)
  const hasRunnableFeatures = features.some(
    (f) => f.status === "pending" || f.status === "in_progress"
  );

  // Check for active session
  const activeSession = projectPath ? getSession(projectPath) : null;
  const isSessionActive = activeSession && !activeSession.completed;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="refresh" content="5">
  <title>${safeName} - SpecFlow UI</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    ${getPhaseIndicatorStyles()}
  </style>
</head>
<body class="bg-gray-100 min-h-screen">
  <div class="max-w-6xl mx-auto px-4 py-8">
    <!-- Header -->
    <div class="flex items-center justify-between mb-8">
      <div>
        <p class="mb-2">
          <a href="/" class="text-blue-600 hover:text-blue-800 text-sm">
            &larr; Back to projects
          </a>
        </p>
        <h1 class="text-3xl font-bold text-gray-900">${safeName}</h1>
        <p class="text-gray-600 mt-1">
          ${complete}/${total} features complete (${percentComplete}%)
        </p>
      </div>
      <div class="flex items-center gap-3">
        ${
          hasRunnableFeatures
            ? `
        <a
          href="/project/${encodeURIComponent(project.name)}/run"
          class="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          <svg class="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Run Next
        </a>
        `
            : ""
        }
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

    <!-- Live Output Section -->
    <div id="live-output-section" class="${isSessionActive ? "" : "hidden"} mb-6">
      <div class="bg-gray-900 rounded-lg shadow-lg overflow-hidden">
        <div class="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
          <div class="flex items-center">
            <div id="status-indicator" class="h-2 w-2 rounded-full bg-green-500 mr-2 animate-pulse"></div>
            <span id="status-text" class="text-sm text-gray-300">Connected</span>
          </div>
          <div class="flex items-center gap-3">
            <span id="output-stats" class="text-xs text-gray-500">0 lines</span>
            <button onclick="clearOutput()" class="text-xs text-gray-500 hover:text-gray-300">Clear</button>
            <button onclick="cancelSession()" id="cancel-btn" class="text-xs text-red-400 hover:text-red-300">Cancel</button>
          </div>
        </div>
        <div id="live-output" class="p-4 font-mono text-sm text-green-400 h-64 overflow-y-auto whitespace-pre-wrap"></div>
      </div>
    </div>

    <!-- Run All Button -->
    ${hasRunnableFeatures ? `
    <div class="mb-6 flex gap-3">
      <button
        onclick="startStreaming('automation')"
        id="run-all-btn"
        class="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500"
      >
        <svg class="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
        <span id="run-all-text">Run All Features</span>
      </button>
    </div>
    ` : ""}

    <!-- Feature Table -->
    ${renderFeatureTable(features, project.name)}
  </div>

  <script>
    const projectName = '${escapeHtml(project.name)}';
    let eventSource = null;
    let lineCount = 0;

    // Check for active session on page load
    ${isSessionActive ? "connectToStream();" : "checkForActiveSession();"}

    async function checkForActiveSession() {
      try {
        const response = await fetch('/api/project/' + encodeURIComponent(projectName) + '/session');
        const data = await response.json();
        if (data.active) {
          connectToStream();
        }
      } catch (err) {
        console.error('Error checking session:', err);
      }
    }

    async function startStreaming(type) {
      const formData = new FormData();
      formData.append('type', type);

      disableRunButton();

      try {
        const response = await fetch('/project/' + encodeURIComponent(projectName) + '/run-stream', {
          method: 'POST',
          body: formData
        });
        const data = await response.json();

        if (data.error) {
          if (data.active) {
            connectToStream();
          } else {
            showError(data.error);
            enableRunButton();
          }
          return;
        }

        connectToStream();
      } catch (err) {
        showError('Failed to start session: ' + err.message);
        enableRunButton();
      }
    }

    function connectToStream() {
      document.getElementById('live-output-section').classList.remove('hidden');
      disableRunButton();

      // Disable auto-refresh while streaming
      const metaRefresh = document.querySelector('meta[http-equiv="refresh"]');
      if (metaRefresh) metaRefresh.remove();

      if (eventSource) {
        eventSource.close();
      }

      eventSource = new EventSource('/project/' + encodeURIComponent(projectName) + '/stream');

      eventSource.onmessage = function(event) {
        const data = JSON.parse(event.data);

        if (data.connected) {
          setStatus('Connected', 'green');
          return;
        }

        if (data.chunk) {
          appendOutput(data.chunk);
        }

        if (data.complete) {
          if (data.success) {
            setStatus('Completed successfully', 'green');
          } else {
            setStatus('Failed: ' + (data.error || 'Unknown error'), 'red');
          }
          eventSource.close();
          enableRunButton();
          // Refresh page after completion to show updated status
          setTimeout(() => window.location.reload(), 2000);
        }

        if (data.error) {
          appendOutput('Error: ' + data.error + '\\n');
          setStatus('Error', 'red');
        }
      };

      eventSource.onerror = function() {
        setStatus('Connection lost. Reconnecting...', 'yellow');
      };
    }

    function appendOutput(text) {
      const output = document.getElementById('live-output');
      output.textContent += text;
      output.scrollTop = output.scrollHeight;
      lineCount += (text.match(/\\n/g) || []).length;
      document.getElementById('output-stats').textContent = lineCount + ' lines';
    }

    function clearOutput() {
      document.getElementById('live-output').textContent = '';
      lineCount = 0;
      document.getElementById('output-stats').textContent = '0 lines';
    }

    function setStatus(text, color) {
      const indicator = document.getElementById('status-indicator');
      const statusText = document.getElementById('status-text');
      indicator.className = 'h-2 w-2 rounded-full mr-2';
      if (color === 'green') {
        indicator.classList.add('bg-green-500', 'animate-pulse');
      } else if (color === 'red') {
        indicator.classList.add('bg-red-500');
      } else if (color === 'yellow') {
        indicator.classList.add('bg-yellow-500', 'animate-pulse');
      }
      statusText.textContent = text;
    }

    async function cancelSession() {
      try {
        await fetch('/project/' + encodeURIComponent(projectName) + '/cancel-session', { method: 'POST' });
        setStatus('Cancelled', 'red');
        if (eventSource) eventSource.close();
        enableRunButton();
      } catch (err) {
        console.error('Error cancelling:', err);
      }
    }

    function disableRunButton() {
      const btn = document.getElementById('run-all-btn');
      if (btn) {
        btn.disabled = true;
        btn.classList.add('opacity-50', 'cursor-not-allowed');
      }
    }

    function enableRunButton() {
      const btn = document.getElementById('run-all-btn');
      if (btn) {
        btn.disabled = false;
        btn.classList.remove('opacity-50', 'cursor-not-allowed');
      }
    }

    function showError(message) {
      document.getElementById('live-output-section').classList.remove('hidden');
      document.getElementById('live-output').textContent = 'Error: ' + message;
      setStatus('Error', 'red');
    }
  </script>
</body>
</html>`;
}

/**
 * Render the 404 not found page for a project
 */
export function renderNotFoundPage(projectName: string): string {
  const safeName = escapeHtml(projectName);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Project Not Found - SpecFlow UI</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-100 min-h-screen">
  <div class="max-w-6xl mx-auto px-4 py-8">
    <div class="text-center py-12">
      <svg class="mx-auto h-16 w-16 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <h1 class="mt-4 text-2xl font-bold text-gray-900">Project Not Found</h1>
      <p class="mt-2 text-gray-600">
        The project "<span class="font-medium">${safeName}</span>" could not be found.
      </p>
      <p class="mt-4">
        <a href="/" class="text-blue-600 hover:text-blue-800">
          &larr; Back to projects
        </a>
      </p>
    </div>
  </div>
</body>
</html>`;
}
