/**
 * F-12 & F-15: Run Page
 * Shows next feature context with copy-to-clipboard and live streaming output.
 */

import type { ProjectWithData } from "../lib/database";
import type { NextFeatureResult } from "../lib/runner";
import { getSession, hasActiveSession } from "../lib/session-manager";

/**
 * Render the run page showing next feature context
 */
export function renderRunPage(
  project: ProjectWithData,
  result: NextFeatureResult,
  projectPath?: string
): string {
  // Check for active session
  const activeSession = projectPath ? getSession(projectPath) : null;
  const isSessionActive = activeSession && !activeSession.completed;
  const featureSection = result.feature
    ? `
    <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
      <div class="flex items-start justify-between">
        <div>
          <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 mb-2">
            ${result.feature.id}
          </span>
          <h2 class="text-xl font-semibold text-gray-900">${result.feature.name}</h2>
          <p class="text-gray-600 mt-1">${result.feature.description}</p>
        </div>
        <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
          ${result.feature.phase}
        </span>
      </div>
    </div>
    `
    : "";

  const promptSection =
    result.prompt && result.feature
      ? `
    <div class="bg-green-50 border border-green-200 rounded-lg p-6 mb-6">
      <div class="flex items-start">
        <svg class="h-6 w-6 text-green-500 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <div class="ml-4">
          <h3 class="text-lg font-medium text-green-800">Feature Ready for Implementation</h3>
          <p class="text-green-700 mt-1">
            <strong>${result.feature.id}</strong>: ${result.feature.name}
          </p>
        </div>
      </div>

      <div class="mt-6 flex gap-3">
        <button
          onclick="startStreaming('implement', '${result.feature.id}')"
          id="run-implement-btn"
          class="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
        >
          <svg class="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span id="implement-btn-text">Run Implementation with Claude</span>
        </button>
        <button
          onclick="copyPrompt()"
          class="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
        >
          <svg class="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          <span id="copy-text">Copy Prompt</span>
        </button>
      </div>
    </div>

    <div class="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      <div class="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200">
        <h3 class="text-sm font-medium text-gray-700">Implementation Prompt</h3>
      </div>
      <div class="p-4 overflow-x-auto max-h-96 overflow-y-auto">
        <pre id="prompt-content" class="text-xs text-gray-800 whitespace-pre-wrap font-mono leading-relaxed">${escapeHtml(result.prompt)}</pre>
      </div>
    </div>

    <script>
      function copyPrompt() {
        const content = document.getElementById('prompt-content').textContent;
        navigator.clipboard.writeText(content).then(() => {
          const btn = document.getElementById('copy-text');
          btn.textContent = 'Copied!';
          setTimeout(() => { btn.textContent = 'Copy Prompt'; }, 2000);
        });
      }
    </script>
    `
      : "";

  // Section for when feature needs SpecKit phases
  const needsPhasesSection =
    result.status === "needs_phases" && result.feature && result.neededPhases
      ? `
    <div class="bg-amber-50 border border-amber-200 rounded-lg p-6 mb-6">
      <div class="flex items-start justify-between">
        <div class="flex items-start">
          <svg class="h-6 w-6 text-amber-500 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div class="ml-4">
            <h3 class="text-lg font-medium text-amber-800">Feature Needs SpecKit Phases</h3>
            <p class="text-amber-700 mt-1">
              <strong>${result.feature.id}</strong>: ${result.feature.name}
            </p>
            <p class="text-amber-600 text-sm mt-2">
              This feature needs the following phases before implementation:
            </p>
            <ul class="mt-2 space-y-1">
              ${result.neededPhases
                .map(
                  (phase) => `
                <li class="flex items-center text-sm text-amber-700">
                  <svg class="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                  </svg>
                  specflow ${phase} ${result.feature!.id}
                </li>
              `
                )
                .join("")}
            </ul>
          </div>
        </div>
      </div>

      <div class="mt-6 flex gap-3">
        <button
          onclick="startStreaming('phases', '${result.feature.id}', '${result.neededPhases.join(",")}')"
          id="run-phases-btn"
          class="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-amber-600 hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-500"
        >
          <svg class="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span id="run-btn-text">Run SpecKit Phases with Claude</span>
        </button>
      </div>

      <p class="mt-4 text-xs text-amber-600">
        This will spawn Claude Code to run the specify, plan, and tasks phases with live output streaming.
      </p>
    </div>
    `
      : "";

  const errorSection =
    result.status === "all_complete" ||
    (!result.success && result.error && result.status !== "needs_phases")
      ? `
    <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
      <div class="flex items-start">
        <svg class="h-5 w-5 text-yellow-400 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
          <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
        </svg>
        <div class="ml-3">
          <h3 class="text-sm font-medium text-yellow-800">No Features Ready</h3>
          <p class="text-sm text-yellow-700 mt-1">${escapeHtml(result.error || "All features complete")}</p>
          <p class="text-sm text-yellow-700 mt-2">All features may be complete, or dependencies need to be resolved first.</p>
        </div>
      </div>
    </div>
    `
      : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="refresh" content="5">
  <title>Run - ${project.name} - SpecFlow UI</title>
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
      <span class="text-gray-900">Run</span>
    </nav>

    <!-- Header -->
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold text-gray-900">Run Next Feature</h1>
        <p class="text-gray-600 mt-1">Get the implementation prompt for the next ready feature</p>
      </div>
      <a
        href="/project/${encodeURIComponent(project.name)}"
        class="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
      >
        <svg class="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        Back to Project
      </a>
    </div>

    ${featureSection}
    ${needsPhasesSection}
    ${result.status === "ready" ? promptSection : ""}
    ${errorSection}

    <!-- Live Output Section -->
    <div id="live-output-section" class="${isSessionActive ? "" : "hidden"} mt-6">
      <div class="bg-gray-900 rounded-lg shadow-lg overflow-hidden">
        <div class="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
          <div class="flex items-center">
            <div id="status-indicator" class="h-2 w-2 rounded-full bg-green-500 mr-2 animate-pulse"></div>
            <span id="status-text" class="text-sm text-gray-300">Connected</span>
          </div>
          <button
            onclick="cancelSession()"
            id="cancel-btn"
            class="text-xs text-red-400 hover:text-red-300"
          >
            Cancel
          </button>
        </div>
        <div id="live-output" class="p-4 font-mono text-sm text-green-400 h-96 overflow-y-auto whitespace-pre-wrap"></div>
      </div>
      <div class="mt-2 flex items-center justify-between text-sm text-gray-500">
        <span id="output-stats">0 lines</span>
        <button onclick="clearOutput()" class="text-gray-500 hover:text-gray-700">Clear</button>
      </div>
    </div>

    <!-- Run All Section -->
    ${
      result.status !== "all_complete"
        ? `
    <div class="mt-6 bg-purple-50 border border-purple-200 rounded-lg p-4">
      <div class="flex items-center justify-between">
        <div>
          <h4 class="text-sm font-medium text-purple-800">Full Automation (with Live Output)</h4>
          <p class="text-sm text-purple-600 mt-1">Run all features automatically with real-time output streaming</p>
        </div>
        <button
          onclick="startStreaming('automation')"
          id="run-all-stream-btn"
          class="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500"
        >
          <svg class="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          Run All Features
        </button>
      </div>
    </div>
    `
        : ""
    }

    <!-- Usage Instructions -->
    <div class="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
      <h4 class="text-sm font-medium text-blue-800 mb-2">Manual Alternative</h4>
      <ol class="text-sm text-blue-700 list-decimal list-inside space-y-1">
        <li>Copy the prompt above</li>
        <li>In Claude Code, use the Task tool with subagent_type="general-purpose"</li>
        <li>Paste the prompt as the task description</li>
        <li>The agent will implement the feature with fresh context</li>
      </ol>
    </div>
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

    async function startStreaming(type, featureId, phases) {
      const formData = new FormData();
      formData.append('type', type);
      if (featureId) formData.append('featureId', featureId);
      if (phases) formData.append('phases', phases);

      // Disable buttons
      disableButtons();

      try {
        const response = await fetch('/project/' + encodeURIComponent(projectName) + '/run-stream', {
          method: 'POST',
          body: formData
        });
        const data = await response.json();

        if (data.error) {
          if (data.active) {
            // Session already running - just connect
            connectToStream();
          } else {
            showError(data.error);
            enableButtons();
          }
          return;
        }

        // Connect to stream
        connectToStream();
      } catch (err) {
        showError('Failed to start session: ' + err.message);
        enableButtons();
      }
    }

    function connectToStream() {
      // Show output section
      document.getElementById('live-output-section').classList.remove('hidden');

      // Close existing connection
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
          enableButtons();
          // Disable auto-refresh after completion so user can see results
          const metaRefresh = document.querySelector('meta[http-equiv="refresh"]');
          if (metaRefresh) metaRefresh.remove();
        }

        if (data.error) {
          appendOutput('\\nError: ' + data.error + '\\n');
          setStatus('Error', 'red');
        }
      };

      eventSource.onerror = function() {
        setStatus('Connection lost. Reconnecting...', 'yellow');
      };

      // Disable buttons while streaming
      disableButtons();
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
        await fetch('/project/' + encodeURIComponent(projectName) + '/cancel-session', {
          method: 'POST'
        });
        setStatus('Cancelled', 'red');
        if (eventSource) eventSource.close();
        enableButtons();
      } catch (err) {
        console.error('Error cancelling:', err);
      }
    }

    function disableButtons() {
      const btns = ['run-phases-btn', 'run-implement-btn', 'run-all-stream-btn'];
      btns.forEach(id => {
        const btn = document.getElementById(id);
        if (btn) {
          btn.disabled = true;
          btn.classList.add('opacity-50', 'cursor-not-allowed');
        }
      });
    }

    function enableButtons() {
      const btns = ['run-phases-btn', 'run-implement-btn', 'run-all-stream-btn'];
      btns.forEach(id => {
        const btn = document.getElementById(id);
        if (btn) {
          btn.disabled = false;
          btn.classList.remove('opacity-50', 'cursor-not-allowed');
        }
      });
    }

    function showError(message) {
      const output = document.getElementById('live-output');
      document.getElementById('live-output-section').classList.remove('hidden');
      output.textContent = 'Error: ' + message;
      setStatus('Error', 'red');
    }

    function copyPrompt() {
      const content = document.getElementById('prompt-content');
      if (content) {
        navigator.clipboard.writeText(content.textContent).then(() => {
          const btn = document.getElementById('copy-text');
          btn.textContent = 'Copied!';
          setTimeout(() => { btn.textContent = 'Copy Prompt'; }, 2000);
        });
      }
    }
  </script>
</body>
</html>`;
}

/**
 * Render error page when project not found
 */
export function renderRunNotFoundPage(projectName: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Project Not Found - SpecFlow UI</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-100 min-h-screen">
  <div class="max-w-4xl mx-auto px-4 py-8">
    <div class="bg-red-50 border border-red-200 rounded-lg p-6">
      <h1 class="text-xl font-bold text-red-800">Project Not Found</h1>
      <p class="text-red-700 mt-2">Could not find project: ${escapeHtml(projectName)}</p>
      <a href="/" class="inline-block mt-4 text-red-600 hover:text-red-800">← Back to Projects</a>
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
