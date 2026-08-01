import { v } from "convex/values";

export const GTFS_TABLE_NAMES = [
  "routes",
  "agency",
  "trips",
  "stops",
  "calendar",
  "calendar_dates",
  "shapes",
  "feed_info",
] as const;

export type GtfsTableName = (typeof GTFS_TABLE_NAMES)[number];

export const gtfsTableNameValidator = v.union(
  v.literal("routes"),
  v.literal("agency"),
  v.literal("trips"),
  v.literal("stops"),
  v.literal("calendar"),
  v.literal("calendar_dates"),
  v.literal("shapes"),
  v.literal("feed_info"),
);
