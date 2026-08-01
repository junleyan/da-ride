import { Workpool } from "@convex-dev/workpool";
import { components } from "../_generated/api";

// Shared workpool that serializes the GTFS download/purge/load pipeline so we
// don't hammer the upstream feed or thrash the database with parallel writes.
export const gtfsLoadingWorkpool = new Workpool(
  components.gtfsLoadingWorkpool,
  { maxParallelism: 1 },
);
