const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const vm = require("node:vm");

// Pure unit checks: avoid a live Atlas connection and external npm modules.
function loadConnectDB(fakeMongoose, uri = "mongodb://local.test/culinary") {
  const source = readFileSync(join(__dirname, "../config/db.js"), "utf8");
  const module = { exports: {} };
  vm.runInNewContext(source, {
    module, exports: module.exports, console,
    require(name) {
      assert.equal(name, "mongoose");
      return fakeMongoose;
    },
    process: { env: { MONGODB_URI: uri } }
  });
  return module.exports;
}

test("coalesces concurrent Atlas connection attempts and reuses warm connection", async () => {
  const connection = { readyState: 0 };
  let calls = 0;
  let resolveConnect;
  const mongoose = {
    connection,
    connect() {
      calls += 1;
      return new Promise(resolve => { resolveConnect = resolve; });
    }
  };
  const connectDB = loadConnectDB(mongoose);
  const one = connectDB();
  const two = connectDB();
  assert.equal(calls, 1);
  connection.readyState = 1;
  resolveConnect();
  assert.equal(await one, connection);
  assert.equal(await two, connection);
  assert.equal(await connectDB(), connection);
  assert.equal(calls, 1);
});

test("can retry a failed connection and reconnect after disconnect", async () => {
  const connection = { readyState: 0 };
  let calls = 0;
  const mongoose = {
    connection,
    connect: async () => {
      calls += 1;
      if (calls === 1) throw new Error("network down");
      connection.readyState = 1;
    }
  };
  const connectDB = loadConnectDB(mongoose);
  await assert.rejects(connectDB(), /network down/);
  assert.equal(await connectDB(), connection);
  assert.equal(calls, 2);
  connection.readyState = 0;
  assert.equal(await connectDB(), connection);
  assert.equal(calls, 3);
});
