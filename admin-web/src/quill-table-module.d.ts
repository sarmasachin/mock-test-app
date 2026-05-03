declare module 'quill1.3.7-table-module' {
  export function rewirteFormats(): void;

  const TableModule: {
    new (quill: unknown, options?: Record<string, unknown>): unknown;
    moduleName: string;
    toolName: string;
    createEventName: string;
  };

  export default TableModule;
}
