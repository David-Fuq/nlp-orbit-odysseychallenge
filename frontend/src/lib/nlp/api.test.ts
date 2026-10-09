import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// Imported via the `@/` alias on purpose: proves vitest.config.ts resolves it.
import {
  ApiError,
  NotTrainedError,
  connectTrainingSocket,
  getModelStatus,
  predict,
  startTraining,
  type TrainingExample,
  type TrainingMessage,
} from "@/lib/nlp/api";

// A controllable stand-in for the browser WebSocket. Node 22 has a real
// global WebSocket, so every test that connects must stub it.
class FakeWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  readyState = FakeWebSocket.CONNECTING;
  onopen: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  onclose: ((ev: unknown) => void) | null = null;
  close = vi.fn(() => {
    this.readyState = FakeWebSocket.CLOSED;
  });

  constructor(public url: string) {
    FakeWebSocket.instances.push(this);
  }

  fireOpen() {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.({});
  }
  fireError() {
    this.onerror?.({});
  }
  fireClose() {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.({});
  }
  fireMessage(data: unknown) {
    this.onmessage?.({ data });
  }
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// Lets any already-queued promise callbacks run.
const flush = () => new Promise((r) => setTimeout(r, 0));

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  FakeWebSocket.instances = [];
  vi.stubGlobal("WebSocket", FakeWebSocket);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("startTraining", () => {
  const corpus: TrainingExample[] = [
    { sentence: "roll forward 40 centimeters", intent: "STRAIGHT", amount_cm: 40 },
    { sentence: "turn left", intent: "TURN_LEFT", amount_cm: null },
  ];

  it("POSTs the train body shape and resolves on 202", async () => {
    fetchMock.mockResolvedValue(jsonResponse(202, { job_id: "j1" }));
    await expect(startTraining("j1", corpus, 50, 0.05)).resolves.toBeUndefined();

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:8000/api/train");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.parse(init.body)).toEqual({
      job_id: "j1",
      corpus,
      epochs: 50,
      learning_rate: 0.05,
    });
  });

  it("throws ApiError with status and body on any other status", async () => {
    const detail = [{ msg: "Input should be greater than 0" }];
    fetchMock.mockResolvedValue(jsonResponse(422, { detail }));
    const err = await startTraining("j1", [], 0, 0.05).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(422);
    expect(err.body).toEqual({ detail });
  });
});

describe("predict", () => {
  it("returns the predictions array", async () => {
    const predictions = [
      { sentence: "roll forward 64 cm", intent: "STRAIGHT", amount_cm: 64, command: "STRAIGHT 64" },
    ];
    fetchMock.mockResolvedValue(jsonResponse(200, { job_id: "j1", predictions }));
    await expect(predict("j1", ["roll forward 64 cm"])).resolves.toEqual(predictions);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:8000/api/predict");
    expect(JSON.parse(init.body)).toEqual({ job_id: "j1", sentences: ["roll forward 64 cm"] });
  });

  it("throws NotTrainedError on 404", async () => {
    fetchMock.mockResolvedValue(jsonResponse(404, { detail: "No trained model" }));
    const err = await predict("fresh", ["x"]).catch((e) => e);
    expect(err).toBeInstanceOf(NotTrainedError);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(404);
    expect(err.jobId).toBe("fresh");
    expect(err.body).toEqual({ detail: "No trained model" });
  });

  it("throws a plain ApiError on other failures, keeping a non-JSON body as text", async () => {
    fetchMock.mockResolvedValue(new Response("Internal Server Error", { status: 500 }));
    const err = await predict("j1", ["x"]).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).not.toBeInstanceOf(NotTrainedError);
    expect(err.status).toBe(500);
    expect(err.body).toBe("Internal Server Error");
  });
});

describe("getModelStatus", () => {
  it.each([true, false])("returns trained=%s", async (trained) => {
    fetchMock.mockResolvedValue(jsonResponse(200, { job_id: "j 1", trained }));
    await expect(getModelStatus("j 1")).resolves.toBe(trained);
    expect(fetchMock.mock.calls[0][0]).toBe("http://localhost:8000/api/model/j%201");
  });

  it("treats a non-200 as an error, not as false", async () => {
    fetchMock.mockResolvedValue(jsonResponse(404, { detail: "Not Found" }));
    await expect(getModelStatus("j1")).rejects.toBeInstanceOf(ApiError);
  });
});

describe("connectTrainingSocket", () => {
  it("connects to the ws URL derived from the API base URL", () => {
    void connectTrainingSocket("job-1", () => {});
    expect(FakeWebSocket.instances[0].url).toBe("ws://localhost:8000/api/ws/training/job-1");
  });

  it("resolves only after the socket's open event", async () => {
    let resolved = false;
    const pending = connectTrainingSocket("j1", () => {}).then((d) => {
      resolved = true;
      return d;
    });
    await flush();
    expect(resolved).toBe(false);

    FakeWebSocket.instances[0].fireOpen();
    const disconnect = await pending;
    expect(resolved).toBe(true);
    expect(typeof disconnect).toBe("function");
  });

  it("rejects if the socket errors before opening", async () => {
    const pending = connectTrainingSocket("j1", () => {});
    FakeWebSocket.instances[0].fireError();
    await expect(pending).rejects.toThrow(/failed to open/);
  });

  it("rejects if the socket closes before opening", async () => {
    const pending = connectTrainingSocket("j1", () => {});
    FakeWebSocket.instances[0].fireClose();
    await expect(pending).rejects.toThrow(/closed before opening/);
  });

  it("dispatches parsed messages to the callback", async () => {
    const received: TrainingMessage[] = [];
    const pending = connectTrainingSocket("j1", (m) => received.push(m));
    const ws = FakeWebSocket.instances[0];
    ws.fireOpen();
    await pending;

    const stream: TrainingMessage[] = [
      { type: "log", message: "Training started" },
      { type: "progress", progress: 0.5 },
      {
        type: "metrics",
        metrics: { epoch: 1, intent_loss: 1.63, amount_loss: 1.23, intent_accuracy: 0.2 },
      },
      { type: "completed", message: "Training complete" },
      { type: "failed", message: "boom" },
    ];
    for (const m of stream) ws.fireMessage(JSON.stringify(m));
    expect(received).toEqual(stream);
  });

  it("warns and ignores malformed or unknown messages without throwing", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const onMessage = vi.fn();
    const pending = connectTrainingSocket("j1", onMessage);
    const ws = FakeWebSocket.instances[0];
    ws.fireOpen();
    await pending;

    expect(() => {
      ws.fireMessage("not json {");
      ws.fireMessage(JSON.stringify({ type: "mystery" }));
      ws.fireMessage(JSON.stringify({ type: "metrics", metrics: { epoch: 1 } }));
      ws.fireMessage(JSON.stringify(null));
    }).not.toThrow();
    expect(onMessage).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(4);
  });

  it("returns a disconnect that closes the socket and is safe to call twice", async () => {
    const onMessage = vi.fn();
    const pending = connectTrainingSocket("j1", onMessage);
    const ws = FakeWebSocket.instances[0];
    ws.fireOpen();
    const disconnect = await pending;

    disconnect();
    expect(ws.close).toHaveBeenCalledTimes(1);
    expect(() => disconnect()).not.toThrow();
    expect(ws.close).toHaveBeenCalledTimes(1);

    // No more dispatches after disconnect.
    ws.fireMessage(JSON.stringify({ type: "log", message: "late" }));
    expect(onMessage).not.toHaveBeenCalled();
  });
});
