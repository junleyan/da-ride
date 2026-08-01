import type { MutationCtx } from "../_generated/server";

// GTFS feeds are CSVs, so every cell starts as a string. These helpers convert
// raw cells into the runtime types declared in `schema.ts`. Empty string is
// GTFS' convention for "missing"; we map those to `null`.

const toInteger = (value: string) => parseInt(value);

const toFloat = (value: string) => parseFloat(value);

const toNullableString = (value: string) => (value === "" ? null : value);

const toNullableInteger = (value: string) =>
  value === "" ? null : parseInt(value);

type Row = Record<string, string>;

const parseRoute = (r: Row) => ({
  route_id: r.route_id,
  route_short_name: toNullableString(r.route_short_name),
  route_long_name: toNullableString(r.route_long_name),
  route_desc: toNullableString(r.route_desc),
  route_type: toInteger(r.route_type),
  agency_id: r.agency_id,
  route_color: toNullableString(r.route_color),
  route_text_color: toNullableString(r.route_text_color),
});

const parseAgency = (r: Row) => ({
  agency_id: toNullableString(r.agency_id),
  agency_name: r.agency_name,
  agency_url: r.agency_url,
  agency_timezone: r.agency_timezone,
  agency_lang: toNullableString(r.agency_lang),
  agency_fare_url: toNullableString(r.agency_fare_url),
});

const parseTrip = (r: Row) => ({
  route_id: r.route_id,
  service_id: r.service_id,
  trip_id: r.trip_id,
  trip_headsign: toNullableString(r.trip_headsign),
  direction_id: toNullableInteger(r.direction_id),
  block_id: toNullableString(r.block_id),
  shape_id: toNullableString(r.shape_id),
  apc_trip_id: toNullableString(r.apc_trip_id),
  display_code: toNullableString(r.display_code),
  trip_serial_number: toNullableString(r.trip_serial_number),
  block: toNullableString(r.block),
  trip_headsign_short: toNullableString(r.trip_headsign_short),
});

const parseStop = (r: Row) => ({
  stop_id: r.stop_id,
  stop_code: toNullableString(r.stop_code),
  stop_name: toNullableString(r.stop_name),
  stop_desc: toNullableString(r.stop_desc),
  stop_lat: toFloat(r.stop_lat),
  stop_lon: toFloat(r.stop_lon),
  zone_id: toNullableString(r.zone_id),
  stop_url: toNullableString(r.stop_url),
  location_type: toNullableInteger(r.location_type),
  parent_station: toNullableString(r.parent_station),
  stop_serial_number: toNullableString(r.stop_serial_number),
});

const parseCalendar = (r: Row) => ({
  service_id: r.service_id,
  monday: toInteger(r.monday),
  tuesday: toInteger(r.tuesday),
  wednesday: toInteger(r.wednesday),
  thursday: toInteger(r.thursday),
  friday: toInteger(r.friday),
  saturday: toInteger(r.saturday),
  sunday: toInteger(r.sunday),
  start_date: r.start_date,
  end_date: r.end_date,
  events_and_status: toNullableString(r.events_and_status),
  operating_days: toNullableString(r.operating_days),
  duty: toNullableString(r.duty),
});

const parseCalendarDate = (r: Row) => ({
  service_id: r.service_id,
  date: r.date,
  exception_type: toInteger(r.exception_type),
});

const parseShape = (r: Row) => ({
  shape_id: r.shape_id,
  shape_pt_lat: toFloat(r.shape_pt_lat),
  shape_pt_lon: toFloat(r.shape_pt_lon),
  shape_pt_sequence: toInteger(r.shape_pt_sequence),
});

const parseFeedInfo = (r: Row) => ({
  feed_publisher_name: r.feed_publisher_name,
  feed_publisher_url: r.feed_publisher_url,
  feed_lang: r.feed_lang,
  feed_start_date: r.feed_start_date,
  feed_end_date: r.feed_end_date,
  feed_version: r.feed_version,
  feed_description: toNullableString(r.feed_description),
});

// Per-table inserters. Each entry parses a row and writes it to the matching
// GTFS table. Centralizing them lets us drive the load pipeline from a single
// `tableName -> insert` map instead of an N-way switch.
export const TABLE_INSERTERS = {
  routes: (ctx: MutationCtx, r: Row) => ctx.db.insert("routes", parseRoute(r)),
  agency: (ctx: MutationCtx, r: Row) => ctx.db.insert("agency", parseAgency(r)),
  trips: (ctx: MutationCtx, r: Row) => ctx.db.insert("trips", parseTrip(r)),
  stops: (ctx: MutationCtx, r: Row) => ctx.db.insert("stops", parseStop(r)),
  calendar: (ctx: MutationCtx, r: Row) =>
    ctx.db.insert("calendar", parseCalendar(r)),
  calendar_dates: (ctx: MutationCtx, r: Row) =>
    ctx.db.insert("calendar_dates", parseCalendarDate(r)),
  shapes: (ctx: MutationCtx, r: Row) => ctx.db.insert("shapes", parseShape(r)),
  feed_info: (ctx: MutationCtx, r: Row) =>
    ctx.db.insert("feed_info", parseFeedInfo(r)),
} as const;
