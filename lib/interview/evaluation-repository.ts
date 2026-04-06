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

interface SaveRecordInput {
  provider: AIProvider;
  transcript: InterviewTurn[];
  evaluation: InterviewEvaluationResult;
}

async function hydrateStoreFromDisk() {
  if (isStoreHydrated) {
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
  } catch {
    // Ignore when storage file does not exist or has invalid content.
  } finally {
    isStoreHydrated = true;
  }
}

async function persistStoreToDisk() {
  await fs.mkdir(dataDirectoryPath, { recursive: true });

  const serialized = JSON.stringify(
    Array.from(interviewEvaluationStore.values()),
    null,
    2,
  );

  await fs.writeFile(dataFilePath, serialized, "utf-8");
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
