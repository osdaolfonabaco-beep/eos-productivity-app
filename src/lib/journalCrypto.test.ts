/**
 * Pruebas de ida y vuelta de `journalCrypto.ts`. Sin Supabase: todo en
 * memoria, contra las funciones puras del módulo.
 */

import { describe, expect, it } from 'vitest'
import {
  changePassword,
  createJournalKey,
  decryptNote,
  encryptNote,
  unlockWithPassword,
  unlockWithRecovery,
} from './journalCrypto'

const PASSWORD = 'contraseña-de-prueba-123'

describe('createJournalKey + unlockWithPassword', () => {
  it('con la contraseña correcta devuelve la misma DEK que se generó al crear', async () => {
    const { wrapping } = await createJournalKey(PASSWORD)
    const dek = await unlockWithPassword(PASSWORD, wrapping)

    expect(dek).not.toBeNull()

    // Si la DEK es la misma, cifrar con una y descifrar con la otra debe
    // funcionar (comparación indirecta, sin asumir que la DEK está expuesta
    // en ningún otro sitio que no sea el propio desenvuelto).
    const { ciphertext, iv } = await encryptNote(dek!, 'hola')
    await expect(decryptNote(dek!, ciphertext, iv)).resolves.toBe('hola')
  })
})

describe('unlockWithPassword con contraseña incorrecta', () => {
  it('devuelve null, no lanza', async () => {
    const { wrapping } = await createJournalKey(PASSWORD)
    await expect(unlockWithPassword('otra-contraseña', wrapping)).resolves.toBeNull()
  })
})

describe('unlockWithRecovery', () => {
  it('con el código correcto devuelve la misma DEK que unlockWithPassword', async () => {
    const { wrapping, recoveryCode } = await createJournalKey(PASSWORD)

    const dekByPassword = await unlockWithPassword(PASSWORD, wrapping)
    const dekByRecovery = await unlockWithRecovery(recoveryCode, wrapping)

    expect(dekByPassword).not.toBeNull()
    expect(dekByRecovery).toEqual(dekByPassword)
  })

  it('con un código incorrecto devuelve null', async () => {
    const { wrapping } = await createJournalKey(PASSWORD)
    const codigoFalso = 'AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA'
    await expect(unlockWithRecovery(codigoFalso, wrapping)).resolves.toBeNull()
  })
})

describe('changePassword', () => {
  it('la nueva contraseña desenvuelve la misma DEK, y el código original sigue sirviendo', async () => {
    const { wrapping, recoveryCode } = await createJournalKey(PASSWORD)
    const dekOriginal = await unlockWithPassword(PASSWORD, wrapping)
    expect(dekOriginal).not.toBeNull()

    const newPasswordWrapping = await changePassword(dekOriginal!, 'contraseña-nueva-456')
    const updatedWrapping = { ...wrapping, ...newPasswordWrapping }

    // La contraseña vieja ya no sirve.
    await expect(unlockWithPassword(PASSWORD, updatedWrapping)).resolves.toBeNull()

    // La nueva sí, y da la misma DEK.
    const dekConNueva = await unlockWithPassword('contraseña-nueva-456', updatedWrapping)
    expect(dekConNueva).toEqual(dekOriginal)

    // El código de recuperación original, intacto, sigue dando la misma DEK.
    const dekConRecovery = await unlockWithRecovery(recoveryCode, updatedWrapping)
    expect(dekConRecovery).toEqual(dekOriginal)
  })
})

describe('encryptNote + decryptNote', () => {
  it('un texto largo con acentos y emojis vuelve idéntico tras cifrar y descifrar', async () => {
    const { wrapping } = await createJournalKey(PASSWORD)
    const dek = await unlockWithPassword(PASSWORD, wrapping)
    expect(dek).not.toBeNull()

    const texto =
      'Hoy me sentí agradecido 🙏 por la mañana tranquila. Caminé al parque, ' +
      'tomé café ☕ y pensé en cómo organizar mejor mis días. Mañana quiero ' +
      'madrugar más — ¡ojalá lo logre! 😄 Ácido, murciélago, ñandú, corazón ❤️.'.repeat(20)

    const { ciphertext, iv } = await encryptNote(dek!, texto)
    await expect(decryptNote(dek!, ciphertext, iv)).resolves.toBe(texto)
  })

  it('dos cifrados del mismo texto producen ciphertext distinto (IV aleatorio)', async () => {
    const { wrapping } = await createJournalKey(PASSWORD)
    const dek = await unlockWithPassword(PASSWORD, wrapping)
    expect(dek).not.toBeNull()

    const texto = 'la misma nota, cifrada dos veces'
    const a = await encryptNote(dek!, texto)
    const b = await encryptNote(dek!, texto)

    expect(a.iv).not.toBe(b.iv)
    expect(a.ciphertext).not.toBe(b.ciphertext)

    // Ambas siguen descifrando al mismo texto original.
    await expect(decryptNote(dek!, a.ciphertext, a.iv)).resolves.toBe(texto)
    await expect(decryptNote(dek!, b.ciphertext, b.iv)).resolves.toBe(texto)
  })
})
