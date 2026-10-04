const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('static/js/app-client.js', 'utf8');
const start = source.indexOf('function buildNysegMeterImportPreview(');
const end = source.indexOf('\nfunction openNysegMeterImportPreview(', start);
const context = {};
vm.createContext(context);
vm.runInContext(source.slice(start, end), context);
test('utility import creates missing daily rows after its latest confirmed anchor', () => {
  const updates = context.buildNysegMeterImportPreview([
    { entry_date: '2026-09-15', meter_01_import_reading: 1095, meter_02_export_reading: 2847.8, meter_values_confirmed: true }
  ], [
    { date: '2026-09-15', import_kwh: 10, export_kwh: 50 },
    { date: '2026-09-16', import_kwh: 12.5, export_kwh: 41.1 },
    { date: '2026-09-17', import_kwh: 13.5, export_kwh: 16.8 }
  ]);
  assert.equal(updates.length, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(updates)), [
    { entry: null, isNew: true, date: '2026-09-16', m01: 1107.5, m02: 2888.9, importKwh: 12.5, exportKwh: 41.1 },
    { entry: null, isNew: true, date: '2026-09-17', m01: 1121, m02: 2905.7, importKwh: 13.5, exportKwh: 16.8 }
  ]);
});
test('utility import falls back to existing cumulative rows when a stale payload lacks confirmation flags', () => {
  const updates = context.buildNysegMeterImportPreview([
    { entry_date: '2026-09-15', meter_01_import_reading: 1095, meter_02_export_reading: 2847.8 }
  ], [
    { date: '2026-09-15', import_kwh: 10, export_kwh: 50 },
    { date: '2026-09-16', import_kwh: 12.5, export_kwh: 41.1 }
  ]);
  assert.equal(updates.length, 1);
  assert.equal(updates[0].date, '2026-09-16');
  assert.equal(updates[0].m01, 1107.5);
  assert.equal(updates[0].m02, 2888.9);
});
