/**
 * Settings persistence — JSON file storage
 * Stores settings in a stable per-user writable location.
 */

import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

const SETTINGS_FILE = 'config.json'
const TEMP_SETTINGS_FILE = 'config.temp.json'

let inMemorySettings: unknown = null
let tempSettingsPath: string | null = null

function getStorageDir(): string {
  const baseDir = app.getPath('userData')
  if (!fs.existsSync(baseDir)) {
    fs.mkdirSync(baseDir, { recursive: true })
  }
  return baseDir
}

function getLegacySettingsPaths(fileName: string): string[] {
  const paths = new Set<string>()
  paths.add(path.join(process.cwd(), fileName))
  paths.add(path.join(path.dirname(process.execPath), fileName))
  return Array.from(paths)
}

function migrateLegacyFile(targetPath: string, fileName: string): void {
  if (fs.existsSync(targetPath)) return

  for (const legacyPath of getLegacySettingsPaths(fileName)) {
    if (legacyPath === targetPath || !fs.existsSync(legacyPath)) continue
    fs.copyFileSync(legacyPath, targetPath)
    break
  }
}

export function getSettingsPath(): string {
  return path.join(getStorageDir(), SETTINGS_FILE)
}

export function loadSettings<T extends Record<string, unknown>>(defaults: T): T {
  return loadSettingsFromPath(defaults, getSettingsPath())
}

function loadSettingsFromPath<T extends Record<string, unknown>>(defaults: T, filePath: string): T {
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8')
      const stored = JSON.parse(raw) as Partial<T>
      // Deep merge stored over defaults
      return deepMerge(defaults, stored)
    }
  } catch {
    console.error('Failed to load settings; using defaults.')
  }
  return structuredClone(defaults)
}

export function saveSettings<T>(settings: T): void {
  const filePath = getSettingsPath()
  migrateLegacyFile(filePath, SETTINGS_FILE)
  fs.writeFileSync(filePath, JSON.stringify(settings, null, 2), 'utf-8')
}

export function getInMemorySettings<T extends Record<string, unknown>>(defaults: T): T {
  if (inMemorySettings) return inMemorySettings as T
  if (tempSettingsPath && fs.existsSync(tempSettingsPath)) {
    return loadSettingsFromPath(defaults, tempSettingsPath)
  }
  return loadSettings(defaults)
}

export function setInMemorySettings<T>(settings: T): void {
  inMemorySettings = settings
}

export function persistSettings<T>(settings: T): string {
  inMemorySettings = settings
  saveSettings(settings)
  return getSettingsPath()
}

export function initTempSettings<T extends Record<string, unknown>>(defaults: T): void {
  const settingsPath = getSettingsPath()
  const tempPath = path.join(path.dirname(settingsPath), TEMP_SETTINGS_FILE)

  try {
    migrateLegacyFile(settingsPath, SETTINGS_FILE)
    migrateLegacyFile(tempPath, TEMP_SETTINGS_FILE)

    if (fs.existsSync(settingsPath)) {
      fs.copyFileSync(settingsPath, tempPath)
    } else {
      fs.writeFileSync(tempPath, JSON.stringify(defaults, null, 2), 'utf-8')
    }

    tempSettingsPath = tempPath
    inMemorySettings = loadSettingsFromPath(defaults, tempPath)
  } catch {
    console.error('Failed to initialize temporary settings.')
    tempSettingsPath = null
    inMemorySettings = loadSettings(defaults)
  }
}

export function cleanupTempSettings(): void {
  if (!tempSettingsPath) return

  try {
    if (fs.existsSync(tempSettingsPath)) {
      fs.unlinkSync(tempSettingsPath)
    }
  } catch {
    console.error('Failed to clean up temporary settings.')
  } finally {
    tempSettingsPath = null
  }
}

function deepMerge<T extends Record<string, unknown>>(target: T, source: Partial<T>): T {
  const result = structuredClone(target)
  for (const key of Object.keys(source) as Array<keyof T>) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue
    const sourceVal = source[key]
    const targetVal = target[key]

    if (
      sourceVal !== null &&
      sourceVal !== undefined &&
      typeof sourceVal === 'object' &&
      !Array.isArray(sourceVal) &&
      typeof targetVal === 'object' &&
      targetVal !== null &&
      !Array.isArray(targetVal)
    ) {
      result[key] = deepMerge(
        targetVal as Record<string, unknown>,
        sourceVal as Record<string, unknown>
      ) as T[keyof T]
    } else if (sourceVal !== undefined) {
      result[key] = sourceVal as T[keyof T]
    }
  }
  return result
}
