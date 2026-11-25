import * as NodeSqlite from "node:sqlite";

import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import * as NetService from "@t3tools/shared/Net";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Runtime from "effect/Runtime";
import * as TestConsole from "effect/testing/TestConsole";
import { Command } from "effect/cli";

import { makeCli } from "../binCli.ts";
import * as SqlitePersistence from "../persistence/Sqlite.ts";
import { T3_CLI_COMMANDS } from "../feedback/FeedbackReport.ts";
import { feedbackCommand } from "./feedback.ts";

const listedPaths = (command: Command.Command.Any, path: string): ReadonlyArray<string> => [
  path,
  ...command.subcommands.flatMap((group) =>
    group.commands
      .filter((child) => !child.unlisted)
      .flatMap((child) => listedPaths(child, `${path} ${child.name}`)),
  ),
];

it("feedback subjects name every listed t3 command", () => {
  expect([...T3_CLI_COMMANDS].sort()).toEqual(
    [...listedPaths(makeCli({ cloudEnabled: true }), "t3")].sort(),
  );
});

/** Runs a failing command: stderr gets exactly one line, and the runtime logs nothing more. */
const expectOneLine = (args: ReadonlyArray<string>, baseDir: string, stderr: string) =>
  Effect.gen(function* () {
    const before = (yield* TestConsole.errorLines).length;
    const error = yield* Command.runWith(feedbackCommand, { version: "0.0.0" })([
      ...args,
      "--base-dir",
      baseDir,
    ]).pipe(Effect.flip);
    const lines = (yield* TestConsole.errorLines).slice(before);
    expect(lines, args.join(" ")).toHaveLength(1);
    expect(String(lines[0]), args.join(" ")).toContain(stderr);
    expect((error as { readonly [Runtime.errorReported]?: boolean })[Runtime.errorReported]).toBe(
      false,
    );
  });

it.effect("disables new feedback and keeps local feedback history readable", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const baseDir = yield* fs.makeTempDirectoryScoped({ prefix: "t3-feedback-cli-" });
    const submit = ["--kind", "bug", "--subject", "general", "--expected", "a", "--actual", "b"];
    yield* expectOneLine(submit, baseDir, "Sending agent feedback is disabled in this build.");
    const dbPath = path.join(baseDir, "userdata", "statev2.sqlite");
    const listJson = (dir: string) =>
      Command.runWith(feedbackCommand, { version: "0.0.0" })([
        "list",
        "--json",
        "--base-dir",
        dir,
      ]).pipe(
        Effect.andThen(TestConsole.logLines),
        Effect.map((lines) => JSON.parse(String(lines.at(-1)))),
      );

    expect(yield* listJson(baseDir)).toEqual([]);
    expect(yield* fs.exists(dbPath)).toBe(false);

    // A damaged database is reported in one line.
    const damaged = yield* fs.makeTempDirectoryScoped({ prefix: "t3-feedback-cli-" });
    yield* fs.makeDirectory(path.join(damaged, "userdata"), { recursive: true });
    yield* fs.writeFileString(path.join(damaged, "userdata", "statev2.sqlite"), "not a database");
    yield* expectOneLine(["list"], damaged, "Could not read this machine's feedback reports: ");

    // A database from before agent feedback, with no table for it, lists nothing.
    const older = yield* fs.makeTempDirectoryScoped({ prefix: "t3-feedback-cli-" });
    yield* fs.makeDirectory(path.join(older, "userdata"), { recursive: true });
    const olderDatabase = new NodeSqlite.DatabaseSync(
      path.join(older, "userdata", "statev2.sqlite"),
    );
    olderDatabase.exec("CREATE TABLE projection_projects (project_id TEXT)");
    olderDatabase.close();
    expect(yield* listJson(older)).toEqual([]);

    // The list prints the entire stored report, with feedback off and no server running.
    yield* fs.makeDirectory(path.dirname(dbPath), { recursive: true });
    yield* Effect.scoped(Layer.build(SqlitePersistence.layerFromPath(dbPath)));
    const trace = {
      turns: 1,
      textTurns: 0,
      truncated: false,
      entries: [{ turn: 1, type: "user", length: 4 }],
    };
    const database = new NodeSqlite.DatabaseSync(dbPath);
    database
      .prepare(
        `INSERT INTO agent_feedback (id, thread_id, run_id, created_at, kind, subject, expected,
          actual, workaround, user_requested, trace, source, sent)
        VALUES ('r1', 't1', 'run1', '2026-11-17T00:00:00.000Z', 'bug', 't3_thread_read', 'a', 'b',
          '', 1, ?, 'mcp', 1)`,
      )
      .run(JSON.stringify(trace));
    database.close();
    expect(yield* listJson(baseDir)).toEqual([
      {
        id: "r1",
        threadId: "t1",
        createdAt: "2026-11-17T00:00:00.000Z",
        kind: "bug",
        subject: "t3_thread_read",
        expected: "a",
        actual: "b",
        workaround: "",
        userRequested: true,
        trace,
        source: "mcp",
        sent: true,
      },
    ]);
  }).pipe(
    Effect.scoped,
    Effect.provide(
      Layer.mergeAll(
        NodeServices.layer,
        NodeCrypto.layer,
        NetService.layer,
        ConfigProvider.layer(ConfigProvider.fromEnv({ env: { T3CODE_PORT: "3773" } })),
      ),
    ),
  ),
);
