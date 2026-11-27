import { isWorkspaceId, CHANNEL_PROFILES, type WorkspaceId } from './workspaces';
export const PROJECT_SCHEMA_VERSION = 1 as const;
export type ProjectModule = 'combine'|'loop'|'verbaflow'|'seo'|'thumb'|'editor';
export interface ProjectRecord {
 schemaVersion: 1; projectId: string; workspaceId: WorkspaceId; name: string;
 createdAt: number; updatedAt: number; revision: number; activeModule: ProjectModule;
}
const modules = ['combine','loop','verbaflow','seo','thumb','editor'];
export function validateProject(value: unknown): value is ProjectRecord {
 if (!value || typeof value !== 'object') return false;
 const p = value as ProjectRecord;
 return p.schemaVersion === 1 && typeof p.projectId === 'string' &&
 /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(p.projectId) &&
 isWorkspaceId(p.workspaceId) && typeof p.name === 'string' && !!p.name.trim() &&
 Number.isSafeInteger(p.createdAt) && p.createdAt >= 0 &&
 Number.isSafeInteger(p.updatedAt) && p.updatedAt >= p.createdAt &&
 Number.isSafeInteger(p.revision) && p.revision >= 1 && modules.includes(p.activeModule);
}
export function createProject(workspaceId: WorkspaceId, name: string): ProjectRecord {
 if (!isWorkspaceId(workspaceId) || typeof name !== 'string' || !name.trim()) throw new Error('Invalid project');
 const now = Date.now();
 return {schemaVersion:1,projectId:crypto.randomUUID(),workspaceId,name:name.trim(),createdAt:now,updatedAt:now,revision:1,activeModule:CHANNEL_PROFILES[workspaceId].defaultModule};
}
// Explicit projection: never persist arbitrary extra properties.
export function projectMetadata(value: unknown): ProjectRecord {
 if (!validateProject(value)) throw new Error('Invalid project schema');
 const {schemaVersion,projectId,workspaceId,name,createdAt,updatedAt,revision,activeModule}=value;
 return {schemaVersion,projectId,workspaceId,name,createdAt,updatedAt,revision,activeModule};
}
