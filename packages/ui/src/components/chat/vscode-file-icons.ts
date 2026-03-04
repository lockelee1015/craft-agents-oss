import { normalizePath } from '@craft-agent/core/utils'

import fileIcon from 'material-icon-theme/icons/file.svg'
import pythonIcon from 'material-icon-theme/icons/python.svg'
import typescriptIcon from 'material-icon-theme/icons/typescript.svg'
import reactTsIcon from 'material-icon-theme/icons/react_ts.svg'
import javascriptIcon from 'material-icon-theme/icons/javascript.svg'
import reactIcon from 'material-icon-theme/icons/react.svg'
import markdownIcon from 'material-icon-theme/icons/markdown.svg'
import jsonIcon from 'material-icon-theme/icons/json.svg'
import yamlIcon from 'material-icon-theme/icons/yaml.svg'
import dockerIcon from 'material-icon-theme/icons/docker.svg'
import goIcon from 'material-icon-theme/icons/go.svg'
import rustIcon from 'material-icon-theme/icons/rust.svg'
import javaIcon from 'material-icon-theme/icons/java.svg'
import cIcon from 'material-icon-theme/icons/c.svg'
import cppIcon from 'material-icon-theme/icons/cpp.svg'
import csharpIcon from 'material-icon-theme/icons/csharp.svg'
import consoleIcon from 'material-icon-theme/icons/console.svg'
import htmlIcon from 'material-icon-theme/icons/html.svg'
import cssIcon from 'material-icon-theme/icons/css.svg'
import sassIcon from 'material-icon-theme/icons/sass.svg'
import vueIcon from 'material-icon-theme/icons/vue.svg'
import svelteIcon from 'material-icon-theme/icons/svelte.svg'
import phpIcon from 'material-icon-theme/icons/php.svg'
import rubyIcon from 'material-icon-theme/icons/ruby.svg'
import swiftIcon from 'material-icon-theme/icons/swift.svg'
import kotlinIcon from 'material-icon-theme/icons/kotlin.svg'
import tomlIcon from 'material-icon-theme/icons/toml.svg'
import xmlIcon from 'material-icon-theme/icons/xml.svg'
import databaseIcon from 'material-icon-theme/icons/database.svg'
import settingsIcon from 'material-icon-theme/icons/settings.svg'

export interface VscodeFileIcon {
  src: string
  alt: string
}

