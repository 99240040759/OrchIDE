import Parser from 'web-tree-sitter';
import { SymbolRow } from './workspaceDb';

type Tree = Parser.Tree;
type Node = Parser.SyntaxNode;

export class SymbolExtractor {
  
  public extractSymbols(filepath: string, tree: Tree, code: string): Omit<SymbolRow, 'id'>[] {
    const symbols: Omit<SymbolRow, 'id'>[] = [];
    const root = tree.rootNode;
    const lines = code.split('\n');

    // Recursive traversal of the tree
    this.traverseNode(root, filepath, symbols, lines);
    return symbols;
  }

  private traverseNode(node: Node, filepath: string, symbols: Omit<SymbolRow, 'id'>[], lines: string[]) {
    // Check if the current node is a declaration of interest
    const kind = this.identifySymbolKind(node);
    
    if (kind) {
      const name = this.extractName(node);
      if (name) {
        // Extract a sensible snippet (e.g. signature or the first few lines)
        const endRow = node.endPosition.row;
        // Don't store the entire class body if it's huge. Max 20 lines.
        const snippetEnd = Math.min(node.startPosition.row + 20, endRow);
        
        const snippet = lines.slice(node.startPosition.row, snippetEnd + 1).join('\n');

        symbols.push({
          filepath,
          name,
          kind,
          line_start: node.startPosition.row + 1,
          line_end: node.endPosition.row + 1,
          snippet
        });
      }
    }

    // Traverse children
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child) {
        this.traverseNode(child, filepath, symbols, lines);
      }
    }
  }

  private identifySymbolKind(node: Node): string | null {
    const t = node.type;
    if (t === 'class_declaration' || t === 'class_definition' || t === 'struct_item') return 'class';
    if (t === 'function_declaration' || t === 'function_definition' || t === 'function_item' || t === 'generator_function_declaration') return 'function';
    if (t === 'method_definition' || t === 'method_declaration') return 'method';
    if (t === 'interface_declaration' || t === 'trait_item') return 'interface';
    if (t === 'export_statement' || t === 'export_declaration') return 'export';
    if (t === 'type_alias_declaration' || t === 'type_definition') return 'type';
    if (t === 'enum_declaration' || t === 'enum_item') return 'enum';
    if (t === 'namespace_definition' || t === 'module_definition') return 'module';
    return null;
  }

  private extractName(node: Node): string | null {
    // 1. Try child by field name 'name' (very common in tree-sitter grammars)
    const namedChild = node.childForFieldName('name');
    if (namedChild) return namedChild.text;

    // 2. Try common identifiers
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child && (
        child.type === 'identifier' || 
        child.type === 'type_identifier' || 
        child.type === 'field_identifier' ||
        child.type === 'property_identifier'
      )) {
        return child.text;
      }
    }
    
    // 3. Special handling for exports
    if (node.type === 'export_statement' || node.type === 'export_declaration') {
      const decl = node.childForFieldName('declaration') || node.child(1);
      if (decl) return this.extractName(decl);
    }
    
    return null;
  }
}
