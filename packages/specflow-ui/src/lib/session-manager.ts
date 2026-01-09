/**
 * F-15: Session Manager
 * Tracks active Claude sessions per project for live output streaming.
 */

import type { Subprocess } from "bun";

export interface ActiveSession {
  projectPath: string;
  featureId: string;
  type: "phases" | "implement" | "automation";
  startedAt: Date;
  output: string[]; // Buffer last N lines for late-joining clients
  listeners: Set<(event: SessionEvent) => void>;
  process: Subprocess | null;
  completed: boolean;
  result?: {
    success: boolean;
    error?: string;
  };
}

export interface SessionEvent {
  type: "chunk" | "complete" | "error";
  data: string;
  timestamp: Date;
}

// In-memory session store (keyed by project path)
const activeSessions: Map<string, ActiveSession> = new Map();

// Max lines to buffer for late-joining clients
const MAX_BUFFER_LINES = 500;

// Session timeout (30 minutes)
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

/**
 * Get active session for a project
 */
export function getSession(projectPath: string): ActiveSession | undefined {
  return activeSessions.get(projectPath);
}

/**
 * Check if project has an active session
 */
export function hasActiveSession(projectPath: string): boolean {
  const session = activeSessions.get(projectPath);
  return session !== undefined && !session.completed;
}

/**
 * Start a new session for a project
 */
export function startSession(
  projectPath: string,
  featureId: string,
  type: ActiveSession["type"] = "implement"
): ActiveSession {
  // Clean up any existing completed session
  const existing = activeSessions.get(projectPath);
  if (existing && !existing.completed) {
    throw new Error("Session already active for this project");
  }

  const session: ActiveSession = {
    projectPath,
    featureId,
    type,
    startedAt: new Date(),
    output: [],
    listeners: new Set(),
    process: null,
    completed: false,
  };

  activeSessions.set(projectPath, session);

  // Set timeout to auto-cleanup stale sessions
  setTimeout(() => {
    const current = activeSessions.get(projectPath);
    if (current === session && !session.completed) {
      broadcast(projectPath, {
        type: "error",
        data: "Session timed out after 30 minutes",
        timestamp: new Date(),
      });
      endSession(projectPath);
    }
  }, SESSION_TIMEOUT_MS);

  return session;
}

/**
 * End a session and notify all listeners
 */
export function endSession(projectPath: string, result?: { success: boolean; error?: string }): void {
  const session = activeSessions.get(projectPath);
  if (!session) return;

  session.completed = true;
  session.result = result;

  // Notify all listeners of completion
  broadcast(projectPath, {
    type: "complete",
    data: JSON.stringify(result || { success: true }),
    timestamp: new Date(),
  });

  // Keep session around for 5 minutes so late clients can see result
  setTimeout(() => {
    const current = activeSessions.get(projectPath);
    if (current === session) {
      activeSessions.delete(projectPath);
    }
  }, 5 * 60 * 1000);
}

/**
 * Set the process handle for a session
 */
export function setSessionProcess(projectPath: string, process: Subprocess): void {
  const session = activeSessions.get(projectPath);
  if (session) {
    session.process = process;
  }
}

/**
 * Subscribe to session events
 * Returns unsubscribe function
 */
export function subscribe(
  projectPath: string,
  callback: (event: SessionEvent) => void
): () => void {
  const session = activeSessions.get(projectPath);
  if (!session) {
    // No session, but we still allow subscription (will get events when session starts)
    // Create a temporary listener holder
    return () => {};
  }

  session.listeners.add(callback);

  return () => {
    session.listeners.delete(callback);
  };
}

/**
 * Broadcast event to all listeners and buffer output
 */
export function broadcast(projectPath: string, event: SessionEvent): void {
  const session = activeSessions.get(projectPath);
  if (!session) return;

  // Buffer chunk events
  if (event.type === "chunk") {
    session.output.push(event.data);
    // Trim buffer if too large
    while (session.output.length > MAX_BUFFER_LINES) {
      session.output.shift();
    }
  }

  // Notify all listeners
  for (const listener of session.listeners) {
    try {
      listener(event);
    } catch {
      // Ignore errors in listeners
    }
  }
}

/**
 * Broadcast a chunk of output
 */
export function broadcastChunk(projectPath: string, chunk: string): void {
  broadcast(projectPath, {
    type: "chunk",
    data: chunk,
    timestamp: new Date(),
  });
}

/**
 * Get buffered output for late-joining clients
 */
export function getBufferedOutput(projectPath: string): string[] {
  const session = activeSessions.get(projectPath);
  return session?.output || [];
}

/**
 * Get all active sessions (for status endpoint)
 */
export function getAllSessions(): Map<string, ActiveSession> {
  return activeSessions;
}

/**
 * Cancel a session's process
 */
export function cancelSession(projectPath: string): boolean {
  const session = activeSessions.get(projectPath);
  if (!session || !session.process) return false;

  try {
    session.process.kill();
    endSession(projectPath, { success: false, error: "Cancelled by user" });
    return true;
  } catch {
    return false;
  }
}
