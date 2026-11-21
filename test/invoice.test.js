'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const invoice = require('../lib/invoice');
const pricing = require('../lib/pricing');
const reports = require('../lib/reports');

test('invoice uses the HSN slab and matches billed totals without a coupon', function () {
  const items = [
    { id: 1, name: 'Rice', sku: 'RICE-001', hsn: '1006', price: 10, qty: 1 }
  ];

  const billed = pricing.computeTotals(items, '');
  const invoiceFigures = invoice.computeInvoiceFigures({
    items: items,
    coupon: '',
    subtotal: billed.subtotal,
    discount: billed.discount,
    tax: billed.tax,
    total: billed.total
  });

  assert.equal(billed.lines[0].gstPercent, 5);
  assert.equal(billed.tax, 0.5);
  assert.equal(billed.total, 10.5);

  assert.equal(invoiceFigures.rows[0].gstPercent, 5);
  assert.equal(invoiceFigures.tax, billed.tax);
  assert.equal(invoiceFigures.total, billed.total);
});

test('invoice uses the billed SAVE10 discount, GST breakdown, and total', function () {
  const items = [
    { id: 1, name: 'Rice', sku: 'RICE-001', hsn: '1006', price: 10, qty: 100 }
  ];

  const billed = pricing.computeTotals(items, 'SAVE10');
  const invoiceFigures = invoice.computeInvoiceFigures({
    items: items,
    coupon: 'SAVE10',
    subtotal: billed.subtotal,
    discount: billed.discount,
    tax: billed.tax,
    total: billed.total
  });

  assert.deepEqual(
    { subtotal: billed.subtotal, discount: billed.discount, tax: billed.tax, total: billed.total },
    { subtotal: 1000, discount: 100, tax: 45, total: 945 }
  );
  assert.deepEqual(
    {
      subtotal: invoiceFigures.subtotal,
      discount: invoiceFigures.discount,
      tax: invoiceFigures.tax,
      total: invoiceFigures.total,
      gstPercent: invoiceFigures.rows[0].gstPercent,
      lineTax: invoiceFigures.rows[0].lineTax
    },
    { subtotal: 1000, discount: 100, tax: 45, total: 945, gstPercent: 5, lineTax: 45 }
  );
});

test('invoice line GST sums to billed GST for fractional prices and mixed HSN slabs', function () {
  const items = [
    { id: 1, name: 'Rice', hsn: '1006', price: 0.29, qty: 7 },
    { id: 2, name: 'Ghee', hsn: '0405', price: 17.83, qty: 3 },
    { id: 3, name: 'Tea', hsn: '0902', price: 5.99, qty: 2 }
  ];
  const billed = pricing.computeTotals(items, 'WELCOME');
  const invoiceFigures = invoice.computeInvoiceFigures({
    items: items,
    coupon: 'WELCOME',
    subtotal: billed.subtotal,
    discount: billed.discount,
    tax: billed.tax,
    total: billed.total
  });

  assert.deepEqual(
    invoiceFigures.rows.map(function (row) { return row.lineTax; }),
    billed.lines.map(function (line) { return line.tax; })
  );
  assert.equal(
    invoiceFigures.rows.reduce(function (sum, row) { return sum + row.lineTax; }, 0),
    billed.tax
  );
});

test('GST reconciliation matches billed amounts and excludes cancelled orders', function () {
  const activeOrder = {
    id: 1001,
    date: '21/11/2026',
    customer: 'In-memory customer',
    coupon: 'SAVE10',
    subtotal: 1000,
    discount: 100,
    tax: 45,
    total: 945,
    items: [
      { id: 1, name: 'Rice', sku: 'RICE-001', hsn: '1006', price: 10, qty: 100 }
    ]
  };
  const cancelledOrder = {
    id: 1002,
    status: 'cancelled',
    subtotal: 1000,
    discount: 100,
    tax: 45,
    total: 945,
    items: activeOrder.items
  };

  const reconciliation = reports.getGstReconciliation({ orders: [activeOrder, cancelledOrder] });

  assert.equal(reconciliation.totalChecked, 1);
  assert.equal(reconciliation.mismatchCount, 0);
  assert.equal(reconciliation.totalDelta, 0);
  assert.equal(reconciliation.rows[0].invoiceTax, 45);
  assert.equal(reconciliation.rows[0].invoiceDiscount, 100);
  assert.equal(reconciliation.rows[0].invoiceTotal, 945);
  assert.equal(reconciliation.rows[0].delta, 0);
  assert.equal(reconciliation.rows[0].matched, true);
});
