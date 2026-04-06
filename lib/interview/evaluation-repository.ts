import "server-only";
import fs from "node:fs/promises";
import path from "node:path";

import type {
  AIProvider,
  InterviewEvaluationResult,
  InterviewTurn,
} from "@/lib/interview/types";

export interface InterviewEvaluationRecord {
  id: string;
  provider: AIProvider;
  transcript: InterviewTurn[];
  evaluation: InterviewEvaluationResult;
  createdAt: string;
}

const interviewEvaluationStore = new Map<string, InterviewEvaluationRecord>();
const dataDirectoryPath = path.join(process.cwd(), ".data");
const dataFilePath = path.join(dataDirectoryPath, "interview-evaluations.json");

let isStoreHydrated = false;
let diskPersistenceEnabled = true;
let hasWarnedPersistenceFallback = false;

interface SaveRecordInput {
  provider: AIProvider;
  transcript: InterviewTurn[];
  evaluation: InterviewEvaluationResult;
}

function getErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") {
    return undefined;
  }

  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

function isDiskPermissionError(error: unknown): boolean {
  const code = getErrorCode(error);

  return code === "EROFS" || code === "EACCES" || code === "EPERM";
}

function warnPersistenceFallback(action: "read" | "write", error: unknown) {
  if (hasWarnedPersistenceFallback) {
    return;
  }

  hasWarnedPersistenceFallback = true;

  const reason = error instanceof Error ? error.message : "Unknown error";
  console.warn(
    `Interview evaluation ${action} persistence unavailable. Falling back to in-memory store only.`,
    { reason },
  );
}

async function hydrateStoreFromDisk() {
  if (isStoreHydrated || !diskPersistenceEnabled) {
    return;
  }

  try {
    const fileContent = await fs.readFile(dataFilePath, "utf-8");
    const parsed = JSON.parse(fileContent) as unknown;

    if (Array.isArray(parsed)) {
      for (const item of parsed) {
        if (!item || typeof item !== "object") {
          continue;
        }

        const record = item as InterviewEvaluationRecord;

        if (typeof record.id !== "string" || record.id.trim().length === 0) {
          continue;
        }

        interviewEvaluationStore.set(record.id, record);
      }
    }
  } catch (error) {
    const code = getErrorCode(error);

    if (code === "ENOENT") {
      // Ignore when storage file does not exist.
    } else {
      warnPersistenceFallback("read", error);
    }

    if (isDiskPermissionError(error)) {
      diskPersistenceEnabled = false;
    }
  } finally {
    isStoreHydrated = true;
  }
}

async function persistStoreToDisk() {
  if (!diskPersistenceEnabled) {
    return;
  }

  try {
    await fs.mkdir(dataDirectoryPath, { recursive: true });

    const serialized = JSON.stringify(
      Array.from(interviewEvaluationStore.values()),
      null,
      2,
    );

    await fs.writeFile(dataFilePath, serialized, "utf-8");
  } catch (error) {
    if (isDiskPermissionError(error)) {
      diskPersistenceEnabled = false;
    }

    warnPersistenceFallback("write", error);
  }
}

export async function saveInterviewEvaluationRecord(
  input: SaveRecordInput,
): Promise<InterviewEvaluationRecord> {
  await hydrateStoreFromDisk();

  const record: InterviewEvaluationRecord = {
    id: crypto.randomUUID(),
    provider: input.provider,
    transcript: input.transcript,
    evaluation: input.evaluation,
    createdAt: new Date().toISOString(),
  };

  interviewEvaluationStore.set(record.id, record);
  await persistStoreToDisk();

  return record;
}

export async function getInterviewEvaluationRecord(
  recordId: string,
): Promise<InterviewEvaluationRecord | null> {
  await hydrateStoreFromDisk();
  return interviewEvaluationStore.get(recordId) ?? null;
}
