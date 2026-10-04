const pickerOptions = {
  id: "dungeoneer-level",
  types: [{ description: "JSON level", accept: { "application/json": [".json"] } }],
  excludeAcceptAllOption: true,
};

export function supportsNativeFiles(browser = globalThis) {
  return browser.isSecureContext === true
    && typeof browser.showOpenFilePicker === "function"
    && typeof browser.showSaveFilePicker === "function";
}

export async function pickOpenFile(browser = globalThis) {
  try {
    const [handle] = await browser.showOpenFilePicker({ ...pickerOptions, multiple: false });
    return handle;
  } catch (error) {
    if (error.name === "AbortError") return null;
    throw error;
  }
}

export async function pickSaveFile(suggestedName, browser = globalThis) {
  try {
    return await browser.showSaveFilePicker({ ...pickerOptions, suggestedName });
  } catch (error) {
    if (error.name === "AbortError") return null;
    throw error;
  }
}

export async function readFileText(handle) {
  return (await handle.getFile()).text();
}

export class FileChangedError extends Error {
  constructor(name) {
    super(`${name} has changed outside the editor. It was not overwritten. Use Save As to choose a different file, or Open JSON to reload it.`);
    this.name = "FileChangedError";
  }
}

export async function writeFileText(handle, text, expectedText) {
  if (typeof text !== "string" || typeof expectedText !== "string") {
    throw new TypeError("Saving requires both the new contents and the last known disk contents.");
  }
  // Request access before any disk reads can consume the click's user activation.
  if (await handle.requestPermission({ mode: "readwrite" }) !== "granted") {
    throw new DOMException("Write permission was not granted. Allow file editing, use Save As, or download a copy.", "NotAllowedError");
  }
  const checkUnchanged = async () => {
    if (await readFileText(handle) !== expectedText) throw new FileChangedError(handle.name);
  };
  await checkUnchanged();
  const writable = await handle.createWritable({ mode: "exclusive" });
  try {
    await checkUnchanged();
    await writable.write(text);
    // Writes are staged until close. Check again before committing them.
    await checkUnchanged();
    await writable.close();
  } catch (error) {
    try {
      await writable.abort();
    } catch (abortError) {
      throw new AggregateError([error, abortError], `${error.message}\nThe pending write could not be released: ${abortError.message}`);
    }
    throw error;
  }
}
