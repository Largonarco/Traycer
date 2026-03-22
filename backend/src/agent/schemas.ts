import { z } from "zod";

// ─── Q&A Structured Output Schemas ──────────────────────────────────────────
// Questions
export const QuestionSchema = z.object({
  id: z.string().describe("Unique identifier for this question (e.g., 'q1', 'q2')"),
  statement: z.string().describe("The question title/statement shown to the user"),
  description: z.string().describe("Additional context or explanation for the question"),
  options: z.array(z.string()).describe("List of selectable options for the user"),
  multiselect: z.boolean().describe("Whether the user can select multiple options"),
});

export const QuestionsPayloadSchema = z.object({
  questions: z
    .array(QuestionSchema)
    .min(1)
    .describe("List of questions to ask the user"),
});

// Answers
export const AnswerSchema = z.object({
  questionId: z.string().describe("ID of the question being answered"),
  selectedOptions: z
    .array(z.string())
    .min(1)
    .describe("The option(s) selected by the user"),
});

export const AnswersPayloadSchema = z.object({
  answers: z
    .array(AnswerSchema)
    .min(1)
    .describe("List of answers to the questions"),
});

// ─── Diff/Patch Schema ──────────────────────────────────────────────────────
export const DiffBlockSchema = z.object({
  search: z.string().describe("The exact text to find in the artifact"),
  replace: z.string().describe("The text to replace it with"),
});

export const DiffPayloadSchema = z.object({
  patches: z
    .array(DiffBlockSchema)
    .min(1)
    .describe("List of search-replace blocks to apply"),
  artifactId: z.string().describe("ID of the artifact to patch"),
  baseVersion: z
    .number()
    .int()
    .min(0)
    .describe("Version number the patches are based on"),
});

// ─── Inferred Types ─────────────────────────────────────────────────────────
export type Answer = z.infer<typeof AnswerSchema>;
export type Question = z.infer<typeof QuestionSchema>;
export type DiffBlock = z.infer<typeof DiffBlockSchema>;
export type DiffPayload = z.infer<typeof DiffPayloadSchema>;
export type AnswersPayload = z.infer<typeof AnswersPayloadSchema>;
export type QuestionsPayload = z.infer<typeof QuestionsPayloadSchema>;
