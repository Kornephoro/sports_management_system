import { z } from "zod";

// Seed/demo IDs in this project follow UUID text shape but not strict RFC version bits.
export const UuidLikeSchema = z.string().regex(
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
  "Invalid UUID-like id",
);
