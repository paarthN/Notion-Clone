import { defineApp } from "convex/server";
import prosemirrorSync from "./components/prosemirrorSync/convex.config.js";

const app = defineApp();
app.use(prosemirrorSync);

export default app;
