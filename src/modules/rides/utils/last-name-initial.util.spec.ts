import { deriveLastNameInitial } from './last-name-initial.util';

describe('deriveLastNameInitial', () => {
  it('devuelve la inicial en mayúscula seguida de punto', () => {
    expect(deriveLastNameInitial('Pérez')).toBe('P.');
  });

  it('recorta espacios en los extremos antes de derivar', () => {
    expect(deriveLastNameInitial('  Landeo  ')).toBe('L.');
  });

  it('normaliza minúsculas a mayúscula', () => {
    expect(deriveLastNameInitial('gómez')).toBe('G.');
  });

  it('devuelve cadena vacía si el apellido está vacío', () => {
    expect(deriveLastNameInitial('')).toBe('');
  });

  it('devuelve cadena vacía si el apellido es solo espacios (legacy)', () => {
    expect(deriveLastNameInitial('   ')).toBe('');
  });

  it('usa solo el primer apellido en apellidos compuestos', () => {
    expect(deriveLastNameInitial('De la Cruz')).toBe('D.');
  });
});
