import express from "express";
import path from "path";
import routes from "./routes";

const PORT = parseInt(process.env.PORT ?? "3000");
const app = express();

app.use(express.json());
app.use("/api", routes);
app.use(express.static(path.join(__dirname, "public")));
app.get("/", (_req, res) => res.sendFile(path.join(__dirname, "public", "dashboard.html")));

app.listen(PORT, () => {
  console.log(`[server] FlowIndexer running at http://localhost:${PORT}`);
});

export default app;
