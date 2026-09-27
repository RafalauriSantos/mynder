import { id, validate, type Document } from './document.ts';

const BACKUP_FORMAT = 'mynder-backup';
const BACKUP_VERSION = 1;

export type Backup = {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  documents: Document[];
};

export function createBackup(documents: Document[]): Backup {
  const validated = documents.map(validate);
  if (new Set(validated.map(document => document.id)).size !== validated.length) {
    throw new Error('O backup contém mapas duplicados.');
  }
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, documents: validated };
}

export function parseImport(raw: string): Document[] {
  const value: unknown = JSON.parse(raw);
  if (value && typeof value === 'object' && 'format' in value && value.format === BACKUP_FORMAT) {
    const backup = value as Partial<Backup>;
    if (backup.version !== BACKUP_VERSION || !Array.isArray(backup.documents)) {
      throw new Error('Backup Mynder inválido ou versão não suportada.');
    }
    return createBackup(backup.documents).documents;
  }
  return [validate(value)];
}

export function createImportedCopies(documents: Document[]): Document[] {
  return createBackup(documents).documents.map(document => ({
    ...document,
    id: id(),
    title: `${document.title} (importado)`,
  }));
}
