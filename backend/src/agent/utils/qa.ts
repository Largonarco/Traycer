import { getCheckpointer } from "../../agent/index.js";

/**
 * Checks if a LangGraph thread has a pending interrupt by inspecting
 * the checkpoint state via PostgresSaver.
 *
 * Per LangGraph documentation, when interrupt() is called inside a tool,
 * the graph pauses and the interrupt payload is stored as a pending write
 * on the "__interrupt__" channel. We check for this to determine if the
 * thread is waiting for a Command({ resume }) to continue.
 *
 * This is the canonical way to detect pending interrupts when using
 * PostgresSaver — check pendingWrites for the __interrupt__ channel.
 */
export async function hasPendingInterrupt(sessionId: string): Promise<boolean> {
  try {
    const checkpointer = await getCheckpointer();

    const config = { configurable: { thread_id: sessionId } };
    const state = await checkpointer.getTuple(config);
    if (!state) return false;

    const pendingWrites = state.pendingWrites ?? [];
    for (const write of pendingWrites) {
      if (Array.isArray(write) && write.length >= 2) {
        const channel = write[1];

        if (channel === "__interrupt__") {
          return true;
        }
      }
    }

    return false;
  } catch (err) {
    console.warn("[chat] Error checking interrupt state:", err);
    return false;
  }
}

/**
 * Extracts the interrupt payload (questions) from the checkpoint state.
 *
 * When the ask_clarification_questions tool calls interrupt(), the payload
 * ({ questions: [...] }) is stored in the __interrupt__ channel's pending
 * writes. This function retrieves it so the backend can send it to the
 * frontend as a Q&A SSE event.
 *
 * Returns the interrupt value (e.g., { questions: [...] }) or null.
 */
export async function getInterruptPayload(sessionId: string): Promise<unknown | null> {
  try {
    const checkpointer = await getCheckpointer();

    const config = { configurable: { thread_id: sessionId } };
    const state = await checkpointer.getTuple(config);
    if (!state?.pendingWrites) return null;

    for (const write of state.pendingWrites) {
      if (Array.isArray(write) && write.length >= 3) {
        const channel = write[1];

        if (channel === "__interrupt__") {
          const interruptArr = write[2];

          if (Array.isArray(interruptArr) && interruptArr.length > 0) {
            const val = interruptArr[0]?.value;
            if (val) return val;
          }
        }
      }
    }

    return null;
  } catch (err) {
    console.warn("[chat] Error reading interrupt payload from checkpoint:", err);
    return null;
  }
}
