#!/usr/bin/env node
// Run in the owner's own terminal. This script never writes credentials to disk.
import { randomBytes, scryptSync } from "node:crypto"
import readline from "node:readline"
import { Writable } from "node:stream"
import { spawnSync } from "node:child_process"

const hashPattern = /^[a-f0-9]{32}:[a-f0-9]{64}$/
const validHash = value => value.length === 97 && hashPattern.test(value)
const configureVercel = process.argv.includes("--configure-vercel")
const hashOnly = configureVercel || process.argv.includes("--hash-only")
const verifyClipboardOnly = process.argv.includes("--verify-clipboard")
function clipboardCheck(expected) {
  const script = expected === undefined
    ? "$actual = Get-Clipboard -Raw; if ($actual.Length -eq 97 -and $actual -cmatch '^[a-f0-9]{32}:[a-f0-9]{64}$') { exit 0 } else { exit 1 }"
    : "$expected = [Console]::In.ReadToEnd(); $actual = Get-Clipboard -Raw; if ([string]::Equals($actual, $expected, [StringComparison]::Ordinal) -and $actual.Length -eq 97 -and $actual -cmatch '^[a-f0-9]{32}:[a-f0-9]{64}$') { exit 0 } else { exit 1 }"
  return spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Sta", "-Command", script], {
    input: expected ?? "", timeout: 3000, stdio: ["pipe", "ignore", "ignore"], windowsHide: true,
  }).status === 0
}
if (verifyClipboardOnly) {
  const valid = process.platform === "win32" && clipboardCheck()
  process.stdout.write(valid ? "FORMATO_OK\n" : "FORMATO_INVALIDO\n")
  process.exit(valid ? 0 : 1)
}

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
let clipboardUsed = false
function clipboard(value) {
  const result = spawnSync("clip.exe", [], { input: value, timeout: 3000,
    stdio: ["pipe", "ignore", "ignore"], windowsHide: true })
  if (result.status !== 0) throw Error("Área de transferência indisponível. Nenhuma credencial foi exibida.")
  clipboardUsed = true
}
async function pasteStep(label, value, hash = false) {
  if (hash && !validHash(value)) throw Error("FORMATO_INVALIDO")
  clipboard(value)
  if (hash) {
    if (!clipboardCheck(value)) throw Error("FORMATO_INVALIDO")
    process.stdout.write("FORMATO_OK\n")
  }
  const confirmation = await question(`${label} copiado. Cole somente o valor no Secret de Production, salve e digite COLEI aqui. `)
  if (confirmation.trim() !== "COLEI") throw Error("Cópia não confirmada; execute novamente antes de salvar o Secret.")
}

try {
  let owner
  if (!hashOnly) {
    owner = (await question("Login exclusivo do proprietário (email): ")).trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(owner) || owner.length > 200) throw Error("Login inválido.")
  }
  const password = await hidden("Senha forte (entrada oculta): ")
  const confirmation = await hidden("Repita a senha (entrada oculta): ")
  if (password !== confirmation || password.length < 16 || password.length > 1024) throw Error("As senhas devem coincidir e ter de 16 a 1024 caracteres.")
  if (process.argv.includes("--check-input-only")) {
    process.stdout.write("Captura e confirmação da senha: OK. Nenhuma credencial foi gerada.\n")
    process.exit(0)
  }
  const salt = randomBytes(16)
  const hash = scryptSync(password, salt, 32)
  const encoded = `${salt.toString("hex")}:${hash.toString("hex")}`
  if (!validHash(encoded)) throw Error("FORMATO_INVALIDO")
  if (configureVercel) {
    const result = spawnSync("npx.cmd", ["vercel", "env", "add", "FUTSCOUT_ADMIN_PASSWORD_HASH",
      "--environment", "production", "--sensitive", "--force", "--yes",
      "--project", "prj_bxwmEhksloSEAEbCqdEUJRAmeiQm"], {
      input: encoded, timeout: 120000, stdio: ["pipe", "pipe", "pipe"], windowsHide: true,
      shell: true, // Node 24 cannot launch a .cmd file directly on Windows.
    })
    if (result.status !== 0) throw Error("CONFIGURATION_FAILED")
    process.stdout.write("CONFIGURED: senha protegida em Production. Nenhum deploy foi executado.\n")
  } else {
    process.stdout.write("\nOs valores serão copiados um por vez; nenhum será exibido.\n")
    process.stdout.write(hashOnly
      ? "Substitua somente FUTSCOUT_ADMIN_PASSWORD_HASH como Secret em Production.\n"
      : "Configure as duas variáveis como Secret, somente em Production.\n")
    if (owner) await pasteStep("FUTSCOUT_ADMIN_OWNER_LOGIN", owner)
    await pasteStep("FUTSCOUT_ADMIN_PASSWORD_HASH", encoded, true)
    process.stdout.write("Configuração manual concluída. Nenhum deploy foi executado.\n")
  }
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : "Falha local."}\n`)
  process.exitCode = 1
} finally {
  if (configureVercel) await question("Pressione Enter para fechar esta janela. ")
  if (process.platform === "win32" && clipboardUsed) {
    try { clipboard(" ") } catch {
      process.stderr.write("Não foi possível limpar a área de transferência; limpe-a manualmente.\n")
    }
  }
  rl.close()
  process.stdin.pause()
  process.exit(process.exitCode ?? 0)
}
