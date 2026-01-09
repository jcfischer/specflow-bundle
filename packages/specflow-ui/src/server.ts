/**
 * F-3: HTTP Server
 * Bun native HTTP server with routes for dashboard pages and JSON API.
 */

import * as fs from "fs";
import * as path from "path";
import { scanProjects } from "./lib/scanner";
import { loadProjectData } from "./lib/database";
import { renderLandingPage } from "./pages/landing";
import { renderDetailPage, renderNotFoundPage } from "./pages/detail";
import {
  renderFeatureDetailPage,
  renderFeatureNotFoundPage,
} from "./pages/feature-detail";
import { renderNewProjectPage } from "./pages/new-project";
import {
  renderInterviewPage,
  renderInterviewNotFoundPage,
  TOTAL_PHASES,
  getPhase,
} from "./pages/interview";
import { generateProject } from "./lib/generator";
import { renderGenerationResultPage } from "./pages/generate";
import {
  getNextFeature,
  runSpecKitPhases,
  runImplementation,
  runAutomationLoop,
  runSpecKitPhasesStreaming,
  runImplementationStreaming,
  runAutomationLoopStreaming,
} from "./lib/runner";
import {
  getSession,
  hasActiveSession,
  getBufferedOutput,
  subscribe,
  cancelSession,
  type SessionEvent,
} from "./lib/session-manager";
import { renderRunPage, renderRunNotFoundPage } from "./pages/run";
import { renderRunPhasesResultPage } from "./pages/run-result";
import { renderAutomationResultPage } from "./pages/automation-result";

// Interview state stored per project
interface PendingProject {
  name: string;
  description: string;
  currentPhase: number;
  answers: Record<string, string>;
}

// In-memory storage for new project data (session-like)
const pendingProjects: Map<string, PendingProject> = new Map();

