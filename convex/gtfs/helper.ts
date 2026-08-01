import JSZip from "jszip";
import Papa from "papaparse";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import type { GtfsTableName } from "./constants";

export type GtfsRow = Record<string, string>;

export const parseGtfsRows = (text: string) => {
  const { data, errors } = Papa.parse<GtfsRow>(text, {
    header: true,
    skipEmptyLines: true,
  });

  if (errors.length > 0) {
    const firstError = errors[0];
    throw new Error(
      `Invalid GTFS CSV at row ${firstError.row ?? "unknown"}: ${firstError.message}`,
    );
  }

  return data;
};

export const downloadGtfsArchive = async () => {
  const feedUrl = process.env.THEBUS_GTFS_FEED_URL;
  if (!feedUrl) {
    throw new Error("THEBUS_GTFS_FEED_URL is not configured");
  }

  const response = await fetch(feedUrl);
  if (!response.ok) {
    throw new Error(`Failed to download GTFS zip: ${response.status}`);
  }

  return await JSZip.loadAsync(await response.arrayBuffer());
};

export const readGtfsTableText = async (
  archive: JSZip,
  tableName: GtfsTableName,
) => {
  const filename = `${tableName}.txt`;
  const file = archive.file(filename);
  if (!file) {
    throw new Error(`${filename} not found in GTFS zip`);
  }
  return await file.async("string");
};

export const readStoredGtfsRows = async (
  ctx: ActionCtx,
  storageId: Id<"_storage">,
) => {
  const blob = await ctx.storage.get(storageId);
  if (!blob) {
    throw new Error(`GTFS source chunk ${storageId} not found`);
  }
  return parseGtfsRows(await blob.text());
};
