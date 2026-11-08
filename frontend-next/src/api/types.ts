// Shapes of what the server sends, as the Go side encodes them.

export interface DocumentEntry {
  id: string;
  name: string;
  /** notebook, pdf, epub */
  type: string;
  lastModified: string;
  size: number;
}

export interface FolderEntry {
  id: string;
  name: string;
  children: Entry[] | null;
  lastModified: string;
  isFolder: true;
}

export type Entry = DocumentEntry | FolderEntry;

export interface DocumentTree {
  Entries: Entry[] | null;
  Trash: Entry[] | null;
}

export interface Device {
  id: string;
  userId?: string;
  description: string;
  firstSeen: string;
  lastSeen: string;
  syncVersion?: string;
  online: boolean;
  lastIP?: string;
  userAgent?: string;
}

export interface FileEntry {
  name: string;
  hash?: string;
  size: number;
}

export interface PageInfo {
  id: string;
  index: number;
  docPage: number;
  template?: string;
  tags: string[] | null;
}

export interface ContentDetails {
  fileType: string;
  formatVersion: number;
  orientation: string;
  pageCount: number;
  lastOpenedPage: number;
  fontName?: string;
  margins?: number;
  sizeInBytes?: string;
}

export interface RmNode {
  id: string;
  name: string;
  type: "DocumentType" | "CollectionType";
  version: number;
  modifiedClient: string;
  currentPage: number;
  parent: string;
  tags: string[] | null;
  starred: boolean;
  path: string;
  children?: RmNode[];
}

export interface RmStat extends RmNode {
  hash?: string;
  fileType: string;
  createdTime: string;
  lastModified: string;
  lastOpened: string;
  files: FileEntry[] | null;
  totalSize: number;
  content?: ContentDetails;
  pages: PageInfo[] | null;
  rawMetadata?: unknown;
  rawContent?: unknown;
}

export interface RmInfo {
  generation: number;
  rootHash?: string;
  schemaVersion: string;
  documents: number;
  folders: number;
  trashed: number;
  syncVersion: string;
  userId: string;
}

export const isFolder = (e: Entry): e is FolderEntry => "isFolder" in e && e.isFolder === true;

export interface Integration {
  ID: string;
  Provider: string;
  Name: string;
  Address?: string;
  Username?: string;
  Password?: string;
  ActiveTransfers?: boolean;
  Insecure?: boolean;
  Accesstoken?: string;
  Path?: string;
  Endpoint?: string;
}

export interface UserSummary {
  userid: string;
  email: string;
  name?: string;
  isAdmin: boolean;
  dev: boolean;
  sync15: boolean;
  integrationCount: number;
  deviceCount: number;
  lastSeen?: string;
  CreatedAt?: string;
}

export interface LogEntry {
  seq: number;
  time: string;
  level: string;
  message: string;
}
