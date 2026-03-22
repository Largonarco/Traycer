import { z } from "zod";
import { tool } from "@langchain/core/tools";
import { QuestionSchema } from "../schemas.js";
import { interrupt } from "@langchain/langgraph";

/**
 * The agent's ONLY mechanism for asking the user questions.
 *
 * The agent must NEVER ask questions in plain text responses — all user-facing
 * questions must go through this tool. It interrupts the graph, presents
 * structured questions in the UI, and returns the user's selections.
 *
 * Multiple rounds of clarification are expected and encouraged.
 */
export const askClarificationQuestions = tool(
  async ({ questions }: { questions: Array<{ id: string; statement: string; description: string; options: string[]; multiselect: boolean }> }) => {
    // Freeze Graph statement
    // Send Questions with interrupt
    const userResponse = interrupt({
      questions,
    }) as { answers: Array<{ questionId: string; selectedOptions: string[] }> };

    // Format Answers
    if (!userResponse || !userResponse.answers) {
      return "The user did not provide answers. Proceed with your best judgment based on available context.";
    }
    const answerLines = userResponse.answers.map((a) => {
      return `- Question "${a.questionId}": ${a.selectedOptions.join(", ")}`;
    });

    return `User answered ${userResponse.answers.length} question(s):\n${answerLines.join("\n")}\n\nProceed with the workflow using these answers as context.`;
  },
  {
    name: "ask_clarification_questions",
    description:
      "This is your ONLY mechanism for asking the user questions. You must NEVER ask questions in plain text — always use this tool. " +
      "Call this tool whenever you need to resolve ambiguity, narrow scope, surface assumptions, or gather requirements. " +
      "Each question must have concrete, selectable options (single or multi-select) that help the user decide quickly. " +
      "The tool pauses execution, presents the questions to the user in a structured UI, and returns their answers. " +
      "Aim for 3-7 focused questions per round. Multiple rounds are expected and encouraged — do not rush past clarification.",
    schema: z.object({
      questions: z
        .array(QuestionSchema)
        .min(1)
        .max(10)
        .describe("List of structured questions to ask the user"),
    }),
  }
);
