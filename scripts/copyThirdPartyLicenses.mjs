import { mkdir, copyFile } from "node:fs/promises";
import { join } from "node:path";

const licenses = [
  ["mermaid", "LICENSE", "mermaid-MIT.txt"],
  ["jspdf", "LICENSE", "jspdf-MIT.txt"],
  ["html2canvas", "LICENSE", "html2canvas-MIT.txt"],
  ["marked", "LICENSE.md", "marked-MIT.md"],
  ["dompurify", "LICENSE", "dompurify-Apache-2.0.txt"],
];

await mkdir("licenses", { recursive: true });
await Promise.all(
  licenses.map(([packageName, sourceName, targetName]) =>
    copyFile(
      join("node_modules", packageName, sourceName),
      join("licenses", targetName)
    )
  )
);
