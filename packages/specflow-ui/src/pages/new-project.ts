/**
 * F-9: New Project Form
 * HTML page with form for creating a new project.
 */

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
 * Render the new project form page
 */
export function renderNewProjectPage(error?: string): string {
  const errorHtml = error
    ? `<div class="mb-4 p-4 bg-red-50 border border-red-200 rounded-md">
        <p class="text-sm text-red-600">${escapeHtml(error)}</p>
      </div>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New Project - SpecFlow UI</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-100 min-h-screen">
  <div class="max-w-2xl mx-auto px-4 py-8">
    <!-- Header -->
    <div class="mb-8">
      <a href="/" class="text-blue-600 hover:text-blue-800 text-sm">&larr; Back to Projects</a>
      <h1 class="text-3xl font-bold text-gray-900 mt-2">New Project</h1>
      <p class="text-gray-600 mt-1">Create a new SpecFlow project</p>
    </div>

    ${errorHtml}

    <!-- Form -->
    <form method="POST" action="/new-project" class="bg-white rounded-lg shadow p-6">
      <div class="mb-6">
        <label for="name" class="block text-sm font-medium text-gray-700 mb-2">
          Project Name
        </label>
        <input
          type="text"
          id="name"
          name="name"
          required
          pattern="[a-z0-9-]+"
          placeholder="my-project"
          class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
        <p class="mt-1 text-sm text-gray-500">
          Lowercase, numbers, hyphens only. Will create ~/work/{name}/
        </p>
      </div>

      <div class="mb-6">
        <label for="description" class="block text-sm font-medium text-gray-700 mb-2">
          Description
        </label>
        <textarea
          id="description"
          name="description"
          required
          rows="4"
          placeholder="A web app that..."
          class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        ></textarea>
        <p class="mt-1 text-sm text-gray-500">
          High-level description of what this project will do
        </p>
      </div>

      <div class="flex justify-end">
        <button
          type="submit"
          class="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          Start Interview
          <svg class="ml-2 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
          </svg>
        </button>
      </div>
    </form>
  </div>
</body>
</html>`;
}
