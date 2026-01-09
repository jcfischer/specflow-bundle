/**
 * Shared layout components
 */

export function pageHead(title: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - SpecFlow UI</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-100 min-h-screen">
  <div class="max-w-6xl mx-auto px-4 py-8">`;
}

export function pageFooter(): string {
  return `  </div>
</body>
</html>`;
}
