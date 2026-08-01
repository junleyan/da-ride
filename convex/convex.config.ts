import { defineApp } from "convex/server";
import workpool from "@convex-dev/workpool/convex.config.js";
import geospatial from "@convex-dev/geospatial/convex.config.js";

const app = defineApp();
app.use(workpool, { name: "gtfsLoadingWorkpool" });
app.use(geospatial);

export default app;
