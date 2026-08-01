import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { gtfsTableNameValidator } from "./gtfs/constants";

const routeFields = {
  route_id: v.string(),
  route_short_name: v.nullable(v.string()),
  route_long_name: v.nullable(v.string()),
  route_desc: v.nullable(v.string()),
  route_type: v.number(),
  agency_id: v.string(),
  route_color: v.nullable(v.string()),
  route_text_color: v.nullable(v.string()),
};

const agencyFields = {
  agency_id: v.nullable(v.string()),
  agency_name: v.string(),
  agency_url: v.string(),
  agency_timezone: v.string(),
  agency_lang: v.nullable(v.string()),
  agency_fare_url: v.nullable(v.string()),
};

const tripFields = {
  route_id: v.string(),
  service_id: v.string(),
  trip_id: v.string(),
  trip_headsign: v.nullable(v.string()),
  direction_id: v.nullable(v.number()),
  block_id: v.nullable(v.string()),
  shape_id: v.nullable(v.string()),
  trip_headsign_short: v.nullable(v.string()),
  apc_trip_id: v.nullable(v.string()),
  display_code: v.nullable(v.string()),
  trip_serial_number: v.nullable(v.string()),
  block: v.nullable(v.string()),
};

const stopFields = {
  stop_id: v.string(),
  stop_code: v.nullable(v.string()),
  stop_name: v.nullable(v.string()),
  stop_desc: v.nullable(v.string()),
  stop_lat: v.number(),
  stop_lon: v.number(),
  zone_id: v.nullable(v.string()),
  stop_url: v.nullable(v.string()),
  location_type: v.nullable(v.number()),
  parent_station: v.nullable(v.string()),
  stop_serial_number: v.nullable(v.string()),
};

const calendarFields = {
  service_id: v.string(),
  monday: v.number(),
  tuesday: v.number(),
  wednesday: v.number(),
  thursday: v.number(),
  friday: v.number(),
  saturday: v.number(),
  sunday: v.number(),
  start_date: v.string(), // Format: YYYYMMDD
  end_date: v.string(),
  events_and_status: v.nullable(v.string()),
  operating_days: v.nullable(v.string()),
  duty: v.nullable(v.string()),
};

const calendarDateFields = {
  service_id: v.string(),
  date: v.string(),
  exception_type: v.number(),
};

const shapeFields = {
  shape_id: v.string(),
  shape_pt_lat: v.number(),
  shape_pt_lon: v.number(),
  shape_pt_sequence: v.number(),
};

const feedInfoFields = {
  feed_publisher_name: v.string(),
  feed_publisher_url: v.string(),
  feed_lang: v.string(),
  feed_start_date: v.string(),
  feed_end_date: v.string(),
  feed_version: v.string(),
  feed_description: v.nullable(v.string()),
};

export default defineSchema({
  // GTFS Table
  routes: defineTable(routeFields),
  agency: defineTable(agencyFields),
  trips: defineTable(tripFields),
  stops: defineTable(stopFields),
  calendar: defineTable(calendarFields),
  calendar_dates: defineTable(calendarDateFields),
  shapes: defineTable(shapeFields),
  feed_info: defineTable(feedInfoFields),

  gtfsFeedSourceFiles: defineTable({
    hash: v.string(),
    table_name: gtfsTableNameValidator,
    purged: v.boolean(),
    chunks: v.array(
      v.object({
        storage_id: v.id("_storage"),
        loaded: v.boolean(),
      }),
    ),
  }).index("by_table_name", ["table_name"]),
});
