import * as assert from 'assert';
import {
	normalizeTextFilter,
	resolveOptionStep,
	resolveStep,
	resolveTagsSelection,
} from '../core/filter-wizard-logic';

suite('filter-wizard-logic', () => {

	suite('resolveStep', () => {
		test('Esc (undefined) conserva el valor actual', () => {
			assert.strictEqual(resolveStep(undefined, 'actual'), 'actual');
		});

		test('confirmar reemplaza el valor actual', () => {
			assert.strictEqual(resolveStep('nuevo', 'actual'), 'nuevo');
		});
	});

	suite('resolveOptionStep', () => {
		test('Esc (undefined) conserva el valor actual', () => {
			assert.strictEqual(resolveOptionStep<string>(undefined, 'alta'), 'alta');
		});

		test('elegir explícitamente "cualquiera" (value undefined) limpia el filtro', () => {
			assert.strictEqual(resolveOptionStep<string | undefined>({ value: undefined }, 'alta'), undefined);
		});

		test('elegir una opción concreta la aplica', () => {
			assert.strictEqual(resolveOptionStep<string>({ value: 'baja' }, 'alta'), 'baja');
		});
	});

	suite('normalizeTextFilter', () => {
		test('texto vacío o solo espacios se normaliza a undefined', () => {
			assert.strictEqual(normalizeTextFilter(''), undefined);
			assert.strictEqual(normalizeTextFilter('   '), undefined);
		});

		test('recorta espacios', () => {
			assert.strictEqual(normalizeTextFilter('  hola  '), 'hola');
		});

		test('lowercase opcional', () => {
			assert.strictEqual(normalizeTextFilter('Hola', true), 'hola');
			assert.strictEqual(normalizeTextFilter('Hola', false), 'Hola');
		});
	});

	suite('resolveTagsSelection', () => {
		test('Esc (undefined) conserva el filtro actual', () => {
			const current = new Set(['TODO']);
			assert.strictEqual(resolveTagsSelection(undefined, 5, current), current);
		});

		test('ninguna seleccionada equivale a sin filtro', () => {
			assert.strictEqual(resolveTagsSelection([], 5, new Set(['TODO'])), undefined);
		});

		test('todas seleccionadas equivale a sin filtro', () => {
			assert.strictEqual(resolveTagsSelection(['TODO', 'FIXME'], 2, undefined), undefined);
		});

		test('selección parcial se aplica como Set', () => {
			assert.deepStrictEqual(resolveTagsSelection(['FIXME'], 3, undefined), new Set(['FIXME']));
		});
	});
});
