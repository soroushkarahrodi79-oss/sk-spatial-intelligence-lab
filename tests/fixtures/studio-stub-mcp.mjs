// Stub MCP server used ONLY to simulate failures of the Madrid Evidence MCP in the studio tests.
// It returns no evidence: every mode is a failure the studio must show as an error, never as data.
//   STUB_MODE=wrong-name     handshake under another server name (verification must fail)
//   STUB_MODE=not-readonly   required tools without readOnlyHint (verification must fail)
//   STUB_MODE=wrong-commit   responses declare a Lens commit other than the pinned one
//   STUB_MODE=crash          the process exits while answering a tool call
//   STUB_MODE=tool-error     every call returns isError
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const mode = process.env.STUB_MODE;
const server = new McpServer({ name: mode === "wrong-name" ? "not-madrid-evidence" : "madrid-evidence", version: "0.0.0-stub" });
const annotations = { readOnlyHint: mode !== "not-readonly" };
const handler = async () => {
  if (mode === "crash") process.exit(3);
  if (mode === "tool-error") return { isError: true, content: [{ type: "text", text: "stub tool error" }] };
  // wrong-commit: a well-formed-looking payload carrying a fabricated count and the wrong commit.
  const payload = {
    shape: "LICENCES_IN_LENS",
    result: { kind: "EVIDENCE", value: { perFamily: { ACTIVITY_LICENCE_FAMILY: 999 } } },
    reading: { lensCommit: "0000000000000000000000000000000000000000" },
  };
  return { content: [{ type: "text", text: JSON.stringify(payload) }], structuredContent: payload };
};
for (const name of ["ambito_snapshot_at_point", "licences_in_lens", "source_provenance"]) {
  server.registerTool(name, { description: "stub", inputSchema: z.looseObject({}), annotations }, handler);
}
await server.connect(new StdioServerTransport());
