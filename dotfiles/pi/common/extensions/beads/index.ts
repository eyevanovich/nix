import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import registerExtension from "./extension.ts";

export default function (pi: ExtensionAPI) {
  registerExtension(pi);
}
