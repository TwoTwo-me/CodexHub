import {
  RELAY_E2EE_ALGORITHM,
  RELAY_E2EE_VERSION,
  type RelayE2eeEnvelope,
} from '../types/relayE2ee'

type RelayE2eeSecret = {
  keyId: string
  passphrase: string
}

function toBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64')
  }

  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return globalThis.btoa(binary)
}

function fromBase64(value: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(value, 'base64'))
  }

  const binary = globalThis.atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const cloned = new Uint8Array(bytes.byteLength)
  cloned.set(bytes)
  return cloned.buffer
}

function resolveCrypto(): Crypto {
  if (!globalThis.crypto?.subtle) {
    throw new Error('WebCrypto is unavailable in this runtime')
  }
  return globalThis.crypto
}

function getKeyCacheKey(secret: RelayE2eeSecret): string {
  return `${secret.keyId}::${secret.passphrase}`
}

const derivedKeyByCacheKey = new Map<string, Promise<CryptoKey>>()

async function deriveAesGcmKey(secret: RelayE2eeSecret): Promise<CryptoKey> {
  const cacheKey = getKeyCacheKey(secret)
  const cached = derivedKeyByCacheKey.get(cacheKey)
  if (cached) {
    return cached
  }

  const createPromise = (async () => {
    const crypto = resolveCrypto()
    const encoder = new TextEncoder()
    const passphraseBytes = encoder.encode(secret.passphrase)
    const salt = encoder.encode(`codexui-relay-e2ee:${secret.keyId}`)

    const baseKey = await crypto.subtle.importKey('raw', passphraseBytes, 'PBKDF2', false, ['deriveKey'])
    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt,
        iterations: 200_000,
        hash: 'SHA-256',
      },
      baseKey,
      {
        name: 'AES-GCM',
        length: 256,
      },
      false,
      ['encrypt', 'decrypt'],
    )
  })()

  derivedKeyByCacheKey.set(cacheKey, createPromise)
  return createPromise
}

export async function encryptRelayE2eePayload(
  payload: unknown,
  secret: RelayE2eeSecret,
): Promise<RelayE2eeEnvelope> {
  const crypto = resolveCrypto()
  const key = await deriveAesGcmKey(secret)
  const encoder = new TextEncoder()
  const plaintext = encoder.encode(JSON.stringify(payload ?? null))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encrypted = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
    },
    key,
    plaintext,
  )

  return {
    version: RELAY_E2EE_VERSION,
    algorithm: RELAY_E2EE_ALGORITHM,
    keyId: secret.keyId,
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(encrypted)),
    createdAtIso: new Date().toISOString(),
  }
}

export async function decryptRelayE2eePayload(
  envelope: RelayE2eeEnvelope,
  secret: RelayE2eeSecret,
): Promise<unknown> {
  if (envelope.keyId !== secret.keyId) {
    throw new Error('E2EE keyId mismatch')
  }

  const crypto = resolveCrypto()
  const key = await deriveAesGcmKey(secret)
  const plaintext = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: toArrayBuffer(fromBase64(envelope.iv)),
    },
    key,
    toArrayBuffer(fromBase64(envelope.ciphertext)),
  )

  const decoder = new TextDecoder()
  return JSON.parse(decoder.decode(plaintext))
}
