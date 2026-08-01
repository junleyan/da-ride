"use node";

import { createHash } from "node:crypto";
import { v } from "convex/values";
import Papa from "papaparse";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { internalAction } from "../_generated/server";
import type { ActionCtx } from "../_generated/server";
import { GTFS_TABLE_NAMES, gtfsTableNameValidator } from "./constants";
import type { GtfsTableName } from "./constants";
import {
  downloadGtfsArchive,
  parseGtfsRows,
  readGtfsTableText,
  readStoredGtfsRows,
} from "./helper";
import type { GtfsRow } from "./helper";
import { gtfsLoadingWorkpool } from "./workpool";

// Source files are stored as multiple CSV blobs so each loaded chunk fits
// comfortably under Convex's per-mutation limits.
const MAX_ROWS_PER_CSV_CHUNK = 50_000;
const INSERT_BATCH_SIZE = 500;

// Download and unzip the archive once, then stage only the tables whose source
// text changed. Tables left pending by an interrupted run are resumed too.
export const refreshGtfsSourceFiles = internalAction({
  args: {},
  handler: async (ctx) => {
    const archive = await downloadGtfsArchive();
    const sourceTexts = await Promise.all(
      GTFS_TABLE_NAMES.map(async (tableName) => ({
        tableName,
        text: await readGtfsTableText(archive, tableName),
      })),
    );

    const tablesToReload = new Set<GtfsTableName>();

    for (const { tableName, text } of sourceTexts) {
      const hash = createHash("sha256").update(text).digest("hex");
      const existing = await ctx.runQuery(
        internal.gtfs.transactions.findGtfsFeedSourceFile,
        { tableName },
      );

      if (existing?.hash === hash) {
        if (
          !existing.purged ||
          existing.chunks.some((chunk) => !chunk.loaded)
        ) {
          tablesToReload.add(tableName);
        }
        continue;
      }

      await stageGtfsSourceFile(ctx, tableName, hash, parseGtfsRows(text));
      tablesToReload.add(tableName);
    }

    if (tablesToReload.size > 0) {
      await gtfsLoadingWorkpool.enqueueMutationBatch(
        ctx,
        internal.gtfs.transactions.purgeGtfsTableThenEnqueueLoads,
        [...tablesToReload].map((tableName) => ({ tableName })),
      );
    }

    return [...tablesToReload];
  },
});

const stageGtfsSourceFile = async (
  ctx: ActionCtx,
  tableName: GtfsTableName,
  hash: string,
  rows: GtfsRow[],
) => {
  const storageIds = await uploadCsvChunks(ctx, rows);
  try {
    await ctx.runMutation(
      internal.gtfs.transactions.replaceGtfsFeedSourceFile,
      { tableName, hash, storageIds },
    );
  } catch (error) {
    await Promise.allSettled(
      storageIds.map((storageId) => ctx.storage.delete(storageId)),
    );
    throw error;
  }
};

const uploadCsvChunks = async (
  ctx: ActionCtx,
  rows: GtfsRow[],
): Promise<Id<"_storage">[]> => {
  const storageIds: Id<"_storage">[] = [];
  try {
    for (let start = 0; start < rows.length; start += MAX_ROWS_PER_CSV_CHUNK) {
      const slice = rows.slice(start, start + MAX_ROWS_PER_CSV_CHUNK);
      const blob = new Blob([Papa.unparse(slice)], { type: "text/csv" });
      storageIds.push(await ctx.storage.store(blob));
    }
    return storageIds;
  } catch (error) {
    await Promise.allSettled(
      storageIds.map((storageId) => ctx.storage.delete(storageId)),
    );
    throw error;
  }
};

// Parse a staged chunk and insert its rows into the destination GTFS table.
// If the table hasn't finished purging yet we re-enqueue ourselves so the
// purge -> load ordering stays correct.
export const loadGtfsFeed = internalAction({
  args: {
    tableName: gtfsTableNameValidator,
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    const isPurged = await ctx.runQuery(
      internal.gtfs.transactions.isTablePurged,
      { tableName: args.tableName },
    );
    if (!isPurged) {
      await gtfsLoadingWorkpool.enqueueAction(
        ctx,
        internal.gtfs.actions.loadGtfsFeed,
        { tableName: args.tableName, storageId: args.storageId },
      );
      return;
    }

    const rows = await readStoredGtfsRows(ctx, args.storageId);
    for (let start = 0; start < rows.length; start += INSERT_BATCH_SIZE) {
      const slice = rows.slice(start, start + INSERT_BATCH_SIZE);
      await ctx.runMutation(internal.gtfs.transactions.insertGtfsRows, {
        tableName: args.tableName,
        rows: slice,
      });
    }

    await ctx.runMutation(internal.gtfs.transactions.markChunkAsLoaded, {
      tableName: args.tableName,
      storageId: args.storageId,
    });
  },
});
