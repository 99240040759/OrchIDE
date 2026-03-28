const BASE_ICON_URL = 'https://cdn.jsdelivr.net/gh/vscode-icons/vscode-icons@master/icons';

const ICON_MAP: Record<string, string> = {
  ts: 'file_type_typescript.svg',
  tsx: 'file_type_reactts.svg',
  js: 'file_type_js.svg',
  jsx: 'file_type_reactjs.svg',
  css: 'file_type_css.svg',
  html: 'file_type_html.svg',
  json: 'file_type_json.svg',
  md: 'file_type_markdown.svg',
  py: 'file_type_python.svg',
  rs: 'file_type_rust.svg',
  go: 'file_type_go.svg',
  java: 'file_type_java.svg',
  c: 'file_type_c.svg',
  cpp: 'file_type_cpp.svg',
  h: 'file_type_c.svg',
  svg: 'file_type_svg.svg',
  png: 'file_type_image.svg',
  jpg: 'file_type_image.svg',
  jpeg: 'file_type_image.svg',
  txt: 'file_type_text.svg',
  yml: 'file_type_yaml.svg',
  yaml: 'file_type_yaml.svg',
  xml: 'file_type_xml.svg',
  sh: 'file_type_shell.svg',
  bash: 'file_type_shell.svg',
  env: 'file_type_env.svg',
};

export function getVSCodeIcon(fileName: string): string {
  const normalized = fileName.toLowerCase();
  const ext = normalized.split('.').pop() || '';

  if (normalized === '.env' || normalized.endsWith('.env')) {
    return `${BASE_ICON_URL}/file_type_light_env.svg`;
  }
  if (normalized === 'package.json') {
    return `${BASE_ICON_URL}/file_type_npm.svg`;
  }
  if (normalized === 'vite.config.js' || normalized === 'vite.config.ts') {
    return `${BASE_ICON_URL}/file_type_vite.svg`;
  }

  return `${BASE_ICON_URL}/${ICON_MAP[ext] || 'default_file.svg'}`;
}