const EXTENSION_ICON_MAP: Record<string, VscodeFileIcon> = {
  py: { src: pythonIcon, alt: 'Python' },
  pyi: { src: pythonIcon, alt: 'Python' },
  ts: { src: typescriptIcon, alt: 'TypeScript' },
  mts: { src: typescriptIcon, alt: 'TypeScript' },
  cts: { src: typescriptIcon, alt: 'TypeScript' },
  tsx: { src: reactTsIcon, alt: 'React TypeScript' },
  js: { src: javascriptIcon, alt: 'JavaScript' },
  mjs: { src: javascriptIcon, alt: 'JavaScript' },
  cjs: { src: javascriptIcon, alt: 'JavaScript' },
  jsx: { src: reactIcon, alt: 'React' },
  md: { src: markdownIcon, alt: 'Markdown' },
  mdx: { src: markdownIcon, alt: 'Markdown' },
  markdown: { src: markdownIcon, alt: 'Markdown' },
  json: { src: jsonIcon, alt: 'JSON' },
  jsonc: { src: jsonIcon, alt: 'JSON' },
  json5: { src: jsonIcon, alt: 'JSON' },
  yml: { src: yamlIcon, alt: 'YAML' },
  yaml: { src: yamlIcon, alt: 'YAML' },
  go: { src: goIcon, alt: 'Go' },
  rs: { src: rustIcon, alt: 'Rust' },
  java: { src: javaIcon, alt: 'Java' },
  c: { src: cIcon, alt: 'C' },
  h: { src: cIcon, alt: 'C Header' },
  cpp: { src: cppIcon, alt: 'C++' },
  cxx: { src: cppIcon, alt: 'C++' },
  cc: { src: cppIcon, alt: 'C++' },
  hpp: { src: cppIcon, alt: 'C++ Header' },
  hh: { src: cppIcon, alt: 'C++ Header' },
  cs: { src: csharpIcon, alt: 'C#' },
  sh: { src: consoleIcon, alt: 'Shell' },
  bash: { src: consoleIcon, alt: 'Shell' },
  zsh: { src: consoleIcon, alt: 'Shell' },
  fish: { src: consoleIcon, alt: 'Shell' },
  ps1: { src: consoleIcon, alt: 'PowerShell' },
  bat: { src: consoleIcon, alt: 'Batch' },
  cmd: { src: consoleIcon, alt: 'Command' },
  html: { src: htmlIcon, alt: 'HTML' },
  htm: { src: htmlIcon, alt: 'HTML' },
  css: { src: cssIcon, alt: 'CSS' },
  scss: { src: sassIcon, alt: 'SCSS' },
  sass: { src: sassIcon, alt: 'Sass' },
  less: { src: sassIcon, alt: 'Less' },
  vue: { src: vueIcon, alt: 'Vue' },
  svelte: { src: svelteIcon, alt: 'Svelte' },
  php: { src: phpIcon, alt: 'PHP' },
  phtml: { src: phpIcon, alt: 'PHP' },
  rb: { src: rubyIcon, alt: 'Ruby' },
  swift: { src: swiftIcon, alt: 'Swift' },
  kt: { src: kotlinIcon, alt: 'Kotlin' },
  kts: { src: kotlinIcon, alt: 'Kotlin' },
  toml: { src: tomlIcon, alt: 'TOML' },
  xml: { src: xmlIcon, alt: 'XML' },
  xsd: { src: xmlIcon, alt: 'XML' },
  xsl: { src: xmlIcon, alt: 'XML' },
  sql: { src: databaseIcon, alt: 'SQL' },
}

const DEFAULT_FILE_ICON: VscodeFileIcon = { src: fileIcon, alt: 'File' }

function parseFileParts(filePath: string): { normalizedName: string; extension: string } {
  const normalized = normalizePath(filePath)
  const normalizedName = normalized.split('/').pop()?.toLowerCase() || normalized.toLowerCase()

  const dotIndex = normalizedName.lastIndexOf('.')
  if (dotIndex <= 0 || dotIndex === normalizedName.length - 1) {
    return { normalizedName, extension: '' }
  }
  return { normalizedName, extension: normalizedName.slice(dotIndex + 1) }
}

/**
 * Resolve a VS Code-like icon for file badges using Material Icon Theme assets.
 */
export function getVscodeFileIcon(filePath: string): VscodeFileIcon {
  const { normalizedName, extension } = parseFileParts(filePath)

  // Name-based mappings first
  if (normalizedName === 'dockerfile' || normalizedName.startsWith('dockerfile.')) {
    return { src: dockerIcon, alt: 'Docker' }
  }
  if (normalizedName === 'docker-compose.yml' || normalizedName === 'docker-compose.yaml' || normalizedName === 'compose.yml' || normalizedName === 'compose.yaml') {
    return { src: dockerIcon, alt: 'Docker Compose' }
  }
  if (normalizedName === 'makefile' || normalizedName === 'gnumakefile') {
    return { src: settingsIcon, alt: 'Makefile' }
  }
  if (normalizedName.startsWith('.env')) {
    return { src: settingsIcon, alt: 'Environment' }
  }
  if (normalizedName.endsWith('.d.ts') || normalizedName.endsWith('.d.mts') || normalizedName.endsWith('.d.cts')) {
    return { src: typescriptIcon, alt: 'TypeScript Declaration' }
  }

  if (extension && EXTENSION_ICON_MAP[extension]) {
    return EXTENSION_ICON_MAP[extension]!
  }

  return DEFAULT_FILE_ICON
}
