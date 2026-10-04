import test from "node:test";
import assert from "node:assert/strict";
import {
  supportsNativeFiles, pickOpenFile, pickSaveFile, readFileText, writeFileText, FileChangedError,
} from "../file-access.mjs";

function fileHandle(text = "original") {
  const state = { disk: text, events: [], permission: "granted", reads: 0, staged: null };
  const handle = {
    name: "level.json",
    async requestPermission(options) {
      state.events.push("permission");
      assert.deepEqual(options, { mode: "readwrite" });
      return state.permission;
    },
    async getFile() {
      state.events.push("read");
      state.reads++;
      if (state.readError) throw state.readError;
      const snapshot = state.disk;
      return { text: async () => snapshot };
    },
    async createWritable(options) {
      state.events.push("create");
      assert.deepEqual(options, { mode: "exclusive" });
      if (state.createError) throw state.createError;
      state.onCreate?.();
      return {
        async write(contents) {
          state.events.push("write");
          if (state.writeError) throw state.writeError;
          state.staged = contents;
          await state.onWrite?.();
        },
        async close() {
          state.events.push("close");
          if (state.closeError) throw state.closeError;
          await state.onClose?.();
          state.disk = state.staged;
        },
        async abort() {
          state.events.push("abort");
          if (state.abortError) throw state.abortError;
          state.staged = null;
        },
      };
    },
  };
  return { handle, state };
}

test("native access requires a secure context and both picker APIs", () => {
  const browser = { isSecureContext: true, showOpenFilePicker() {}, showSaveFilePicker() {} };
  assert.equal(supportsNativeFiles(browser), true);
  assert.equal(supportsNativeFiles({ ...browser, isSecureContext: false }), false);
  assert.equal(supportsNativeFiles({ ...browser, showOpenFilePicker: undefined }), false);
  assert.equal(supportsNativeFiles({ ...browser, showSaveFilePicker: undefined }), false);
});

test("open picker is invoked immediately with a single JSON-file filter", async () => {
  let called = false;
  const { handle } = fileHandle();
  const pending = pickOpenFile({
    showOpenFilePicker(options) {
      called = true;
      assert.equal(options.multiple, false);
      assert.deepEqual(options.types[0].accept, { "application/json": [".json"] });
      return Promise.resolve([handle]);
    },
  });
  assert.equal(called, true, "picker must run within the original user activation");
  assert.equal(await pending, handle);
});

test("Save As invokes the picker immediately and suggests the filename", async () => {
  let called = false;
  const { handle } = fileHandle();
  const pending = pickSaveFile("cave.json", {
    showSaveFilePicker(options) {
      called = true;
      assert.equal(options.suggestedName, "cave.json");
      assert.equal(options.excludeAcceptAllOption, true);
      return Promise.resolve(handle);
    },
  });
  assert.equal(called, true);
  assert.equal(await pending, handle);
});

for (const picker of ["open", "save"]) {
  test(`${picker} picker cancellation is not a failed write or fallback request`, async () => {
    const cancel = () => { throw new DOMException("Cancelled", "AbortError"); };
    assert.equal(await (picker === "open"
      ? pickOpenFile({ showOpenFilePicker: cancel })
      : pickSaveFile("level.json", { showSaveFilePicker: cancel })), null);
  });
  test(`${picker} picker security failures remain visible to the caller`, async () => {
    const error = new DOMException("Blocked by embedding context", "SecurityError");
    const reject = () => Promise.reject(error);
    await assert.rejects(picker === "open"
      ? pickOpenFile({ showOpenFilePicker: reject })
      : pickSaveFile("level.json", { showSaveFilePicker: reject }), (caught) => caught === error);
  });
}

test("reads preserve the exact disk contents, including whitespace", async () => {
  const { handle } = fileHandle(' { "name": "Cave" }\r\n');
  assert.equal(await readFileText(handle), ' { "name": "Cave" }\r\n');
});