// Response helpers
const html = (content: string, status = 200) =>
  new Response(content, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const redirect = (location: string) =>
  new Response(null, {
    status: 302,
    headers: { Location: location },
  });

// Route matchers
const matchProjectRoute = (pathname: string): string | null => {
  const match = pathname.match(/^\/project\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : null;
};

const matchApiProjectRoute = (pathname: string): string | null => {
  const match = pathname.match(/^\/api\/project\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : null;
};

const matchFeatureRoute = (
  pathname: string
): { projectName: string; featureId: string } | null => {
  const match = pathname.match(/^\/project\/([^/]+)\/feature\/([^/]+)$/);
  return match
    ? {
        projectName: decodeURIComponent(match[1]),
        featureId: decodeURIComponent(match[2]),
      }
    : null;
};

const matchInterviewRoute = (pathname: string): string | null => {
  const match = pathname.match(/^\/interview\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : null;
};

const matchGenerateRoute = (pathname: string): string | null => {
  const match = pathname.match(/^\/generate\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : null;
};

const matchRunRoute = (pathname: string): string | null => {
  const match = pathname.match(/^\/project\/([^/]+)\/run$/);
  return match ? decodeURIComponent(match[1]) : null;
};

const matchRunPhasesRoute = (pathname: string): string | null => {
  const match = pathname.match(/^\/project\/([^/]+)\/run-phases$/);
  return match ? decodeURIComponent(match[1]) : null;
};

const matchRunImplementRoute = (pathname: string): string | null => {
  const match = pathname.match(/^\/project\/([^/]+)\/run-implement$/);
  return match ? decodeURIComponent(match[1]) : null;
};

const matchRunAllRoute = (pathname: string): string | null => {
  const match = pathname.match(/^\/project\/([^/]+)\/run-all$/);
  return match ? decodeURIComponent(match[1]) : null;
};

const matchStreamRoute = (pathname: string): string | null => {
  const match = pathname.match(/^\/project\/([^/]+)\/stream$/);
  return match ? decodeURIComponent(match[1]) : null;
};

const matchRunStreamRoute = (pathname: string): string | null => {
  const match = pathname.match(/^\/project\/([^/]+)\/run-stream$/);
  return match ? decodeURIComponent(match[1]) : null;
};

const matchSessionRoute = (pathname: string): string | null => {
  const match = pathname.match(/^\/api\/project\/([^/]+)\/session$/);
  return match ? decodeURIComponent(match[1]) : null;
};

const matchCancelSessionRoute = (pathname: string): string | null => {
  const match = pathname.match(/^\/project\/([^/]+)\/cancel-session$/);
  return match ? decodeURIComponent(match[1]) : null;
};

/**
 * Read a spec file content safely
 */
function readSpecFile(specPath: string, filename: string): string | null {
  try {
    const filePath = path.join(specPath, filename);
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
}

// Generic 404 page
const notFoundHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>404 - Not Found</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 800px; margin: 0 auto; padding: 2rem; text-align: center; }
    h1 { color: #cc0000; }
    a { color: #0066cc; }
  </style>
</head>
<body>
  <h1>404 - Not Found</h1>
  <p>The page you're looking for doesn't exist.</p>
  <p><a href="/">Go to homepage</a></p>
</body>
</html>`;

/**
 * Validate project name format
 */
function isValidProjectName(name: string): boolean {
  return /^[a-z0-9-]+$/.test(name);
}

// Request handler
async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const { pathname } = url;
  const method = req.method;

  // GET / - Landing page
  if (pathname === "/" && method === "GET") {
    const projects = scanProjects();
    const projectsWithData = projects.map(loadProjectData);
    return html(renderLandingPage(projectsWithData));
  }

  // GET /new-project - New project form
  if (pathname === "/new-project" && method === "GET") {
    return html(renderNewProjectPage());
  }

  // POST /new-project - Handle form submission
  if (pathname === "/new-project" && method === "POST") {
    const formData = await req.formData();
    const name = formData.get("name")?.toString()?.trim() || "";
    const description = formData.get("description")?.toString()?.trim() || "";

    // Validate name
    if (!name) {
      return html(renderNewProjectPage("Project name is required"), 400);
    }
    if (!isValidProjectName(name)) {
      return html(
        renderNewProjectPage(
          "Project name must contain only lowercase letters, numbers, and hyphens"
        ),
        400
      );
    }

    // Validate description
    if (!description) {
      return html(renderNewProjectPage("Description is required"), 400);
    }

    // Store in memory and redirect to interview
    pendingProjects.set(name, {
      name,
      description,
      currentPhase: 1,
      answers: {},
    });
    return redirect(`/interview/${encodeURIComponent(name)}`);
  }

  // GET /interview/:name - Interview page
  const interviewName = matchInterviewRoute(pathname);
  if (interviewName !== null && method === "GET") {
    const pending = pendingProjects.get(interviewName);
    if (!pending) {
      return html(renderInterviewNotFoundPage(interviewName), 404);
    }
    return html(
      renderInterviewPage(
        pending.name,
        pending.description,
        pending.currentPhase,
        pending.answers
      )
    );
  }

  // POST /interview/:name - Handle interview form submission
  if (interviewName !== null && method === "POST") {
    const pending = pendingProjects.get(interviewName);
    if (!pending) {
      return html(renderInterviewNotFoundPage(interviewName), 404);
    }

    const formData = await req.formData();
    const action = formData.get("action")?.toString() || "next";
    const currentPhaseFromForm = parseInt(
      formData.get("currentPhase")?.toString() || "1",
      10
    );

    // Save answers from current phase
    const phase = getPhase(currentPhaseFromForm);
    if (phase) {
      for (const question of phase.questions) {
        const answer = formData.get(question.id)?.toString() || "";
        pending.answers[question.id] = answer;
      }
    }

    // Handle navigation action
    if (action === "prev" && currentPhaseFromForm > 1) {
      pending.currentPhase = currentPhaseFromForm - 1;
    } else if (action === "next" && currentPhaseFromForm < TOTAL_PHASES) {
      pending.currentPhase = currentPhaseFromForm + 1;
    } else if (action === "generate") {
      // Redirect to generate endpoint which handles project creation
      pendingProjects.set(interviewName, pending);
      return redirect(`/generate/${encodeURIComponent(interviewName)}`);
    }

    // Update state and redirect back to interview
    pendingProjects.set(interviewName, pending);
    return redirect(`/interview/${encodeURIComponent(interviewName)}`);
  }

  // GET /generate/:name - Generate project from interview
  const generateName = matchGenerateRoute(pathname);
  if (generateName !== null && method === "GET") {
    const pending = pendingProjects.get(generateName);
    if (!pending) {
      return html(renderInterviewNotFoundPage(generateName), 404);
    }

    // Generate the project
    const result = await generateProject(
      pending.name,
      pending.description,
      pending.answers
    );

    // Clean up pending project on success
    if (result.success) {
      pendingProjects.delete(generateName);
    }

    return html(renderGenerationResultPage(generateName, result));
  }

  // GET /project/:name/run - Run next feature page
  const runProjectName = matchRunRoute(pathname);
  if (runProjectName !== null && method === "GET") {
    const projects = scanProjects();
    const project = projects.find((p) => p.name === runProjectName);
    if (!project) {
      return html(renderRunNotFoundPage(runProjectName), 404);
    }
    const projectWithData = loadProjectData(project);
    const nextResult = await getNextFeature(project.path);
    return html(renderRunPage(projectWithData, nextResult, project.path));
  }

  // POST /project/:name/run-phases - Run SpecKit phases with Claude
  const runPhasesProjectName = matchRunPhasesRoute(pathname);
  if (runPhasesProjectName !== null && method === "POST") {
    const projects = scanProjects();
    const project = projects.find((p) => p.name === runPhasesProjectName);
    if (!project) {
      return html(renderRunNotFoundPage(runPhasesProjectName), 404);
    }

    const formData = await req.formData();
    const featureId = formData.get("featureId")?.toString() || "";
    const phasesStr = formData.get("phases")?.toString() || "";
    const phases = phasesStr.split(",").filter((p) => p.length > 0);

    if (!featureId || phases.length === 0) {
      return html("Missing featureId or phases", 400);
    }

    const projectWithData = loadProjectData(project);
    const result = await runSpecKitPhases(project.path, featureId, phases);

    return html(renderRunPhasesResultPage(projectWithData, featureId, result));
  }

  // POST /project/:name/run-implement - Run implementation with Claude
  const runImplementProjectName = matchRunImplementRoute(pathname);
  if (runImplementProjectName !== null && method === "POST") {
    const projects = scanProjects();
    const project = projects.find((p) => p.name === runImplementProjectName);
    if (!project) {
      return html(renderRunNotFoundPage(runImplementProjectName), 404);
    }

    const formData = await req.formData();
    const featureId = formData.get("featureId")?.toString() || "";

    if (!featureId) {
      return html("Missing featureId", 400);
    }

    // Get the implementation prompt
    const nextResult = await getNextFeature(project.path);
    if (!nextResult.success || nextResult.status !== "ready" || !nextResult.prompt) {
      return html(renderRunPhasesResultPage(loadProjectData(project), featureId, {
        success: false,
        error: "Feature is not ready for implementation",
      }));
    }

    const projectWithData = loadProjectData(project);
    const result = await runImplementation(project.path, featureId, nextResult.prompt);

    return html(renderRunPhasesResultPage(projectWithData, featureId, result));
  }

  // POST /project/:name/run-all - Run full automation loop
  const runAllProjectName = matchRunAllRoute(pathname);
  if (runAllProjectName !== null && method === "POST") {
    const projects = scanProjects();
    const project = projects.find((p) => p.name === runAllProjectName);
    if (!project) {
      return html(renderRunNotFoundPage(runAllProjectName), 404);
    }

    const projectWithData = loadProjectData(project);
    const result = await runAutomationLoop(project.path);

    return html(renderAutomationResultPage(projectWithData, result));
  }

  // GET /project/:name/stream - SSE endpoint for live Claude output
  const streamProjectName = matchStreamRoute(pathname);
  if (streamProjectName !== null && method === "GET") {
    const projects = scanProjects();
    const project = projects.find((p) => p.name === streamProjectName);
    if (!project) {
      return json({ error: "Project not found" }, 404);
    }

    // Create SSE response stream
    const encoder = new TextEncoder();
    let unsubscribe: (() => void) | null = null;

    const stream = new ReadableStream({
      start(controller) {
        // Send initial connection event
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ connected: true })}\n\n`));

        // Send buffered output for late-joining clients
        const buffered = getBufferedOutput(project.path);
        if (buffered.length > 0) {
          for (const line of buffered) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ chunk: line })}\n\n`));
          }
        }

        // Check if session is already complete
        const session = getSession(project.path);
        if (session?.completed) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ complete: true, ...session.result })}\n\n`));
          controller.close();
          return;
        }

        // Subscribe to new events
        unsubscribe = subscribe(project.path, (event: SessionEvent) => {
          try {
            if (event.type === "chunk") {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ chunk: event.data })}\n\n`));
            } else if (event.type === "complete") {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ complete: true, ...JSON.parse(event.data) })}\n\n`));
              controller.close();
            } else if (event.type === "error") {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: event.data })}\n\n`));
            }
          } catch {
            // Connection may have closed
          }
        });
      },
      cancel() {
        if (unsubscribe) unsubscribe();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  }

  // POST /project/:name/run-stream - Start streaming session
  const runStreamProjectName = matchRunStreamRoute(pathname);
  if (runStreamProjectName !== null && method === "POST") {
    const projects = scanProjects();
    const project = projects.find((p) => p.name === runStreamProjectName);
    if (!project) {
      return json({ error: "Project not found" }, 404);
    }

    // Check for active session
    if (hasActiveSession(project.path)) {
      const session = getSession(project.path);
      return json({
        error: "Session already active",
        active: true,
        featureId: session?.featureId,
        streamUrl: `/project/${encodeURIComponent(runStreamProjectName)}/stream`,
      }, 409);
    }

    const formData = await req.formData();
    const runType = formData.get("type")?.toString() || "implement";
    const featureId = formData.get("featureId")?.toString() || "";
    const phasesStr = formData.get("phases")?.toString() || "";

    // Get next feature if not specified
    const nextResult = await getNextFeature(project.path);
    if (!nextResult.success) {
      return json({ error: nextResult.error || "No feature ready" }, 400);
    }

    const actualFeatureId = featureId || nextResult.feature?.id || "";

    // Start the appropriate streaming operation in the background
    if (runType === "phases" && phasesStr) {
      const phases = phasesStr.split(",").filter((p) => p.length > 0);
      // Run in background (don't await)
      runSpecKitPhasesStreaming(project.path, actualFeatureId, phases);
    } else if (runType === "implement" && nextResult.prompt) {
      // Run in background (don't await)
      runImplementationStreaming(project.path, actualFeatureId, nextResult.prompt);
    } else if (runType === "automation") {
      // Run in background (don't await)
      runAutomationLoopStreaming(project.path);
    } else {
      return json({ error: "Invalid run type or missing data" }, 400);
    }

    return json({
      started: true,
      featureId: actualFeatureId,
      runType,
      streamUrl: `/project/${encodeURIComponent(runStreamProjectName)}/stream`,
    });
  }

  // GET /api/project/:name/session - Check session status
  const sessionProjectName = matchSessionRoute(pathname);
  if (sessionProjectName !== null && method === "GET") {
    const projects = scanProjects();
    const project = projects.find((p) => p.name === sessionProjectName);
    if (!project) {
      return json({ error: "Project not found" }, 404);
    }

    const session = getSession(project.path);
    if (!session) {
      return json({ active: false });
    }

    return json({
      active: !session.completed,
      featureId: session.featureId,
      type: session.type,
      startedAt: session.startedAt.toISOString(),
      completed: session.completed,
      result: session.result,
      outputLines: session.output.length,
    });
  }

  // POST /project/:name/cancel-session - Cancel active session
  const cancelProjectName = matchCancelSessionRoute(pathname);
  if (cancelProjectName !== null && method === "POST") {
    const projects = scanProjects();
    const project = projects.find((p) => p.name === cancelProjectName);
    if (!project) {
      return json({ error: "Project not found" }, 404);
    }

    const cancelled = cancelSession(project.path);
    return json({ cancelled });
  }

  // GET /project/:name/feature/:id - Feature detail page
  const featureMatch = matchFeatureRoute(pathname);
  if (featureMatch !== null) {
    const { projectName: fProjectName, featureId } = featureMatch;
    const projects = scanProjects();
    const project = projects.find((p) => p.name === fProjectName);
    if (!project) {
      return html(renderNotFoundPage(fProjectName), 404);
    }
    const projectWithData = loadProjectData(project);
    const feature = projectWithData.features.find((f) => f.id === featureId);
    if (!feature) {
      return html(renderFeatureNotFoundPage(fProjectName, featureId), 404);
    }

    // Read spec files
    let specContent: string | null = null;
    let planContent: string | null = null;
    let tasksContent: string | null = null;

    if (feature.specPath) {
      specContent = readSpecFile(feature.specPath, "spec.md");
      planContent = readSpecFile(feature.specPath, "plan.md");
      tasksContent = readSpecFile(feature.specPath, "tasks.md");
    }

    return html(
      renderFeatureDetailPage(
        projectWithData,
        feature,
        specContent,
        planContent,
        tasksContent
      )
    );
  }

  // GET /project/:name - Project detail page
  const projectName = matchProjectRoute(pathname);
  if (projectName !== null) {
    const projects = scanProjects();
    const project = projects.find((p) => p.name === projectName);
    if (!project) {
      return html(renderNotFoundPage(projectName), 404);
    }
    const projectWithData = loadProjectData(project);
    return html(renderDetailPage(projectWithData, project.path));
  }

  // GET /api/projects - JSON list of projects
  if (pathname === "/api/projects") {
    const projects = scanProjects();
    const projectsWithData = projects.map(loadProjectData);
    return json({ projects: projectsWithData });
  }

  // GET /api/project/:name - JSON detail for one project
  const apiProjectName = matchApiProjectRoute(pathname);
  if (apiProjectName !== null) {
    const projects = scanProjects();
    const project = projects.find((p) => p.name === apiProjectName);
    if (!project) {
      return json({ error: "Project not found" }, 404);
    }
    const projectWithData = loadProjectData(project);
    return json(projectWithData);
  }

  // 404 for unknown routes
  return html(notFoundHtml, 404);
}

// Start server
const port = Number(process.env.PORT) || 3000;

const server = Bun.serve({
  port,
  fetch: handleRequest,
});

console.log(`Server running at http://localhost:${server.port}`);

export { server, handleRequest, html, json, redirect, pendingProjects };
