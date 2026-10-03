const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const source = fs.readFileSync("static/js/app-client.js", "utf8");
test("V2 is a shadow layer with an EOD forecast", () => { assert.match(source, /function buildCalibrationEngineV2/); assert.match(source, /mode: "shadow"/); assert.match(source, /const eodV1 = buildMeterSimulation/); });
test("V2 backtest uses prior checkpoints only", () => { assert.match(source, /function backtestCalibrationEngineV2/); assert.match(source, /checkpointMoment\(item\) < checkpointMoment\(checkpoint\)/); });