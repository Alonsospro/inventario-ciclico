const test = require('node:test');
const assert = require('node:assert');
const authService = require('../src/services/authService');

test('Auth Service: Authentication and Role Permissions', async (t) => {
  await t.test('Should authenticate Superadmin ALONSO successfully', () => {
    const res = authService.authenticate('ALONSO', 'alonso.superadmin2026');
    assert.ok(res.token);
    assert.strictEqual(res.user.username, 'ALONSO');
    assert.strictEqual(res.user.role, 'ADMIN');
    assert.strictEqual(res.user.isSuperadmin, true);
  });

  await t.test('Should authenticate Encargado Warnes with center restriction', () => {
    const res = authService.authenticate('encargado_warnes', 'warnes2026');
    assert.ok(res.token);
    assert.strictEqual(res.user.role, 'ENCARGADO');
    assert.strictEqual(res.user.center, 'WARNES');
  });

  await t.test('Should authenticate Auxiliar Warnes with strict scoping', () => {
    const res = authService.authenticate('auxiliar_warnes', 'auxiliar2026');
    assert.ok(res.token);
    assert.strictEqual(res.user.role, 'AUXILIAR');
    assert.strictEqual(res.user.center, 'WARNES');
  });

  await t.test('Should reject invalid credentials', () => {
    assert.throws(() => {
      authService.authenticate('ALONSO', 'wrongpassword');
    }, /Credenciales inválidas/);
  });

  await t.test('Should verify JWT token correctly', () => {
    const auth = authService.authenticate('ALONSO', 'alonso.superadmin2026');
    const payload = authService.verifyToken(auth.token);
    assert.ok(payload);
    assert.strictEqual(payload.username, 'ALONSO');
  });
});
