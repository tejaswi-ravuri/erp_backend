// utils/sequence.js
import Counter from "../models/Counter.js";

/**
 * Atomically increments and returns the next value for a given counter
 * key. Creates the counter at 1 on first use (upsert).
 */
export async function nextSequence(key) {
  const doc = await Counter.findByIdAndUpdate(
    key,
    { $inc: { seq: 1 } },
    { new: true, upsert: true },
  );
  return doc.seq;
}
