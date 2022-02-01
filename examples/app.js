import { dirname, join } from "path";
import { fileURLToPath } from "url";
import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import passport from "passport";
import cookieParser from "cookie-parser";
import config from "./config/main.js";
import { ErrorLogs, logPretty, initMorgan } from "./services/logging.js";
import passportConfig from "./middleware/authentication.js";
import users from "./routes/users.js";
import { handleServerErrors } from "./middleware/errorHandling.js";

const app = express();
app.use(cors());
app.use(express.json());
app.use(cookieParser());
app.use(passport.initialize());
passportConfig(passport);

if (config.env.mode === "development") initMorgan(app);
app.use("/api/users", users);

app.use(
  "/",
  express.static(
    join(dirname(fileURLToPath(import.meta.url)), "../client/build"),
  ),
);

app.use("*", (req, res) => {
  return res.status(404).send("404 Not found");
});

app.use(handleServerErrors);

if (config.env.mode === "development") mongoose.set("debug", { shell: true });
if (config.env.mode === "production") mongoose.set("autoIndex", false);

(async () => {
  try {
    await mongoose.connect(config.env.dbURL, {
      serverSelectionTimeoutMS: 5000,
    });
    logPretty("DB connected");
  } catch (error) {
    console.error(error);
  }
})();

const server = app.listen(config.env.port, () => {
  logPretty(`Server is listening on port ${config.env.port}`);
});

const logs = ErrorLogs();

function shutDown() {
  server.close(() => {
    process.exit(1);
  });
  setTimeout(() => {
    process.abort();
  }, 1000).unref();
}

mongoose.connection.on("disconnect", (event) => {
  logs.write(event);
});

process.on("uncaughtException", (error) => {
  logs.write(error);
  if (config.env.mode === "production") shutDown();
});

process.on("unhandledRejection", (reason, promise) => {
  logs.write(null, reason, promise);
  if (config.env.mode === "production") shutDown();
});
