import { v } from "convex/values";
import { internal } from "../_generated/api";
import {
  internalMutation as rawInternalMutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server";
import { GTFS_TABLE_NAMES, gtfsTableNameValidator } from "./constants";
import type { GtfsTableName } from "./constants";
import { TABLE_INSERTERS } from "./parsers";
import { hasFeedExpiredInHst } from "./schedule";
import { gtfsLoadingWorkpool } from "./workpool";
import type { DataModel } from "../_generated/dataModel";
import { Triggers } from "convex-helpers/server/triggers";
import {
  customCtx,
  customMutation,
} from "convex-helpers/server/customFunctions";
import { GeospatialIndex } from "@convex-dev/geospatial";
import { components } from "../_generated/api";

const geospatial = new GeospatialIndex(components.geospatial);

const triggers = new Triggers<DataModel>();
triggers.register("stops", async (ctx, change) => {
  if (change.operation === "insert") {
    await geospatial.insert(
      ctx,
      change.id,
      {
        latitude: change.newDoc.stop_lat,
        longitude: change.newDoc.stop_lon,
      },
      {},
    );
  } else if (change.operation === "delete") {
    await geospatial.remove(ctx, change.id);
  }
});

const internalMutation = customMutation(
  rawInternalMutation,
  customCtx(triggers.wrapDB),
);

// ---------------------------------------------------------------------------
// GTFS refresh pipeline (serialized by `gtfsLoadingWorkpool`):
//   1. The daily cron checks whether the current feed expires today in HST.
//   2. `refreshGtfsSourceFiles` downloads the zip once and stages changed files.
//   3. Changed tables are purged in batches, then reloaded from staged chunks.
// ---------------------------------------------------------------------------

const DEFAULT_PURGE_BATCH_SIZE = 1000;
const PURGE_BATCH_SIZE_OVERRIDES: Partial<Record<GtfsTableName, number>> = {
  stops: 100,
};

// ---------------------------------------------------------------------------
// Source-file lookup helpers
// ---------------------------------------------------------------------------

const getFeedSourceFile = (
  ctx: QueryCtx | MutationCtx,
  tableName: GtfsTableName,
) =>
  ctx.db
    .query("gtfsFeedSourceFiles")
    .withIndex("by_table_name", (q) => q.eq("table_name", tableName))
    .unique();

const getFeedSourceFileOrThrow = async (
  ctx: QueryCtx | MutationCtx,
  tableName: GtfsTableName,
) => {
  const file = await getFeedSourceFile(ctx, tableName);
  if (!file) {
    throw new Error(`GTFS feed source file not found for table ${tableName}`);
  }
  return file;
};

// ---------------------------------------------------------------------------
// Source-file state
// ---------------------------------------------------------------------------

export const findGtfsFeedSourceFile = internalQuery({
  args: { tableName: gtfsTableNameValidator },
  handler: (ctx, args) => getFeedSourceFile(ctx, args.tableName),
});

export const replaceGtfsFeedSourceFile = internalMutation({
  args: {
    tableName: gtfsTableNameValidator,
    hash: v.string(),
    storageIds: v.array(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    const existing = await getFeedSourceFile(ctx, args.tableName);
    const sourceFile = {
      hash: args.hash,
      chunks: args.storageIds.map((storage_id) => ({
        storage_id,
        loaded: false,
      })),
      purged: false,
    };

    if (!existing) {
      await ctx.db.insert("gtfsFeedSourceFiles", {
        table_name: args.tableName,
        ...sourceFile,
      });
      return;
    }

    await ctx.db.patch(existing._id, sourceFile);
    await Promise.all(
      existing.chunks.map((chunk) => ctx.storage.delete(chunk.storage_id)),
    );
  },
});

// ---------------------------------------------------------------------------
// Pipeline orchestration
// ---------------------------------------------------------------------------

const sourceNeedsLoading = (
  source: Awaited<ReturnType<typeof getFeedSourceFile>>,
) =>
  source === null ||
  !source.purged ||
  source.chunks.some((chunk) => !chunk.loaded);

const isGtfsRefreshDue = async (ctx: MutationCtx) => {
  const sources = await Promise.all(
    GTFS_TABLE_NAMES.map((tableName) => getFeedSourceFile(ctx, tableName)),
  );
  if (sources.some(sourceNeedsLoading)) {
    return true;
  }

  const feedInfo = await ctx.db.query("feed_info").first();
  if (!feedInfo) {
    return true;
  }
  return hasFeedExpiredInHst(feedInfo.feed_end_date, Date.now());
};

const enqueueGtfsRefresh = (ctx: MutationCtx) =>
  gtfsLoadingWorkpool.enqueueAction(
    ctx,
    internal.gtfs.actions.refreshGtfsSourceFiles,
    {},
    { retry: false },
  );

// Invoked daily at 3:00 AM HST. The network and database work is skipped until
// the current feed reaches its feed_end_date, or an interrupted load needs work.
export const checkForGtfsUpdate = internalMutation({
  args: {},
  handler: async (ctx) => {
    if (!(await isGtfsRefreshDue(ctx))) {
      return false;
    }
    await enqueueGtfsRefresh(ctx);
    return true;
  },
});

// Manual escape hatch for development and operations. Unlike the cron check,
// this always downloads the upstream archive and compares its table hashes.
export const startGtfsLoading = internalMutation({
  args: {},
  handler: async (ctx) => {
    await gtfsLoadingWorkpool.cancelAll(ctx);
    await enqueueGtfsRefresh(ctx);
  },
});

export const cancelWorkpool = internalMutation({
  args: {},
  handler: (ctx) => gtfsLoadingWorkpool.cancelAll(ctx),
});

// ---------------------------------------------------------------------------
// Per-table purge + chunk fan-out
// ---------------------------------------------------------------------------

export const purgeGtfsTableThenEnqueueLoads = internalMutation({
  args: { tableName: gtfsTableNameValidator },
  handler: async (ctx, args) => {
    const file = await getFeedSourceFileOrThrow(ctx, args.tableName);

    if (!file.purged) {
      const batchSize =
        PURGE_BATCH_SIZE_OVERRIDES[args.tableName] ?? DEFAULT_PURGE_BATCH_SIZE;
      const documents = await ctx.db.query(args.tableName).take(batchSize);

      if (documents.length > 0) {
        await Promise.all(documents.map((doc) => ctx.db.delete(doc._id)));
        await gtfsLoadingWorkpool.enqueueMutation(
          ctx,
          internal.gtfs.transactions.purgeGtfsTableThenEnqueueLoads,
          { tableName: args.tableName },
        );
        return;
      }

      await ctx.db.patch(file._id, { purged: true });
    }

    // This also resumes unloaded chunks after an interrupted run.
    for (const chunk of file.chunks) {
      if (chunk.loaded) continue;
      await gtfsLoadingWorkpool.enqueueAction(
        ctx,
        internal.gtfs.actions.loadGtfsFeed,
        { tableName: args.tableName, storageId: chunk.storage_id },
      );
    }
  },
});

// ---------------------------------------------------------------------------
// Chunk-level state used by `loadGtfsFeed`
// ---------------------------------------------------------------------------

export const isTablePurged = internalQuery({
  args: { tableName: gtfsTableNameValidator },
  handler: async (ctx, args) => {
    const file = await getFeedSourceFileOrThrow(ctx, args.tableName);
    return file.purged;
  },
});

export const markChunkAsLoaded = internalMutation({
  args: {
    tableName: gtfsTableNameValidator,
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    const file = await getFeedSourceFileOrThrow(ctx, args.tableName);
    const hasChunk = file.chunks.some(
      (chunk) => chunk.storage_id === args.storageId,
    );
    if (!hasChunk) {
      throw new Error(`Chunk not found for storage id ${args.storageId}`);
    }
    await ctx.db.patch(file._id, {
      chunks: file.chunks.map((chunk) =>
        chunk.storage_id === args.storageId
          ? { ...chunk, loaded: true }
          : chunk,
      ),
    });
  },
});

// ---------------------------------------------------------------------------
// Row insert
// ---------------------------------------------------------------------------

// One mutation handles inserts for every GTFS table. Per-table parsing and
// `ctx.db.insert` are looked up in `TABLE_INSERTERS` (see `parsers.ts`), so
// adding a new feed only requires a new entry there plus a schema table.
export const insertGtfsRows = internalMutation({
  args: {
    tableName: gtfsTableNameValidator,
    rows: v.array(v.record(v.string(), v.string())),
  },
  handler: async (ctx, args) => {
    const insert = TABLE_INSERTERS[args.tableName];
    await Promise.all(args.rows.map((row) => insert(ctx, row)));
  },
});
