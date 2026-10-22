/** buscarContactos -> buscar_contactos. Es el nombre de la herramienta MCP. */
export function aSnake(nombre: string): string {
  return nombre.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
}
