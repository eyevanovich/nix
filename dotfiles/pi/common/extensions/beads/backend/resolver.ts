import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { TaskAdapter } from "./api.ts";
import beadsAdapter from "./adapters/beads.ts";

export default function initializeAdapter(pi: ExtensionAPI): TaskAdapter {
  return beadsAdapter.initialize(pi);
}
