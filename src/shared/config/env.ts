import dotenv from "dotenv";

// Must be imported FIRST (before any module whose top-level code reads
// process.env). ESM evaluates static imports before the importing module's
// body runs, so a `dotenv.config()` at the bottom of server.ts executes too
// late for modules like email.ts that construct their client at import time.
dotenv.config();