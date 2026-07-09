import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import mysql from "mysql2/promise";
import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";

let pool: mysql.Pool | null = null;

export default function (pi: ExtensionAPI) {
  // Try loading from .env in the current working directory
  const loadEnv = (cwd: string) => {
    const envPath = path.join(cwd, ".env");
    if (fs.existsSync(envPath)) {
      dotenv.config({ path: envPath });
    } else {
      // Fallback: just run dotenv config which looks in process.cwd()
      dotenv.config();
    }
  };

  // We can initialize the pool lazily when the tool is called
  const getPool = (cwd: string) => {
    if (!pool) {
      loadEnv(cwd);
      pool = mysql.createPool({
        host: process.env.MYSQL_HOST || "localhost",
        port: Number(process.env.MYSQL_PORT) || 3306,
        user: process.env.MYSQL_USER || "root",
        password: process.env.MYSQL_PASSWORD || "",
        database: process.env.MYSQL_DATABASE || undefined,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
      });
    }
    return pool;
  };

  pi.on("session_shutdown", async () => {
    if (pool) {
      await pool.end();
      pool = null;
    }
  });

  pi.registerTool({
    name: "mysql_query",
    label: "MySQL Query",
    description: "Execute a query against the local MySQL database. Uses MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE. Variables can be set in the environment or in a .env file in the current working directory.",
    promptSnippet: "Query the MySQL database using standard SQL",
    promptGuidelines: [
      "Use mysql_query to inspect database schemas, tables, and run queries.",
      "Limit SELECT queries with LIMIT when exploring large tables.",
    ],
    parameters: Type.Object({
      query: Type.String({ description: "The SQL query to execute" }),
      params: Type.Optional(Type.Array(Type.Any(), { description: "Optional query parameters to prevent SQL injection" })),
    }),
    async execute(toolCallId, args, signal, onUpdate, ctx) {
      try {
        const dbPool = getPool(ctx.cwd);
        const [rows, fields] = await dbPool.execute(args.query, args.params || []);
        
        // Truncate output if it's too massive
        const jsonResult = JSON.stringify(rows, null, 2);
        const truncatedResult = jsonResult.length > 50000 
          ? jsonResult.slice(0, 50000) + "\n... [TRUNCATED - Result too large]"
          : jsonResult;

        return {
          content: [
            { type: "text", text: truncatedResult }
          ],
          details: {
            rowCount: Array.isArray(rows) ? rows.length : (rows as any).affectedRows,
          }
        };
      } catch (error: any) {
        return {
          content: [
            { type: "text", text: `Error executing query: ${error.message}` }
          ],
          isError: true,
        };
      }
    },
  });
}
