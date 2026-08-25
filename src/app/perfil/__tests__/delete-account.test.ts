/**
 * Borrar la cuenta son dos pasos con dueños distintos: la purga de datos la
 * hace `delete_my_account()` (SECURITY DEFINER, resuelve auth.uid(), una sola
 * transacción) con el cliente de sesión; la cuenta de acceso la borra el
 * admin client (service_role), porque es lo único que puede tocar auth.users.
 * El orden importa: si la purga falla, Auth no se toca y el usuario sigue
 * entero; si Auth falla después, los datos ya no están y hay que decirlo.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const m = vi.hoisted(() => ({
  rpc: vi.fn(),
  getUser: vi.fn(),
  signOut: vi.fn(),
  deleteUser: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`)
  }),
}))

vi.mock('@/utils/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: m.getUser, signOut: m.signOut }, rpc: m.rpc }),
}))
vi.mock('@/utils/supabase/admin', () => ({
  createAdminClient: () => ({ auth: { admin: { deleteUser: m.deleteUser } } }),
}))
vi.mock('next/navigation', () => ({ redirect: m.redirect }))

import { deleteMyAccount } from '../actions'

const UID = '11111111-1111-4111-8111-111111111111'

beforeEach(() => {
  vi.clearAllMocks()
  m.getUser.mockResolvedValue({ data: { user: { id: UID } }, error: null })
  m.rpc.mockResolvedValue({ data: null, error: null })
  m.deleteUser.mockResolvedValue({ data: {}, error: null })
  m.signOut.mockResolvedValue({ error: null })
})

describe('deleteMyAccount', () => {
  it('sin sesión no borra nada', async () => {
    m.getUser.mockResolvedValue({ data: { user: null }, error: null })
    const r = await deleteMyAccount()
    expect(r).toEqual({ error: expect.stringContaining('sesión') })
    expect(m.rpc).not.toHaveBeenCalled()
    expect(m.deleteUser).not.toHaveBeenCalled()
  })

  it('purga los datos con delete_my_account() antes de tocar Auth, y termina en la landing', async () => {
    await expect(deleteMyAccount()).rejects.toThrow('REDIRECT:/')
    expect(m.rpc).toHaveBeenCalledWith('delete_my_account')
    expect(m.deleteUser).toHaveBeenCalledWith(UID)
    expect(m.signOut).toHaveBeenCalled()
    expect(m.rpc.mock.invocationCallOrder[0]).toBeLessThan(m.deleteUser.mock.invocationCallOrder[0])
  })

  it('si la purga falla, la cuenta de acceso queda intacta y se avisa', async () => {
    m.rpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    const r = await deleteMyAccount()
    expect(r).toEqual({ error: expect.stringContaining('No pudimos borrar') })
    expect(m.deleteUser).not.toHaveBeenCalled()
    expect(m.signOut).not.toHaveBeenCalled()
  })

  it('si Auth falla después de la purga, cierra la sesión y da el contacto', async () => {
    m.deleteUser.mockResolvedValue({ data: null, error: { message: 'boom' } })
    const r = await deleteMyAccount()
    expect(r).toEqual({ error: expect.stringContaining('lhstudio.dev@gmail.com') })
    expect(m.signOut).toHaveBeenCalled()
  })
})
