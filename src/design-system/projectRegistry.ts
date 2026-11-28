import { isWorkspaceId, type WorkspaceId } from './workspaces';
export const PROJECT_SCHEMA_VERSION = 1 as const;
export type ProjectModule = 'combine'|'loop'|'verbaflow'|'seo'|'thumb'|'editor';
export type ProjectFormat = 'video'|'shorts'|'ambient';
export function defaultProjectFormat(workspace:WorkspaceId):ProjectFormat {
 return workspace==='the_whisker_trio'?'ambient':'video';
}
export function allowsProjectFormat(workspace:WorkspaceId,format:unknown):format is ProjectFormat {
 return format==='video'||format==='shorts'||(format==='ambient'&&workspace==='the_whisker_trio');
}
export function projectFormat(project:Pick<ProjectRecord,'workspaceId'|'format'>):ProjectFormat {
 return project.format??defaultProjectFormat(project.workspaceId);
}
export interface ProjectRecord {
 schemaVersion: 1; projectId: string; workspaceId: WorkspaceId; name: string;
 createdAt: number; updatedAt: number; revision: number; activeModule: ProjectModule; format?: ProjectFormat; archived?: boolean;
}
const modules = ['combine','loop','verbaflow','seo','thumb','editor'];
export function validateProject(value: unknown): value is ProjectRecord {
 if (!value || typeof value !== 'object') return false;
 const p = value as ProjectRecord;
 return p.schemaVersion === 1 && typeof p.projectId === 'string' &&
 /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(p.projectId) &&
 isWorkspaceId(p.workspaceId) && (p.archived===undefined||typeof p.archived==='boolean') && (p.format===undefined||allowsProjectFormat(p.workspaceId,p.format)) && typeof p.name === 'string' && !!p.name.trim() &&
 Number.isSafeInteger(p.createdAt) && p.createdAt >= 0 &&
 Number.isSafeInteger(p.updatedAt) && p.updatedAt >= p.createdAt &&
 Number.isSafeInteger(p.revision) && p.revision >= 1 && modules.includes(p.activeModule);
}
export function createProject(workspaceId: WorkspaceId, name: string, format:ProjectFormat=defaultProjectFormat(workspaceId)): ProjectRecord {
 if (!isWorkspaceId(workspaceId) || typeof name !== 'string' || !name.trim() || !allowsProjectFormat(workspaceId,format)) throw new Error('Invalid project');
 const now = Date.now();
 return {schemaVersion:1,projectId:crypto.randomUUID(),workspaceId,name:name.trim(),createdAt:now,updatedAt:now,revision:1,format,activeModule:format==='ambient'?'loop':'combine'};
}
// Explicit projection: never persist arbitrary extra properties.
export function projectMetadata(value: unknown): ProjectRecord {
 if (!validateProject(value)) throw new Error('Invalid project schema');
 const {schemaVersion,projectId,workspaceId,name,createdAt,updatedAt,revision,activeModule}=value;
 return {schemaVersion,projectId,workspaceId,name,createdAt,updatedAt,revision,activeModule,...(value.format===undefined?{}:{format:value.format}),...(value.archived===undefined?{}:{archived:value.archived})};
}
