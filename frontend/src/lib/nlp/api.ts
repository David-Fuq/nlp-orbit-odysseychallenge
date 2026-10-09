// Typed client for the FastAPI backend (backend/app/routers/train.py and
// backend/app/ws/progress.py). Wire shapes mirror backend/app/schemas.py.

import { API_BASE_URL, WS_BASE_URL } from "./config";

export interface TrainingExample {
  sentence: string;
  intent: "STRAIGHT" | "BACKWARDS" | "TURN_RIGHT" | "TURN_LEFT" | "TURN_180";
  amount_cm: number | null;
}

export interface EpochMetric {
  epoch: number;
  intent_loss: number;
  amount_loss: number;
  intent_accuracy: number;
}

export interface Prediction {
  sentence: string;
  intent: TrainingExample["intent"];
  amount_cm: number | null;
  command: string;
}

export type TrainingMessage =
  | { type: "log"; message: string }
  | { type: "progress"; progress: number }
  | { type: "metrics"; metrics: EpochMetric }
  | { type: "completed"; message: string }
  | { type: "failed"; message: string };

/** Any unexpected HTTP status. `body` is the parsed JSON if it parses, else the raw text. */
export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, body: unknown, message = `API request failed with status ${status}`) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** `POST /api/predict` returned 404: no trained model exists for this job_id. */
export class NotTrainedError extends ApiError {
  readonly jobId: string;

  constructor(jobId: string, body: unknown) {
    super(404, body, `No trained model for job_id ${jobId}`);
    this.name = "NotTrainedError";
    this.jobId = jobId;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

async function readBody(res: Response): Promise<unknown> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function postJson(path: string, body: unknown): Promise<Response> {
  return fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/**
 * Starts a training run. Resolves once the backend accepts it (202), not when
 * training finishes; the outcome arrives over the WebSocket. An empty corpus
 * is valid (the backend falls back to its base corpus). Corpus validation
 * errors also arrive over the socket as `failed`, not as an HTTP error.
 */
export async function startTraining(
  jobId: string,
  corpus: TrainingExample[],
  epochs: number,
  learningRate: number,
): Promise<void> {
  const res = await postJson("/api/train", {
    job_id: jobId,
    corpus,
    epochs,
    learning_rate: learningRate,
  });
  if (res.status !== 202) throw new ApiError(res.status, await readBody(res));
}

export async function predict(jobId: string, sentences: string[]): Promise<Prediction[]> {
  const res = await postJson("/api/predict", { job_id: jobId, sentences });
  if (res.status === 404) throw new NotTrainedError(jobId, await readBody(res));
  if (!res.ok) throw new ApiError(res.status, await readBody(res));
  const body = (await res.json()) as { predictions: Prediction[] };
  return body.predictions;
}

/** Whether the backend holds a trained model for `jobId`. Recovery path for a missed `completed`. */
export async function getModelStatus(jobId: string): Promise<boolean> {
  const res = await fetch(`${API_BASE_URL}/api/model/${encodeURIComponent(jobId)}`);
  if (res.status !== 200) throw new ApiError(res.status, await readBody(res));
  const body = (await res.json()) as { trained: boolean };
  return body.trained === true;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Narrows a parsed WS payload to a TrainingMessage, or null if it isn't one. */
export function parseTrainingMessage(data: unknown): TrainingMessage | null {
  if (!isObject(data)) return null;
  switch (data.type) {
    case "log":
    case "completed":
    case "failed":
      return typeof data.message === "string" ? (data as TrainingMessage) : null;
    case "progress":
      return typeof data.progress === "number" ? (data as TrainingMessage) : null;
    case "metrics": {
      const m = data.metrics;
      if (
        isObject(m) &&
        typeof m.epoch === "number" &&
        typeof m.intent_loss === "number" &&
        typeof m.amount_loss === "number" &&
        typeof m.intent_accuracy === "number"
      ) {
        return data as TrainingMessage;
      }
      return null;
    }
    default:
      return null;
  }
}

/**
 * Opens the training socket for `jobId` and resolves on its `open` event with
 * a disconnect function. Rejects if the socket errors or closes first.
 *
 * Callers MUST await this before `startTraining` for the same job: the server
 * doesn't buffer, and a run can finish in milliseconds, so a socket that is
 * still CONNECTING can miss the whole stream, including `completed`.
 *
 * After open, a malformed or unknown message is logged with `console.warn` and
 * ignored; it never throws out of the socket's message handler. The returned
 * disconnect function is safe to call more than once.
 */
export function connectTrainingSocket(
  jobId: string,
  onMessage: (msg: TrainingMessage) => void,
): Promise<() => void> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${WS_BASE_URL}/api/ws/training/${encodeURIComponent(jobId)}`);
    let opened = false;
    let closed = false;

    const disconnect = () => {
      if (closed) return;
      closed = true;
      ws.onopen = null;
      ws.onmessage = null;
      ws.onerror = null;
      ws.onclose = null;
      if (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    };

    ws.onopen = () => {
      opened = true;
      resolve(disconnect);
    };

    ws.onerror = () => {
      if (opened) return;
      disconnect();
      reject(new Error(`Training socket for job ${jobId} failed to open`));
    };

    ws.onclose = () => {
      if (opened) return;
      disconnect();
      reject(new Error(`Training socket for job ${jobId} closed before opening`));
    };

    ws.onmessage = (event: MessageEvent) => {
      let msg: TrainingMessage | null = null;
      try {
        msg = parseTrainingMessage(JSON.parse(String(event.data)));
      } catch {
        // Not JSON; handled below like any other unrecognised payload.
      }
      if (msg === null) {
        console.warn("Ignoring unrecognised training message:", event.data);
        return;
      }
      onMessage(msg);
    };
  });
}
