#!/usr/bin/env node
// Run in the owner's own terminal. This script never writes credentials to disk.
import { randomBytes, scryptSync, createHmac } from "node:crypto"
import readline from "node:readline"
import { Writable } from "node:stream"

if (!process.stdin.isTTY || !process.stdout.isTTY) {
  process.stderr.write("Execute em um terminal interativo local.\n")
  process.exit(1)
}

let muted = false
const output = new Writable({ write(chunk, _encoding, done) {
  if (!muted) process.stdout.write(chunk)
  done()
} })
output.columns = process.stdout.columns
const rl = readline.createInterface({ input: process.stdin, output, terminal: true })
const question = (prompt) => new Promise(resolve => rl.question(prompt, resolve))
function hidden(prompt) {
  return new Promise(resolve => {
    process.stdout.write(prompt)
    muted = true
    rl.question("", answer => {
      muted = false
      process.stdout.write("\n")
      resolve(answer)
    })
  })
}
function base32(bytes) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"
  let bits = 0, value = 0, result = ""
  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      result += alphabet[(value >>> (bits -= 5)) & 31]
    }
  }
  if (bits) result += alphabet[(value << (5 - bits)) & 31]
  return result
}
function totp(bytes, time = Date.now()) {
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(Math.floor(time / 30_000)))
  const mac = createHmac("sha1", bytes).update(counter).digest()
  const offset = mac[mac.length - 1] & 15
  return String((mac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, "0")
}

try {
  const owner = (await question("Login exclusivo do proprietário (email): ")).trim()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(owner) || owner.length > 200) throw Error("Login inválido.")
  const password = await hidden("Senha forte (entrada oculta): ")
  const confirmation = await hidden("Repita a senha (entrada oculta): ")
  if (password !== confirmation || password.length < 16 || password.length > 1024) throw Error("As senhas devem coincidir e ter de 16 a 1024 caracteres.")
  if (process.argv.includes("--check-input-only")) {
    process.stdout.write("Captura e confirmação da senha: OK. Nenhuma credencial foi gerada.\n")
    process.exit(0)
  }
  const salt = randomBytes(16)
  const hash = scryptSync(password, salt, 32)
  const secretBytes = randomBytes(20)
  const secret = base32(secretBytes)
  process.stdout.write("\nConfigure estes valores na Vercel como Secret, somente em Production. Não os envie ao Codex:\n")
  process.stdout.write(`FUTSCOUT_ADMIN_OWNER_LOGIN=${owner}\n`)
  process.stdout.write(`FUTSCOUT_ADMIN_PASSWORD_HASH=${salt.toString("hex")}:${hash.toString("hex")}\n`)
  process.stdout.write(`FUTSCOUT_ADMIN_TOTP_SECRET=${secret}\n`)
  process.stdout.write("\nCadastre o segredo TOTP no seu aplicativo autenticador (30 segundos, SHA1, 6 dígitos).\n")
  const code = (await hidden("Digite o código atual do autenticador para validar (entrada oculta): ")).trim()
  const now = Date.now()
  if (![now - 30_000, now, now + 30_000].some(t => totp(secretBytes, t) === code)) throw Error("Código TOTP não conferiu. Não configure as variáveis; execute novamente.")
  process.stdout.write("MFA validado localmente. Feche este terminal após cadastrar as três variáveis.\n")
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : "Falha local."}\n`)
  process.exitCode = 1
} finally {
  rl.close()
}
