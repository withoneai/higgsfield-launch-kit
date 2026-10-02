import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { driveParentFolder } from "./config.js";
import { oneCall } from "./one.js";

/**
 * Both Drive calls use the same catalog action, "Create a Drive File"
 * (POST /drive/v3/files), through raw passthrough so the request can ask for
 * `webViewLink` back. The folder is a metadata-only create. A file with bytes
 * goes to Drive's upload URI (/upload/drive/v3/files?uploadType=multipart),
 * which that action's docs name as the way to send content. Nothing here
 * shares or publishes: the folder inherits the owner's private default.
 */
const CREATE_FILE = "conn_mod_def::GJ6RzlNn1fs::1Qlp0KgqQbGF7WVXdC5wsw";
const FIELDS = "id,name,webViewLink";

export interface DriveFile {
  id: string;
  name: string;
  webViewLink?: string;
}

const fixtureFile = (name: string): DriveFile => ({
  id: `dry-run-${name}`,
  name,
  webViewLink: `(dry run, not created: ${name})`,
});

export async function createFolder(name: string): Promise<DriveFile> {
  const parent = driveParentFolder();
  return (await oneCall({
    platform: "drive",
    label: `create review folder "${name}"`,
    systemId: CREATE_FILE,
    method: "POST",
    path: "/drive/v3/files",
    query: { fields: FIELDS },
    body: {
      name,
      mimeType: "application/vnd.google-apps.folder",
      ...(parent ? { parents: [parent] } : {}),
    },
    fixture: () => fixtureFile(name),
  })) as DriveFile;
}

const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".json": "application/json",
  ".md": "text/markdown",
};

function multipart(metadata: object, bytes: Buffer, mimeType: string) {
  const boundary = `launchkit${randomBytes(8).toString("hex")}`;
  const head = Buffer.from(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  return { body: Buffer.concat([head, bytes, tail]), contentType: `multipart/related; boundary=${boundary}` };
}

export async function uploadFile(localPath: string, folderId: string, name = basename(localPath)): Promise<DriveFile> {
  const ext = name.slice(name.lastIndexOf(".")).toLowerCase();
  const mimeType = MIME[ext] ?? "application/octet-stream";
  const { body, contentType } = multipart({ name, parents: [folderId] }, readFileSync(localPath), mimeType);
  return (await oneCall({
    platform: "drive",
    label: `upload ${name}`,
    systemId: CREATE_FILE,
    method: "POST",
    path: "/upload/drive/v3/files",
    query: { uploadType: "multipart", fields: FIELDS },
    headers: { "Content-Type": contentType },
    rawBody: body,
    fixture: () => fixtureFile(name),
  })) as DriveFile;
}
