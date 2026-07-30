import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatCurrencyDigits,
  normalizeCurrencyDigits,
} from '../../../apps/web/app/components/ui/CurrencyInput';

test('currency input keeps integer VND digits and formats thousands', () => {
  assert.equal(normalizeCurrencyDigits('12.345.000 ₫'), '12345000');
  assert.equal(formatCurrencyDigits('12345000'), '12.345.000');
});

test('currency input supports empty values and caps unsafe length', () => {
  assert.equal(normalizeCurrencyDigits(''), '');
  assert.equal(normalizeCurrencyDigits('000125'), '125');
  assert.equal(
    normalizeCurrencyDigits('12345678901234567890'),
    '123456789012345',
  );
});
