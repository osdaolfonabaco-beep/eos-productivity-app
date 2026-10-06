/**
 * Pruebas de `redact.ts`. Funciones puras: sin Deno, sin Supabase, sin red.
 */

import { describe, expect, it } from 'vitest'
import { redactPayload, redactText } from './redact.ts'

const dinero = {
  quincena: { sueldo: 2500000, totalIngresos: 2600000, totalGastos: 1800000, disponible: 800000 },
  gastosPorCategoria: [{ categoria: 'Mercado', total: 450000 }],
  deudas: [
    { nombre: 'Tarjeta Visa', saldo: 3200000, tasaAnual: 28.5, cuota: 250000, enMora: false },
    { nombre: 'Préstamo Carro', saldo: 18000000, tasaAnual: null, cuota: 900000, enMora: true },
  ],
}

describe('redactPayload', () => {
  it('renombra las deudas en orden y deja los montos intactos', () => {
    const { payload, seudonimos } = redactPayload({ tipo: 'diario', dinero })

    expect(payload.dinero.deudas.map((d) => d.nombre)).toEqual(['Deuda 1', 'Deuda 2'])
    expect(payload.dinero.deudas[0]).toMatchObject({ saldo: 3200000, tasaAnual: 28.5, cuota: 250000, enMora: false })
    expect(payload.dinero.deudas[1]).toMatchObject({ saldo: 18000000, tasaAnual: null, cuota: 900000, enMora: true })
    expect(payload.dinero.quincena).toEqual(dinero.quincena)
    expect(payload.dinero.gastosPorCategoria).toEqual(dinero.gastosPorCategoria)
    expect(seudonimos.get('Tarjeta Visa')).toBe('Deuda 1')
    expect(seudonimos.get('Préstamo Carro')).toBe('Deuda 2')
    // El original no se toca: es el que va a Gemini.
    expect(dinero.deudas[0].nombre).toBe('Tarjeta Visa')
  })

  it('reemplaza los textos personales por su longitud', () => {
    const { payload } = redactPayload({
      comentarioDelDia: 'Hoy dormí mal 😴',
      proposito: { objetivo: 'Salir de deudas', plazo: null, dificultad: 'Constancia', masDeUnMesSinRevisar: false },
      comentariosDeLaSemana: [
        { fecha: '2026-10-05', texto: 'Día pesado' },
        { fecha: '2026-10-06', texto: 'Mejor' },
      ],
    })

    expect(payload.comentarioDelDia).toBe('[texto personal: 15 caracteres]')
    expect(payload.proposito).toEqual({
      objetivo: '[texto personal: 15 caracteres]',
      plazo: null,
      dificultad: '[texto personal: 10 caracteres]',
      masDeUnMesSinRevisar: false,
    })
    expect(payload.comentariosDeLaSemana).toEqual([
      { fecha: '2026-10-05', texto: '[texto personal: 10 caracteres]' },
      { fecha: '2026-10-06', texto: '[texto personal: 5 caracteres]' },
    ])
  })

  it('enmascara correo, teléfono, URL y número largo dentro de un nombre de tarea', () => {
    const { payload } = redactPayload({
      tareasDeHoySinHacer: [
        { texto: 'Escribir a ana.perez@correo.com' },
        { texto: 'Llamar al +57 300 123 4567' },
        { texto: 'Llamar al 300-123-4567 antes de las 5' },
        { texto: 'Revisar https://banco.example.com/extracto?id=9.' },
        { texto: 'Pagar factura 123456789012' },
      ],
    })

    expect(payload.tareasDeHoySinHacer.map((t) => t.texto)).toEqual([
      'Escribir a [correo]',
      'Llamar al [teléfono]',
      'Llamar al [teléfono] antes de las 5',
      'Revisar [url].',
      'Pagar factura [número]',
    ])
  })

  it('no toca fechas, montos con puntos ni números cortos', () => {
    const { payload } = redactPayload({
      fechaDeHoy: '2026-10-05',
      tareasDeHoySinHacer: [{ texto: 'Ahorrar 1.500.000 en 3 meses' }, { texto: 'Leer 20 páginas' }],
    })

    expect(payload.fechaDeHoy).toBe('2026-10-05')
    expect(payload.tareasDeHoySinHacer.map((t) => t.texto)).toEqual(['Ahorrar 1.500.000 en 3 meses', 'Leer 20 páginas'])
  })

  it('cambia los nombres de deudas que aparecen en otros textos del payload', () => {
    const { payload } = redactPayload({
      dinero,
      tareasDeHoySinHacer: [{ texto: 'Pagar la tarjeta visa hoy' }],
    })

    expect(payload.tareasDeHoySinHacer[0].texto).toBe('Pagar la Deuda 1 hoy')
  })

  it('no falla con un payload sin dinero ni propósito', () => {
    const original = {
      tipo: 'diario',
      fechaDeHoy: '2026-10-05',
      habitos: [{ nombre: 'Correr', ultimos14dias: 'HHN.._________', creadoEl: '2026-10-01', diasConHistorial: 5 }],
      tareasDeHoySinHacer: [],
      tareasDeHoyHechas: [],
      tareasAtrasadasDeDiasAnteriores: [],
      totalTareasAtrasadas: 0,
      tono: 'equilibrado',
    }
    const { payload, seudonimos } = redactPayload(original)

    expect(payload).toEqual(original)
    expect(seudonimos.size).toBe(0)
  })
})

describe('redactText', () => {
  it('cambia un nombre de deuda dentro de una frase y aplica las máscaras', () => {
    const { seudonimos } = redactPayload({ dinero })
    const texto =
      'El saldo del préstamo carro sigue igual y la Tarjeta Visa está al día. Escríbele a ana@correo.com.'

    expect(redactText(texto, seudonimos)).toBe(
      'El saldo del Deuda 2 sigue igual y la Deuda 1 está al día. Escríbele a [correo].',
    )
  })

  it('solo reemplaza palabras completas', () => {
    const seudonimos = new Map([['Carro', 'Deuda 1']])

    expect(redactText('Pagar el carro, no la carrocería', seudonimos)).toBe('Pagar el Deuda 1, no la carrocería')
  })
})