test("save requests permission first and commits only after closing", async () => {
  const { handle, state } = fileHandle();
  let closed = false;
  state.onWrite = () => assert.equal(state.disk, "original");
  state.onClose = () => { assert.equal(state.disk, "original"); closed = true; };
  await writeFileText(handle, "updated", "original");
  assert.equal(closed, true);
  assert.equal(state.disk, "updated");
  assert.deepEqual(state.events, ["permission", "read", "create", "read", "write", "read", "close"]);
});

test("save does not resolve before the close operation finishes", async () => {
  const { handle, state } = fileHandle();
  let complete = false, release, entered;
  const atClose = new Promise((resolve) => { entered = resolve; });
  const closeGate = new Promise((resolve) => { release = resolve; });
  state.onClose = async () => { entered(); await closeGate; };
  const pending = writeFileText(handle, "updated", "original").then(() => { complete = true; });
  await atClose;
  assert.equal(complete, false);
  assert.equal(state.disk, "original");
  release();
  await pending;
  assert.equal(complete, true);
});

test("permission denial does not open a stream or alter the file", async () => {
  const { handle, state } = fileHandle();
  state.permission = "denied";
  await assert.rejects(writeFileText(handle, "updated", "original"), { name: "NotAllowedError" });
  assert.equal(state.disk, "original");
  assert.deepEqual(state.events, ["permission"]);
});

test("external edits with the same length are caught before opening a stream", async () => {
  const { handle, state } = fileHandle("external");
  await assert.rejects(writeFileText(handle, "updated", "original"), FileChangedError);
  assert.equal(state.disk, "external");
  assert.deepEqual(state.events, ["permission", "read"]);
});

test("external edits while acquiring the writable stream abort it", async () => {
  const { handle, state } = fileHandle();
  state.onCreate = () => { state.disk = "external"; };
  await assert.rejects(writeFileText(handle, "updated", "original"), FileChangedError);
  assert.equal(state.disk, "external");
  assert.equal(state.events.includes("write"), false);
  assert.equal(state.events.at(-1), "abort");
});

test("external edits while writing are caught before committing staged data", async () => {
  const { handle, state } = fileHandle();
  state.onWrite = () => { state.disk = "external"; };
  await assert.rejects(writeFileText(handle, "updated", "original"), FileChangedError);
  assert.equal(state.disk, "external");
  assert.equal(state.staged, null);
  assert.equal(state.events.includes("close"), false);
});

test("deleted files and locked streams propagate their actual failures", async () => {
  for (const property of ["readError", "createError"]) {
    const { handle, state } = fileHandle();
    const error = new DOMException("File unavailable", property === "readError" ? "NotFoundError" : "NoModificationAllowedError");
    state[property] = error;
    await assert.rejects(writeFileText(handle, "updated", "original"), (caught) => caught === error);
    assert.equal(state.disk, "original");
    assert.equal(state.events.includes("close"), false);
  }
});

test("a write AbortError is a real failure, not picker cancellation", async () => {
  const { handle, state } = fileHandle();
  const error = new DOMException("Write blocked", "AbortError");
  state.writeError = error;
  await assert.rejects(writeFileText(handle, "updated", "original"), (caught) => caught === error);
  assert.equal(state.events.at(-1), "abort");
  assert.equal(state.disk, "original");
});

test("a close failure rejects the save and releases the stream", async () => {
  const { handle, state } = fileHandle();
  const error = new DOMException("Disk write failed", "UnknownError");
  state.closeError = error;
  await assert.rejects(writeFileText(handle, "updated", "original"), (caught) => caught === error);
  assert.equal(state.events.at(-1), "abort");
  assert.equal(state.disk, "original");
});

test("cleanup failure retains both errors instead of hiding the write failure", async () => {
  const { handle, state } = fileHandle();
  state.writeError = new Error("Write failed");
  state.abortError = new Error("Release failed");
  await assert.rejects(writeFileText(handle, "updated", "original"), (error) => {
    assert.ok(error instanceof AggregateError);
    assert.deepEqual(error.errors, [state.writeError, state.abortError]);
    return true;
  });
});

test("a save cannot bypass conflict checks with a missing disk baseline", async () => {
  const { handle, state } = fileHandle();
  await assert.rejects(writeFileText(handle, "updated", null), TypeError);
  assert.deepEqual(state.events, []);
});
