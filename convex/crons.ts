import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Cron schedules are static, so this lightweight check runs every day. The
// expensive refresh only starts when the stored feed expires in HST.
crons.cron(
  "check GTFS feed expiration",
  "0 13 * * *", // 3:00 AM HST (UTC-10), year-round
  internal.gtfs.transactions.checkForGtfsUpdate,
  {},
);

export default crons;
