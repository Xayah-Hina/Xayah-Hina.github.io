import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

async function resolvedPath(value) {
  const absolute = path.resolve(value);
  try {
    return await fs.realpath(absolute);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return path.join(await resolvedPath(path.dirname(absolute)), path.basename(absolute));
  }
}

function contains(parent, child) {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

export async function safeBuildOutput(root, output, journalSourceRoot) {
  const [repository, destination, journals, temporary] = await Promise.all(
    [root, output, journalSourceRoot, os.tmpdir()].map(resolvedPath),
  );
  // Only the normal generated directory or a separate temporary directory may
  // be removed. Resolve junctions/symlinks before comparing protected paths.
  const normalOutput = path.join(repository, "_site");
  const allowed = destination === normalOutput
    || (destination !== temporary && contains(temporary, destination) && !contains(repository, destination));
  if (!allowed || contains(destination, repository)
    || contains(destination, journals) || contains(journals, destination)) {
    throw new Error("Unsafe build output: use the repository _site directory or a separate temporary directory outside source data.");
  }
  return destination;
}
